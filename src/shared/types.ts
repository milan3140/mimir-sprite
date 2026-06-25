// ponytail: shared by main + renderer. Keep flat, no imports.

export type TodoStatus = 'pending' | 'active' | 'paused' | 'done'
export type Mode = 'idle' | 'working' | 'resting'

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
