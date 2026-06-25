import { app, screen } from 'electron'
import { appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Instrument-first debug logger. Writes structured lines to <appPath>/mimir-debug.log
 * AND the terminal, so a bug can be diagnosed from real-machine data instead of guessed.
 * Toggle with env MIMIR_DEBUG=0 to silence.
 */
const ENABLED = process.env.MIMIR_DEBUG !== '0'
const LOG_PATH = join(app.getAppPath(), 'mimir-debug.log')

export function initDebugLog(): void {
  if (!ENABLED) return
  try {
    writeFileSync(LOG_PATH, `=== Mimir-Sprite debug log @ ${new Date().toISOString()} ===\n`)
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log('[mimir-debug] logging to', LOG_PATH)
  dumpDisplays('startup')
}

export function dlog(tag: string, data?: Record<string, unknown>): void {
  if (!ENABLED) return
  const line = `[${new Date().toISOString()}] ${tag}${data ? ' ' + JSON.stringify(data) : ''}`
  try {
    appendFileSync(LOG_PATH, line + '\n')
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

export const DEBUG_LOG_PATH = LOG_PATH
