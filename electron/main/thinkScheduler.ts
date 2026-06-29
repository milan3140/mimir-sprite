import { BrowserWindow } from 'electron'
import { dlog } from './debugLog'
import { getThinkSettings, getAppState, getTodos } from './store'
import { streamRealThinking } from './thinking'

// M5 auto-think scheduler (docs/05 需求 7) — when idle AND auto is enabled, after a random [min,max] gap
// pick one of the top-N incomplete todos and run a think. Paused during working/resting (nextAt resets,
// so the gap restarts on return to idle). DEFAULT OFF via getThinkSettings — never auto-spends unless the
// user opts in. The 🧠 manual trigger is the always-available path.

let timer: ReturnType<typeof setInterval> | null = null
let nextAt = 0          // ms epoch of the next scheduled think; 0 = not yet scheduled
let running = false

export function startThinkScheduler(win: BrowserWindow): void {
  const fast = process.env.MIMIR_THINK_AUTO === '1'
  const checkMs = fast ? 1500 : 30_000

  const tick = async (): Promise<void> => {
    if (win.isDestroyed() || running) return
    const cfg = getThinkSettings()
    if (!cfg.autoEnabled) { nextAt = 0; return }            // gated OFF → never fires
    if (getAppState().mode !== 'idle') { nextAt = 0; return } // pause; reschedule when idle again

    const now = Date.now()
    if (nextAt === 0) {
      const spanMin = cfg.minMinutes + Math.random() * Math.max(0, cfg.maxMinutes - cfg.minMinutes)
      const ms = fast ? 1200 : spanMin * 60_000
      nextAt = now + ms
      dlog('think:sched', { nextInMs: Math.round(ms) })
      return
    }
    if (now < nextAt) return

    nextAt = 0
    const candidates = getTodos().filter((t) => t.status !== 'done').slice(0, cfg.candidateTopN)
    if (!candidates.length) { dlog('think:sched-skip', { reason: 'no-incomplete-todos' }); return }
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    dlog('think:sched-fire', { id: pick.id, title: pick.title })
    running = true
    try { await streamRealThinking(win, pick.title, pick.notes ?? '', fast ? 0.06 : 1) }
    finally { running = false }
  }

  timer = setInterval(() => { void tick() }, checkMs)
  dlog('think:sched-start', { autoEnabled: getThinkSettings().autoEnabled, checkMs })
}

export function stopThinkScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}
