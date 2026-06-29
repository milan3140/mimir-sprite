// ponytail: shared by main + renderer. Keep flat, no imports.

export type TodoStatus = 'pending' | 'active' | 'paused' | 'done'
export type Mode = 'idle' | 'working' | 'resting'

// M5 thinking bubbles: Claude's pre-task prep plan, compressed to one tagged line per bubble.
export type BubbleTag = '目標' | '準備' | '時程' | '資源' | '能力' | '時間' | '風險' | '第一步'
export interface Bubble {
  idx: number
  tag: BubbleTag
  text: string
  sessionId?: string
  fading?: boolean   // set when this bubble is told to fade out (drives the fade-out animation)
}

// Binary does NOT go in db.json — files live on disk under
// userData/mimir-sprite/attachments/<owner>/<ownerId>/<id>.<ext>; db holds only metadata + rel path.
export interface Attachment {
  id: string
  kind: 'image' | 'file'
  path: string                   // relative to userData/mimir-sprite (e.g. attachments/todo/<id>/<aid>.png)
  name: string
  mime?: string
  bytes?: number
  width?: number
  height?: number
  createdAt: number
}

export interface Todo {
  id: string
  title: string
  notes?: string
  order: number
  status: TodoStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  totalActiveMs: number
  lastStartedAt?: number
  thinkingSessionIds: string[]
  notebookIds: string[]
  completionLogPath?: string
  attachments?: Attachment[]     // pasted screenshots / files (M3b: paste-image priority)
}

export interface AppMode {
  mode: Mode
  activeTodoId?: string
  restStartedAt?: number
  expanded: boolean
}

export interface DB {
  schemaVersion: number
  todos: Todo[]
  appState: AppMode
  thinkingSessions: unknown[]
  notebooks: unknown[]
  settings: {
    hue: number
    anchorEdge: string
    position: { x: number; y: number }
    hidden: boolean
    alwaysOnTop: boolean
    panelW?: number   // user-resized panel size (clamped to geometry MIN/MAX); default if absent
    panelH?: number
  }
}

/** The subset of DB state sent to the renderer via store:changed */
export interface StoreSnapshot {
  todos: Todo[]
  appState: AppMode
  panel: { w: number; h: number }   // current (possibly user-resized) panel size
}
