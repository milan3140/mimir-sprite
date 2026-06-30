import { useEffect, useRef, useState, useCallback } from 'react'
import type { Notebook, NoteMessage } from '../shared/types'

// NotebookView — rendered in a floating frameless window (?notebook=<id>).
// Draggable via header (-webkit-app-region:drag). Non-click-through (real window).

function Message({ m }: { m: NoteMessage }) {
  const isUser = m.role === 'user'
  const isThinking = m.kind === 'thinking'
  const isPending = m.pending

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: isUser
            ? 'hsl(var(--hue) 60% 40% / 0.85)'
            : isThinking
              ? 'hsl(var(--hue) 20% 18% / 0.97)'
              : 'hsl(var(--hue) 16% 16% / 0.97)',
          color: isPending ? 'var(--fg-muted)' : 'var(--fg)',
          fontSize: 13,
          lineHeight: 1.55,
          border: isThinking ? '1px solid hsl(var(--hue) 40% 35% / 0.6)' : undefined,
          fontStyle: isPending ? 'italic' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {isThinking ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 12,
              color: 'var(--fg)',
              opacity: 0.92,
            }}
          >
            {m.text}
          </pre>
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
        )}
        {m.costUsd != null && (
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--fg-faint)', textAlign: 'right' }}>
            ${m.costUsd.toFixed(4)}
          </div>
        )}
      </div>
    </div>
  )
}

export function NotebookView({ notebookId }: { notebookId: string }) {
  const [nb, setNb] = useState<Notebook | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // load on mount
  useEffect(() => {
    window.api.notebookGet(notebookId).then(setNb)
  }, [notebookId])

  // live updates from main (while Claude is replying)
  useEffect(() => {
    return window.api.onNotebookUpdated((updated) => {
      if (updated.id === notebookId) setNb(updated)
    })
  }, [notebookId])

  // scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nb?.messages.length])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    try {
      await window.api.notebookSend(notebookId, text)
    } finally {
      setSending(false)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [input, sending, notebookId])

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void send()
      }
    },
    [send]
  )

  if (!nb) {
    return (
      <div
        style={{
          width: '100vw', height: '100vh',
          background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--fg-muted)', fontSize: 14,
        }}
      >
        載入中…
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100vw', height: '100vh',
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        color: 'var(--fg)',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Header — drag region */}
      <div
        style={{
          WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
          height: 40,
          background: 'hsl(var(--hue) 18% 11% / 0.99)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--fg)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {nb.title}
        </span>
        <button
          onClick={() => window.close()}
          style={{
            WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'],
            background: 'none',
            border: 'none',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            fontSize: 15,
            padding: '2px 6px',
            borderRadius: 4,
            lineHeight: 1,
          }}
          title="關閉"
        >
          ✕
        </button>
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {nb.messages.length === 0 && (
          <div
            style={{
              margin: 'auto',
              color: 'var(--fg-faint)',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            傳訊息給 Claude，或點擊 🧠 開始深度思考
          </div>
        )}
        {nb.messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 12px',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          background: 'hsl(var(--hue) 16% 11% / 0.98)',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="傳訊息… (Enter 送出, Shift+Enter 換行)"
          rows={2}
          disabled={sending}
          style={{
            flex: 1,
            background: 'hsl(var(--hue) 16% 16%)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--fg)',
            fontSize: 13,
            padding: '7px 10px',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            opacity: sending ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => { void send() }}
          disabled={sending || !input.trim()}
          style={{
            background: 'var(--brand)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 14px',
            opacity: sending || !input.trim() ? 0.5 : 1,
            transition: 'opacity 150ms',
            whiteSpace: 'nowrap',
            alignSelf: 'flex-end',
          }}
        >
          {sending ? '…' : '送出'}
        </button>
      </div>
    </div>
  )
}
