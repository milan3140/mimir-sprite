import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { setupClickThrough } from './clickThrough'
import { setupTray } from './tray'
import { setupIpc, broadcastStore } from './ipc'
import { initDebugLog } from './debugLog'
import { initStore, getTodos, getAppState, getPanelSize } from './store'
import { setupTestControl } from './testControl'
import { startThinkScheduler, stopThinkScheduler } from './thinkScheduler'
import { closeAllNotebooks } from './notebookManager'

// ponytail: disable-gpu-compositing prevents the Win11 transparent-window-renders-black bug
app.commandLine.appendSwitch('disable-gpu-compositing')

// TEST ISOLATION: probes set MIMIR_TEST_USERDATA so their runs use a throwaway store and never
// pollute the user's real todos (db.json + attachments live under userData). The user's own
// `npm run dev` doesn't set it, so it's unaffected. Must run before any getPath('userData').
if (process.env.MIMIR_TEST_USERDATA) {
  app.setPath('userData', process.env.MIMIR_TEST_USERDATA)
}

let win: BrowserWindow | null = null
const teardown: Array<() => void> = []   // cleanup fns run on will-quit (clear intervals / close server / drop ipc)

app.whenReady().then(async () => {
  initDebugLog()
  win = createWindow()
  setupIpc(win)
  teardown.push(setupClickThrough(win))
  setupTray(win)
  const stopTestControl = setupTestControl(win) // test-control channel (MIMIR_TEST_CONTROL=1) — inject input, no OS cursor
  if (stopTestControl) teardown.push(stopTestControl)

  // init store — broadcast changes to renderer
  const w = win
  await initStore((snap) => broadcastStore(w, snap))

  // #A fix: the initStore broadcast can race ahead of the renderer registering its listener,
  // leaving the panel showing "No todos yet" until the first mutation. Re-push the snapshot
  // whenever the renderer (re)finishes loading, so it always has the current state on mount.
  w.webContents.on('did-finish-load', () =>
    broadcastStore(w, { todos: getTodos(), appState: getAppState(), panel: getPanelSize() })
  )

  // M5 auto-think — gated OFF by default (see getThinkSettings); never auto-spends unless the user opts in.
  startThinkScheduler(w)
})

// single teardown point: stop the auto-think scheduler + run every registered cleanup (clickThrough
// poll/listeners, testControl server + port file). Guard each so one failure can't block quit.
app.on('will-quit', () => {
  stopThinkScheduler()
  closeAllNotebooks()
  for (const fn of teardown.splice(0)) { try { fn() } catch { /* best-effort on quit */ } }
})

app.on('window-all-closed', () => app.quit())
