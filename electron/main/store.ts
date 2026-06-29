import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, appendFileSync } from 'fs'
import { dlog } from './debugLog'
import { deleteAttachmentsForOwner } from './attachments'
import { DEFAULT_PANEL_W, DEFAULT_PANEL_H, clampPanel } from '../../src/shared/geometry'
import type { DB, Todo, AppMode, StoreSnapshot, Attachment } from '../../src/shared/types'

// ponytail: lowdb v7 is ESM-only. We dynamic-import it at init time.
let db: { data: DB; write: () => Promise<void> } | null = null
let onChange: ((snap: StoreSnapshot) => void) | null = null

const DB_DIR = () => join(app.getPath('userData'), 'mimir-sprite')
const DB_PATH = () => join(DB_DIR(), 'db.json')
const LOG_DIR = () => join(DB_DIR(), 'state')
const LOG_PATH = () => join(LOG_DIR(), 'completion_log.jsonl')

function defaults(): DB {
  return {
    schemaVersion: 1,
    todos: [],
    appState: { mode: 'idle', expanded: false },
    thinkingSessions: [],
    notebooks: [],
    settings: {
      hue: 265,
      anchorEdge: 'right',
      position: { x: 0, y: 0 },
      hidden: false,
      alwaysOnTop: true
    }
  }
}

export async function initStore(listener: (snap: StoreSnapshot) => void): Promise<void> {
  onChange = listener
  const dir = DB_DIR()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // ponytail: lowdb v7 ESM dynamic import
  const { Low } = await import('lowdb')
  const { JSONFile } = await import('lowdb/node')

  const adapter = new JSONFile<DB>(DB_PATH())
  const low = new Low(adapter, defaults())
  await low.read()
  db = low
  dlog('store:init', { path: DB_PATH(), todos: db.data.todos.length })
  broadcast()
}

function broadcast(): void {
  if (!db || !onChange) return
  onChange({ todos: db.data.todos, appState: db.data.appState, panel: getPanelSize() })
}

async function save(): Promise<void> {
  if (!db) return
  await db.write()
}

export function getSnapshot(): StoreSnapshot {
  return { todos: getTodos(), appState: getAppState(), panel: getPanelSize() }
}

export function getPanelSize(): { w: number; h: number } {
  const s = db?.data.settings
  return clampPanel(s?.panelW ?? DEFAULT_PANEL_W, s?.panelH ?? DEFAULT_PANEL_H)
}

export async function setPanelSize(w: number, h: number): Promise<void> {
  if (!db) return
  const c = clampPanel(w, h)
  db.data.settings.panelW = c.w
  db.data.settings.panelH = c.h
  await save(); broadcast()
  dlog('panel:resize', c)
}

// M5 auto-think config — DEFAULT OFF (the cat never auto-spends a Claude call unless the user opts in).
// env MIMIR_THINK_AUTO=1 forces it on with a fast cadence, for testing the scheduler without a UI toggle.
export function getThinkSettings(): { autoEnabled: boolean; minMinutes: number; maxMinutes: number; candidateTopN: number } {
  const s = db?.data.settings as Record<string, unknown> | undefined
  return {
    autoEnabled: process.env.MIMIR_THINK_AUTO === '1' || s?.thinkAutoEnabled === true,
    minMinutes: (s?.thinkMinMinutes as number) ?? 30,
    maxMinutes: (s?.thinkMaxMinutes as number) ?? 60,
    candidateTopN: (s?.thinkCandidateTopN as number) ?? 3,
  }
}

// --- Todo CRUD ---

export function getTodos(): Todo[] {
  return db?.data.todos ?? []
}

export function getAppState(): AppMode {
  return db?.data.appState ?? defaults().appState
}

export async function addTodo(title: string): Promise<Todo> {
  if (!db) throw new Error('store not init')
  const { v4 } = await import('uuid')
  const maxOrder = db.data.todos.reduce((m, t) => Math.max(m, t.order), -1)
  const todo: Todo = {
    id: v4(), title, order: maxOrder + 1, status: 'pending',
    createdAt: Date.now(), totalActiveMs: 0,
    thinkingSessionIds: [], notebookIds: []
  }
  db.data.todos.push(todo)
  await save(); broadcast()
  dlog('todo:add', { id: todo.id, title })
  return todo
}

export async function updateTodo(id: string, patch: Partial<Pick<Todo, 'title' | 'notes'>>): Promise<void> {
  if (!db) return
  const t = db.data.todos.find(x => x.id === id)
  if (!t) return
  if (patch.title !== undefined) t.title = patch.title
  if (patch.notes !== undefined) t.notes = patch.notes
  await save(); broadcast()
}

