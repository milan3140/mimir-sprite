import { app, screen } from 'electron'
import { appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Instrument-first debug logger. Writes structured lines to <appPath>/mimir-debug.log
 * AND the terminal, so a bug can be diagnosed from real-machine data instead of guessed.
 * Toggle with env MIMIR_DEBUG=0 to silence.
 */
const ENABLED = process.env.MIMIR_DEBUG !== '0'

// Lazy: app.getAppPath() must NOT run at module top level — `app` is undefined until the
// electron main process is ready, which crashed startup. Resolve on first use instead.
let _logPath = ''
function logPath(): string {
  if (!_logPath) _logPath = join(app.getAppPath(), 'mimir-debug.log')
  return _logPath
}

export function initDebugLog(): void {
  if (!ENABLED) return
  try {
    writeFileSync(logPath(), `=== Mimir-Sprite debug log @ ${new Date().toISOString()} ===\n`)
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log('[mimir-debug] logging to', logPath())
  dumpDisplays('startup')
}

export function dlog(tag: string, data?: Record<string, unknown>): void {
  if (!ENABLED) return
  const line = `[${new Date().toISOString()}] ${tag}${data ? ' ' + JSON.stringify(data) : ''}`
  try {
    appendFileSync(logPath(), line + '\n')
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log(line)
}

/** Dump every display's geometry + DPI so we can spot scaling / multi-monitor issues (H1/H2/H4). */
export function dumpDisplays(when: string): void {
  if (!ENABLED) return
  const displays = screen.getAllDisplays().map((d) => ({
    id: d.id,
    scaleFactor: d.scaleFactor,
    bounds: d.bounds,
    workArea: d.workArea
  }))
  const primary = screen.getPrimaryDisplay().id
  const cursor = screen.getCursorScreenPoint()
  dlog(`displays:${when}`, { primary, cursor, displays })
}

export function debugLogPath(): string { return logPath() }
