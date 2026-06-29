import { BrowserWindow, ipcMain, screen } from 'electron'
import { isExpanded, isHidden, isSnapping, isDragging, expandWindow, collapseWindow, getPanelHitRect } from './windowManager'
import { getInjectedCursor } from './testControl'

/**
 * Main-process cursor controller (single source of truth) for the FIXED-WINDOW model. The window is
 * always the expanded size while docked, so "outside the window" is no longer the collapse trigger —
 * we hit-test the cat rect and the panel rect instead, and toggle click-through accordingly.
 *  - cursor over cat (or panel, when open) -> window interactive (drag / panel buttons).
 *  - cursor over the cat while collapsed -> open the panel (CSS disclosure, no resize).
 *  - cursor outside cat+panel for >180ms while expanded -> collapse.
 *  - everywhere else -> click-through (transparent passes to desktop).
 *
 * SINGLE OWNER of setIgnoreMouseEvents while visible & not (snapping/dragging/hidden): this poll, and
 * only this poll. windowManager DOES call setIgnoreMouseEvents during those excluded transitions
 * (snap:done sets ignore=true; hideToNub false; restore true). Previously this poll kept a private
 * `interactive` flag and early-returned when it "matched", so after a snap/restore the flag was stale
 * (true) while the window was actually ignoring mouse events → hovering the cat did nothing and you
 * couldn't grab it OR click the add-todo box (user-reported). Fix: the poll re-asserts the correct
 * setIgnoreMouseEvents whenever it resumes after a skipped tick (a transition just changed the real
 * state) OR the hit-state changes — so the flag can never drift from reality.
 */
export function setupClickThrough(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(true, { forward: true })

  // Z-ORDER: a transparent always-on-top window can be demoted below other windows (Windows lets
  // another app steal the top), so the cat "flashes to a lower layer and can't be clicked". The moment
  // it gets demoted is when it loses focus, so re-assert topmost on 'blur' — event-driven, not a blind
  // periodic heartbeat (which would itself cause a visible re-raise flicker). Plus moveTop the instant
  // the cursor reaches the cat/panel (below), so it's on top right when you reach for it.
  win.on('blur', () => { if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver') })

  let catRect = { x: 0, y: 0, w: 0, h: 0 } // sprite box within the window (DIP), from the renderer
  let lastOver: boolean | null = null      // last applied interactive state; null = must re-assert
  let skippedLast = true                    // last tick was skipped (a transition may have changed state)
  let outsideSince = 0

  ipcMain.on('cat:rect', (_e, r: { x: number; y: number; w: number; h: number }) => {
    if (r) catRect = r
  })

  const applyInteractive = (over: boolean): void => {
    // re-assert after a skipped tick (windowManager may have changed the real state during a
    // snap/drag/hide/restore) or whenever the hit-state changed. Idempotent otherwise.
    if (!skippedLast && over === lastOver) return
    win.setIgnoreMouseEvents(!over, over ? undefined : { forward: true })
    lastOver = over
  }

  setInterval(() => {
    if (win.isDestroyed() || !win.isVisible() || isHidden() || isSnapping() || isDragging()) {
      skippedLast = true // next active tick must re-assert: the transition owns the mouse state now
      return
    }
    const cursor = getInjectedCursor() ?? screen.getCursorScreenPoint()
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
    if (over && lastOver !== true) win.moveTop() // raise to top the instant the cursor reaches it
    applyInteractive(over) // click-through unless over the cat or the open panel
    skippedLast = false

    if (!isExpanded()) {
      if (onCat) expandWindow(win) // idempotent — guarded inside
    } else if (over) {
      outsideSince = 0
    } else if (!outsideSince) {
      outsideSince = Date.now()
    } else if (Date.now() - outsideSince > 180) {
      collapseWindow(win)
      outsideSince = 0
    }
  }, 100)
}
