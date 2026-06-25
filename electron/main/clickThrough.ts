import { BrowserWindow, ipcMain, screen } from 'electron'
import { dlog } from './debugLog'

/**
 * Click-through: transparent areas pass clicks to desktop.
 * Renderer sends cat-rect (the actual sprite, not the whole window), main polls cursor
 * every 120ms as fallback because Electron's mouseleave is unreliable after forward:true on Windows.
 */
export function setupClickThrough(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(true, { forward: true })

  let catRect = { x: 0, y: 0, w: 0, h: 0 }
  let isInteractive = false

  const setInteractive = (next: boolean, src: string): void => {
    if (next === isInteractive) return
    isInteractive = next
    win.setIgnoreMouseEvents(!next, next ? undefined : { forward: true })
    dlog('clickthrough:toggle', { interactive: next, src, catRect })
  }

  ipcMain.on('cat:rect', (_e, rect: { x: number; y: number; w: number; h: number }) => {
    catRect = rect
  })
  ipcMain.on('mouse:enter-cat', () => setInteractive(true, 'enter-ipc'))
  ipcMain.on('mouse:leave-cat', () => setInteractive(false, 'leave-ipc'))

  // cursor-polling fallback — Electron mouseleave breaks after forward:true on Win
  setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    const relX = cursor.x - wx
    const relY = cursor.y - wy
    const inside =
      relX >= catRect.x && relX <= catRect.x + catRect.w &&
      relY >= catRect.y && relY <= catRect.y + catRect.h
    if (inside) setInteractive(true, 'poll')
    else setInteractive(false, 'poll')
  }, 120)
}
