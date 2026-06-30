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
  sendCatContent: (rect: { x: number; y: number; w: number; h: number; tight?: boolean }) =>
    ipcRenderer.send('cat:content', rect),

  // Window expand/collapse
  windowExpand: () => ipcRenderer.send('window:expand'),
  windowCollapse: () => ipcRenderer.send('window:collapse'),
  windowHide: () => ipcRenderer.send('window:hide'),
  windowRestore: () => ipcRenderer.send('window:restore'),

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
  onExpandedChanged: (cb: (v: { expanded: boolean; edge: string; catOffset?: number; winX?: number; winY?: number; wa?: { x: number; y: number; width: number; height: number } }) => void) => {
    const h = (_e: Electron.IpcRendererEvent, v: { expanded: boolean; edge: string; catOffset?: number; winX?: number; winY?: number; wa?: { x: number; y: number; width: number; height: number } }): void => { cb(v) }
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
  onHiddenChanged: (cb: (v: { hidden: boolean; edge: string }) => void) => {
    const h = (_e: Electron.IpcRendererEvent, v: { hidden: boolean; edge: string }): void => { cb(v) }
    ipcRenderer.on('window:hidden', h)
    return () => { ipcRenderer.removeListener('window:hidden', h) }
  },
  storeGet: () => ipcRenderer.invoke('store:get'),
  sendPanelRects: (rects: unknown) => ipcRenderer.send('panel:rects', rects),

  // M3b attachments
  attachmentSave: (p: { todoId: string; dataUrl: string; name?: string; width?: number; height?: number }) =>
    ipcRenderer.invoke('attachment:save', p),
  attachmentRead: (relPath: string): Promise<string | null> => ipcRenderer.invoke('attachment:read', relPath),

  // Panel resize (M: drag handle)
  panelResize: (w: number, h: number) => ipcRenderer.invoke('panel:resize', w, h),
  setResizing: (v: boolean) => ipcRenderer.send('panel:resizing', v),

  // M5 thinking bubbles (streamed from main)
  thinkNow: (todoId: string) => ipcRenderer.invoke('think:now', todoId),
  thinkSessions: (todoId: string) => ipcRenderer.invoke('think:sessions', todoId),
  onThinkBubble: (cb: (b: unknown) => void) => {
    const h = (_e: Electron.IpcRendererEvent, b: unknown): void => { cb(b) }
    ipcRenderer.on('think:bubble', h)
    return () => { ipcRenderer.removeListener('think:bubble', h) }
  },
  onThinkRemove: (cb: (p: { idx: number; sid: string }) => void) => {
    const h = (_e: Electron.IpcRendererEvent, p: { idx: number; sid: string }): void => { cb(p) }
    ipcRenderer.on('think:remove', h)
    return () => { ipcRenderer.removeListener('think:remove', h) }
  },
  onThinkMeta: (cb: (m: { sid: string; rawAnswer: string }) => void) => {
    const h = (_e: Electron.IpcRendererEvent, m: { sid: string; rawAnswer: string }): void => { cb(m) }
    ipcRenderer.on('think:meta', h)
    return () => { ipcRenderer.removeListener('think:meta', h) }
  },
  // report the speech-bubble stack's window-rect so main can make that area interactive (click a bubble)
  sendBubblesRect: (rect: { x: number; y: number; w: number; h: number } | null) => ipcRenderer.send('bubbles:rect', rect),
  onThinkClear: (cb: () => void) => {
    const h = (): void => { cb() }
    ipcRenderer.on('think:clear', h)
    return () => { ipcRenderer.removeListener('think:clear', h) }
  },

  // Notebook IPC (S1)
  notebookList: (todoId: string) => ipcRenderer.invoke('notebook:list', todoId),
  notebookGet: (id: string) => ipcRenderer.invoke('notebook:get', id),
  notebookNew: (todoId: string) => ipcRenderer.invoke('notebook:new', todoId),
  notebookOpen: (id: string) => ipcRenderer.invoke('notebook:open', id),
  notebookOpenDefault: (todoId: string) => ipcRenderer.invoke('notebook:openDefault', todoId),
  notebookSend: (id: string, text: string) => ipcRenderer.invoke('notebook:send', id, text),
  notebookSendDefault: (todoId: string, text: string) => ipcRenderer.invoke('notebook:sendDefault', todoId, text),
  sendPopoverRect: (rect: { x: number; y: number; w: number; h: number } | null) => ipcRenderer.send('panel:popoverRect', rect),
  onNotebookUpdated: (cb: (nb: unknown) => void) => {
    const h = (_e: Electron.IpcRendererEvent, nb: unknown): void => { cb(nb) }
    ipcRenderer.on('notebook:updated', h)
    return () => { ipcRenderer.removeListener('notebook:updated', h) }
  },
})
