import { BrowserWindow, Tray, Menu, globalShortcut, nativeImage, app } from 'electron'
import { dlog } from './debugLog'

let tray: Tray | null = null

// avatar IDs inline, no import from renderer code. Default = luizmelo (user dislikes oneko).
const AVATARS = ['luizmelo', 'oneko'] as const
let currentAvatar = 0

export function setupTray(win: BrowserWindow): void {
  try {
    const icon = nativeImage.createFromBuffer(createTrayIcon(), { width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('Mimir Sprite')
    rebuildMenu(win)
    win.on('show', () => rebuildMenu(win))
    win.on('hide', () => rebuildMenu(win))
    tray.on('click', () => toggleVisibility(win))
    dlog('tray:created', { ok: true })
  } catch (err) {
    dlog('tray:create-failed', { err: String(err) })
  }

  globalShortcut.register('Ctrl+Alt+Space', () => toggleVisibility(win))
  // tray-independent avatar switch (tray icon can be hidden in the Windows overflow)
  globalShortcut.register('Ctrl+Alt+A', () => cycleAvatar(win))
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

function rebuildMenu(win: BrowserWindow): void {
  if (!tray) return
  const visible = win.isVisible()
  const avatarLabel = AVATARS[currentAvatar]
  const nextLabel = AVATARS[(currentAvatar + 1) % AVATARS.length]
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? 'Hide' : 'Show', click: () => toggleVisibility(win) },
      { label: `Avatar: ${avatarLabel} → ${nextLabel}  (Ctrl+Alt+A)`, click: () => cycleAvatar(win) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

function toggleVisibility(win: BrowserWindow): void {
  if (win.isVisible()) { win.hide() }
  else { win.show(); win.setAlwaysOnTop(true, 'screen-saver') }
}

function cycleAvatar(win: BrowserWindow): void {
  currentAvatar = (currentAvatar + 1) % AVATARS.length
  win.webContents.send('avatar:changed', AVATARS[currentAvatar])
  dlog('avatar:switched', { to: AVATARS[currentAvatar] })
  rebuildMenu(win)
}

/** 16x16 high-contrast disc (dark ring + warm fill + ears) so it's visible on light AND dark trays. */
function createTrayIcon(): Buffer {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const cx = 7.5, cy = 8.5
  const put = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255
  }
  // body disc
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (d <= 6) put(x, y, 232, 178, 92)        // warm gold fill
      else if (d <= 7) put(x, y, 38, 30, 22)     // dark outline ring
    }
  }
  // two ears (dark) so the silhouette reads as a cat
  for (const ex of [3, 12]) {
    put(ex, 2, 38, 30, 22); put(ex + (ex < 8 ? 1 : -1), 2, 38, 30, 22)
    put(ex, 3, 38, 30, 22); put(ex + (ex < 8 ? 1 : -1), 3, 38, 30, 22)
  }
  return buf
}
