# 00 · Overview

## 願景
一個常駐桌面側邊的 8-bit 小精靈,作為使用者的「管家 / 秘書 / Jarvis」。平時只是一隻會動的可愛 avatar 不擋路;需要時懸浮展開待辦清單管理;閒置時主動幫使用者**預想下一步該做什麼準備**,用對話框一句句講出來。

## 需求對照表(原始需求 → 設計落點)

| # | 需求 | 設計落點 |
|---|---|---|
| 1 | 顯示最上層;播 PPT 自動降層;可隱藏 + 易召回 | `setAlwaysOnTop(true,'screen-saver')` + `get-windows` 輪詢降層 + tray/全域快捷鍵召回 → [01](01_architecture.md) |
| 2 | 預設只露 avatar(會動的 8-bit 角色) | CC0 sprite + CSS `steps()` 狀態機(idle/walk/talk/sleep) → [01](01_architecture.md)/[03](03_design_tokens.md) |
| 3 | 懸浮展開清單;拖曳排序;移除項目 | hover 展開 panel;dnd 排序;swipe/icon 刪除 → [04](04_wireframes.md) |
| 4 | 展開時下方對話框可新增項目 | 底部 input → [04](04_wireframes.md) |
| 5 | 項目「開始 / 暫停 / 完成」(純 icon) | Todo 狀態機 active/paused/done → [02](02_data_schema.md) |
| 6 | 「休息時刻」(純 icon) | AppState.mode = resting → [02](02_data_schema.md) |
| 7 | 閒置 0.5–1hr 隨機挑前三項之一,問 Claude 前置準備 → 一句一行 → 對話框堆疊顯示 | thinking 框架 + bubble 堆疊 → [05](05_thinking_framework.md) |
| 8 | 對項目直接「思考」= 立即觸發 7 | 同 7 的手動入口 → [05](05_thinking_framework.md) |
| A | 統整/規劃/查證/開源/順序/暗色極簡 + schema/token/wireframe | 本 docs 全集 |
| B | 開 Project 持續開發 | 本資料夾 |
| C | 設計檢查器自我迭代 | [07](07_checker_design.md) |
| D | Cron PM 迴圈 + subprocess 派 agent | [08](08_cron_self_dev.md) |
| +1 | 完成項目要 log(session id/位置/背景/結果,Obsidian+LLM wiki) | [09](09_completion_log.md) |

## 範圍(MVP vs 之後)
- **MVP(里程碑 M1–M3)**:懸浮視窗 + avatar + 待辦 CRUD + 拖曳排序 + 開始/暫停/完成/休息 + 本地儲存。
- **M4**:thinking 框架(手動「思考」按鈕先行)+ 對話框堆疊顯示 + 完成 log。
- **M5**:閒置自動觸發 + PPT 降層 + tray/快捷鍵 + 隱藏召回。
- **M6**:檢查器(C)。
- **M7**:cron 自我開發迴圈(D)。

## 名詞
- **Avatar / 精靈**:畫面上會動的角色本體 = **暹羅貓**(卡其奶白、可愛柔和,蜷起來是一顆毛球)。唯一不走暗色極簡規範的視覺元素,配色與狀態見 [03](03_design_tokens.md#avatar-形象規格暹羅貓)。
- **Panel**:hover 後展開的待辦清單面板。
- **Bubble**:thinking 結果一句一個的對話框。
- **Thinking session**:一次 Claude 規劃對話(對應一個 claude session id)。
- **Mode**:App 全域狀態 idle / working / resting。
