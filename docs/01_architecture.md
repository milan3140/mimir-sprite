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

## 視窗策略 —— 固定視窗 + 貓黏住(fixed-window, cat-glued)
**單一「固定大小」的透明 `BrowserWindow`**,大小 `WIN_W×WIN_H = (CELL + 2·MAX_PANEL_W) × (CELL + 2·MAX_PANEL_H) = (190 + 2·560) × (190 + 2·720)` = **1310×1630**(probe 實測確認),大到足以容納「最大 panel 在任一側展開」。貓固定在視窗內的常數位置(`CAT_X=MAX_PANEL_W`、`CAT_Y=MAX_PANEL_H`,即置中)。**panel 用 CSS 在這個固定視窗「內」長大/縮小,永遠不觸發原生視窗 resize** —— 這是消除 hover/展開閃爍的關鍵架構(舊版每次 hover 都 `setBounds` 改視窗大小 → native resize 閃爍,**已廢除**)。

幾何只有一個真相來源 **`src/shared/geometry.ts`**:main(`windowManager`:視窗 bounds + panel HIT rect)與 renderer(`App`:貓 + panel RENDER 位置)都 import 它,兩邊不可能 drift。panel 使用者可拖拉調大小(`settings.panelW/H`,clamp 到 `[MIN,MAX]`)。

```ts
new BrowserWindow({
  width: WIN_W, height: WIN_H,            // 固定;不隨 hover/展開/縮放改變
  frame: false, transparent: true, hasShadow: false,
  resizable: false, skipTaskbar: true, alwaysOnTop: true,
  thickFrame: false, roundedCorners: false, maximizable: false, minimizable: false,
  backgroundColor: '#00000000',
  webPreferences: { preload, contextIsolation: true, nodeIntegration: false,
                    backgroundThrottling: false }  // 失焦仍動畫
})
win.setAlwaysOnTop(true, 'screen-saver')
```
- **唯一會動視窗的時機 = 貼邊 snap**:放開拖移時把「整個固定視窗」`setBounds` **move** 到貼齊最近螢幕邊(**只 move,不 resize**)。hover 展開 panel、拉大 panel 都只改 CSS,完全不碰視窗大小。
- **架構紅線(never-do)**:hover / 展開 / 縮放 路徑上絕不可 `setBounds` 改視窗「大小」(見 CLAUDE.md + `TEST_DESIGN.md` §6 的幾何契約)。違反 = 閃爍回歸。
- panel 太大時用 `panelClamp(edge, …)` 沿 cross-axis 夾回工作區;main 與 renderer 用**同一函式**算,故 hit-rect 與可視永遠一致。
- **Win11 透明黑塊風險**:真機驗證透明;若黑塊先試 `app.commandLine.appendSwitch('disable-gpu-compositing')`,最後手段 `disableHardwareAcceleration()`。

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

## Click-through(滑鼠穿透)—— 單一擁有者輪詢(single-owner poll)
透明區要讓桌面可點,實體區(貓 / panel / 泡泡 / 縮放把手)要可互動。由 **main 的 `clickThrough` 當唯一擁有者**做座標輪詢:每個 tick 比對游標是否落在任一實體 rect 內 —— `over = onCat || onPanel || resizing || onBubbles` —— `over` 為真才 `setIgnoreMouseEvents(false)`,否則 `setIgnoreMouseEvents(true, {forward:true})`。
- **rect 來源**:renderer 量測後回報(`cat:rect`、`bubbles:rect`),panel 的 HIT rect 由 `geometry.ts` 與 main 同算(與可視一致);`resizing` 由縮放互動旗標提供。單一 owner 彙整,避免多處各自切換互相打架(舊版 mouseenter/leave 多源切換的 race 已廢除)。
- **為何輪詢而非事件**:`mouseleave`/`:hover` 在 `forward:true` 後可能不觸發(electron #30808),不能只靠事件。

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

## 模組清單(main)—— 對齊 `electron/main/`
| 模組 | 責任 |
|---|---|
| `index` | app 生命週期、建立視窗、`will-quit` 統一 teardown(清 interval / server / handler) |
| `windowManager` | 固定視窗 + 層級;貼邊 snap(只 move 不 resize);panel HIT rect;隱藏/召回。幾何 import `geometry.ts` |
| `clickThrough` | 單一擁有者座標輪詢 → `setIgnoreMouseEvents`;彙整貓 / panel / 泡泡 / 縮放 rect |
| `store` | lowdb 讀寫 + 原子寫(temp→rename)+ 寫佇列序列化 + corrupt-recovery + migration + ThinkingSession + 完成 log(cost/transcripts 由 sessions 算,見 09) |
| `claudeRunner` | spawn `claude` CLI(剝除 CLAUDECODE)、兩段式 prompt、WebSearch grounding、json 解析、timeout、cost |
| `thinking` | 串流逐句泡泡(per-bubble 計時)、存 ThinkingSession、parse bubbles |
| `thinkScheduler` | 閒置計時、nextThinkAt、觸發 thinking;**預設關閉**,被 working/resting 暫停 |
| `ipc` | 所有 channel 註冊 |
| `tray` | tray icon + 選單 + 快捷鍵 |
| `attachments` | 貼上的截圖/檔案存到 userData(只存 meta + 相對路徑) |
| `testControl` | 測試專用 channel(probe 用;非 production 互動路徑) |
| `debugLog` | `dlog` 除錯記錄 |

> PPT/全螢幕降層在 main 的前景輪詢內(非獨立 `foregroundWatcher` 模組);筆記本視窗管理(`notebookManager`)型別已保留、尚未實作(見 10)。

### 筆記本視窗(補充 3)
每本筆記本 = **一個獨立輕量 `BrowserWindow`**(frameless 暗色、可拖移、**非** click-through、可多開),載入同 renderer 但路由帶 `?notebook=<id>`。`notebookManager` 用 map 追蹤;同項目多本、跨項目多本都只是 map 裡多個 entry。送出訊息 → IPC 寫 store(該 notebook.messages)→ `updatedAt`。關閉視窗只 `hide`/銷毀視窗、資料留存,下次開同 id 即 resume。詳見 [10](10_notebook.md)。

## 模組清單(renderer)
`SpriteAvatar`、`SpeechBubbleStack`(點任一泡泡 → inline `TranscriptOverlay` 看整篇 stage-1 plan)、`TodoPanel` / `TodoRow`(含 inline 詳情 accordion + `ThinkingTranscript`,**非** modal、**非** 「Detail」標題框,由左側 chevron 切換)、`AddTodo` 輸入、控制 icon(開始/暫停/完成/休息/思考/隱藏)、`store hooks`(zustand,鏡像 main 的 store,經 IPC 同步)。

## IPC channel(草案;實際以 `ipc.ts` + `preload/index.ts` 為準)
```
todo:list / todo:add / todo:update / todo:reorder / todo:remove
todo:start / todo:pause / todo:complete
app:setMode(resting|idle)
think:now(todoId)                 → 觸發 thinking(該 todo)
think:sessions(todoId)            → 取該 todo 的 ThinkingSession[](transcript + bubbles)
window:hide / window:show ; mouse:setIgnore(ignore, opts)
renderer→main: cat:rect / bubbles:rect      (回報實體 rect 給 clickThrough 單一擁有者輪詢)
event think:clear / think:meta({sid,rawAnswer}) / think:bubble({idx,tag,text,sessionId}) / think:remove({idx,sid})
                                  (main→renderer:清空 / 全文 meta / 逐句串流 / 逐句淡出)
event store:changed(snapshot)
```
