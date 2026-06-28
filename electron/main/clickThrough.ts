import { BrowserWindow, ipcMain, screen } from 'electron'
import { isExpanded, isHidden, isSnapping, isDragging, expandWindow, collapseWindow, getPanelHitRect } from './windowManager'

/**
 * Main-process cursor controller (single source of truth) for the FIXED-WINDOW model. The window is
 * always the expanded size while docked, so "outside the window" is no longer the collapse trigger —
 * we hit-test the cat rect and the panel rect instead, and toggle click-through accordingly.
 *  - cursor over cat (or panel, when open) -> window interactive (drag / panel buttons).
 *  - cursor over the cat while collapsed -> open the panel (CSS disclosure, no resize).
 *  - cursor outside cat+panel for >180ms while expanded -> collapse.
 *  - everywhere else -> click-through (transparent passes to desktop).
 */
export function setupClickThrough(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(true, { forward: true })

  let catRect = { x: 0, y: 0, w: 0, h: 0 } // sprite box within the window (DIP), from the renderer
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
    if (win.isDestroyed() || !win.isVisible() || isHidden() || isSnapping() || isDragging()) return
    const cursor = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const relX = cursor.x - b.x
    const relY = cursor.y - b.y

    const onCat =
      relX >= catRect.x && relX <= catRect.x + catRect.w &&
      relY >= catRect.y && relY <= catRect.y + catRect.h

    let onPanel = false
    if (isExpanded()) {
      const p = getPanelHitRect()
      if (p) {
        onPanel = relX >= p.x && relX <= p.x + p.width && relY >= p.y && relY <= p.y + p.height
      }
    }

    const over = onCat || onPanel
    setInteractive(over) // click-through unless over the cat or the open panel

    if (!isExpanded()) {
      if (onCat) expandWindow(win) // idempotent — guarded inside
    } else if (over) {
      outsideSince = 0
    } else if (!outsideSince) {
      outsideSince = Date.now()
    } else if (Date.now() - outsideSince > 180) {
      collapseWindow(win)
      outsideSince = 0
      interactive = false // window is click-through again; keep our flag in sync
    }
  }, 100)
}
