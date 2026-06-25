import { BrowserWindow, ipcMain, screen } from 'electron'

/**
 * Click-through: transparent areas pass clicks to desktop.
 * Renderer sends cat-rect, main polls cursor position every 120ms as fallback
 * because Electron's mouseleave is unreliable after forward:true on Windows.
 */
export function setupClickThrough(win: BrowserWindow): void {
  // Start with click-through on
  win.setIgnoreMouseEvents(true, { forward: true })

  let catRect = { x: 0, y: 0, w: 0, h: 0 }
  let isInteractive = false

  ipcMain.on('cat:rect', (_e, rect: { x: number; y: number; w: number; h: number }) => {
    catRect = rect
  })

  ipcMain.on('mouse:enter-cat', () => {
    if (!isInteractive) {
      isInteractive = true
      win.setIgnoreMouseEvents(false)
    }
  })

  ipcMain.on('mouse:leave-cat', () => {
    if (isInteractive) {
      isInteractive = false
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  })

  // ponytail: cursor-polling fallback — Electron mouseleave breaks after forward:true on Win
  setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return

    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    const relX = cursor.x - wx
    const relY = cursor.y - wy

    const inside =
      relX >= catRect.x &&
      relX <= catRect.x + catRect.w &&
      relY >= catRect.y &&
      relY <= catRect.y + catRect.h

    if (inside && !isInteractive) {
      isInteractive = true
      win.setIgnoreMouseEvents(false)
    } else if (!inside && isInteractive) {
      isInteractive = false
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  }, 120)
}
