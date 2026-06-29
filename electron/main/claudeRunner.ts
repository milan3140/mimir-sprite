import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { dlog } from './debugLog'
import type { Bubble, BubbleTag } from '../../src/shared/types'

// M5 ClaudeRunner (docs/05) — two-stage same-session `claude` CLI call:
//   stage 1 → full structured pre-task prep plan (kept as rawAnswer for the transcript)
//   stage 2 → compress that plan to one tagged line per bubble (the stream the cat speaks)
// Same session (--session-id then --resume) so stage 2 is a faithful condensation of stage 1.
// COST: each think spends a real Claude call. The auto-idle trigger is OFF by default; manual 🧠 only.
// FAKE mode (MIMIR_FAKE_CLAUDE=1) returns canned output so the whole pipeline can be tested WITHOUT spend.

const THINK_MODEL = process.env.MIMIR_THINK_MODEL || 'claude-sonnet-4-6'
const TIMEOUT_MS = 90_000

export interface ThinkResult {
  bubbles: Bubble[]
  rawAnswer: string
  costUsd: number
  sessionId: string
  error?: string
}

const VALID_TAGS: BubbleTag[] = ['目標', '準備', '時程', '資源', '能力', '時間', '風險', '第一步']
const LINE = /^\[(目標|準備|時程|資源|能力|時間|風險|第一步)\]\s*(.+)$/

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

function stage1Prompt(title: string, notes: string): string {
  return `你是使用者的執行教練。針對以下這一個待辦項目,擬定「開始動手前」需要做好的所有前置準備。只規劃「準備」,不要幫我把任務本身做完。

【待辦項目】
標題:${title}
背景/備註:${notes || '(無)'}

請依下列結構回答,務實、具體、可執行,數字要敢估:
1. 目標釐清(1–2 句) 2. 前置準備清單(每點含為什麼) 3. 準備時程(相對時間/順序/依賴) 4. 所需資源 5. 所需能力/知識(缺則如何最快補) 6. 整體時間估算(準備+本體,給區間) 7. 風險與卡點(+預防/備案) 8. 第一個動作(小到能馬上做)`
}

const STAGE2_PROMPT = `很好。現在把上面的規劃,改寫成「一行一句、可被程式逐句顯示」的精簡版,規則:
- 每行一句完整、口語、像在提醒朋友的話,≤ 28 個中文字,不要句號結尾。
- 每行開頭加一個方括號標籤,只能用:[目標][準備][時程][資源][能力][時間][風險][第一步]
- 依這個順序輸出,[準備][時程][資源][風險] 可各有多行,其餘各 1 行。
- 總行數 8–14 行,最後一行一定是 [第一步]。
- 不要任何標題、編號、空行、開場白、結語。只輸出這些行。`

interface ClaudeOut { result: string; costUsd: number }

function fakeClaude(stage: 1 | 2, title: string): ClaudeOut {
  if (stage === 1) return { result: `(fake plan for ${title})`, costUsd: 0 }
  // canned tagged lines — exercises parseBubbles + streaming end to end
  const lines = [
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
    const args = ['-p', prompt, '--output-format', 'json', '--model', THINK_MODEL, '--max-turns', '6']
    if (resume) args.push('--resume', sessionId)
    else args.push('--session-id', sessionId)
    // Windows: `claude` is a .cmd on PATH → shell:true. windowsHide avoids a console flash.
    const child = spawn('claude', args, { cwd, shell: true, windowsHide: true })
    let out = '', err = ''
    const to = setTimeout(() => { child.kill(); reject(new Error('claude timeout 90s')) }, TIMEOUT_MS)
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
  const cwd = join(app.getPath('userData'), 'mimir-sprite', 'thinking')
  try { mkdirSync(cwd, { recursive: true }) } catch { /* exists */ }
  dlog('think:run-start', { sessionId, title, model: THINK_MODEL, fake: process.env.MIMIR_FAKE_CLAUDE === '1' })
  try {
    const r1 = await callStage(1, stage1Prompt(title, notes), sessionId, title, cwd)
    const r2 = await callStage(2, STAGE2_PROMPT, sessionId, title, cwd)
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
