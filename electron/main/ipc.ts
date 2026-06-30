import { BrowserWindow, ipcMain } from 'electron'
import { dlog } from './debugLog'
import { hideToNub, restoreFromNub } from './windowManager'
import {
  getTodos, getAppState, getSnapshot, addTodo, updateTodo, removeTodo,
  reorderTodos, startTodo, pauseTodo, completeTodo, setMode, addAttachmentToTodo, setPanelSize,
  getThinkingSessions, getNotebooks, getNotebook, createNotebook, getOrCreateDefaultNotebook,
} from './store'
import { saveImageAttachment, readAttachmentDataUrl } from './attachments'
import { streamRealThinking } from './thinking'
import { openNotebook, broadcastNotebook } from './notebookManager'
import { sendNotebookMessage, appendThinkingToDefaultNotebook } from './notebookChat'
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

  // M5: manual 🧠 — run the two-stage ClaudeRunner for one todo, stream the bubbles, PERSIST the session.
  // S5: after thinking, auto-append the plan to the default notebook so clicking a bubble opens the window.
  ipcMain.handle('think:now', async (_e, id: string) => {
    const todo = getTodos().find((t) => t.id === id)
    if (!todo) { dlog('think:now-missing', { id }); return }
    await streamRealThinking(win, todo.title, todo.notes ?? '', 1, todo.id, 'manual')
    const sessions = getThinkingSessions(todo.id)
    const last = sessions[sessions.length - 1]
    if (last?.rawAnswer) {
      await appendThinkingToDefaultNotebook(todo.id, last.rawAnswer, last.costUsd ?? 0, broadcastNotebook)
    }
  })
  // M5 transcript view (Task 4): the persisted thinking sessions for a todo (rawAnswer = full stage-1 plan).
  ipcMain.handle('think:sessions', (_e, todoId: string) => getThinkingSessions(todoId))

  ipcMain.on('window:hide', () => hideToNub(win))
  ipcMain.on('window:restore', () => restoreFromNub(win))
  // ponytail: panel element rects for self-test probes
  ipcMain.on('panel:rects', (_e, rects: unknown) => dlog('panel:rects', rects))

  // Notebook IPC (S1 wiring)
  ipcMain.handle('notebook:list', (_e, todoId: string) => getNotebooks(todoId))
  ipcMain.handle('notebook:get', (_e, id: string) => getNotebook(id) ?? null)
  ipcMain.handle('notebook:new', (_e, todoId: string) => createNotebook(todoId))
  ipcMain.handle('notebook:open', (_e, id: string) => { openNotebook(id) })
  ipcMain.handle('notebook:openDefault', async (_e, todoId: string) => {
    const nb = await getOrCreateDefaultNotebook(todoId)
    openNotebook(nb.id)
    return nb.id
  })
  ipcMain.handle('notebook:send', async (_e, id: string, text: string) => {
    await sendNotebookMessage(win, id, text, broadcastNotebook)
  })
  ipcMain.handle('notebook:sendDefault', async (_e, todoId: string, text: string) => {
    const nb = await getOrCreateDefaultNotebook(todoId)
    await sendNotebookMessage(win, nb.id, text, broadcastNotebook)
  })
}

/** Called by store on every mutation to push snapshot to renderer */
export function broadcastStore(win: BrowserWindow, snap: StoreSnapshot): void {
  if (!win.isDestroyed()) {
    win.webContents.send('store:changed', snap)
  }
}
