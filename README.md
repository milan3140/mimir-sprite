# Mimir-Sprite 🐾

一個懸浮在桌面側邊的 **待辦清單小精靈** — 像 Jarvis / 管家的 8-bit 桌面寵物。預設只露出會動的 avatar;滑鼠懸浮展開待辦清單(可拖曳排序、增刪、開始/暫停/完成、休息);閒置時會隨機挑前三項待辦,透過 Claude Code CLI 規劃「執行前置準備」,再用堆疊式對話框一句一句講給你聽。

> Project-Mimir 旗下子專案。狀態:**設計階段(Phase 0)**。

## 技術決策(已定案)

| 面向 | 選擇 | 理由 |
|---|---|---|
| 桌面框架 | **Electron + React + TS** | Windows 透明/always-on-top/click-through/tray 最成熟,桌面寵物範例最多 |
| UI | **Tailwind + shadcn/ui + Lucide React** | 極簡暗色系,token 驅動 |
| Avatar | **CC0 sprite sheet + CSS `steps()` 逐格動畫** | Kenney Mini Characters(CC0),0 渲染依賴、離主線程省電 |
| Claude 呼叫 | **`claude` CLI subprocess + `--session-id`** | 符合「思考」與自我開發迴圈需求,可 fork/注入 context |
| 本地儲存 | **lowdb(JSON)於 userData** | 資料量小、好 parse、好版本化檢查 |

## 文件導覽(動工前必備設計)

| # | 檔案 | 內容 |
|---|---|---|
| 00 | [docs/00_overview.md](docs/00_overview.md) | 願景、需求對照表、範圍、名詞 |
| 01 | [docs/01_architecture.md](docs/01_architecture.md) | 進程模型、視窗策略、IPC、模組、PPT 降層、click-through |
| 02 | [docs/02_data_schema.md](docs/02_data_schema.md) | 資料 schema(Todo / AppState / ThinkingSession / Settings)+ 狀態機 |
| 03 | [docs/03_design_tokens.md](docs/03_design_tokens.md) | 暗色系 hue 驅動 design token |
| 04 | [docs/04_wireframes.md](docs/04_wireframes.md) | ASCII wireframe(收合 / 展開 / 對話框堆疊) |
| 05 | [docs/05_thinking_framework.md](docs/05_thinking_framework.md) | 「思考」的 Claude prompt 框架 + 一句一行輸出格式 + 對話框堆疊邏輯 |
| 06 | [docs/06_dev_plan.md](docs/06_dev_plan.md) | 執行順序、里程碑、風險、可借 repo |
| 07 | [docs/07_checker_design.md](docs/07_checker_design.md) | 品質檢查器設計(Task C) |
| 08 | [docs/08_cron_self_dev.md](docs/08_cron_self_dev.md) | Cron PM 自我開發迴圈設計(Task D) |
| 09 | [docs/09_completion_log.md](docs/09_completion_log.md) | 完成項目 Log(Obsidian + LLM wiki) |
| 10 | [docs/10_notebook.md](docs/10_notebook.md) | 項目筆記本(浮動聊天、多本多工、resume) |

## 快速開始(實作後補)

```bash
npm install
npm run dev      # Electron + Vite HMR
npm run check    # 跑品質檢查器
```
