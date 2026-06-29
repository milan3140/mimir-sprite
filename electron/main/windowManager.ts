import { BrowserWindow, screen, ipcMain, Rectangle } from 'electron'
import { join } from 'path'
import { dlog } from './debugLog'
import { getInjectedCursor } from './testControl'
import { CELL, WIN_W, WIN_H, CAT_X, CAT_Y, HUG_X, HUG_Y, EAR_W, EAR_D } from '../../src/shared/geometry'
import { getPanelSize } from './store'

// cursor source: injected (test-control, no OS mouse) when present, else the real OS cursor
function cursorPoint(): { x: number; y: number } {
  return getInjectedCursor() ?? screen.getCursorScreenPoint()
}

export type AnchorEdge = 'left' | 'right' | 'top' | 'bottom'
export { WIN_W, WIN_H }

// ===========================================================================================
// UNIFIED FIXED-WINDOW, CAT-GLUED MODEL (see TEST_DESIGN.md §6 contract)
// -------------------------------------------------------------------------------------------
// The window is ONE fixed size on every edge and in every state. The cat cell sits at a CONSTANT
// position inside it (CAT_X, CAT_Y) — it is rigidly glued to the window. Docking, dragging and the
// hover-panel NEVER move the cat within the window and NEVER resize the window:
//   - snap  = MOVE the window (cat rides along, perfectly in sync — no re-anchor, no teleport)
//   - hover = CSS panel disclosure only (no native resize — no flicker)
//   - drag  = MOVE the window at its fixed size (no resize — no grab flash)
// Only the PANEL repositions per edge, and only while it is collapsed (invisible), so there is no
// visible main↔renderer desync to flash. This kills the whole flicker/teleport class structurally.
// ===========================================================================================

// Geometry constants (CELL, PANEL_W/H, WIN_W/H, CAT_X/Y, HUG_X/Y, EAR_W/D) now come from the shared
// module ../../src/shared/geometry — the ONE source of truth shared with the renderer (App.tsx).
let currentlyExpanded = false
let currentEdge: AnchorEdge = 'right'
let snapping = false
let dragging = false
let hidden = false
let didInitialDock = false
let dockedBounds: Rectangle | null = null      // the fixed-size window rect at its docked position
let preHideBounds: Rectangle | null = null
// tight visible cat-content box in CELL coordinates (0..190). Captured ONLY from a cellBox-ready
// ("tight") report — never the boot fallback full render box (that was the 150×150 not-flush bug).
let spriteContentBox = { x: 0, y: 0, w: 0, h: 0 }
let scTight = false
let latestCatRect = { x: 0, y: 0, w: 0, h: 0 } // window-relative sprite hit rect (from renderer)

export function isExpanded(): boolean { return currentlyExpanded }
export function isSnapping(): boolean { return snapping }
export function isHidden(): boolean { return hidden }
export function isDragging(): boolean { return dragging }

export function createWindow(): BrowserWindow {
  const preload = join(__dirname, '../preload/index.js')

  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    thickFrame: false,
    roundedCorners: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.once('did-finish-load', () => {
    const [w, h] = win.getSize()
    const [x, y] = win.getPosition()
    dlog('win:created', { askedW: WIN_W, askedH: WIN_H, gotW: w, gotH: h, x, y })
  })

  // --- Drag driven from main via cursor polling (DPI-safe). The window is ALWAYS WIN_W×WIN_H, so a
  //     drag is a pure MOVE at fixed size — no resize, no grab flash. ---
  let dragOffset = { x: 0, y: 0 }
  let dragInterval: ReturnType<typeof setInterval> | null = null

  ipcMain.on('drag:start', (_e, catScreenRect?: { x: number; y: number; w: number; h: number }) => {
    if (win.isDestroyed() || hidden) return
    if (currentlyExpanded) collapseWindow(win)
    const cursor = cursorPoint()
    const [wx, wy] = win.getPosition()
    dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
    dragging = true
    const disp = screen.getDisplayNearestPoint(cursor)
    dlog('drag:start', {
      cursor, winPos: { x: wx, y: wy }, winSize: { w: WIN_W, h: WIN_H },
      offset: dragOffset, scaleFactor: disp.scaleFactor, catScreenRect
    })
    dragInterval = setInterval(() => {
      if (!dragging || win.isDestroyed()) {
        if (dragInterval) clearInterval(dragInterval)
        return
      }
      const c = cursorPoint()
      const nx = Math.round(c.x - dragOffset.x)
      const ny = Math.round(c.y - dragOffset.y)
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return
      win.setBounds({ x: nx, y: ny, width: WIN_W, height: WIN_H }) // MOVE only, fixed size
    }, 16)
  })

  ipcMain.on('cat:content', (_e, rect: { x: number; y: number; w: number; h: number; tight?: boolean }) => {
    if (!rect || rect.w <= 0 || rect.h <= 0) return
    latestCatRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
    // capture the cell-relative TIGHT content box (cat is glued at CAT_X,CAT_Y, so cell = window - CAT_*).
    // Only from a tight (cellBox-ready) report — the boot fallback full box gave the 59px not-flush bug.
    if (rect.tight) {
      spriteContentBox = { x: rect.x - CAT_X, y: rect.y - CAT_Y, w: rect.w, h: rect.h }
      scTight = true
    }
    if (!win.isDestroyed()) {
      const [wx, wy] = win.getPosition()
      dlog('cat:screen', {
        x: Math.round(wx + rect.x), y: Math.round(wy + rect.y),
        w: Math.round(rect.w), h: Math.round(rect.h)
      })
    }
    // Dock once at boot — but ONLY after a tight content box arrives, so flush is correct from frame 1.
    if (!didInitialDock && scTight && !dragging && !snapping && !hidden && !currentlyExpanded && !win.isDestroyed()) {
      didInitialDock = true
      snapToNearestEdge(win)
    }
  })

  ipcMain.on('drag:end', () => {
    if (!dragging) return
    dragging = false
    if (dragInterval) { clearInterval(dragInterval); dragInterval = null }
    const [wx, wy] = win.getPosition()
    dlog('drag:end', { winPos: { x: wx, y: wy } })
    if (!win.isDestroyed()) snapToNearestEdge(win)
  })

  return win
}

