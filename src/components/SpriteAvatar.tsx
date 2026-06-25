import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { spriteSheet } from '../avatar/spriteConfig'

declare global {
  interface Window {
    api: {
      dragStart: () => void
      dragEnd: () => void
      enterCat: () => void
      leaveCat: () => void
      sendCatRect: (rect: { x: number; y: number; w: number; h: number }) => void
      onAnchorChanged: (cb: (edge: string) => void) => () => void
    }
  }
}

// ponytail: single size constant — avatar render size in CSS px
const AVATAR_PX = 96

export function SpriteAvatar() {
  const ref = useRef<HTMLDivElement>(null)
  const anchorEdge = useAppStore((s) => s.anchorEdge)
  const setAnchorEdge = useAppStore((s) => s.setAnchorEdge)
  const [animState] = useState<string>('idle')

  const state = spriteSheet.states[animState] ?? spriteSheet.states.idle

  // Report cat bounding rect to main for click-through polling
  const reportRect = useCallback(() => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    window.api.sendCatRect({ x: r.x, y: r.y, w: r.width, h: r.height })
  }, [])

  useEffect(() => {
    reportRect()
    const iv = setInterval(reportRect, 500)
    return () => clearInterval(iv)
  }, [reportRect])

  useEffect(() => {
    return window.api.onAnchorChanged((edge) => {
      setAnchorEdge(edge as 'left' | 'right' | 'top' | 'bottom')
    })
  }, [setAnchorEdge])

  // Drag: just signal start/end, main polls cursor itself
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    window.api.dragStart()

    const onUp = () => {
      window.api.dragEnd()
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mouseup', onUp)
  }, [])

  const flipX = anchorEdge === 'left' ? false : true
  const { tileW, tileH } = spriteSheet
  const scale = AVATAR_PX / tileW
  const frameCount = state.frames.length

  // For multi-frame: CSS steps() animation cycling background-position
  // For single-frame: static background-position
  const sheetWidthPx = tileW * spriteSheet.cols
  const sheetHeightPx = tileH * spriteSheet.rows

  // Build a strip of positions for animation (uses first frame's row for simple case)
  const firstFrame = state.frames[0]

  return (
    <div
      ref={ref}
      className="flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing select-none"
      onMouseDown={onMouseDown}
      onMouseEnter={() => window.api.enterCat()}
      onMouseLeave={() => window.api.leaveCat()}
    >
      <div
        className="transition-transform duration-slow ease-app"
        style={{
          width: AVATAR_PX,
          height: AVATAR_PX,
          imageRendering: 'pixelated',
          backgroundImage: `url("${spriteSheet.src}")`,
          backgroundSize: `${sheetWidthPx * scale}px ${sheetHeightPx * scale}px`,
          backgroundPosition: frameCount === 1
            ? `-${firstFrame[0] * tileW * scale}px -${firstFrame[1] * tileH * scale}px`
            : undefined,
          backgroundRepeat: 'no-repeat',
          transform: flipX ? 'scaleX(-1)' : undefined,
          // Multi-frame animation via CSS steps
          ...(frameCount > 1 ? {
            animation: `sprite-${animState} ${frameCount / state.fps}s steps(${frameCount}) infinite`
          } : {})
        }}
      />
      {/* Inject keyframes for multi-frame states */}
      {frameCount > 1 && (
        <style>{buildKeyframes(animState, state.frames, tileW, tileH, scale)}</style>
      )}
    </div>
  )
}

function buildKeyframes(
  name: string,
  frames: [number, number][],
  tileW: number, tileH: number, scale: number
): string {
  // Animate through each frame's background-position
  const steps = frames.map((f, i) => {
    const pct = (i / frames.length * 100).toFixed(2)
    return `${pct}% { background-position: -${f[0] * tileW * scale}px -${f[1] * tileH * scale}px; }`
  })
  // Final 100% wraps to first
  steps.push(`100% { background-position: -${frames[0][0] * tileW * scale}px -${frames[0][1] * tileH * scale}px; }`)
  return `@keyframes sprite-${name} { ${steps.join(' ')} }`
}
