import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { dlog } from './debugLog'
import { getSettings } from './store'
import type { Bubble, BubbleTag } from '../../src/shared/types'

// M5 ClaudeRunner (docs/05) — two-stage same-session `claude` CLI call:
//   stage 1 → full structured pre-task prep plan (kept as rawAnswer for the transcript)
//   stage 2 → compress that plan to one tagged line per bubble (the stream the cat speaks)
// Same session (--session-id then --resume) so stage 2 is a faithful condensation of stage 1.
// COST: each think spends a real Claude call. The auto-idle trigger is OFF by default; manual 🧠 only.
// FAKE mode (MIMIR_FAKE_CLAUDE=1) returns canned output so the whole pipeline can be tested WITHOUT spend.

const THINK_MODEL = process.env.MIMIR_THINK_MODEL || 'claude-sonnet-4-6'
const TIMEOUT_MS = 300_000   // deep research (vault + web over ~8 dimensions) can take a few minutes
// Knowledge vault the thinking agent reads (read-only) to GROUND the plan in the task's real context
// (Read/Grep/Glob + the vault's wiki-query skill, hot→index→pages). Resolved from env → user setting; if
// neither is set or the path doesn't exist, thinking falls back to "no external context" (NOT an
// author-hardcoded path — audit D-M6). Configure via settings.knowledgeVaultPath.
function knowledgeVault(): string | undefined {
  return process.env.MIMIR_KNOWLEDGE_VAULT || getSettings().knowledgeVaultPath || undefined
}

export interface ThinkResult {
  bubbles: Bubble[]
  rawAnswer: string
  costUsd: number
  sessionId: string
  error?: string
}

const VALID_TAGS: BubbleTag[] = ['任務', '目標', '準備', '時程', '資源', '能力', '時間', '風險', '第一步']
const LINE = /^\[(任務|目標|準備|時程|資源|能力|時間|風險|第一步)\]\s*(.+)$/

export function parseBubbles(raw: string, sessionId: string): Bubble[] {
  const out: Bubble[] = []
  let idx = 0
  for (const ln of raw.split(/\r?\n/)) {
    const t = ln.trim()
    if (!t) continue
    const m = t.match(LINE)
    if (!m) { dlog('think:parse-skip', { line: t.slice(0, 60) }); continue }
    out.push({ idx: idx++, tag: m[1] as BubbleTag, text: m[2].trim(), sessionId })
  }
  return out
}

function userContext(): string {
  return getSettings().userContext || '台灣'
}

