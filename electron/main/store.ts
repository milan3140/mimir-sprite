import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, appendFileSync, writeFileSync, renameSync, copyFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { dlog } from './debugLog'
import { deleteAttachmentsForOwner } from './attachments'
import { DEFAULT_PANEL_W, DEFAULT_PANEL_H, clampPanel } from '../../src/shared/geometry'
import type { DB, Todo, AppMode, StoreSnapshot, Attachment, ThinkingSession, ThinkSettings } from '../../src/shared/types'

const SCHEMA_VERSION = 2

// We use lowdb only to READ (+ default-on-absent); we own WRITES so they can be atomic + serialized.
let db: { data: DB } | null = null
let onChange: ((snap: StoreSnapshot) => void) | null = null

const DB_DIR = () => join(app.getPath('userData'), 'mimir-sprite')
const DB_PATH = () => join(DB_DIR(), 'db.json')
const LOG_DIR = () => join(DB_DIR(), 'state')
const LOG_PATH = () => join(LOG_DIR(), 'completion_log.jsonl')

const DEFAULT_THINK: ThinkSettings = { autoEnabled: false, minMinutes: 30, maxMinutes: 60, candidateTopN: 3 }

function defaults(): DB {
  return {
    schemaVersion: SCHEMA_VERSION,
    todos: [],
    appState: { mode: 'idle', expanded: false },
    thinkingSessions: [],
    notebooks: [],
    settings: {
      hue: 265, anchorEdge: 'right', position: { x: 0, y: 0 },
      hidden: false, alwaysOnTop: true,
    },
  }
}

// Fill in any top-level / settings keys missing from an old or hand-edited db.json — lowdb only supplies
// defaults when the file is ABSENT, not when it's present-but-incomplete. (audit C-H4)
function mergeDefaults(data: Partial<DB>): DB {
  const d = defaults()
  return {
    schemaVersion: data.schemaVersion ?? 1,
    todos: data.todos ?? d.todos,
    appState: { ...d.appState, ...(data.appState ?? {}) },
    thinkingSessions: Array.isArray(data.thinkingSessions) ? data.thinkingSessions : d.thinkingSessions,
    notebooks: Array.isArray(data.notebooks) ? data.notebooks : d.notebooks,
    settings: { ...d.settings, ...(data.settings ?? {}) },
  }
}

// schemaVersion migrations, applied in order for any version below SCHEMA_VERSION. (audit C-H4)
const migrations: Record<number, (d: DB) => void> = {
  // 1 -> 2: move flat think* settings under settings.think; ensure typed session/notebook arrays.
  2: (d) => {
    const s = d.settings as unknown as Record<string, unknown>
    if (s.thinkAutoEnabled !== undefined && !d.settings.think) {
      d.settings.think = {
        autoEnabled: s.thinkAutoEnabled === true,
        minMinutes: (s.thinkMinMinutes as number) ?? 30,
        maxMinutes: (s.thinkMaxMinutes as number) ?? 60,
        candidateTopN: (s.thinkCandidateTopN as number) ?? 3,
      }
      delete s.thinkAutoEnabled; delete s.thinkMinMinutes; delete s.thinkMaxMinutes; delete s.thinkCandidateTopN
    }
  },
}

export async function initStore(listener: (snap: StoreSnapshot) => void): Promise<void> {
  onChange = listener
  const dir = DB_DIR()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const { Low } = await import('lowdb')
  const { JSONFile } = await import('lowdb/node')
  const low = new Low<DB>(new JSONFile<DB>(DB_PATH()), defaults())

  try {
    await low.read()
  } catch (err) {
    // corrupt db.json (e.g. crash mid-write) — preserve it, fall back to defaults so we never hard-fail. (C-M2)
    dlog('store:corrupt', { err: String(err) })
    try { if (existsSync(DB_PATH())) copyFileSync(DB_PATH(), DB_PATH() + '.corrupt.' + Date.now() + '.json') } catch { /* ignore */ }
    low.data = defaults()
  }

  const data = mergeDefaults((low.data ?? defaults()) as Partial<DB>)
  if (data.schemaVersion < SCHEMA_VERSION) {
    try { copyFileSync(DB_PATH(), join(DB_DIR(), 'db.bak.v' + data.schemaVersion + '.' + Date.now() + '.json')) } catch { /* first run: no file yet */ }
    for (let v = data.schemaVersion + 1; v <= SCHEMA_VERSION; v++) migrations[v]?.(data)
    data.schemaVersion = SCHEMA_VERSION
  }
  db = { data }
  await save()                       // persist the merged/migrated structure (atomically)
  dlog('store:init', { path: DB_PATH(), todos: db.data.todos.length, schema: SCHEMA_VERSION })
  broadcast()
}