export async function addAttachmentToTodo(todoId: string, att: Attachment): Promise<void> {
  if (!db) return
  const t = db.data.todos.find(x => x.id === todoId)
  if (!t) return
  ;(t.attachments ??= []).push(att)
  await save(); broadcast()
  dlog('todo:attach', { todoId, attId: att.id, n: t.attachments.length })
}

export async function removeTodo(id: string): Promise<void> {
  if (!db) return
  deleteAttachmentsForOwner('todo', id) // cascade: no orphan attachment files
  db.data.todos = db.data.todos.filter(t => t.id !== id)
  if (db.data.appState.activeTodoId === id) {
    db.data.appState.activeTodoId = undefined
    db.data.appState.mode = 'idle'
  }
  await save(); broadcast()
  dlog('todo:remove', { id })
}

export async function reorderTodos(ids: string[]): Promise<void> {
  if (!db) return
  ids.forEach((id, i) => {
    const t = db!.data.todos.find(x => x.id === id)
    if (t) t.order = i
  })
  await save(); broadcast()
}

// --- State machine ---

export async function startTodo(id: string): Promise<void> {
  if (!db) return
  // pause any currently active todo first
  const prev = db.data.todos.find(t => t.status === 'active')
  if (prev && prev.id !== id) {
    accumulateActive(prev)
    prev.status = 'paused'
  }
  const t = db.data.todos.find(x => x.id === id)
  if (!t || t.status === 'done') return
  t.status = 'active'
  t.lastStartedAt = Date.now()
  if (!t.startedAt) t.startedAt = t.lastStartedAt
  db.data.appState.mode = 'working'
  db.data.appState.activeTodoId = id
  await save(); broadcast()
  dlog('todo:start', { id })
}

export async function pauseTodo(id: string): Promise<void> {
  if (!db) return
  const t = db.data.todos.find(x => x.id === id)
  if (!t || t.status !== 'active') return
  accumulateActive(t)
  t.status = 'paused'
  db.data.appState.mode = 'idle'
  db.data.appState.activeTodoId = undefined
  await save(); broadcast()
  dlog('todo:pause', { id })
}

export async function completeTodo(id: string): Promise<void> {
  if (!db) return
  const t = db.data.todos.find(x => x.id === id)
  if (!t || t.status === 'done') return
  if (t.status === 'active') accumulateActive(t)
  t.status = 'done'
  t.completedAt = Date.now()
  if (db.data.appState.activeTodoId === id) {
    db.data.appState.activeTodoId = undefined
    db.data.appState.mode = 'idle'
  }
  // Write completion log
  writeCompletionLog(t)
  await save(); broadcast()
  dlog('todo:complete', { id, totalActiveMs: t.totalActiveMs })
}

export async function setMode(mode: 'idle' | 'resting'): Promise<void> {
  if (!db) return
  if (mode === 'resting') {
    // pause any active todo when entering rest
    const active = db.data.todos.find(t => t.status === 'active')
    if (active) {
      accumulateActive(active)
      active.status = 'paused'
    }
    db.data.appState.mode = 'resting'
    db.data.appState.activeTodoId = undefined
    db.data.appState.restStartedAt = Date.now()
  } else {
    db.data.appState.mode = 'idle'
    db.data.appState.restStartedAt = undefined
  }
  await save(); broadcast()
  dlog('mode:set', { mode })
}

function accumulateActive(t: Todo): void {
  if (t.lastStartedAt) {
    t.totalActiveMs += Date.now() - t.lastStartedAt
    t.lastStartedAt = undefined
  }
}

// --- Completion log ---

function writeCompletionLog(t: Todo): void {
  const dir = LOG_DIR()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const entry = {
    todoId: t.id, title: t.title, createdAt: t.createdAt,
    completedAt: t.completedAt, totalActiveMs: t.totalActiveMs,
    thinkingSessionIds: t.thinkingSessionIds, notebookIds: t.notebookIds,
    transcriptPaths: [] as string[], domainTags: [] as string[],
    result: '', obsidianPath: '', costUsd: 0
  }
  try {
    appendFileSync(LOG_PATH(), JSON.stringify(entry) + '\n')
    t.completionLogPath = LOG_PATH()
    dlog('completion:logged', { todoId: t.id })
  } catch (err) {
    dlog('completion:error', { err: String(err) })
  }
}