// cat content box in WINDOW coordinates (cat is glued at CAT_X,CAT_Y; sc is its cell offset)
function contentInWindow(): { x: number; y: number; w: number; h: number } {
  const sc = scTight ? spriteContentBox : { x: 0, y: 0, w: CELL, h: CELL }
  return { x: CAT_X + sc.x, y: CAT_Y + sc.y, w: sc.w, h: sc.h }
}

// --- Expand / Collapse: NO native resize (window already the right size) — CSS panel disclosure only.
export function expandWindow(win: BrowserWindow): void {
  if (win.isDestroyed() || currentlyExpanded || snapping || dragging || hidden || !dockedBounds) return
  currentlyExpanded = true
  win.webContents.send('window:expanded', { expanded: true, edge: currentEdge, catOffset: 0 })
  dlog('window:expand', { to: dockedBounds, edge: currentEdge })
}

export function collapseWindow(win: BrowserWindow): void {
  if (win.isDestroyed() || !currentlyExpanded) return
  currentlyExpanded = false
  win.webContents.send('window:expanded', { expanded: false, edge: currentEdge, catOffset: 0 })
  dlog('window:collapse', { edge: currentEdge })
}

// The panel's window-relative hit rect for the current docked edge (must match App.tsx panelStyle).
export function getPanelHitRect(): Rectangle | null {
  if (!dockedBounds) return null
  const { w: PANEL_W, h: PANEL_H } = getPanelSize() // dynamic (user-resized); single source = the store
  // small margin so the resize grip (which pokes ~10px beyond the panel corner) stays inside the
  // interactive region — else a click on the grip's outer ring would fall through.
  const M = 14
  const grow = (r: Rectangle): Rectangle => ({ x: r.x - M, y: r.y - M, width: r.width + 2 * M, height: r.height + 2 * M })
  switch (currentEdge) {
    case 'right':  return grow({ x: CAT_X - PANEL_W + HUG_X, y: CAT_Y + CELL / 2 - PANEL_H / 2, width: PANEL_W, height: PANEL_H })
    case 'left':   return grow({ x: CAT_X + CELL - HUG_X,    y: CAT_Y + CELL / 2 - PANEL_H / 2, width: PANEL_W, height: PANEL_H })
    case 'top':    return grow({ x: CAT_X + CELL / 2 - PANEL_W / 2, y: CAT_Y + CELL - HUG_Y,    width: PANEL_W, height: PANEL_H })
    case 'bottom': return grow({ x: CAT_X + CELL / 2 - PANEL_W / 2, y: CAT_Y - PANEL_H + HUG_Y, width: PANEL_W, height: PANEL_H })
  }
  return null
}

// --- Hide to nub / restore ---
export function hideToNub(win: BrowserWindow): void {
  if (win.isDestroyed() || hidden) return
  if (currentlyExpanded) collapseWindow(win)
  preHideBounds = dockedBounds ?? win.getBounds()
  const { x: wx, y: wy } = preHideBounds
  const wa = screen.getDisplayMatching(preHideBounds).workArea
  const cc = contentInWindow()
  const ccx = wx + cc.x + cc.w / 2
  const ccy = wy + cc.y + cc.h / 2
  let nx = 0, ny = 0, nw = 0, nh = 0
  switch (currentEdge) {
    case 'bottom': nw = EAR_W; nh = EAR_D; nx = clamp(Math.round(ccx - EAR_W / 2), wa.x, wa.x + wa.width - nw); ny = wa.y + wa.height - EAR_D; break
    case 'top':    nw = EAR_W; nh = EAR_D; nx = clamp(Math.round(ccx - EAR_W / 2), wa.x, wa.x + wa.width - nw); ny = wa.y; break
    case 'left':   nw = EAR_D; nh = EAR_W; nx = wa.x; ny = clamp(Math.round(ccy - EAR_W / 2), wa.y, wa.y + wa.height - nh); break
    case 'right':  nw = EAR_D; nh = EAR_W; nx = wa.x + wa.width - EAR_D; ny = clamp(Math.round(ccy - EAR_W / 2), wa.y, wa.y + wa.height - nh); break
  }
  hidden = true
  win.setBounds({ x: nx, y: ny, width: nw, height: nh })
  win.setIgnoreMouseEvents(false)
  win.webContents.send('window:hidden', { hidden: true, edge: currentEdge })
  dlog('window:hideToNub', { preHideBounds, nub: { x: nx, y: ny, w: nw, h: nh }, edge: currentEdge, wa })
}

