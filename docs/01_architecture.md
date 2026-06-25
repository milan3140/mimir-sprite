# 01 · Architecture(系統邏輯)

## 進程模型
```
┌─────────────────────────── Electron ───────────────────────────┐
│  Main process (Node)                                            │
│   • 視窗生命週期、always-on-top 層級、PPT 降層輪詢              │
│   • Tray + globalShortcut(隱藏/召回)                          │
│   • IPC 路由                                                    │
│   • Store(lowdb JSON @ userData)                              │
│   • ClaudeRunner(spawn `claude` CLI subprocess)               │
│   • Scheduler(閒置計時 → 觸發 thinking)                       │
│        │ contextBridge / ipcRenderer (preload.ts)              │
│   Renderer process (React + Tailwind + shadcn)                 │
│   • Avatar 狀態機(CSS steps 動畫)                            │
│   • Panel(待辦清單 / dnd / CRUD / 控制 icon)                 │
│   • BubbleStack(thinking 句子堆疊)                           │
└────────────────────────────────────────────────────────────────┘
        │ subprocess (stdout json)
   `claude -p ... --session-id <uuid> --output-format json`
        │
   ThinkingSession transcript (~/.claude/projects/.../<id>.jsonl)
```
**安全原則**:Claude 與資料邏輯全在 main process;renderer 透過 `contextBridge` 暴露的窄 API 溝通(`contextIsolation:true`、`nodeIntegration:false`)。

## 視窗策略
單一 `BrowserWindow`,大小約 **220×260**(收合時實際可視只有 avatar;panel 展開時動態 `setBounds` 加寬加高)。

```ts
new BrowserWindow({
  width: 240, height: 280,
  frame: false, transparent: true, hasShadow: false,
  resizable: false, skipTaskbar: true,
  alwaysOnTop: true, thickFrame: false, roundedCorners: false,
  maximizable: false, minimizable: false,
  backgroundColor: '#00000000',
  webPreferences: { preload, contextIsolation: true, nodeIntegration: false,
                    backgroundThrottling: false }  // 失焦仍動畫
})
win.setAlwaysOnTop(true, 'screen-saver')
```
- **Win11 透明黑塊風險**:M1 第一件事在真機驗證透明;若黑塊先試 `app.commandLine.appendSwitch('disable-gpu-compositing')`,最後手段 `disableHardwareAcceleration()`。
- 展開/收合時用 `win.setBounds()` 動態調整,並保持貼齊 anchor 邊。

### 自由拖移 + 四側吸附(補充需求 2)
精靈可被使用者抓著 avatar 在桌面任意拖移;**放開時自動吸附到「最近的螢幕邊」(上/下/左/右四側)**。判斷哪一側 = avatar 中心點到四邊的最短距離。
```ts
// drag 進行中:CSS -webkit-app-region:drag 標 avatar 為拖移把手(或 renderer delta → IPC setPosition)
// drag 結束(mouseup):
const wa = screen.getDisplayNearestPoint(cursor).workArea   // {x,y,width,height}
const cx = winX + winW/2, cy = winY + winH/2
const d = { left: cx-wa.x, right: wa.x+wa.width-cx, top: cy-wa.y, bottom: wa.y+wa.height-cy }
const edge = minKey(d)                                       // 'left'|'right'|'top'|'bottom'
const target = snapPos(edge, wa, winW, winH, MARGIN)         // 貼該邊,另一軸保留並 clamp 進可視
animateTo(target)                                            // --dur-slow 補間,「啪」黏上
// 寫回 settings.anchorEdge & position
```
- `anchorEdge` 改變時通知 renderer → **panel 展開方向、bubble 錨點/堆疊方向依邊推導**:
  - 左/右緣 → panel 往中心側水平展開、bubble 在中心側垂直往上堆。
  - 上/下緣 → panel 往中心側垂直展開、bubble 在中心側往內側堆。
  - 推導集中在一個 `layoutFromEdge(edge)` 函式,UI 元件只讀它的結果(`expandDir`、`bubbleAnchor`、`bubbleGrow`、`spriteFlip`)。
- 多螢幕:以游標所在 display 的 `workArea` 計算(避開工作列)。

