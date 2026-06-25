import { BrowserWindow, ipcMain } from 'electron'
import { dlog } from './debugLog'
import {
  getTodos, getAppState, addTodo, updateTodo, removeTodo,
  reorderTodos, startTodo, pauseTodo, completeTodo, setMode
} from './store'
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

  ipcMain.on('window:hide', () => win.hide())
}

/** Called by store on every mutation to push snapshot to renderer */
export function broadcastStore(win: BrowserWindow, snap: StoreSnapshot): void {
  if (!win.isDestroyed()) {
    win.webContents.send('store:changed', snap)
  }
}
