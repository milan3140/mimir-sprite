# 10 · Notebook(項目筆記本,補充需求 3)

對某項目點「筆記本」→ 跳出一個**懸浮小對話框 + 訊息紀錄**(像 Line 聊天),讓使用者打上對該項目的想法。送出即存;關掉可 resume 看舊訊息。**純本地,不需 Claude。**

## 能力
- 一個項目可開**多本**筆記本(多工思考各走各的 thread)。
- 可**同時開多個**視窗:同項目多本、或不同項目各自的本,並存桌面。
- 送出訊息 → 自動存到該項目的資料儲存(`Notebook.messages`)。
- 關閉視窗 ≠ 刪除;再開同 id 即還原全部歷史(resume)+ 上次視窗位置。

## 開啟入口
1. Panel 裡 item hover 出一顆 `📓`(Lucide `NotebookPen`)→ 開該項目「最近一本」或新建。
2. item 右鍵 / 長按 → 選單:`新筆記本` / 既有筆記本清單(點某本開該本)。
3. 之後也可從項目記錄區(時間軸)點任一 thread 開回。

## 視窗形態
每本 = **一個完整的獨立浮動視窗**(像真的視窗:可自由拖移、可拉伸縮放、各自獨立),載 `index.html?notebook=<id>`。`notebookManager` 維護 `Map<id, win>`;重複開同 id → 聚焦既有視窗而非開第二個。
```ts
new BrowserWindow({
  width: ws?.w ?? 300, height: ws?.h ?? 380,   // 還原上次大小
  x: ws?.x, y: ws?.y,                          // 還原上次位置
  minWidth: 220, minHeight: 240,
  frame: false, transparent: false,            // 暗色實心、frameless 自繪標題列
  resizable: true,                             // ★ 可拉伸改大小
  skipTaskbar: false,                          // 視窗化,允許進工作列/Alt-Tab
  alwaysOnTop: false,                          // 不搶精靈的最上層
  backgroundColor: 'var→#bg-solid'
})
// 標題列用 CSS -webkit-app-region:drag 當拖移把手;按鈕區 no-drag
// 'resize'/'move' 事件節流寫回 windowState(關閉/移動/縮放都持久化)
```
- 拖移:自繪標題列 `-webkit-app-region: drag`,✎/✕ 等按鈕設 `no-drag`。
- 縮放:`resizable:true` + `minWidth/minHeight`;訊息流區自適應高度、輸入框固定底部。
- 持久化:`resize`/`move`(節流 ~300ms)→ `notebook:setWindowState` 寫回 `Notebook.windowState`,resume 時還原。

```
┌─────────────────────────────┐
│ 📓 Q3報告 · 筆記2      ✎  ✕ │  ← 標題=項目名·筆記名(✎ 改名 ✕ 關閉)
│ ─────────────────────────── │
│  昨天先列了三個資料來源       │  ← 訊息泡泡(自己的,靠右)
│  圖表那段可能要找去年的       │
│  └ 14:32                     │
│ ─────────────────────────── │
│ [ 輸入想法…              ⏎ ] │  ← Enter 送出存檔;Shift+Enter 換行
└─────────────────────────────┘
```

## 資料流
```
送出 → ipc notebook:append(notebookId, text)
     → store 推入 messages + updatedAt + (首則時自動命名 title)
     → 廣播 store:changed(該 notebook)
關閉 → ipc notebook:close(id) → 視窗銷毀;archived 不變(仍在清單)
開啟 → ipc notebook:open(todoId, notebookId?)
     → 無 id 則新建;有則從 store 載 messages + windowState 還原
```
schema 見 [02](02_data_schema.md)(`Notebook` / `NoteMessage`)。

## 多本整合(回答你的開放問題)
**活著時不合併,完成時才合成。**
- **項目記錄區呈現**:該項目的所有筆記本以**手風琴/分頁**分開列(按 `updatedAt`),各自完整 thread;不混排、不強合,保住多工分流的意義。
- **整合時機(都靠 LLM,延後 M7)**:
  1. 項目「完成」時 → completionLogger 把該項目所有 notebook thread + thinking session 一起餵 LLM,萃取成完成 Log 的「想法/決策」段落(見 [09](09_completion_log.md))。
  2. 手動「整理筆記」按鈕 → LLM 即時把多本濃縮成一段摘要(寫回記錄,不動原 thread)。
- **MVP(M4)只做**:多本獨立 thread + 分開列出 + resume。合成是 M7。

## IPC channel(補)
```
notebook:open(todoId, notebookId?)   notebook:append(id, text)
notebook:list(todoId)                notebook:rename(id, title)
notebook:close(id)                   notebook:archive(id)
notebook:setWindowState(id, rect)
event: notebook:changed(notebook)
```

## 與 thinking / bubble 的區別
| | Notebook(10) | Thinking(05) |
|---|---|---|
| 內容來源 | 人類自己打字 | Claude 生成 |
| 形態 | 浮動聊天視窗、可多開常駐 | 暫態冒泡 bubble + 全文 modal |
| 觸發 | 使用者主動開 | 手動🧠 / 閒置自動 |
| 都屬於 | 該項目時間軸,完成時一起被合成進 Log |
