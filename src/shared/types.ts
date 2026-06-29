// ponytail: shared by main + renderer. Keep flat, no imports.

export type TodoStatus = 'pending' | 'active' | 'paused' | 'done'
export type Mode = 'idle' | 'working' | 'resting'

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
  }
}

/** The subset of DB state sent to the renderer via store:changed */
export interface StoreSnapshot {
  todos: Todo[]
  appState: AppMode
}