function stage1Prompt(title: string, notes: string): string {
  const ctx = userContext()
  return `你是使用者的「執行教練 + 研究員」。工作目錄是使用者的知識庫(可唯讀讀檔),你也能上網查資料(WebSearch / WebFetch)。
目標:針對這一個待辦,產出一份「開工前」的**深度準備分析**——不是泛泛建議,而是**查證過、分情況、可立即執行**的。
使用者背景:${ctx}(時程 / 資源 / 管道 / 可行性都要對應這個背景的實際情況)。

【先 grounding —— 內部 + 外部都要做】
A. 內部脈絡(快速,最多 1–2 個動作就好):看根目錄有沒有 hot.md / index.md;有 → grep 取相關頁來讀;**沒有 → 直接說「沒找到內部脈絡」並立刻進入 B**。不要用 Glob / Bash / 大量讀檔去探索目錄結構或猜「這是不是一個 vault」——那會把回合數浪費光、害你來不及查證與寫輸出(回合是硬上限)。

B. 外部查證 —— 這是你身為研究員的標準作業,不是選配:
   你的訓練資料有截止日,任何「會隨時間改變」的事實,你現在腦中的版本預設就是過時的,要用 WebSearch 查最新的再寫。判斷「會改變」的標準(命中任一就查):
   · 價格 / 報價 / 費率 / 成本數字
   · 薪資、稅率、補助、法規門檻與條文(例:基本工資、勞健保級距)
   · 「目前 / 現在 / 最新」的供應商、平台、管道、工具、版本、業界做法
   · 任何帶日期、或答案在你截止日後可能已不同的事
   ——就算你「覺得知道答案」,只要它屬於上面這些會變動的類別,仍然要查;你的自信不能取代查證(這正是最容易出錯的地方)。
   穩定知識(原理、數學、通用方法、已提供的內容)則直接寫,不必為查而查。查證有預算,務必嚴守,否則會來不及寫完分析:
   · 全篇最多用 6 次 WebSearch。把這 6 次花在「最關鍵、最會影響結論、且最會變動」的幾個數字上(通常是價格 / 法規門檻 / 在地供應商行情);不是每個數字都要查。
   · 查之前先想好「這一查要回答哪個關鍵問題」,一次查到位,不要為同一件事反覆搜尋。
   · 一旦做滿 6 次、或關鍵數字已查齊,就「停止搜尋」,把剩下的回合全部用來寫完整份 0–9 結構輸出。寧可少查一兩個次要數字,也不可因為一直搜尋而讓輸出被截斷。
   · 沒查到的會變動數字,直接用 \`(估,建議自行查證最新)\`,不要為了補它而再開新搜尋。
   收尾自我檢查:輸出必須涵蓋完整的 0–9 段;若快用完回合,立刻停止任何搜尋,優先把結構寫完。

C. 誠實原則(查證的配套,違反等於說謊):
   · 標 \`(來源:URL)\` = 你「真的用 WebSearch 查到、且該 URL 出現在工具回傳結果裡」的承諾。沒經過 WebSearch 的 URL 一律不准標,憑記憶寫網址等同編造。
   · 該查而沒查到 / 工具當下查不到時,凡是會變動的具體數字一律標 \`(估,建議自行查證最新)\`,並用你最有把握的估計 —— 不要假裝有確切來源。
   · 每個具體數字,二選一:真有來源 → \`(來源:URL)\`;否則 → \`(估)\`。不可含糊、不可裝懂。

【待辦】 標題:${title}   背景/備註:${notes || '(無)'}

【貫穿全篇的四個原則】
1. 每維度都「分情況」:列出可能出現的情況,再說「在每種情況下該做什麼」(不要只給一個解)。
2. 不確定屬於哪種情況時:說明「怎麼用查數據 / 小測試 / A-B test 去驗證是哪一種」,再對症下藥。
3. 有誤差的數字(時程 / 資源 / 時間 / 成本…):給「下限 / 最佳猜測 / 上限」三個值,不要單點。
4. 一切具體、可立即執行、在地化(${ctx}):具體供應商類型 / 管道 / 平台 / 數字(例:貨怎麼叫、找哪類供應商)。

【輸出結構】(每段都先查證再寫;務實、具體、敢給數字)
0. 任務理解:這到底是什麼、為什麼做(內部脈絡 + 外部查到的「這類任務通常是什麼」)。
1. 目標:查證「這類任務正確的目標設定通常長怎樣」、「執行者要什麼 vs 審核者 / 利害關係人要什麼」;列可能的目標情境 + 各自做法。
2. 各層面前置準備:逐層列(資料 / 權限 / 工具 / 人 / 錢 / 環境 / 法規…),每項 = 為什麼需要 + 這層最常見的失敗情況 + 對策。
3. 準備時程:每項提前多久、順序 / 依賴;查證在 ${ctx} 是否具體可行、具體途徑;有誤差的給「下限 / 最佳 / 上限」。
4. 所需資源:具體到「怎麼取得」(哪類供應商 / 管道 / 工具 / 平台,在地);有量的給區間。
5. 所需能力 / 知識:查證需要什麼;缺的話最快怎麼補(具體課程 / 資源)。
6. 時間估算:準備 + 本體,給「下限 / 最佳 / 上限」區間。
7. 風險與卡點:每個層面可能的失敗情況 + 預防 / 備案。
8. 達成的必然邏輯步驟鏈(第一性原理):從「要達成這個目標」往回推,列出**必然要經過的完整步驟鏈**、彼此的因果與依賴 —— 這是整件事的骨架。
9. 第一個動作:小到現在就能做的第一步。`
}

function stage2Prompt(title: string): string {
  return `很好。上面那份是完整深度版(使用者點泡泡能看全文)。現在把它**濃縮成逐句冒泡的精華版**,規則:
- 每行一句完整、口語、像在提醒朋友的話,≤ 28 個中文字,不要句號結尾。
- 每行開頭加一個方括號標籤,只能用:[任務][目標][準備][時程][資源][能力][時間][風險][第一步]
- **第一行一定是 [任務]**,內容是「關於「${title}」:…」一句話的任務理解。
- 接著依序 [目標][準備][時程][資源][能力][時間][風險][第一步];[準備][時程][資源][風險] 可各多行,其餘各 1 行。
- **[時程][時間][資源] 這類有區間的,就寫成帶範圍**(例:「準備約 2~4 小時」),不要只寫單一數字。
- 挑「最關鍵、最該先知道」的點濃縮;細節(分情況、查證來源、完整步驟鏈)留在全文,泡泡只給精華。
- 總行數 9–15 行,最後一行一定是 [第一步]。不要任何標題、編號、空行、開場白、結語。只輸出這些行。`
}

interface ClaudeOut { result: string; costUsd: number }

function fakeClaude(stage: 1 | 2, title: string): ClaudeOut {
  if (stage === 1) return { result: `(fake plan for ${title})`, costUsd: 0 }
  // canned tagged lines — exercises parseBubbles + streaming end to end (first line = [任務] problem def)
  const lines = [
    `[任務] 關於「${title}」:我理解這是一個測試任務`,
    '[目標] 把這件事做到能直接交出去',
    '[準備] 先把需要的資料與權限要齊',
    '[準備] 找一個舊範本當骨架省時間',
    '[時程] 要等人回覆的提前一天先問',
    '[資源] 需要的工具與檔案先開好',
    '[能力] 不熟的部分先看十分鐘教學',
    '[時間] 準備約一小時、本體抓半天',
    '[風險] 最可能卡在等別人給東西',
    '[第一步] 現在先開一個空白檔貼上大綱',
  ]
  return { result: lines.join('\n'), costUsd: 0 }
}

