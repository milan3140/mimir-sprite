import { BrowserWindow, screen, ipcMain, Rectangle } from 'electron'
import { join } from 'path'
import { dlog } from './debugLog'

export type AnchorEdge = 'left' | 'right' | 'top' | 'bottom'

// ponytail: collapsed = cat only; expanded = cat + panel
export const WIN_W = 190
export const WIN_H = 190
const PANEL_W = 200
const PANEL_H = 360

const NUB_W = 18  // nub thickness (protrusion from edge) — prominent enough for a stranger to spot
const NUB_H = 76  // nub length along the edge

let currentlyExpanded = false
let currentEdge: AnchorEdge = 'right'
let collapsedBounds: Rectangle | null = null
let snapping = false                       // true while the ~320ms snap animation runs
let dockedBounds: Rectangle | null = null  // the FINAL docked (edge) collapsed bounds
let dragging = false                       // true while mouse-drag is active
let hidden = false                         // true while showing the edge nub
let preHideBounds: Rectangle | null = null

export function isExpanded(): boolean { return currentlyExpanded }
export function isSnapping(): boolean { return snapping }
export function isHidden(): boolean { return hidden }

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

  // Expand/collapse is driven by the main-process cursor poll in clickThrough.ts —
  // renderer mouseover/leave through a click-through, self-resizing window was unreliable
  // (re-hover stuck, flicker-collapse, residual panel sliver). Main is the single authority.

  // --- Drag driven entirely from main via cursor polling (DPI-safe) ---
  let dragOffset = { x: 0, y: 0 }
  let dragInterval: ReturnType<typeof setInterval> | null = null
  let pollCount = 0

  ipcMain.on('drag:start', (_e, catScreenRect?: { x: number; y: number; w: number; h: number }) => {
    if (win.isDestroyed()) return
    // ponytail: clear stale docked position so collapse won't jump to a previous edge
    dockedBounds = null
    // collapse before drag to avoid inflation
    if (currentlyExpanded) collapseWindow(win)

    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    const [ww, wh] = win.getSize()
    dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
    dragging = true
    pollCount = 0

    const disp = screen.getDisplayNearestPoint(cursor)
    const overCat = catScreenRect
      ? cursor.x >= catScreenRect.x && cursor.x <= catScreenRect.x + catScreenRect.w &&
        cursor.y >= catScreenRect.y && cursor.y <= catScreenRect.y + catScreenRect.h
      : 'unknown'
    dlog('drag:start', {
      cursor, winPos: { x: wx, y: wy }, winSize: { w: ww, h: wh },
      offset: dragOffset, scaleFactor: disp.scaleFactor, overCat, catScreenRect
    })

    dragInterval = setInterval(() => {
      if (!dragging || win.isDestroyed()) {
        if (dragInterval) clearInterval(dragInterval)
        return
      }
      const c = screen.getCursorScreenPoint()
      const rawX = c.x - dragOffset.x
      const rawY = c.y - dragOffset.y
      const { x: nx, y: ny, clamped } = clampToDisplay(c, rawX, rawY, WIN_W, WIN_H)
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return
      win.setBounds({ x: nx, y: ny, width: WIN_W, height: WIN_H })
      pollCount++
      if (clamped || pollCount % 12 === 0) {
        const [ax, ay] = win.getPosition()
        const [sw, sh] = win.getSize()
        dlog('drag:move', {
          cursor: c, set: { x: nx, y: ny }, actual: { x: ax, y: ay }, size: { w: sw, h: sh }, clamped
        })
      }
    }, 16)
  })

  ipcMain.on('cat:content', (_e, rect: { x: number; y: number; w: number; h: number }) => {
    if (rect && rect.w > 0 && rect.h > 0) {
      latestCatRect = rect
      // log the cat's live SCREEN rect (DIP) so a probe can locate it exactly before grabbing
      if (!win.isDestroyed()) {
        const [wx, wy] = win.getPosition()
        dlog('cat:screen', {
          x: Math.round(wx + rect.x), y: Math.round(wy + rect.y),
          w: Math.round(rect.w), h: Math.round(rect.h)
        })
      }
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

// --- Expand/Collapse: cat stays EXACTLY where it was, panel grows toward center ---

export function expandWindow(win: BrowserWindow): void {
  // Never expand mid-snap or mid-drag; expand from the TRUE docked edge bounds — not getBounds(),
  // which can be a mid-animation position. dockedBounds is set when the snap animation finishes.
  if (win.isDestroyed() || currentlyExpanded || snapping || dragging || hidden) return
  collapsedBounds = dockedBounds ?? win.getBounds()
  const { x: wx, y: wy } = collapsedBounds

  let bx: number, by: number, bw: number, bh: number
  switch (currentEdge) {
    case 'right':
      bx = wx - PANEL_W; by = wy; bw = WIN_W + PANEL_W; bh = PANEL_H; break
    case 'left':
      bx = wx; by = wy; bw = WIN_W + PANEL_W; bh = PANEL_H; break
    case 'top':
      bx = wx; by = wy; bw = WIN_W; bh = WIN_H + PANEL_H; break
    case 'bottom':
      bx = wx; by = wy - PANEL_H; bw = WIN_W; bh = WIN_H + PANEL_H; break
  }

  // Clamp ONLY the perpendicular axis. The panel grows toward screen center (always on-screen),
  // so the docked-edge axis must NOT be clamped — clamping it pulls the window (and the cat)
  // inward off the edge = the "cat displaces on hover when docked" bug (#B).
  const wa = screen.getDisplayMatching(collapsedBounds).workArea
  if (currentEdge === 'left' || currentEdge === 'right') {
    by = clamp(by, wa.y, wa.y + wa.height - bh) // keep panel vertically on-screen; cat stays docked
  } else {
    bx = clamp(bx, wa.x, wa.x + wa.width - bw)
  }

  currentlyExpanded = true
  win.setBounds({ x: Math.round(bx), y: Math.round(by), width: bw, height: bh })
  win.setIgnoreMouseEvents(false)
  win.webContents.send('window:expanded', { expanded: true, edge: currentEdge })
  dlog('window:expand', { from: collapsedBounds, to: { x: bx, y: by, w: bw, h: bh }, edge: currentEdge })
}

export function collapseWindow(win: BrowserWindow): void {
  if (win.isDestroyed() || !currentlyExpanded) return
  currentlyExpanded = false
  if (collapsedBounds) win.setBounds(collapsedBounds) // restore exact pre-expand position
  win.setIgnoreMouseEvents(true, { forward: true })
  win.webContents.send('window:expanded', { expanded: false, edge: currentEdge })
  dlog('window:collapse', { to: collapsedBounds, edge: currentEdge })
}

// --- Hide to nub / restore ---

export function hideToNub(win: BrowserWindow): void {
  if (win.isDestroyed() || hidden) return
  if (currentlyExpanded) collapseWindow(win)
  preHideBounds = dockedBounds ?? win.getBounds()
  const { x: wx, y: wy } = preHideBounds

  // The docked window hangs PARTLY OFF-SCREEN (cat's visible pixels are flush to the edge, the
  // transparent margin spills past it). So anchoring the nub to the WINDOW bounds put it in the
  // off-screen margin → invisible. Anchor to the SCREEN workArea edge instead, centred on the
  // cat's visible content.
  const wa = screen.getDisplayMatching(preHideBounds).workArea
  const cr = latestCatRect.w > 0 && latestCatRect.h > 0
    ? latestCatRect : { x: 0, y: 0, w: WIN_W, h: WIN_H }
  const catCx = wx + cr.x + cr.w / 2
  const catCy = wy + cr.y + cr.h / 2

  let nx = 0, ny = 0, nw = 0, nh = 0
  switch (currentEdge) {
    case 'left':
      nw = NUB_W; nh = NUB_H
      nx = wa.x; ny = clamp(Math.round(catCy - nh / 2), wa.y, wa.y + wa.height - nh); break
    case 'right':
      nw = NUB_W; nh = NUB_H
      nx = wa.x + wa.width - nw; ny = clamp(Math.round(catCy - nh / 2), wa.y, wa.y + wa.height - nh); break
    case 'top':
      nw = NUB_H; nh = NUB_W
      ny = wa.y; nx = clamp(Math.round(catCx - nw / 2), wa.x, wa.x + wa.width - nw); break
    case 'bottom':
      nw = NUB_H; nh = NUB_W
      ny = wa.y + wa.height - nh; nx = clamp(Math.round(catCx - nw / 2), wa.x, wa.x + wa.width - nw); break
  }

  hidden = true
  win.setBounds({ x: nx, y: ny, width: nw, height: nh })
  win.setIgnoreMouseEvents(false) // nub fully clickable
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

// --- Snap ---

let snapInterval: ReturnType<typeof setInterval> | null = null
let latestCatRect = { x: 0, y: 0, w: 0, h: 0 }

function snapToNearestEdge(win: BrowserWindow): void {
  if (snapInterval) { clearInterval(snapInterval); snapInterval = null }

  const [wx, wy] = win.getPosition()
  const [reportedW, reportedH] = win.getSize()
  const ww = WIN_W, wh = WIN_H
  const cursor = screen.getCursorScreenPoint()

  const dispByCursor = screen.getDisplayNearestPoint(cursor)
  const dispByWindow = screen.getDisplayMatching({ x: wx, y: wy, width: ww, height: wh })
  const wa = dispByWindow.workArea

  const cr = latestCatRect.w > 0 && latestCatRect.h > 0
    ? latestCatRect : { x: 0, y: 0, w: ww, h: wh }

  const ccx = wx + cr.x + cr.w / 2
  const ccy = wy + cr.y + cr.h / 2
  const distances = {
    left: ccx - wa.x,
    right: wa.x + wa.width - ccx,
    top: ccy - wa.y,
    bottom: wa.y + wa.height - ccy
  }

  const edge = (Object.keys(distances) as AnchorEdge[]).reduce((a, b) =>
    distances[a] <= distances[b] ? a : b
  )
  currentEdge = edge

  let tx = wx, ty = wy
  switch (edge) {
    case 'left':   tx = wa.x - cr.x;                      ty = clamp(wy, wa.y, wa.y + wa.height - wh); break
    case 'right':  tx = wa.x + wa.width - (cr.x + cr.w);  ty = clamp(wy, wa.y, wa.y + wa.height - wh); break
    case 'top':    ty = wa.y - cr.y;                      tx = clamp(wx, wa.x, wa.x + wa.width - ww);  break
    case 'bottom': ty = wa.y + wa.height - (cr.y + cr.h); tx = clamp(wx, wa.x, wa.x + wa.width - ww);  break
  }
  tx = Math.round(tx); ty = Math.round(ty)

  dlog('snap:compute', {
    winPos: { x: wx, y: wy }, sizeUsed: { w: ww, h: wh },
    reportedSize: { w: reportedW, h: reportedH },
    catRect: cr, distances, edge, target: { x: tx, y: ty },
    scaleFactor: dispByWindow.scaleFactor, workArea: wa,
    sameDisplay: dispByCursor.id === dispByWindow.id
  })

  const frames = 20
  const startX = wx, startY = wy
  let frame = 0
  snapping = true // block hover-expand until the cat is docked at the edge

  snapInterval = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(snapInterval!); snapInterval = null; snapping = false; return }
    frame++
    const t = easeOut(frame / frames)
    const x = Math.round(startX + (tx - startX) * t)
    const y = Math.round(startY + (ty - startY) * t)
    if (Number.isFinite(x) && Number.isFinite(y)) win.setBounds({ x, y, width: WIN_W, height: WIN_H })
    if (frame >= frames) {
      clearInterval(snapInterval!); snapInterval = null
      snapping = false
      dockedBounds = { x: tx, y: ty, width: WIN_W, height: WIN_H } // canonical docked position
      // ponytail: emit fresh cat:screen so probes/tools have accurate position after snap
      if (latestCatRect.w > 0) {
        dlog('cat:screen', {
          x: Math.round(tx + latestCatRect.x), y: Math.round(ty + latestCatRect.y),
          w: Math.round(latestCatRect.w), h: Math.round(latestCatRect.h)
        })
      }
      // ponytail: snap animation sets WIN_W×WIN_H = collapsed; force-reset if stale
      if (currentlyExpanded) {
        currentlyExpanded = false
        win.setIgnoreMouseEvents(true, { forward: true })
        win.webContents.send('window:expanded', { expanded: false, edge })
      }
      const [ax, ay] = win.getPosition()
      dlog('snap:done', { target: { x: tx, y: ty }, actual: { x: ax, y: ay }, edge })
      if (!win.isDestroyed()) win.webContents.send('anchor:changed', edge)
    }
  }, 16)
}

function clampToDisplay(
  point: { x: number; y: number }, x: number, y: number, w: number, h: number
): { x: number; y: number; clamped: boolean } {
  const b = screen.getDisplayNearestPoint(point).bounds
  const cx = Math.round(clamp(x, b.x, b.x + b.width - w))
  const cy = Math.round(clamp(y, b.y, b.y + b.height - h))
  return { x: cx, y: cy, clamped: cx !== Math.round(x) || cy !== Math.round(y) }
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(max, v))
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
