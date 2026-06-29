import { useAppStore } from '../store/useAppStore'
import type { Bubble, BubbleTag } from '../shared/types'
import { CAT_X, CAT_Y, CELL, WIN_W } from '../shared/geometry'

// M5 — speech-bubble stack: Claude's pre-task prep, one tagged line per bubble, streamed from the cat's
// centre-facing side. Newest bubble nearest the cat; older ones stack away + fade. Display-only for now
// (pointer-events none); clicking a bubble to open the transcript comes with the ClaudeRunner slice.

const TAG_COLOR: Record<BubbleTag, string> = {
  目標: 'var(--brand)', 準備: '#5b9bd5', 時程: '#46c6d6', 資源: 'var(--success)',
  能力: '#a78bfa', 時間: 'var(--fg-faint)', 風險: 'var(--warning)', 第一步: 'var(--success)',
}

function SpeechBubble({ b, tail }: { b: Bubble; tail: string }) {
  return (
    <div className={`bubble bubble-tail-${tail}`}>
      <span className="bubble-dot" style={{ background: TAG_COLOR[b.tag] }} />
      <span className="bubble-tag" style={{ color: TAG_COLOR[b.tag] }}>{b.tag}</span>
      <span className="bubble-text">{b.text}</span>
    </div>
  )
}

function stackStyle(edge: string): { style: React.CSSProperties; tail: string; reversed: boolean } {
  const base: React.CSSProperties = {
    position: 'absolute', display: 'flex', flexDirection: 'column', gap: 7,
    zIndex: 15, pointerEvents: 'none', width: 232,
  }
  const vc = CAT_Y + CELL / 2
  const H = 460
  switch (edge) {
    case 'right':  // bubbles LEFT of cat, newest at bottom (cat level), grow up; tail points right
      return { style: { ...base, right: WIN_W - CAT_X + 8, top: vc - H, height: H, justifyContent: 'flex-end', alignItems: 'flex-end' }, tail: 'right', reversed: false }
    case 'left':
      return { style: { ...base, left: CAT_X + CELL + 8, top: vc - H, height: H, justifyContent: 'flex-end', alignItems: 'flex-start' }, tail: 'left', reversed: false }
    case 'top':    // bubbles BELOW cat, newest at top (near cat), grow down; tail points up
      return { style: { ...base, left: CAT_X + CELL / 2 - 116, top: CAT_Y + CELL + 8, alignItems: 'center' }, tail: 'top', reversed: true }
    case 'bottom': // bubbles ABOVE cat, newest at bottom (near cat), grow up; tail points down
      return { style: { ...base, left: CAT_X + CELL / 2 - 116, top: vc - H, height: CAT_Y - 8 - (vc - H), justifyContent: 'flex-end', alignItems: 'center' }, tail: 'bottom', reversed: false }
    default:
      return { style: base, tail: 'right', reversed: false }
  }
}

export function SpeechBubbleStack({ edge }: { edge: string }) {
  const bubbles = useAppStore((s) => s.bubbles)
  if (!bubbles.length) return null
  const { style, tail, reversed } = stackStyle(edge)
  const list = reversed ? [...bubbles].reverse() : bubbles
  return (
    <div className="bubble-stack" style={style}>
      {list.map((b) => <SpeechBubble key={b.idx} b={b} tail={tail} />)}
    </div>
  )
}
