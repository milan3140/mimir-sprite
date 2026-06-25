import { BrowserWindow, ipcMain, screen } from 'electron'
import { isExpanded, expandWindow, collapseWindow } from './windowManager'

/**
 * Main-process cursor controller for the floating window (single source of truth):
 *  - COLLAPSED: cursor over the cat -> make the window interactive (so it can be dragged) AND
 *    open the todo panel; cursor elsewhere -> click-through (transparent passes to desktop).
 *  - EXPANDED: cursor outside the window for >250ms -> collapse.
 * Driving this from the real cursor (instead of renderer mouseover/leave fired through a
 * click-through, self-resizing window) fixes: re-hover-stuck, flicker-collapse, residual sliver.
 */
export function setupClickThrough(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(true, { forward: true })

  let catRect = { x: 0, y: 0, w: 0, h: 0 } // sprite box within the window (DIP), for hover hit-test
  let interactive = false
  let outsideSince = 0

  ipcMain.on('cat:rect', (_e, r: { x: number; y: number; w: number; h: number }) => {
    if (r) catRect = r
  })

  const setInteractive = (next: boolean): void => {
    if (next === interactive) return
    interactive = next
    win.setIgnoreMouseEvents(!next, next ? undefined : { forward: true })
  }

  setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return
    const cursor = screen.getCursorScreenPoint()
    const b = win.getBounds()

    if (isExpanded()) {
      const inside =
        cursor.x >= b.x && cursor.x <= b.x + b.width &&
        cursor.y >= b.y && cursor.y <= b.y + b.height
      if (inside) {
        outsideSince = 0
      } else if (!outsideSince) {
        outsideSince = Date.now()
      } else if (Date.now() - outsideSince > 150) {
        collapseWindow(win)
        outsideSince = 0
        interactive = false // window is click-through again; keep our flag in sync
      }
      return
    }

    // collapsed: is the cursor over the cat?
    const relX = cursor.x - b.x
    const relY = cursor.y - b.y
    const onCat =
      relX >= catRect.x && relX <= catRect.x + catRect.w &&
      relY >= catRect.y && relY <= catRect.y + catRect.h
    if (onCat) {
      setInteractive(true) // so a mousedown can begin a drag
      expandWindow(win)    // and open the panel (idempotent — guarded inside)
    } else {
      setInteractive(false)
    }
  }, 100)
}
