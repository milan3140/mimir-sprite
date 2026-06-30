import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Bubble, BubbleTag } from '../shared/types'
import { CAT_X, CAT_Y, CELL, WIN_W, WIN_H } from '../shared/geometry'

// M5 — speech-bubble stack: Claude's pre-task prep, one tagged line per bubble, streamed from the cat's
// centre-facing side. Newest bubble nearest the cat; older ones stack away + fade. Bubbles are CLICKABLE
// (click any → the full stage-1 plan in an overlay). The stack reports its window-rect so main can make
// that region interactive (clickThrough), and is bottom/edge-anchored with auto height so it never clips.

const TAG_COLOR: Record<BubbleTag, string> = {
  任務: 'var(--fg)',              // opening / problem definition — neutral
  目標: 'var(--brand)',           // goal — brand
  準備: 'hsl(210 70% 66%)',       // prep — blue
  時程: 'hsl(175 55% 56%)',       // schedule — teal
  資源: 'var(--success)',         // resource — green
  能力: 'hsl(265 70% 72%)',       // ability — purple
  時間: 'hsl(45 80% 62%)',        // time — amber
  風險: 'var(--warning)',         // risk — warning
  第一步: 'hsl(330 75% 70%)',     // first step — pink
}

function SpeechBubble({ b, tail, onClick }: { b: Bubble; tail: string; onClick: () => void }) {
  return (
    <div
      className={`bubble bubble-clickable bubble-tail-${tail}${b.fading ? ' bubble-out' : ''}`}
      onClick={onClick}
      title="點看完整想法"
    >
      <span className="bubble-dot" style={{ background: TAG_COLOR[b.tag] }} />
      <span className="bubble-tag" style={{ color: TAG_COLOR[b.tag] }}>{b.tag}</span>
      <span className="bubble-text">{b.text}</span>
    </div>
  )
}

// Bottom/edge-anchored + auto height, so the container HUGS its content (tight rect for hit-testing) and
// can't clip (fixes A-M6). vc = cat's vertical centre.
function stackStyle(edge: string): { style: React.CSSProperties; tail: string; reversed: boolean } {
  const base: React.CSSProperties = {
    position: 'absolute', display: 'flex', flexDirection: 'column', gap: 7, zIndex: 15, maxWidth: 248,
    pointerEvents: 'none',   // only the bubbles/overlay are interactive; gaps fall through
  }
  const vc = CAT_Y + CELL / 2
  switch (edge) {
    case 'right':  return { style: { ...base, right: WIN_W - CAT_X + 8, bottom: WIN_H - vc, alignItems: 'flex-end' }, tail: 'right', reversed: false }
    case 'left':   return { style: { ...base, left: CAT_X + CELL + 8, bottom: WIN_H - vc, alignItems: 'flex-start' }, tail: 'left', reversed: false }
    case 'top':    return { style: { ...base, left: CAT_X + CELL / 2 - 116, top: CAT_Y + CELL + 8, alignItems: 'center' }, tail: 'top', reversed: true }
    case 'bottom': return { style: { ...base, left: CAT_X + CELL / 2 - 116, bottom: WIN_H - (CAT_Y - 8), alignItems: 'center' }, tail: 'bottom', reversed: false }
    default:       return { style: base, tail: 'right', reversed: false }
  }
}

function TranscriptOverlay({ rawAnswer, onClose }: { rawAnswer: string; onClose: () => void }) {
  return (
    <div className="transcript-overlay">
      <div className="transcript-overlay-head">
        <span>完整想法</span>
        <button className="transcript-overlay-close" onClick={onClose} aria-label="關閉">✕</button>
      </div>
      <pre className="transcript-overlay-body">{rawAnswer?.trim() || '(沒有內容)'}</pre>
    </div>
  )
}

export function SpeechBubbleStack({ edge }: { edge: string }) {
  const bubbles = useAppStore((s) => s.bubbles)
  const transcript = useAppStore((s) => s.transcript)
  const transcriptOpen = useAppStore((s) => s.transcriptOpen)
  const setTranscriptOpen = useAppStore((s) => s.setTranscriptOpen)
  const ref = useRef<HTMLDivElement>(null)

  const showOverlay = transcriptOpen && !!transcript
  const active = bubbles.length > 0 || showOverlay

  // report the tight window-rect of whatever is shown (bubbles OR overlay) so main makes it clickable;
  // null when nothing is shown so the area falls back to click-through.
  useEffect(() => {
    if (!active || !ref.current) { window.api.sendBubblesRect(null); return }
    const r = ref.current.getBoundingClientRect()
    window.api.sendBubblesRect({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
  }, [active, bubbles, showOverlay])
  useEffect(() => () => { window.api.sendBubblesRect(null) }, [])

  if (!active) return null
  const { style, tail, reversed } = stackStyle(edge)
  const list = reversed ? [...bubbles].reverse() : bubbles
  return (
    <div ref={ref} className="bubble-stack" style={style}>
      {showOverlay
        ? <TranscriptOverlay rawAnswer={transcript!.rawAnswer} onClose={() => setTranscriptOpen(false)} />
        : list.map((b) => (
          <SpeechBubble
            key={`${b.sessionId}:${b.idx}`} b={b} tail={tail}
            onClick={() => {
              // S5: open the default notebook window if we know which todo this session belongs to;
              // ponytail: fall back to inline overlay for mock/dev paths that have no todoId.
              if (transcript?.todoId) {
                window.api.notebookOpenDefault(transcript.todoId)
              } else {
                setTranscriptOpen(true)
              }
            }}
          />
        ))
      }
    </div>
  )
}