function spawnClaude(prompt: string, sessionId: string, resume: boolean, cwd: string): Promise<ClaudeOut> {
  return new Promise((resolve, reject) => {
    // read-only tools: vault retrieval (Read/Grep/Glob) + web research (WebSearch/WebFetch) for best-practice
    // verification. Never writes. The prompt goes via stdin (below) so user todo text can't shell-inject.
    // max-turns is high because the deep analysis researches ~8 dimensions; stage 2 (compress) uses few.
    const args = ['-p', '--output-format', 'json', '--model', THINK_MODEL, '--max-turns', '16',
      '--allowedTools', 'Read,Grep,Glob,WebSearch,WebFetch',   // COMMA-separated (space-sep = one invalid tool name → tools not enabled)
      // allowedTools only governs auto-APPROVAL, not availability — so explicitly DISALLOW mutation/shell:
      // the thinking is read-only + web; without this the agent will happily Bash-explore the vault (observed).
      '--disallowedTools', 'Bash,Edit,Write,NotebookEdit']
    if (resume) args.push('--resume', sessionId)
    else args.push('--session-id', sessionId)
    // Windows: `claude` is a .cmd on PATH → shell:true. windowsHide avoids a console flash.
    // CRITICAL: the claude CLI refuses to run "nested" inside a Claude Code session (CLAUDECODE env) and
    // exits with an error — so strip those from the child env, else thinking silently fails whenever the
    // app was launched from a Claude Code context (e.g. `npm run dev` in its terminal).
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.CLAUDE_CODE_SSE_PORT
    const child = spawn('claude', args, { cwd, shell: true, windowsHide: true, env })
    // SECURITY (audit D-H1 / A-L4): the prompt contains arbitrary user todo text — feed it via STDIN, never
    // as a shell argument, so cmd.exe can't interpret metacharacters (`& | > ^ " %VAR%`) in a todo title.
    try { child.stdin?.write(prompt); child.stdin?.end() } catch { /* stdin closed if spawn already failed */ }
    let out = '', err = ''
    const to = setTimeout(() => { child.kill(); reject(new Error('claude timeout ' + Math.round(TIMEOUT_MS / 1000) + 's')) }, TIMEOUT_MS)
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('error', (e) => { clearTimeout(to); reject(e) })
    child.on('close', (code) => {
      clearTimeout(to)
      if (code !== 0) { reject(new Error(`claude exit ${code}: ${err.slice(0, 200)}`)); return }
      try {
        const j = JSON.parse(out)
        resolve({ result: String(j.result ?? ''), costUsd: Number(j.total_cost_usd ?? 0) })
      } catch (e) { reject(new Error('claude json parse failed: ' + String(e))) }
    })
  })
}

async function callStage(stage: 1 | 2, prompt: string, sessionId: string, title: string, cwd: string): Promise<ClaudeOut> {
  if (process.env.MIMIR_FAKE_CLAUDE === '1') return fakeClaude(stage, title)
  // one retry on failure (per docs/05)
  try {
    return await spawnClaude(prompt, sessionId, stage === 2, cwd)
  } catch (e) {
    dlog('think:retry', { stage, err: String(e) })
    return await spawnClaude(prompt, sessionId, stage === 2, cwd)
  }
}

export async function runThinking(title: string, notes: string): Promise<ThinkResult> {
  const sessionId = randomUUID()
  // run IN the knowledge vault so the agent can read it (hot→index→pages) + load its wiki-query skill.
  // Fall back to a private workdir if no vault is configured / it doesn't exist (retrieval → "no context").
  const vault = knowledgeVault()
  let cwd = vault ?? ''
  if (!vault || !existsSync(vault)) {
    cwd = join(app.getPath('userData'), 'mimir-sprite', 'thinking')
    try { mkdirSync(cwd, { recursive: true }) } catch { /* exists */ }
    dlog('think:no-vault', { tried: vault ?? '(unset)' })
  }
  dlog('think:run-start', { sessionId, title, model: THINK_MODEL, cwd, fake: process.env.MIMIR_FAKE_CLAUDE === '1' })
  try {
    const r1 = await callStage(1, stage1Prompt(title, notes), sessionId, title, cwd)
    const r2 = await callStage(2, stage2Prompt(title), sessionId, title, cwd)
    const bubbles = parseBubbles(r2.result, sessionId)
    const costUsd = r1.costUsd + r2.costUsd
    dlog('think:run-done', { sessionId, nBubbles: bubbles.length, costUsd })
    if (!bubbles.length) {
      return { bubbles: [{ idx: 0, tag: '第一步', text: '我想得不太順,等等再試', sessionId }], rawAnswer: r1.result, costUsd, sessionId, error: 'no-bubbles' }
    }
    return { bubbles, rawAnswer: r1.result, costUsd, sessionId }
  } catch (e) {
    dlog('think:run-error', { sessionId, err: String(e) })
    return { bubbles: [{ idx: 0, tag: '第一步', text: '我想得不太順,等等再試', sessionId }], rawAnswer: '', costUsd: 0, sessionId, error: String(e) }
  }
}
