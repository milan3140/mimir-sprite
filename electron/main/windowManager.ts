import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'

export type AnchorEdge = 'left' | 'right' | 'top' | 'bottom'

// ponytail: single size constant, tune here
export const WIN_W = 128
export const WIN_H = 128

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

  // --- Drag driven entirely from main via cursor polling (DPI-safe) ---
  let dragging = false
  let dragOffset = { x: 0, y: 0 }
  let dragInterval: ReturnType<typeof setInterval> | null = null

  ipcMain.on('drag:start', () => {
    if (win.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
    dragging = true

    // ponytail: poll cursor in main — renderer screenX/Y lies under DPI scaling
    dragInterval = setInterval(() => {
      if (!dragging || win.isDestroyed()) {
        if (dragInterval) clearInterval(dragInterval)
        return
      }
      const c = screen.getCursorScreenPoint()
      const nx = Math.round(c.x - dragOffset.x)
      const ny = Math.round(c.y - dragOffset.y)
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return
      win.setPosition(nx, ny)
    }, 16)
  })

  ipcMain.on('drag:end', () => {
    if (!dragging) return
    dragging = false
    if (dragInterval) { clearInterval(dragInterval); dragInterval = null }
    if (!win.isDestroyed()) snapToNearestEdge(win)
  })

  return win
}

let snapInterval: ReturnType<typeof setInterval> | null = null

function snapToNearestEdge(win: BrowserWindow): void {
  // Abort any in-flight snap
  if (snapInterval) { clearInterval(snapInterval); snapInterval = null }

  const [wx, wy] = win.getPosition()
  const [ww, wh] = win.getSize()
  const cursor = screen.getCursorScreenPoint()
  const wa = screen.getDisplayNearestPoint(cursor).workArea

  const cx = wx + ww / 2
  const cy = wy + wh / 2

  const distances = {
    left: cx - wa.x,
    right: wa.x + wa.width - cx,
    top: cy - wa.y,
    bottom: wa.y + wa.height - cy
  }

  const edge = (Object.keys(distances) as AnchorEdge[]).reduce((a, b) =>
    distances[a] <= distances[b] ? a : b
  )

  let tx = wx, ty = wy
  switch (edge) {
    case 'left':   tx = wa.x;                       ty = clamp(wy, wa.y, wa.y + wa.height - wh); break
    case 'right':  tx = wa.x + wa.width - ww;       ty = clamp(wy, wa.y, wa.y + wa.height - wh); break
    case 'top':    ty = wa.y;                        tx = clamp(wx, wa.x, wa.x + wa.width - ww);  break
    case 'bottom': ty = wa.y + wa.height - wh;       tx = clamp(wx, wa.x, wa.x + wa.width - ww);  break
  }

  const frames = 20
  const startX = wx, startY = wy
  let frame = 0

  snapInterval = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(snapInterval!); snapInterval = null; return }
    frame++
    const t = easeOut(frame / frames)
    const x = Math.round(startX + (tx - startX) * t)
    const y = Math.round(startY + (ty - startY) * t)
    if (Number.isFinite(x) && Number.isFinite(y)) win.setPosition(x, y)
    if (frame >= frames) {
      clearInterval(snapInterval!); snapInterval = null
      if (!win.isDestroyed()) win.webContents.send('anchor:changed', edge)
    }
  }, 16)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
