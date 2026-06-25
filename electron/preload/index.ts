import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  dragStart: (catScreenRect: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.send('drag:start', catScreenRect),
  dragEnd: () => ipcRenderer.send('drag:end'),
  enterCat: () => ipcRenderer.send('mouse:enter-cat'),
  leaveCat: () => ipcRenderer.send('mouse:leave-cat'),
  sendCatRect: (rect: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.send('cat:rect', rect),

  onAnchorChanged: (cb: (edge: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, edge: string): void => { cb(edge) }
    ipcRenderer.on('anchor:changed', handler)
    return () => { ipcRenderer.removeListener('anchor:changed', handler) }
  },

  onAvatarChanged: (cb: (id: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string): void => { cb(id) }
    ipcRenderer.on('avatar:changed', handler)
    return () => { ipcRenderer.removeListener('avatar:changed', handler) }
  }
})
