// ponytail: shared by main + renderer. Keep flat, no imports.

export type TodoStatus = 'pending' | 'active' | 'paused' | 'done'
export type Mode = 'idle' | 'working' | 'resting'

// M5 thinking bubbles: Claude's pre-task prep plan, compressed to one tagged line per bubble.
export type BubbleTag = '任務' | '目標' | '準備' | '時程' | '資源' | '能力' | '時間' | '風險' | '第一步'
export interface Bubble {
  idx: number
  tag: BubbleTag
  text: string
  sessionId?: string
  fading?: boolean   // set when this bubble is told to fade out (drives the fade-out animation)
}

// A persisted thinking session (the durable record of one 🧠 run). The transient compute result lives in
// claudeRunner.ThinkResult; this is ThinkResult + ownership/status so the transcript view + completion log
// + cost auditing have a real source. (audit C-H1/H2)
export type ThinkingStatus = 'running' | 'ready' | 'error'
export type ThinkTrigger = 'manual' | 'auto'
export interface ThinkingSession {
  id: string                 // == claude --session-id (uuid v4)
  todoId: string             // owner; mirrored in Todo.thinkingSessionIds
  trigger: ThinkTrigger
  createdAt: number
  status: ThinkingStatus
  model: string
  costUsd: number
  rawAnswer: string          // stage-1 full plan (for the transcript view)
  bubbles: Bubble[]          // stage-2 parsed lines
  transcriptPath?: string
  error?: string
}

// Per-todo notebook (human-typed thoughts; docs/10). Reserved/typed now so removeTodo can cascade them.
export interface NoteMessage {
  id: string
  text: string
  createdAt: number
  attachments?: Attachment[]
  author?: 'user' | 'assistant'
}
export interface Notebook {
  id: string
  todoId: string
  title: string
  createdAt: number
  updatedAt: number
  messages: NoteMessage[]
  windowState?: { x: number; y: number; w: number; h: number }
  archived: boolean
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
  lastThinkAt?: number   // auto-think scheduler bookkeeping (persisted so it survives restart)
  nextThinkAt?: number
}

export interface ThinkSettings {
  autoEnabled: boolean
  minMinutes: number
  maxMinutes: number
  candidateTopN: number
  model?: string
}

export interface DB {
  schemaVersion: number
  todos: Todo[]
  appState: AppMode
  thinkingSessions: ThinkingSession[]
  notebooks: Notebook[]
  settings: {
    hue: number
    anchorEdge: string
    position: { x: number; y: number }
    hidden: boolean
    alwaysOnTop: boolean
    panelW?: number   // user-resized panel size (clamped to geometry MIN/MAX); default if absent
    panelH?: number
    think?: ThinkSettings              // auto-think config (off by default)
    knowledgeVaultPath?: string        // thinking-retrieval vault (audit D-M6: not an author-hardcoded path)
    userContext?: string               // user's situational context for grounding plans (default '台灣')
  }
}

/** The subset of DB state sent to the renderer via store:changed */
export interface StoreSnapshot {
  todos: Todo[]
  appState: AppMode
  panel: { w: number; h: number }   // current (possibly user-resized) panel size
}
