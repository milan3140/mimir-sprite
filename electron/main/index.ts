import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { setupClickThrough } from './clickThrough'
import { setupTray } from './tray'
import { setupIpc } from './ipc'
import { initDebugLog } from './debugLog'

// ponytail: disable-gpu-compositing prevents the Win11 transparent-window-renders-black bug
app.commandLine.appendSwitch('disable-gpu-compositing')

let win: BrowserWindow | null = null

app.whenReady().then(() => {
  initDebugLog() // instrument-first: structured diagnostics to mimir-debug.log
  win = createWindow()
  setupIpc(win)
  setupClickThrough(win)
  setupTray(win)
})

app.on('window-all-closed', () => app.quit())
