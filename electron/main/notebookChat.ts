import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { dlog } from './debugLog'
import {
  getNotebook, getTodos, getThinkingSessions,
  getOrCreateDefaultNotebook, addNotebookMessage, patchNotebookMessage,
} from './store'
import { runChat, type ChatHistory } from './claudeRunner'
import { streamRealThinking } from './thinking'
import type { NoteMessage } from '../../src/shared/types'

// notebookChat = the chat brain for a notebook. It stays decoupled from notebookManager: callers pass an
// `emit(notebookId)` that pushes the fresh notebook to its open floating window (so no import cycle).
export type Emit = (notebookId: string) => void

function msg(role: 'user' | 'assistant', text: string, kind: 'thinking' | 'chat' = 'chat', extra: Partial<NoteMessage> = {}): NoteMessage {
  return { id: randomUUID(), role, kind, text, createdAt: Date.now(), ...extra }
}

// Send a user message into a notebook. First-message routing (D5):
//   notebook has 0 messages AND the todo has 0 prior thinking sessions → run the pre-task THINKING flow
//   (stream bubbles on the cat + store the rawAnswer as the first {kind:'thinking'} message).
//   otherwise → a normal chat turn (Claude replies with the conversation as context).
export async function sendNotebookMessage(win: BrowserWindow, notebookId: string, text: string, emit: Emit): Promise<void> {
  const nb = getNotebook(notebookId)
  if (!nb) { dlog('notebook:send-missing', { notebookId }); return }
  const todo = getTodos().find(t => t.id === nb.todoId)
  const title = todo?.title ?? ''
  const wasEmpty = nb.messages.length === 0
  const noPriorThinking = getThinkingSessions(nb.todoId).length === 0
  const priorHistory: ChatHistory = nb.messages.filter(m => !m.pending).map(m => ({ role: m.role, text: m.text }))

  await addNotebookMessage(notebookId, msg('user', text)); emit(notebookId)
  const pending = msg('assistant', '思考中…', 'chat', { pending: true })
  await addNotebookMessage(notebookId, pending); emit(notebookId)

  try {
    if (wasEmpty && noPriorThinking) {
      // first message about understanding/prepping the task → the deep pre-task thinking flow
      await streamRealThinking(win, title, todo?.notes ?? '', 1, nb.todoId, 'manual')
      const s = getThinkingSessions(nb.todoId).slice(-1)[0]
      await patchNotebookMessage(notebookId, pending.id,
        { text: s?.rawAnswer?.trim() || '(這次沒想出完整內容,等等再試)', kind: 'thinking', pending: false, costUsd: s?.costUsd })
    } else {
      const r = await runChat(title, priorHistory, text)
      await patchNotebookMessage(notebookId, pending.id, { text: r.text || '(沒有回覆)', pending: false, costUsd: r.costUsd })
    }
  } catch (e) {
    dlog('notebook:send-error', { notebookId, err: String(e) })
    await patchNotebookMessage(notebookId, pending.id, { text: '(出錯了,等等再試)', pending: false })
  }
  emit(notebookId)
}

// Called when 🧠 thinking runs (Brain click / auto) — ensure the default notebook holds the plan as a
// {kind:'thinking'} message, so the notebook + the bubble-click surface always have the full text.
export async function appendThinkingToDefaultNotebook(todoId: string, rawAnswer: string, costUsd: number, emit: Emit): Promise<string> {
  const nb = await getOrCreateDefaultNotebook(todoId)
  const last = nb.messages[nb.messages.length - 1]
  if (rawAnswer.trim() && (!last || last.text !== rawAnswer)) {
    await addNotebookMessage(nb.id, msg('assistant', rawAnswer, 'thinking', { costUsd }))
    emit(nb.id)
  }
  return nb.id
}