export function restoreFromNub(win: BrowserWindow): void {
  if (win.isDestroyed() || !hidden) return
  hidden = false
  if (preHideBounds) win.setBounds(preHideBounds)
  win.setIgnoreMouseEvents(true, { forward: true })
  win.webContents.send('window:hidden', { hidden: false, edge: currentEdge })
  dlog('window:restoreFromNub', { bounds: preHideBounds, edge: currentEdge })
}

// --- Snap: pick nearest edge from the cat's CURRENT screen position, then MOVE the fixed-size window
//     so the cat content is flush at that edge. The cat is glued to the window, so it rides the move
//     in perfect sync — no re-anchor, no teleport, no resize. ---
let snapInterval: ReturnType<typeof setInterval> | null = null

function snapToNearestEdge(win: BrowserWindow): void {
  if (snapInterval) { clearInterval(snapInterval); snapInterval = null }
  const start = win.getBounds()
  const wa = screen.getDisplayMatching(start).workArea
  const cc = contentInWindow() // cat content in window coords (constant layout)

  // cat content screen centre → nearest edge
  const ccx = start.x + cc.x + cc.w / 2
  const ccy = start.y + cc.y + cc.h / 2
  const distances = {
    left: ccx - wa.x, right: wa.x + wa.width - ccx,
    top: ccy - wa.y, bottom: wa.y + wa.height - ccy
  }
  const edge = (Object.keys(distances) as AnchorEdge[]).reduce((a, b) => distances[a] <= distances[b] ? a : b)
  currentEdge = edge

  // target window pos: flush on the docked axis; keep current position on the perpendicular axis
  // (clamped so the cat content stays fully within the workArea).
  let tx = start.x, ty = start.y
  const vClampLo = wa.y - cc.y, vClampHi = wa.y + wa.height - cc.h - cc.y
  const hClampLo = wa.x - cc.x, hClampHi = wa.x + wa.width - cc.w - cc.x
  switch (edge) {
    case 'left':   tx = wa.x - cc.x;                       ty = clamp(start.y, vClampLo, vClampHi); break
    case 'right':  tx = wa.x + wa.width - cc.w - cc.x;     ty = clamp(start.y, vClampLo, vClampHi); break
    case 'top':    ty = wa.y - cc.y;                       tx = clamp(start.x, hClampLo, hClampHi); break
    case 'bottom': ty = wa.y + wa.height - cc.h - cc.y;    tx = clamp(start.x, hClampLo, hClampHi); break
  }
  tx = Math.round(tx); ty = Math.round(ty)
  const target = { x: tx, y: ty, width: WIN_W, height: WIN_H }

  // Tell the renderer the new edge NOW — this only repositions the (collapsed → invisible) panel and
  // flips the cat to face into the screen; the cat's window POSITION is unchanged, so nothing jumps.
  win.webContents.send('window:expanded', { expanded: false, edge, catOffset: 0 })
  if (!win.isDestroyed()) win.webContents.send('anchor:changed', edge)
  dlog('snap:compute', { start, content: cc, edge, target, wa })

  const frames = 22
  let frame = 0
  snapping = true
  snapInterval = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(snapInterval!); snapInterval = null; snapping = false; return }
    frame++
    const t = easeOut(frame / frames)
    const x = Math.round(start.x + (target.x - start.x) * t)
    const y = Math.round(start.y + (target.y - start.y) * t)
    if (Number.isFinite(x) && Number.isFinite(y)) win.setBounds({ x, y, width: WIN_W, height: WIN_H }) // MOVE only
    if (frame >= frames) {
      clearInterval(snapInterval!); snapInterval = null
      dockedBounds = target
      currentlyExpanded = false
      win.setBounds(target)
      win.setIgnoreMouseEvents(true, { forward: true })
      snapping = false
      dlog('cat:screen', { x: Math.round(tx + cc.x), y: Math.round(ty + cc.y), w: Math.round(cc.w), h: Math.round(cc.h) })
      dlog('snap:done', { target, edge, flush: { x: tx + cc.x, y: ty + cc.y } })
    }
  }, 16)
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(max, v))
}

function easeOut(t: number): number {
  // quadratic ease-out: gentler first-frame step than cubic on long flings (no big leading jump),
  // still settles smoothly. Snap distances are usually small, so this is just insurance.
  return 1 - (1 - t) * (1 - t)
}
