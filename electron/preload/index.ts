import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Drag
  dragStart: (x: number, y: number) => ipcRenderer.send('drag:start', x, y),
  dragMove: (x: number, y: number) => ipcRenderer.send('drag:move', x, y),
  dragEnd: () => ipcRenderer.send('drag:end'),

  // Click-through
  enterCat: () => ipcRenderer.send('mouse:enter-cat'),
  leaveCat: () => ipcRenderer.send('mouse:leave-cat'),
  sendCatRect: (rect: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.send('cat:rect', rect),

  // Screen info
  getCursorPos: () => ipcRenderer.invoke('screen:getCursorPos') as Promise<{ x: number; y: number }>,
  getWindowPos: () => ipcRenderer.invoke('window:getPosition') as Promise<[number, number]>,

  // Anchor edge listener
  onAnchorChanged: (cb: (edge: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, edge: string): void => { cb(edge) }
    ipcRenderer.on('anchor:changed', handler)
    return () => { ipcRenderer.removeListener('anchor:changed', handler) }
  }
})