function broadcast(): void {
  if (!db || !onChange) return
  onChange({ todos: db.data.todos, appState: db.data.appState, panel: getPanelSize() })
}

// Serialized + atomic save: every write chains through one promise (no interleave / lost update — C-M3/D-M3),
// and writes to a temp file then renames (atomic on the same volume — no torn db.json on crash — C-M2).
let writeChain: Promise<void> = Promise.resolve()
function save(): Promise<void> {
  if (!db) return Promise.resolve()
  writeChain = writeChain.then(() => {
    if (!db) return
    const tmp = DB_PATH() + '.tmp'
    writeFileSync(tmp, JSON.stringify(db.data, null, 2))
    renameSync(tmp, DB_PATH())
  }).catch((err) => { dlog('store:write-error', { err: String(err) }) })
  return writeChain
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
export function getThinkSettings(): ThinkSettings {
  const t = db?.data.settings.think
  return {
    autoEnabled: process.env.MIMIR_THINK_AUTO === '1' || t?.autoEnabled === true,
    minMinutes: t?.minMinutes ?? DEFAULT_THINK.minMinutes,
    maxMinutes: t?.maxMinutes ?? DEFAULT_THINK.maxMinutes,
    candidateTopN: t?.candidateTopN ?? DEFAULT_THINK.candidateTopN,
    model: t?.model,
  }
}

export function getSettings(): DB['settings'] {
  return db?.data.settings ?? defaults().settings
}

// Persist a settings patch (edge / hidden / position / alwaysOnTop / think / vault). (audit C-H3)
export async function setSettings(patch: Partial<DB['settings']>): Promise<void> {
  if (!db) return
  db.data.settings = { ...db.data.settings, ...patch }
  await save(); broadcast()
}

// --- Thinking sessions (persisted; the transcript view + completion log + cost auditing read these) ---
export async function addThinkingSession(s: ThinkingSession): Promise<void> {
  if (!db) return
  db.data.thinkingSessions.push(s)
  const t = db.data.todos.find(x => x.id === s.todoId)
  if (t && !t.thinkingSessionIds.includes(s.id)) t.thinkingSessionIds.push(s.id)
  await save(); broadcast()
  dlog('think:session-saved', { id: s.id, todoId: s.todoId, costUsd: s.costUsd, nBubbles: s.bubbles.length })
}

export function getThinkingSessions(todoId: string): ThinkingSession[] {
  return (db?.data.thinkingSessions ?? []).filter(s => s.todoId === todoId)
}

export function getThinkingSession(id: string): ThinkingSession | undefined {
  return (db?.data.thinkingSessions ?? []).find(s => s.id === id)
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
  const maxOrder = db.data.todos.reduce((m, t) => Math.max(m, t.order), -1)
  const todo: Todo = {
    id: randomUUID(), title, order: maxOrder + 1, status: 'pending',
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
  // full cascade so nothing orphans: attachment files + thinking sessions + notebooks (+ their files). (C-M1)
  deleteAttachmentsForOwner('todo', id)
  db.data.thinkingSessions = db.data.thinkingSessions.filter(s => s.todoId !== id)
  for (const nb of db.data.notebooks.filter(n => n.todoId === id)) deleteAttachmentsForOwner('notebook', nb.id)
  db.data.notebooks = db.data.notebooks.filter(n => n.todoId !== id)
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
  await save(); broadcast()
  writeCompletionLog(t)   // log AFTER the db save commits, so the log can't claim an uncommitted state (C-M4)
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
  const sessions = getThinkingSessions(t.id)
  const entry = {
    todoId: t.id, title: t.title, createdAt: t.createdAt,
    completedAt: t.completedAt, totalActiveMs: t.totalActiveMs,
    thinkingSessionIds: t.thinkingSessionIds, notebookIds: t.notebookIds,
    // real values from the persisted sessions, not hardcoded empties (C-M4)
    transcriptPaths: sessions.map(s => s.transcriptPath).filter((p): p is string => !!p),
    domainTags: [] as string[],
    result: '', obsidianPath: '',
    costUsd: sessions.reduce((sum, s) => sum + (s.costUsd || 0), 0),
  }
  try {
    appendFileSync(LOG_PATH(), JSON.stringify(entry) + '\n')
    t.completionLogPath = LOG_PATH()
    dlog('completion:logged', { todoId: t.id })
  } catch (err) {
    dlog('completion:error', { err: String(err) })
  }
}
