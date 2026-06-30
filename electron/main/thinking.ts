import { BrowserWindow } from 'electron'
import { dlog } from './debugLog'
import { runThinking } from './claudeRunner'
import { addThinkingSession, getThinkSettings } from './store'
import type { Bubble, BubbleTag, ThinkingSession, ThinkTrigger } from '../../src/shared/types'

// M5 thinking — streams tagged prep lines to the renderer with PER-BUBBLE independent timing:
//   • a bubble appears, then after a dwell (char-count based) it fades out on its own — no global clear.
//   • next bubble appears after this one's interval (char-count based).
//   • FIFO guarantee: a bubble never fades before the previous one, and fades ≥1s after it, so the
//     sentence sequence never breaks (a short line after a long one waits its turn).
//   streamMockThinking → canned lines (UI dev / probes). streamRealThinking → real ClaudeRunner.
// timeScale compresses the whole timeline for tests (probes pass a small value); 1 = real cadence.

const DWELL_PER_CHAR = 1500   // ms a bubble stays before it starts to fade
const DWELL_MIN = 4000, DWELL_MAX = 24000
const GAP_PER_CHAR = 500      // ms from this bubble appearing to the next appearing
const GAP_MIN = 1500, GAP_MAX = 8000
const FADE_ORDER_GAP = 1000   // min ms between consecutive fade-outs (FIFO, no sequence break)

const MOCK: { tag: BubbleTag; text: string }[] = [
  { tag: '任務', text: '關於「季度報告」:給主管能直接對外的版本' },
  { tag: '目標', text: '把這份報告做到主管能直接對外' },
  { tag: '準備', text: '先把三個資料來源的權限要齊' },
  { tag: '準備', text: '找出上一季的範本當骨架' },
  { tag: '時程', text: '資料權限開始前一天就先申請' },
  { tag: '資源', text: '需要 BI 匯出加上圖表模板' },
  { tag: '能力', text: '不熟樞紐表就先看十分鐘教學' },
  { tag: '時間', text: '準備約兩小時、本體約半天' },
  { tag: '風險', text: '最可能卡在跨部門要數字' },
  { tag: '第一步', text: '現在先開空白檔貼上大綱' },
]
// a plausible full stage-1 plan for the MOCK path (Ctrl+Alt+B), so the click-bubble→transcript works in dev.
const MOCK_RAW = `0. 任務理解:關於「季度報告」,我理解這是一份要給主管、能直接對外的季度成果報告。
1. 目標釐清:一份主管不必再改、能直接對外發布的 Q 報告。
2. 前置準備清單:
   - 三個資料來源(BI、財務、業務)的存取權限 — 因為沒權限就拿不到數字。
   - 上一季的範本 — 當骨架可省一半時間。
3. 準備時程:權限「開始前一天」就先申請(跨部門要等)。
4. 所需資源:BI 匯出、圖表模板、上季範本檔。
5. 所需能力:樞紐表(不熟先看十分鐘教學)。
6. 時間估算:準備約 2 小時、本體約半天。
7. 風險與卡點:最可能卡在跨部門要數字 — 先預約對方時間。
8. 第一個動作:現在先開一個空白檔、貼上大綱。`

let timers: ReturnType<typeof setTimeout>[] = []
let session = 0

function clearTimers(): void {
  for (const t of timers) clearTimeout(t)
  timers = []
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const charCount = (t: string): number => t.replace(/\s/g, '').length

// Schedule each bubble's appear + fade. All timings derive from char count (clamped) × timeScale.
// rawAnswer = the full stage-1 plan, sent up-front so clicking any bubble can show the full text.
function streamBubbles(win: BrowserWindow, sid: string, bubbles: Bubble[], timeScale: number, rawAnswer = ''): void {
  if (win.isDestroyed()) return
  clearTimers()
  win.webContents.send('think:clear')          // reset any leftover from a prior session
  win.webContents.send('think:meta', { sid, rawAnswer })   // full transcript for click-bubble→full-text
  dlog('think:start', { sid, n: bubbles.length, timeScale })

  let appearAt = 0
  let prevFadeAt = -Infinity
  bubbles.forEach((bb, i) => {
    const cc = charCount(bb.text)
    const dwell = clamp(cc * DWELL_PER_CHAR, DWELL_MIN, DWELL_MAX) * timeScale
    const gap = clamp(cc * GAP_PER_CHAR, GAP_MIN, GAP_MAX) * timeScale
    const myAppearAt = appearAt
    // FIFO: never fade before the previous bubble + a 1s order-gap
    const fadeAt = Math.max(myAppearAt + dwell, prevFadeAt + FADE_ORDER_GAP * timeScale)
    prevFadeAt = fadeAt
    appearAt += gap

    const b: Bubble = { ...bb, idx: i, sessionId: sid }
    timers.push(setTimeout(() => {
      if (win.isDestroyed()) return
      win.webContents.send('think:bubble', b)
      dlog('think:bubble', b)
    }, myAppearAt))
    timers.push(setTimeout(() => {
      if (win.isDestroyed()) return
      // send sid too so the renderer removes the RIGHT bubble — a new session reuses idx 0..N, and an
      // old session's deferred removal must not delete the new session's bubble of the same idx (A-H4).
      win.webContents.send('think:remove', { idx: i, sid })
      dlog('think:remove', { idx: i, sid })
    }, fadeAt))
  })
  timers.push(setTimeout(() => dlog('think:done', { sid }), prevFadeAt + 600))
}

export function streamMockThinking(win: BrowserWindow, timeScale = 1): void {
  const sid = `mock-${++session}`
  streamBubbles(win, sid, MOCK.map((m, i) => ({ idx: i, tag: m.tag, text: m.text, sessionId: sid })), timeScale, MOCK_RAW)
}

// Real path: run the two-stage ClaudeRunner, then stream the resulting bubbles. Spends a Claude call
// (unless MIMIR_FAKE_CLAUDE=1). The cat shows nothing while Claude thinks (a few seconds), then speaks.
// When a todoId is given, the session is PERSISTED (transcript view + completion log + cost — audit C-H1).
export async function streamRealThinking(
  win: BrowserWindow, title: string, notes: string,
  timeScale = 1, todoId?: string, trigger: ThinkTrigger = 'manual',
): Promise<void> {
  if (win.isDestroyed()) return
  dlog('think:manual', { title, todoId })
  // immediate placeholder so the cat isn't silent during the (now possibly multi-minute) deep research.
  win.webContents.send('think:clear')
  win.webContents.send('think:meta', { sid: 'pending', rawAnswer: '(思考中,正在查資料與整理…)' })
  win.webContents.send('think:bubble', { idx: 0, tag: '任務', text: `關於「${title}」:思考中…正在查資料`, sessionId: 'pending' })
  const res = await runThinking(title, notes)
  if (todoId) {
    const s: ThinkingSession = {
      id: res.sessionId, todoId, trigger, createdAt: Date.now(),
      status: res.error ? 'error' : 'ready',
      model: getThinkSettings().model ?? 'claude-sonnet-4-6',
      costUsd: res.costUsd, rawAnswer: res.rawAnswer, bubbles: res.bubbles, error: res.error,
    }
    try { await addThinkingSession(s) } catch (e) { dlog('think:persist-error', { err: String(e) }) }
  }
  if (win.isDestroyed()) return
  streamBubbles(win, res.sessionId, res.bubbles, timeScale, res.rawAnswer)
}
