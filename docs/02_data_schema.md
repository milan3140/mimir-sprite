# 02 · Data Schema

儲存:**lowdb**(單一 `db.json` @ `app.getPath('userData')/mimir-sprite/db.json`)。小資料量、人類可讀、好被檢查器與 git diff 驗證。所有時間用 **epoch ms(number)**。所有 id 用 **uuid v4**。

## Top-level
```ts
interface DB {
  schemaVersion: number          // migration 用,起始 1
  todos: Todo[]
  appState: AppState
  thinkingSessions: ThinkingSession[]
  notebooks: Notebook[]          // 補充 3:項目筆記本(可多本/跨項目)
  settings: Settings
}
```

## Todo
```ts
type TodoStatus = 'pending' | 'active' | 'paused' | 'done'

interface Todo {
  id: string
  title: string                  // 必填,單行
  notes?: string                 // 選填,多行背景描述(也餵給 thinking)
  order: number                  // 優先級;越小越前面。拖曳排序改這個
  status: TodoStatus
  createdAt: number
  startedAt?: number             // 第一次 start
  completedAt?: number
  totalActiveMs: number          // 累積實際執行時間(start→pause/complete 累加)
  lastStartedAt?: number         // 當前這段 active 的起點(算 totalActiveMs)
  thinkingSessionIds: string[]   // 對此項目做過的 thinking(可多次)
  notebookIds: string[]          // 此項目的筆記本(補充 3,可多本)
  attachments?: Attachment[]     // 新增任務對話框貼上的截圖/檔案;點項目可察看(共用 Attachment)
  completionLogPath?: string     // 完成後寫出的 log 檔路徑(見 09)
}
```
**排序規則**:UI 只顯示 `status != 'done'` 的項目,依 `order` 升冪。`done` 進歷史/log。「前三項」= 排序後前 3 個未完成項目。

## AppState
```ts
type Mode = 'idle' | 'working' | 'resting'

interface AppState {
  mode: Mode
  activeTodoId?: string          // working 時指向 active todo
  restStartedAt?: number         // resting 起點
  lastThinkAt?: number
  nextThinkAt?: number           // scheduler 計算的下次自動 thinking 時間
  expanded: boolean              // panel 是否展開(hover 狀態鏡像)
}
```
**Mode 與 Todo 的關係**:`todo.start()` → mode=working、activeTodoId 設定;`pause/complete` → mode=idle;`休息時刻` → mode=resting。只有 mode=idle 時 scheduler 才會自動觸發 thinking。

## ThinkingSession
```ts
type ThinkingStatus = 'running' | 'ready' | 'error'

interface ThinkingSession {
  id: string                     // == claude --session-id(uuid)
  todoId: string
  trigger: 'manual' | 'auto'
  createdAt: number
  status: ThinkingStatus
  model: string                  // e.g. 'opus'
  costUsd?: number               // 從 json envelope.total_cost_usd
  rawAnswer?: string             // 第一段完整規劃(整篇,給 TranscriptModal)
  bubbles: Bubble[]              // 第二段 parse 出的逐句
  error?: string
  transcriptPath?: string        // ~/.claude/projects/.../<id>.jsonl
}

interface Bubble {
  idx: number
  tag: BubbleTag                 // 見 05
  text: string                   // 一句話
}
```

## Notebook(補充 3:項目筆記本)
人類自己對某項目打的想法 thread(像 Line 的浮動聊天),純本地、不需 Claude。一個項目可多本(多工思考);可同時開多個視窗(同項目或跨項目)。送出即存,關掉可 resume。
```ts
interface Notebook {
  id: string
  todoId: string                 // 綁定的項目
  title: string                  // 自動命名「筆記 1」或取首句,可改名
  createdAt: number
  updatedAt: number
  messages: NoteMessage[]
  windowState?: {                // 上次浮動視窗位置/大小,resume 用
    x: number; y: number; w: number; h: number
  }
  archived: boolean              // 關閉只是隱藏視窗,不刪資料;archived 才從清單收起
}

interface NoteMessage {
  id: string
  text: string
  createdAt: number
  attachments?: Attachment[]     // 預留:貼上截圖/附加檔案(impl 在 M4,貼圖優先)
  // 預留:author 之後若引入 AI 共筆可加 'user'|'assistant';MVP 只有 user
}

// 附件:二進位「不」進 db.json,存磁碟、這裡只放 metadata + 相對路徑
interface Attachment {
  id: string
  kind: 'image' | 'file'
  path: string                   // 相對 userData/mimir-sprite/attachments/<notebookId>/
  name: string                   // 顯示名/原始檔名
  mime?: string
  bytes?: number
  width?: number; height?: number // 圖片用,排版/縮圖
  createdAt: number
}
```
**附件儲存約定**:檔案落 `userData/mimir-sprite/attachments/<owner>/<ownerId>/<attachmentId>.<ext>`,`owner` ∈ `todo` | `notebook`(同一套機制兩處共用)。刪 todo/message/notebook 時連帶清檔(避免孤兒)。Ctrl+V 貼上 = renderer paste 事件取 image blob(或 main `clipboard.readImage()`)→ 存 png → 建 Attachment。**貼圖機制做一份**:先供「新增任務對話框」(M3)用,筆記本(M4)沿用;拖放檔案/檔案選擇器隨後補。
**多本整合策略(回答開放問題)**:活著時**不合併**——各 thread 在項目記錄裡以手風琴/分頁分開列出(按 `updatedAt` 排)。整合只發生在:① 完成時 LLM 把所有 notebook + thinking 一起萃取成完成 Log(09);② 手動「整理筆記」按鈕讓 LLM 即時濃縮。兩者都延後到有 ClaudeRunner(M7)。

> Todo 的「記錄/時間軸」= thinkingSessions ∪ notebooks ∪ 狀態變更,完成 Log 即是這條時間軸的合成。

## Settings
```ts
interface Settings {
  hue: number                    // design token 主色相,預設見 03
  anchorEdge: 'right' | 'left' | 'top' | 'bottom'  // 補充 2:四側吸附
  position: { x: number; y: number }
  hidden: boolean
  alwaysOnTop: boolean           // 使用者偏好(自動降層仍可暫時覆蓋)
  think: {
    autoEnabled: boolean         // 是否開啟閒置自動 thinking
    minMinutes: number           // 預設 30
    maxMinutes: number           // 預設 60
    candidateTopN: number        // 從前幾項挑,預設 3
    model: string                // 預設 'opus'
  }
  log: {
    enabled: boolean
    vaultPath?: string           // Obsidian vault 路徑(見 09)
    mode: 'obsidian' | 'jsonl' | 'both'
  }
}
```

## 狀態機(Todo)
```
        ┌──── start ────┐      ┌── pause ──┐
        ▼               │      ▼           │
    pending ──start──> active ──pause──> paused
        │               │                  │
        │               └───── start ◀─────┘
        │  complete │ complete │ complete
        └──────────────┴────────┴────────► done ──► 寫 completion log(09)
```
不可逆:done 之後不回頭(若要「重啟」= 開新 todo)。任一狀態都能觸發 thinking(不改 Todo status,只加 thinkingSessionIds)。

## Migration 策略
`store` 啟動時比對 `schemaVersion`;低於當前版就跑 `migrations[]` 逐步升級並備份原檔為 `db.bak.<ts>.json`。檢查器(07)會驗 schema 完整性。
