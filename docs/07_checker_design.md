# 07 · Checker Design(Task C)

目的:讓 agent 能**自行迭代而不退步**。檢查器 = 一組可一鍵跑、會給出 pass/fail + 具體修正指引的關卡。`npm run check` 一次跑全部,輸出彙整 + 非零 exit 代表 fail(供 cron loop 08 判讀)。

## 五層檢查
| 層 | 工具 | 檢什麼 | Fail 範例 |
|---|---|---|---|
| **L1 靜態** | tsc `--noEmit`、eslint、prettier `--check` | 型別、lint、格式 | any 濫用、未使用變數 |
| **L2 Schema 契約** | `checks/schema.test.ts`(zod) | db.json 結構符合 02;migration 不丟資料;IPC payload 型別 | todo 缺 `order`、status 非法值 |
| **L3 設計 token 規範** | `checks/tokens.check.ts`(掃 src) | 無硬編碼色值(`#xxxxxx`/`rgb(`)、只用語義 token;icon-only 按鈕有 `aria-label` | 元件寫死 `#1e1e2e` |
| **L4 邏輯單元** | vitest | 狀態機(Todo/Mode 轉移)、`parseBubbles`、排序 `order` 計算、scheduler 區間、completion log 組裝 | start→done 漏算 totalActiveMs |
| **L5 行為冒煙** | Playwright(Electron)或 main 進程整合測 | 透明窗建得起、tray 開關、CRUD round-trip、ClaudeRunner mock 回傳能 parse 成 bubbles | bubble 0 句 |

## ClaudeRunner 測試策略
真打 Claude 不穩又花錢 → **預設用 fixture mock**(把幾個真實 json envelope 存成 `checks/fixtures/*.json`),測 parse/錯誤處理/成本記錄。另留一個 `npm run check:live`(預設關)做真連煙霧測,給人工或 cron 偶爾跑。

## 品質 Rubric(給 cron PM agent 評分用,0–3)
每個里程碑產出依此打分,< 2 視為未達標需返工:
1. **需求符合** — 對應 00 需求對照表該項是否真的做到(非「看起來有」)。
2. **暗色極簡一致** — 只用 token、icon-only、無卡片堆砌、留白克制。
3. **健壯性** — 邊界(空清單、CLI 缺席、thinking 失敗、拖出螢幕)有處理。
4. **可維護** — 模組邊界清楚、main/renderer 不越界、無重複邏輯。
5. **效能/省電** — 動畫離主線程、輪詢頻率合理、失焦不空轉。

## 輸出格式(`check-report.json`)
```jsonc
{ "ts": 0, "pass": false,
  "layers": { "L1": {"pass":true}, "L2":{"pass":false,"errors":["todo.order missing"]}, … },
  "rubric": { "M3": {"需求符合":3,"暗色極簡":2,"健壯性":1,"可維護":3,"效能":3} },
  "nextActions": ["修 todo.order 預設值","補空清單 UI"] }
```
cron loop(08)讀這份決定下一步派工。
