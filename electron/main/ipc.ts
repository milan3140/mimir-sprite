import { BrowserWindow, ipcMain } from 'electron'
import { dlog } from './debugLog'
import { hideToNub, restoreFromNub } from './windowManager'
import {
  getTodos, getAppState, getSnapshot, addTodo, updateTodo, removeTodo,
  reorderTodos, startTodo, pauseTodo, completeTodo, setMode, addAttachmentToTodo, setPanelSize
} from './store'
import { saveImageAttachment, readAttachmentDataUrl } from './attachments'
import type { StoreSnapshot } from '../../src/shared/types'

export function setupIpc(win: BrowserWindow): void {
  ipcMain.handle('todo:list', () => getTodos())
  ipcMain.handle('todo:add', (_e, title: string) => addTodo(title))
  ipcMain.handle('todo:update', (_e, id: string, patch: { title?: string; notes?: string }) => updateTodo(id, patch))
  ipcMain.handle('todo:remove', (_e, id: string) => removeTodo(id))
  ipcMain.handle('todo:reorder', (_e, ids: string[]) => reorderTodos(ids))
  ipcMain.handle('todo:start', (_e, id: string) => startTodo(id))
  ipcMain.handle('todo:pause', (_e, id: string) => pauseTodo(id))
  ipcMain.handle('todo:complete', (_e, id: string) => completeTodo(id))
  ipcMain.handle('app:setMode', (_e, mode: 'idle' | 'resting') => setMode(mode))
  ipcMain.handle('app:getState', () => getAppState())
  ipcMain.handle('store:get', () => getSnapshot())

  // M3b attachments: paste an image (data URL) -> save to disk + attach to a todo -> return metadata.
  ipcMain.handle('attachment:save', async (_e, p: { todoId: string; dataUrl: string; name?: string; width?: number; height?: number }) => {
    const att = await saveImageAttachment('todo', p.todoId, p.dataUrl, p.name ?? 'pasted.png', p.width, p.height)
    await addAttachmentToTodo(p.todoId, att)
    return att
  })
  // read an attachment file back as a data URL (for rendering thumbnails after reload)
  ipcMain.handle('attachment:read', (_e, relPath: string) => readAttachmentDataUrl(relPath))

  // user dragged the panel resize handle (clamped to geometry MIN/MAX, persisted)
  ipcMain.handle('panel:resize', (_e, w: number, h: number) => setPanelSize(w, h))

  ipcMain.on('window:hide', () => hideToNub(win))
  ipcMain.on('window:restore', () => restoreFromNub(win))
  // ponytail: panel element rects for self-test probes
  ipcMain.on('panel:rects', (_e, rects: unknown) => dlog('panel:rects', rects))
}

/** Called by store on every mutation to push snapshot to renderer */
export function broadcastStore(win: BrowserWindow, snap: StoreSnapshot): void {
  if (!win.isDestroyed()) {
    win.webContents.send('store:changed', snap)
  }
}
