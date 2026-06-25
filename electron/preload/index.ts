import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Drag
  dragStart: (catScreenRect: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.send('drag:start', catScreenRect),
  dragEnd: () => ipcRenderer.send('drag:end'),

  // Click-through
  enterCat: () => ipcRenderer.send('mouse:enter-cat'),
  leaveCat: () => ipcRenderer.send('mouse:leave-cat'),
  sendCatRect: (rect: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.send('cat:rect', rect),
  sendCatContent: (rect: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.send('cat:content', rect),

  // Window expand/collapse
  windowExpand: () => ipcRenderer.send('window:expand'),
  windowCollapse: () => ipcRenderer.send('window:collapse'),
  windowHide: () => ipcRenderer.send('window:hide'),

  // Events from main
  onAnchorChanged: (cb: (edge: string) => void) => {
    const h = (_e: Electron.IpcRendererEvent, edge: string): void => { cb(edge) }
    ipcRenderer.on('anchor:changed', h)
    return () => { ipcRenderer.removeListener('anchor:changed', h) }
  },
  onAvatarChanged: (cb: (id: string) => void) => {
    const h = (_e: Electron.IpcRendererEvent, id: string): void => { cb(id) }
    ipcRenderer.on('avatar:changed', h)
    return () => { ipcRenderer.removeListener('avatar:changed', h) }
  },
  onStoreChanged: (cb: (snap: unknown) => void) => {
    const h = (_e: Electron.IpcRendererEvent, snap: unknown): void => { cb(snap) }
    ipcRenderer.on('store:changed', h)
    return () => { ipcRenderer.removeListener('store:changed', h) }
  },
  onExpandedChanged: (cb: (v: boolean) => void) => {
    const h = (_e: Electron.IpcRendererEvent, v: boolean): void => { cb(v) }
    ipcRenderer.on('window:expanded', h)
    return () => { ipcRenderer.removeListener('window:expanded', h) }
  },

  // Todo CRUD
  todoList: () => ipcRenderer.invoke('todo:list'),
  todoAdd: (title: string) => ipcRenderer.invoke('todo:add', title),
  todoUpdate: (id: string, patch: { title?: string; notes?: string }) => ipcRenderer.invoke('todo:update', id, patch),
  todoRemove: (id: string) => ipcRenderer.invoke('todo:remove', id),
  todoReorder: (ids: string[]) => ipcRenderer.invoke('todo:reorder', ids),
  todoStart: (id: string) => ipcRenderer.invoke('todo:start', id),
  todoPause: (id: string) => ipcRenderer.invoke('todo:pause', id),
  todoComplete: (id: string) => ipcRenderer.invoke('todo:complete', id),
  appSetMode: (mode: string) => ipcRenderer.invoke('app:setMode', mode),
})
