import { BrowserWindow } from 'electron'
import { join } from 'path'
import { getNotebook, setNotebookWindowState } from './store'
import { dlog } from './debugLog'

// ponytail: notebook window registry — one BrowserWindow per open notebook
const windows = new Map<string, BrowserWindow>()

export function openNotebook(id: string): void {
  const existing = windows.get(id)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return
  }

  const nb = getNotebook(id)
  if (!nb) { dlog('notebook:open-missing', { id }); return }

  const preload = join(__dirname, '../preload/index.js')
  const ws = nb.windowState
  const win = new BrowserWindow({
    width: ws?.w ?? 480,
    height: ws?.h ?? 640,
    x: ws?.x,
    y: ws?.y,
    frame: false,
    transparent: false,
    backgroundColor: '#0f0f18',
    skipTaskbar: false,
    alwaysOnTop: false,
    resizable: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?notebook=${encodeURIComponent(id)}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { notebook: id } })
  }

  windows.set(id, win)

  const persist = (): void => {
    if (win.isDestroyed()) return
    const [x, y] = win.getPosition()
    const [w, h] = win.getSize()
    setNotebookWindowState(id, { x, y, w, h }).catch(() => { /* best-effort */ })
  }
  win.on('moved', persist)
  win.on('resized', persist)
  win.on('closed', () => { windows.delete(id) })

  dlog('notebook:open', { id, title: nb.title })
}

// Send the latest notebook snapshot to its open window (if any).
export function broadcastNotebook(id: string): void {
  const win = windows.get(id)
  if (!win || win.isDestroyed()) return
  const nb = getNotebook(id)
  if (nb) win.webContents.send('notebook:updated', nb)
}

// Accessor for probes / testControl (read-only view into the map).
export function getNotebookWindow(id: string): BrowserWindow | undefined {
  const w = windows.get(id)
  return w && !w.isDestroyed() ? w : undefined
}

// Called on will-quit — best-effort close of all floating notebook windows.
export function closeAllNotebooks(): void {
  for (const [, win] of windows) {
    try { if (!win.isDestroyed()) win.close() } catch { /* ignore */ }
  }
  windows.clear()
}
