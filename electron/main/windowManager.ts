import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'

export type AnchorEdge = 'left' | 'right' | 'top' | 'bottom'

export function createWindow(): BrowserWindow {
  const preload = join(__dirname, '../preload/index.js')

  const win = new BrowserWindow({
    width: 240,
    height: 280,
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

  // --- Drag via IPC (manual approach, works reliably frameless on Windows) ---
  let dragging = false
  let dragOffset = { x: 0, y: 0 }

  ipcMain.on('drag:start', (_e, mouseX: number, mouseY: number) => {
    const [wx, wy] = win.getPosition()
    dragOffset = { x: mouseX - wx, y: mouseY - wy }
    dragging = true
  })

  ipcMain.on('drag:move', (_e, mouseX: number, mouseY: number) => {
    if (!dragging) return
    win.setPosition(mouseX - dragOffset.x, mouseY - dragOffset.y)
  })

  ipcMain.on('drag:end', () => {
    if (!dragging) return
    dragging = false
    snapToNearestEdge(win)
  })

  return win
}

function snapToNearestEdge(win: BrowserWindow): void {
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

  // Keep the other axis, clamp into workArea
  let tx = wx
  let ty = wy

  switch (edge) {
    case 'left':
      tx = wa.x
      ty = clamp(wy, wa.y, wa.y + wa.height - wh)
      break
    case 'right':
      tx = wa.x + wa.width - ww
      ty = clamp(wy, wa.y, wa.y + wa.height - wh)
      break
    case 'top':
      ty = wa.y
      tx = clamp(wx, wa.x, wa.x + wa.width - ww)
      break
    case 'bottom':
      ty = wa.y + wa.height - wh
      tx = clamp(wx, wa.x, wa.x + wa.width - ww)
      break
  }

  // Animate with small steps (~320ms total, ~16ms per frame = ~20 frames)
  const frames = 20
  const startX = wx
  const startY = wy
  let frame = 0

  const interval = setInterval(() => {
    frame++
    const t = easeOut(frame / frames)
    const x = Math.round(startX + (tx - startX) * t)
    const y = Math.round(startY + (ty - startY) * t)
    win.setPosition(x, y)
    if (frame >= frames) {
      clearInterval(interval)
      win.webContents.send('anchor:changed', edge)
    }
  }, 16)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
