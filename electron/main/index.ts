import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { setupClickThrough } from './clickThrough'
import { setupTray } from './tray'
import { setupIpc, broadcastStore } from './ipc'
import { initDebugLog } from './debugLog'
import { initStore, getTodos, getAppState, getPanelSize } from './store'
import { setupTestControl } from './testControl'

// ponytail: disable-gpu-compositing prevents the Win11 transparent-window-renders-black bug
app.commandLine.appendSwitch('disable-gpu-compositing')

// TEST ISOLATION: probes set MIMIR_TEST_USERDATA so their runs use a throwaway store and never
// pollute the user's real todos (db.json + attachments live under userData). The user's own
// `npm run dev` doesn't set it, so it's unaffected. Must run before any getPath('userData').
if (process.env.MIMIR_TEST_USERDATA) {
  app.setPath('userData', process.env.MIMIR_TEST_USERDATA)
}

let win: BrowserWindow | null = null

app.whenReady().then(async () => {
  initDebugLog()
  win = createWindow()
  setupIpc(win)
  setupClickThrough(win)
  setupTray(win)
  setupTestControl(win) // test-control channel (MIMIR_TEST_CONTROL=1) — inject input, no OS cursor

  // init store — broadcast changes to renderer
  const w = win
  await initStore((snap) => broadcastStore(w, snap))

  // #A fix: the initStore broadcast can race ahead of the renderer registering its listener,
  // leaving the panel showing "No todos yet" until the first mutation. Re-push the snapshot
  // whenever the renderer (re)finishes loading, so it always has the current state on mount.
  w.webContents.on('did-finish-load', () =>
    broadcastStore(w, { todos: getTodos(), appState: getAppState(), panel: getPanelSize() })
  )
})

app.on('window-all-closed', () => app.quit())
