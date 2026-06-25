# 06 · Dev Plan(執行順序 / 里程碑 / 風險)

## 技術選型一覽
- Electron 30+ · electron-vite(Vite + HMR + TS,比 webpack boilerplate 輕) · React 18 · TypeScript
- Tailwind + shadcn/ui + Lucide React · zustand(renderer 狀態,IPC 鏡像 main)
- lowdb(儲存) · get-windows(前景偵測) · uuid
- sprite:**暹羅貓**(卡其奶白)— CC0 貓 sheet 重新上色 或 AI 生成,Aseprite 清理 → CSS `steps()`(見 03)
- 可借:`maotoumao/desktop-pet`(視窗 scaffold)、`WindowPet`(多狀態管理思路)

## 里程碑與執行順序
| M | 名稱 | 產出 | 驗收 |
|---|---|---|---|
| **M0** | Scaffold | electron-vite + TS + Tailwind + shadcn 初始化、空透明窗、tray | 透明窗在 Win11 真機不黑塊、tray 可開關 |
| **M1** | 懸浮視窗骨架 | always-on-top('screen-saver')、frameless、拖移+**雙側吸附**、click-through hover 切換(含游標輪詢 fallback) | 拖到任意處放開→吸右/左緣;透明區點擊穿透;hover avatar 變可互動 |
| **M2** | Avatar | sprite 載入 + idle/walk/talk/sleep CSS 狀態機 + 狀態點 | 四狀態切換流暢、失焦仍動 |
| **M3** | 待辦核心 + 完成事實 log | lowdb store + IPC + Panel(列表/dnd 排序/新增/刪除)+ 開始/暫停/完成/休息 icon;完成時寫 **jsonl 事實 log**(無 LLM,補充 1 的資料層) | CRUD/排序/狀態機正確、重啟保留、完成有 jsonl 紀錄 |
| **M4** | 筆記本(補充 3) | notebookManager 多視窗 + 聊天 UI + 送出存檔 + resume + 多本分列;**純本地不靠 Claude** | 同/跨項目多開、關了重開看得到舊訊息 |
| **M5** | Thinking + bubble | ClaudeRunner + 兩段式 prompt + parse + BubbleStack 堆疊動畫 + TranscriptModal;先接**手動🧠** | 點🧠→冒出逐句堆疊、點 bubble 看全文 |
| **M6** | 自動化與系統整合 | scheduler 閒置自動 thinking + PPT/全螢幕降層 + 隱藏/快捷鍵召回 | 閒置觸發、放 PPT 降層、Ctrl+Alt+Space 召回 |
| **M7** | 完成 Log LLM 合成 | completionLogger 升級:LLM 萃取 + Obsidian 雙鏈 wiki + 把該項目所有 notebook/thinking 合成;手動「整理筆記」(見 09/10) | 完成項目→產出 wiki 筆記 + 整合多本筆記 |
| **M8** | 檢查器 | 見 07 | `npm run check` 綠燈 |
| **M9** | Cron 自我開發 | 見 08(**需你最終確認才啟用**) | dry-run 產出開發提案 |

MVP = M0–M3。先把「能用的待辦精靈」做出來,再疊筆記本(M4)、智慧層(M5+)。
**補充功能落點**:補充 1 完成 log 拆兩段——事實層 M3(早做、不靠 Claude)、LLM wiki 合成 M7;補充 2 四側吸附在 M1;補充 3 筆記本 M4(合成延到 M7)。

## 風險清單(早驗先行)
| 風險 | 等級 | 緩解 |
|---|---|---|
| Win11 透明窗黑塊(GPU) | 高 | M0 第一件事真機驗;`disable-gpu-compositing`→最後手段關硬體加速 |
| `mouseleave` 在 click-through forward 後不觸發 | 高 | 游標座標輪詢 fallback(每 ~120ms) |
| Windows spawn `claude`(.cmd) | 中 | `shell:true` 或全路徑 `claude.cmd`;啟動時偵測 CLI 是否存在,缺則停用 thinking 並提示 |
| `--resume` 找不到 session(cwd 不一致) | 中 | thinking 固定一個 workdir;以 `--session-id` 自管 uuid |
| 自動 thinking 花費失控 | 中 | per-session `--max-turns`+ 成本記錄 + 每日上限 + 開關 |
| always-on-top 蓋住全螢幕應用惹惱 | 中 | hysteresis 降層 + 使用者隱藏優先 |
| sprite 授權 | 低 | 用 CC0 貓重上色 或自生;來源記 assets/sprites/CREDITS.md |
| 找不到貼切暹羅貓素材 | 中 | M2 先 CSS 佔位毛球跑通流程,正式 sheet 可後換;退路:AI 生成 + Aseprite |

## 目錄結構(實作後)
```
Mimir-Sprite/
  electron/main/        (windowManager, clickThrough, foregroundWatcher,
                         tray, store, claudeRunner, scheduler, thinkingService,
                         notebookManager, completionLogger, ipc)
  electron/preload/
  src/                  (React: Avatar, TodoPanel, SpeechBubbleStack, …)
  src/store/            (zustand + ipc 鏡像)
  assets/sprites/       (Kenney sheets + CREDITS.md)
  checks/               (檢查器,見 07)
  docs/                 (本設計集)
  scripts/              (cron loop,見 08)
```
