import { BrowserWindow, Tray, Menu, globalShortcut, nativeImage, app } from 'electron'

let tray: Tray | null = null

export function setupTray(win: BrowserWindow): void {
  // ponytail: 16x16 1-color placeholder icon generated inline — no external asset needed
  const icon = nativeImage.createFromBuffer(createTinyIcon(), { width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('Mimir Sprite')

  const updateMenu = (): void => {
    const visible = win.isVisible()
    tray!.setContextMenu(
      Menu.buildFromTemplate([
        { label: visible ? 'Hide' : 'Show', click: () => toggleVisibility(win) },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ])
    )
  }

  updateMenu()
  win.on('show', updateMenu)
  win.on('hide', updateMenu)

  tray.on('click', () => toggleVisibility(win))

  // Global shortcut
  globalShortcut.register('Ctrl+Alt+Space', () => toggleVisibility(win))

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}

function toggleVisibility(win: BrowserWindow): void {
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    win.setAlwaysOnTop(true, 'screen-saver')
  }
}

/** Creates a 16x16 RGBA buffer — a small filled circle as placeholder tray icon */
function createTinyIcon(): Buffer {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const cx = 7.5, cy = 7.5, r = 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= r) {
        buf[i] = 210; buf[i + 1] = 195; buf[i + 2] = 170; buf[i + 3] = 255 // cat-cream-ish
      }
    }
  }
  return buf
}
