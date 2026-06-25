import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { dlog } from './debugLog'

export type AnchorEdge = 'left' | 'right' | 'top' | 'bottom'

// single size constant, tune here. Bigger window = bigger cat (see spriteConfig scale).
export const WIN_W = 190
export const WIN_H = 190

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
    // H3: is the actual window size what we asked for?
    dlog('win:created', { askedW: WIN_W, askedH: WIN_H, gotW: w, gotH: h, x, y })
  })

  // --- Drag driven entirely from main via cursor polling (DPI-safe) ---
  let dragging = false
  let dragOffset = { x: 0, y: 0 }
  let dragInterval: ReturnType<typeof setInterval> | null = null
  let pollCount = 0

  ipcMain.on('drag:start', (_e, catScreenRect?: { x: number; y: number; w: number; h: number }) => {
    if (win.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    const [ww, wh] = win.getSize()
    dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
    dragging = true
    pollCount = 0

    const disp = screen.getDisplayNearestPoint(cursor)
    // H6: was the cursor actually over the cat sprite when drag started?
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
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
        dlog('drag:move:NONFINITE', { rawX, rawY }) // H5
        return
      }
      // FIX (H3): setBounds with FIXED width/height re-asserts size every frame, so the
      // Win11 transparent-window DPI inflation can't accumulate (was growing 128→737).
      win.setBounds({ x: nx, y: ny, width: WIN_W, height: WIN_H })
      pollCount++
      if (clamped || pollCount % 12 === 0) {
        const [ax, ay] = win.getPosition()
        const [sw, sh] = win.getSize() // confirm size stays pinned now
        dlog('drag:move', {
          cursor: c, set: { x: nx, y: ny }, actual: { x: ax, y: ay }, size: { w: sw, h: sh }, clamped
        })
      }
    }, 16)
  })

  // Track the cat sprite's rect within the window (DIP) so snap can align the CAT, not the window.
  ipcMain.on('cat:rect', (_e, rect: { x: number; y: number; w: number; h: number }) => {
    if (rect && rect.w > 0 && rect.h > 0) latestCatRect = rect
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

let snapInterval: ReturnType<typeof setInterval> | null = null
let latestCatRect = { x: 0, y: 0, w: 0, h: 0 }

function snapToNearestEdge(win: BrowserWindow): void {
  if (snapInterval) { clearInterval(snapInterval); snapInterval = null }

  const [wx, wy] = win.getPosition()
  const [reportedW, reportedH] = win.getSize() // logged only; may be momentarily inflated
  // Use the CONSTANT size for all math so inflation can't poison the snap target (H3)
  const ww = WIN_W, wh = WIN_H
  const cursor = screen.getCursorScreenPoint()

  // H4: compare the display under the cursor vs the display under the window center
  const dispByCursor = screen.getDisplayNearestPoint(cursor)
  const dispByWindow = screen.getDisplayMatching({ x: wx, y: wy, width: ww, height: wh })
  const wa = dispByWindow.workArea

  // FIX (H-B): align the CAT sprite box to the edge, not the whole (padded) window.
  // cr = cat rect within the window (DIP); fall back to full window if not reported yet.
  const cr = latestCatRect.w > 0 && latestCatRect.h > 0
    ? latestCatRect : { x: 0, y: 0, w: ww, h: wh }

  // pick nearest edge by the CAT's center (what the user sees), not the window center
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

  // Flush the CAT box to the edge. The flush axis may push the transparent window margin
  // off-screen (intended). The perpendicular axis keeps the whole window on-screen.
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
    reportedSize: { w: reportedW, h: reportedH }, // H3: should stay ~190 after the setBounds fix
    catRect: cr, catInset: { x: cr.x, y: cr.y },  // H-B: gap-to-edge should ≈ this inset before fix
    cursorDispId: dispByCursor.id, windowDispId: dispByWindow.id, // H4
    sameDisplay: dispByCursor.id === dispByWindow.id,
    scaleFactor: dispByWindow.scaleFactor,                         // H1
    workArea: wa,                                                  // H2
    distances, edge, target: { x: tx, y: ty }
  })

  const frames = 20
  const startX = wx, startY = wy
  let frame = 0

  snapInterval = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(snapInterval!); snapInterval = null; return }
    frame++
    const t = easeOut(frame / frames)
    const x = Math.round(startX + (tx - startX) * t)
    const y = Math.round(startY + (ty - startY) * t)
    // setBounds (not setPosition) to keep size pinned during the snap too (H3 fix)
    if (Number.isFinite(x) && Number.isFinite(y)) win.setBounds({ x, y, width: WIN_W, height: WIN_H })
    if (frame >= frames) {
      clearInterval(snapInterval!); snapInterval = null
      const [ax, ay] = win.getPosition()
      // H1: did we actually land where we aimed?
      dlog('snap:done', { target: { x: tx, y: ty }, actual: { x: ax, y: ay }, edge })
      if (!win.isDestroyed()) win.webContents.send('anchor:changed', edge)
    }
  }, 16)
}

/** Clamp (x,y) so a WxH window stays within the display under `point`. Reports if it changed. */
function clampToDisplay(
  point: { x: number; y: number }, x: number, y: number, w: number, h: number
): { x: number; y: number; clamped: boolean } {
  const b = screen.getDisplayNearestPoint(point).bounds
  const cx = Math.round(clamp(x, b.x, b.x + b.width - w))
  const cy = Math.round(clamp(y, b.y, b.y + b.height - h))
  return { x: cx, y: cy, clamped: cx !== Math.round(x) || cy !== Math.round(y) }
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min // degenerate (window bigger than area) — avoid NaN/inversion
  return Math.max(min, Math.min(max, v))
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
