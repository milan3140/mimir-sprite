import { BrowserWindow, app } from 'electron'
import { createServer, Socket } from 'net'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { dlog } from './debugLog'

// TEST-CONTROL CHANNEL (enabled by MIMIR_TEST_CONTROL=1) — lets a probe drive the app WITHOUT the OS
// cursor or a screen grab, so tests run on a hidden/inactive desktop while the user keeps working:
//   - injected cursor: clickThrough + drag read getInjectedCursor() instead of GetCursorPos, so hover/
//     expand/drag work with NO real mouse movement (the user's cursor is never touched).
//   - sendInputEvent: synthetic mouseDown/Up + char are dispatched straight into the renderer (fires the
//     real React handlers: drag:start, button clicks, typing) — works on an inactive desktop.
//   - capturePage: the window captures ITSELF (offscreen), so pixel checks don't need mss/screen grab.
// Protocol: line in, line out over 127.0.0.1. Binary (screenshots) returned base64 on one line.

let injected: { x: number; y: number } | null = null
export function getInjectedCursor(): { x: number; y: number } | null { return injected }
export function isTestControl(): boolean { return process.env.MIMIR_TEST_CONTROL === '1' }

export function setupTestControl(win: BrowserWindow): void {
  if (!isTestControl()) return
  injected = { x: 0, y: 0 }
  const server = createServer((sock) => {
    sock.setNoDelay(true)
    let buf = ''
    sock.on('data', async (d) => {
      buf += d.toString('utf8')
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
        if (line) {
          try { await handle(win, sock, line) } catch (e) { sock.write('ERR ' + String(e) + '\n') }
        }
      }
    })
    sock.on('error', () => { /* probe disconnects between runs */ })
  })
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const dir = join(process.cwd(), 'state')
    try { mkdirSync(dir, { recursive: true }) } catch { /* exists */ }
    writeFileSync(join(dir, 'test_control_port'), String(port))
    dlog('testControl:listening', { port, userData: app.getPath('userData') })
  })
}

async function handle(win: BrowserWindow, sock: Socket, line: string): Promise<void> {
  const sp = line.indexOf(' ')
  const cmd = sp < 0 ? line : line.slice(0, sp)
  const rest = sp < 0 ? '' : line.slice(sp + 1)
  const args = rest.split(/\s+/).filter(Boolean)
  const b = win.getBounds()

  if (cmd === 'cursor') {
    injected = { x: parseFloat(args[0]), y: parseFloat(args[1]) }
    sock.write('OK\n')
  } else if (cmd === 'mdown' || cmd === 'mup') {
    const wx = Math.round((injected?.x ?? 0) - b.x)
    const wy = Math.round((injected?.y ?? 0) - b.y)
    win.webContents.sendInputEvent({
      type: cmd === 'mdown' ? 'mouseDown' : 'mouseUp',
      x: wx, y: wy, button: 'left', clickCount: 1,
    } as Electron.MouseInputEvent)
    sock.write('OK\n')
  } else if (cmd === 'move') {
    // dispatch a DOM mousemove at the window-relative point (for hover handlers / dnd-kit)
    const wx = Math.round((injected?.x ?? 0) - b.x)
    const wy = Math.round((injected?.y ?? 0) - b.y)
    win.webContents.sendInputEvent({ type: 'mouseMove', x: wx, y: wy } as Electron.MouseInputEvent)
    sock.write('OK\n')
  } else if (cmd === 'key') {
    for (const ch of rest) {
      win.webContents.sendInputEvent({ type: 'char', keyCode: ch } as Electron.KeyboardInputEvent)
    }
    sock.write('OK\n')
  } else if (cmd === 'bounds') {
    sock.write(`OK ${b.x} ${b.y} ${b.width} ${b.height}\n`)
  } else if (cmd === 'shot') {
    const img = await win.webContents.capturePage()
    sock.write('OK ' + img.toPNG().toString('base64') + '\n')
  } else if (cmd === 'shotrect') {
    const rect = { x: +args[0], y: +args[1], width: +args[2], height: +args[3] }
    const img = await win.webContents.capturePage(rect)
    sock.write('OK ' + img.toPNG().toString('base64') + '\n')
  } else {
    sock.write('ERR unknown ' + cmd + '\n')
  }
}
