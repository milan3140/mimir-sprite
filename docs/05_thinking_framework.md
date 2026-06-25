# 05 · Thinking Framework(需求 7 & 8)

「思考」= 對某待辦項目,請 Claude 規劃**執行前的所有前置準備**,再把規劃拆成一句一句餵給對話框堆疊顯示。

## 觸發
- **手動(需求 8)**:點 item 的 `🧠` → `think:now(todoId, trigger:'manual')`,立即執行。
- **自動(需求 7)**:`mode==idle` 且 `settings.think.autoEnabled`,scheduler 在 `[min,max]` 分鐘(預設 30–60)隨機排定 `nextThinkAt`;到點時從**前 `candidateTopN`(預設 3)個未完成項目**隨機挑一個。working/resting 期間暫停計時,回 idle 重新排。

## 兩段式 Claude 呼叫(同一 session)
**第一段** 產出完整結構化規劃(給 TranscriptModal 全文);**第二段** 在同 session 內要求壓成「一句一行 + 標籤」格式(給 bubble 逐句顯示)。同 session 確保第二段是第一段的忠實濃縮。

### 第一段 Prompt 模板
```
你是使用者的執行教練。針對以下這一個待辦項目,擬定「開始動手前」需要做好的所有前置準備。
只規劃「準備」,不要幫我把任務本身做完。

【待辦項目】
標題:{{title}}
背景/備註:{{notes 或 「(無)」}}
目前時間:{{now 本地時間}}

請依下列結構回答,務實、具體、可執行,數字要敢估:
1. 目標釐清:這個項目「完成」長什麼樣?(1–2 句)
2. 前置準備清單:開始前要先備妥的東西/條件(條列,每點含為什麼)
3. 準備時程:每項準備該「提前多久」開始、彼此順序/依賴(用相對時間,如「開始前一天」)
4. 所需資源:工具、檔案、資料、人、預算、環境
5. 所需能力/知識:需要會什麼;若缺,如何最快補上
6. 整體時間估算:準備總時數 + 任務本身概估(給區間)
7. 風險與卡點:最可能卡住的點 + 預防/備案
8. 第一個動作:現在當下就能做的第一步(1 句,夠小到能馬上做)
```

### 第二段 Prompt 模板(壓成可 parse 的逐句)
```
很好。現在把上面的規劃,改寫成「一行一句、可被程式逐句顯示」的精簡版,規則:
- 每行一句完整、口語、像在提醒朋友的話,≤ 28 個中文字,不要句號結尾。
- 每行開頭加一個方括號標籤,只能用:[目標][準備][時程][資源][能力][時間][風險][第一步]
- 依這個順序輸出,[準備][時程][資源][風險] 可各有多行,其餘各 1 行。
- 總行數控制在 8–14 行。最後一行一定是 [第一步]。
- 不要任何標題、編號、空行、開場白、結語。只輸出這些行。

範例:
[目標] 交出一份主管能直接對外的 Q3 報告
[準備] 先把三個資料來源的權限要齊
[時程] 資料權限開始前一天就要先申請
[第一步] 現在先開一個空白報告檔並貼上大綱
```

## 輸出格式與解析
第二段輸出 = 純文字逐行。解析:
```ts
type BubbleTag = '目標'|'準備'|'時程'|'資源'|'能力'|'時間'|'風險'|'第一步'
const LINE = /^\[(目標|準備|時程|資源|能力|時間|風險|第一步)\]\s*(.+)$/
function parseBubbles(raw: string): Bubble[] {
  return raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    .map((l, i) => { const m = l.match(LINE); return m && { idx:i, tag:m[1], text:m[2].trim() } })
    .filter(Boolean)
}
```
- 容錯:沒中標籤的行 → 丟棄但記 warn;0 行成功 → ThinkingSession.status='error',avatar 出一句「我想得不太順,等等再試」並保留 rawAnswer 供回看。
- bubble 顯示時 tag 可映射成小色點/字首微標(如 [風險] 用 `--warning` 點),text 為主體。

## 串流到 bubble 堆疊
1. `thinkingService` 跑完兩段,得到 `bubbles[]`,存入 ThinkingSession。
2. main 依節奏(預設每 2.2s)逐一 `webContents.send('think:bubble', {sessionId, bubble})`。
3. renderer `SpeechBubbleStack` 收到就 push,套用 04-C 的堆疊/上移/fade 動畫;avatar 切 `talking` 動畫;放完切回原狀態。
4. 位置:bubble 錨點 = avatar 中心側(右貼邊→左、左貼邊→右),拖移/換邊即時重算(呼應拖移吸附補充)。

## ClaudeRunner 呼叫(main)
```ts
const sid = uuidv4()
// 第一段
const r1 = spawnClaude({ prompt: stage1, sessionId: sid })          // --session-id sid
// 第二段(同 session)
const r2 = spawnClaude({ prompt: stage2, sessionId: sid, resume: true })  // --resume sid
// 兩者 cwd 固定為本專案 thinking workdir(確保 resume 找得到 session)
```
旗標:`-p --output-format json --model {{settings.think.model}} --max-turns 6 --permission-mode dontAsk`(thinking 不需要寫檔/跑指令,給最小權限)。逾時:Python/Node `timeout` 90s,失敗記 error + 重試 1 次。`rawAnswer`=r1.result、`costUsd`=r1+r2 的 total_cost_usd 加總、`transcriptPath` 由 session id 推算。

> 細節:本機 `claude` 為 PATH 上的 `.cmd`,Windows spawn 要 `shell:true` 或指向 `claude.cmd` 全路徑(見 06 風險清單)。