## Click-through(滑鼠穿透)
預設整窗 `setIgnoreMouseEvents(true,{forward:true})` 讓透明區不擋桌面;`mouseenter` avatar/panel 時切 `false` 變可互動,`mouseleave` 切回。
- **已知 bug**:`mouseleave`/`:hover` 在 forward 後可能不觸發(electron #30808)→ 用 **游標座標輪詢(每 ~120ms 比對元素 rect)** 當 fallback,而非只靠 mouseleave。
- 抽成 `useClickThrough()` hook;IPC `set-ignore-mouse-events(ignore, options)`。

## PPT / 全螢幕降層
Main process 每 ~1.5s:
```ts
const w = await activeWindow()          // get-windows
const d = screen.getDisplayNearestPoint(w.bounds).bounds
const coversScreen = w.bounds.width >= d.width && w.bounds.height >= d.height
const isPpt = /POWERPNT|Keynote|Impress/i.test(w.owner?.name||'')
            || /slide show|簡報|放映/i.test(w.title||'')
if (coversScreen || isPpt) win.setAlwaysOnTop(false)
else win.setAlwaysOnTop(true, 'screen-saver')
```
加 hysteresis(連續 2 次偵測才切換)避免抖動。使用者「主動隱藏」狀態優先於自動降層。

## 隱藏 / 召回
- 隱藏:panel 上一顆 icon → `win.hide()`,寫 `settings.hidden=true`。
- 召回:① Tray 單擊;② `globalShortcut` `Ctrl+Alt+Space`(可設定);兩者 `win.show()` + 還原層級。`will-quit` 時 `unregisterAll()`。

## 模組清單(main)
| 模組 | 責任 |
|---|---|
| `windowManager` | 建視窗、層級、setBounds、貼邊、隱藏召回 |
| `clickThrough` | ignoreMouseEvents 切換 + 游標輪詢 fallback |
| `foregroundWatcher` | get-windows 輪詢 + 降層判斷(可訂閱) |
| `tray` | tray icon + 選單 + 快捷鍵 |
| `store` | lowdb 讀寫 + schema 驗證 + migration |
| `claudeRunner` | spawn CLI、session 管理、json 解析、timeout、cost 記錄 |
| `scheduler` | 閒置計時、nextThinkAt、觸發 thinking、被 working/resting 暫停 |
| `thinkingService` | 組 prompt(兩段式)、存 ThinkingSession、parse bubbles |
| `completionLogger` | 完成項目寫 log(見 09) |
| `notebookManager` | 開/關/定位筆記本浮動視窗;管理 `Map<notebookId, BrowserWindow>`(見 10) |
| `ipc` | 所有 channel 註冊 |

### 筆記本視窗(補充 3)
每本筆記本 = **一個獨立輕量 `BrowserWindow`**(frameless 暗色、可拖移、**非** click-through、可多開),載入同 renderer 但路由帶 `?notebook=<id>`。`notebookManager` 用 map 追蹤;同項目多本、跨項目多本都只是 map 裡多個 entry。送出訊息 → IPC 寫 store(該 notebook.messages)→ `updatedAt`。關閉視窗只 `hide`/銷毀視窗、資料留存,下次開同 id 即 resume。詳見 [10](10_notebook.md)。

## 模組清單(renderer)
`Avatar`、`SpeechBubbleStack`、`TodoPanel`、`TodoItem`、`AddTodoInput`、`ControlBar`(開始/暫停/完成/休息/思考/隱藏 icon)、`TranscriptModal`(看整篇 thinking)、`store hooks`(zustand,鏡像 main 的 store,經 IPC 同步)。

## IPC channel(草案)
```
todo:list / todo:add / todo:update / todo:reorder / todo:remove
todo:start / todo:pause / todo:complete
app:setMode(resting|idle)
think:now(todoId)              → 觸發 thinking
think:get(sessionId)           → 取 transcript + bubbles
window:hide / window:show / window:setExpanded(bool)
mouse:setIgnore(ignore, opts)
event: think:bubble(sentence)  (main→renderer 串流逐句)
event: foreground:changed(demoted:bool)
event: store:changed(snapshot)
```
