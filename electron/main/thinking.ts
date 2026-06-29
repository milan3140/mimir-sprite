import { BrowserWindow } from 'electron'
import { dlog } from './debugLog'
import { runThinking } from './claudeRunner'
import type { Bubble, BubbleTag } from '../../src/shared/types'

// M5 thinking — streams one tagged prep line per bubble to the renderer (think:bubble), paced ~2.2s.
//   streamMockThinking  → canned lines, no Claude call (UI dev / probes).
//   streamRealThinking  → real two-stage ClaudeRunner (spends a Claude call; manual 🧠 trigger).
// Both feed the SAME streamer + Bubble[] shape, so the bubble UI is identical either way.

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

let timer: ReturnType<typeof setInterval> | null = null
let session = 0

function stop(): void {
  if (timer) { clearInterval(timer); timer = null }
}

// Stream a ready Bubble[] one at a time, then hold + clear. Shared by mock and real paths.
function streamBubbles(win: BrowserWindow, sid: string, bubbles: Bubble[], intervalMs: number): void {
  if (win.isDestroyed()) return
  stop()
  win.webContents.send('think:clear')
  dlog('think:start', { sid, n: bubbles.length })
  let i = 0
  const tick = (): void => {
    if (win.isDestroyed()) { stop(); return }
    if (i >= bubbles.length) {
      stop()
      setTimeout(() => { if (!win.isDestroyed()) { win.webContents.send('think:clear'); dlog('think:done', { sid }) } }, 6000)
      return
    }
    const b: Bubble = { ...bubbles[i], idx: i, sessionId: sid }
    win.webContents.send('think:bubble', b)
    dlog('think:bubble', b)
    i++
  }
  tick()                              // first bubble immediately
  timer = setInterval(tick, intervalMs)
}

export function streamMockThinking(win: BrowserWindow, intervalMs = 2200): void {
  const sid = `mock-${++session}`
  streamBubbles(win, sid, MOCK.map((m, i) => ({ idx: i, tag: m.tag, text: m.text, sessionId: sid })), intervalMs)
}

// Real path: run the two-stage ClaudeRunner, then stream the resulting bubbles. Spends a Claude call
// (unless MIMIR_FAKE_CLAUDE=1). The cat shows nothing while Claude thinks (a few seconds), then speaks.
export async function streamRealThinking(win: BrowserWindow, title: string, notes: string, intervalMs = 2200): Promise<void> {
  if (win.isDestroyed()) return
  dlog('think:manual', { title })
  const res = await runThinking(title, notes)
  if (win.isDestroyed()) return
  streamBubbles(win, res.sessionId, res.bubbles, intervalMs)
}
