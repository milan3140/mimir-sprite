import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { setupClickThrough } from './clickThrough'
import { setupTray } from './tray'
import { setupIpc, broadcastStore } from './ipc'
import { initDebugLog } from './debugLog'
import { initStore } from './store'

// ponytail: disable-gpu-compositing prevents the Win11 transparent-window-renders-black bug
app.commandLine.appendSwitch('disable-gpu-compositing')

let win: BrowserWindow | null = null

app.whenReady().then(async () => {
  initDebugLog()
  win = createWindow()
  setupIpc(win)
  setupClickThrough(win)
  setupTray(win)

  // init store — broadcast changes to renderer
  const w = win
  await initStore((snap) => broadcastStore(w, snap))
})

app.on('window-all-closed', () => app.quit())
