import { BrowserWindow } from 'electron'
import { dlog } from './debugLog'
import { runThinking } from './claudeRunner'
import type { Bubble, BubbleTag } from '../../src/shared/types'

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

let timers: ReturnType<typeof setTimeout>[] = []
let session = 0

function clearTimers(): void {
  for (const t of timers) clearTimeout(t)
  timers = []
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const charCount = (t: string): number => t.replace(/\s/g, '').length

// Schedule each bubble's appear + fade. All timings derive from char count (clamped) × timeScale.
function streamBubbles(win: BrowserWindow, sid: string, bubbles: Bubble[], timeScale: number): void {
  if (win.isDestroyed()) return
  clearTimers()
  win.webContents.send('think:clear')          // reset any leftover from a prior session
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
      win.webContents.send('think:remove', i)   // renderer fades this one out, then drops it
      dlog('think:remove', { idx: i })
    }, fadeAt))
  })
  timers.push(setTimeout(() => dlog('think:done', { sid }), prevFadeAt + 600))
}

export function streamMockThinking(win: BrowserWindow, timeScale = 1): void {
  const sid = `mock-${++session}`
  streamBubbles(win, sid, MOCK.map((m, i) => ({ idx: i, tag: m.tag, text: m.text, sessionId: sid })), timeScale)
}

// Real path: run the two-stage ClaudeRunner, then stream the resulting bubbles. Spends a Claude call
// (unless MIMIR_FAKE_CLAUDE=1). The cat shows nothing while Claude thinks (a few seconds), then speaks.
export async function streamRealThinking(win: BrowserWindow, title: string, notes: string, timeScale = 1): Promise<void> {
  if (win.isDestroyed()) return
  dlog('think:manual', { title })
  const res = await runThinking(title, notes)
  if (win.isDestroyed()) return
  streamBubbles(win, res.sessionId, res.bubbles, timeScale)
}
