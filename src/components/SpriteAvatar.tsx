import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { avatarSets, type AvatarState } from '../avatar/spriteConfig'

declare global {
  interface Window {
    api: {
      dragStart: (catScreenRect: { x: number; y: number; w: number; h: number }) => void
      dragEnd: () => void
      enterCat: () => void
      leaveCat: () => void
      sendCatRect: (rect: { x: number; y: number; w: number; h: number }) => void
      onAnchorChanged: (cb: (edge: string) => void) => () => void
      onAvatarChanged: (cb: (id: string) => void) => () => void
    }
  }
}

export function SpriteAvatar() {
  // ref is on the INNER sprite (the actual cat), so drag + hit-test = the cat only,
  // not the whole transparent window. Fixes "drags even when not on the cat".
  const spriteRef = useRef<HTMLDivElement>(null)
  const anchorEdge = useAppStore((s) => s.anchorEdge)
  const setAnchorEdge = useAppStore((s) => s.setAnchorEdge)
  const avatarId = useAppStore((s) => s.avatarId)
  const setAvatarId = useAppStore((s) => s.setAvatarId)
  const [animState] = useState<AvatarState>('idle')

  const avatar = avatarSets[avatarId] ?? avatarSets.luizmelo
  const state = avatar.states[animState]

  // Report the CAT's rect (relative to window viewport) for click-through hit polling.
  const reportRect = useCallback(() => {
    if (!spriteRef.current) return
    const r = spriteRef.current.getBoundingClientRect()
    window.api.sendCatRect({ x: r.x, y: r.y, w: r.width, h: r.height })
  }, [])

  useEffect(() => {
    reportRect()
    const iv = setInterval(reportRect, 400)
    return () => clearInterval(iv)
  }, [reportRect, avatarId, animState])

  useEffect(() => window.api.onAnchorChanged((e) =>
    setAnchorEdge(e as 'left' | 'right' | 'top' | 'bottom')
  ), [setAnchorEdge])

  useEffect(() => window.api.onAvatarChanged(setAvatarId), [setAvatarId])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    // pass the cat's SCREEN rect so main can verify the drag really started on the cat (H6)
    const r = spriteRef.current?.getBoundingClientRect()
    const catScreenRect = r
      ? { x: Math.round(window.screenX + r.x), y: Math.round(window.screenY + r.y), w: Math.round(r.width), h: Math.round(r.height) }
      : { x: 0, y: 0, w: 0, h: 0 }
    window.api.dragStart(catScreenRect)
    const onUp = () => { window.api.dragEnd(); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mouseup', onUp)
  }, [])

  const flipX = anchorEdge !== 'left'
  const { tileW, tileH, scale } = avatar
  const renderW = tileW * scale
  const renderH = tileH * scale
  const { frames, fps, cols, rows, image } = state
  const n = frames.length

  const bgW = cols * tileW * scale
  const bgH = rows * tileH * scale
  const f0 = frames[0]
  const key = `${avatar.id}-${animState}`

  return (
    // outer container: pointer-events none so ONLY the cat is interactive/draggable
    <div className="flex items-center justify-center w-full h-full select-none" style={{ pointerEvents: 'none' }}>
      <div
        ref={spriteRef}
        className="cursor-grab active:cursor-grabbing"
        style={{ pointerEvents: 'auto' }}
        onMouseDown={onMouseDown}
        onMouseEnter={() => window.api.enterCat()}
        onMouseLeave={() => window.api.leaveCat()}
      >
        <div
          key={key}
          style={{
            width: renderW,
            height: renderH,
            imageRendering: 'pixelated',
            backgroundImage: `url("${image}")`,
            backgroundSize: `${bgW}px ${bgH}px`,
            backgroundRepeat: 'no-repeat',
            transform: flipX ? 'scaleX(-1)' : undefined,
            ...(n === 1
              ? { backgroundPosition: `-${f0[0] * tileW * scale}px -${f0[1] * tileH * scale}px` }
              // step-end: HOLD each frame for its slice, no interpolation between frames.
              // (steps(n) here sub-stepped bg-position between adjacent frames => the sliding/seam bug)
              : { animation: `${key} ${n / fps}s step-end infinite` }
            )
          }}
        />
      </div>
      {n > 1 && <style>{buildKeyframes(key, frames, tileW, tileH, scale)}</style>}
    </div>
  )
}

function buildKeyframes(
  name: string, frames: [number, number][],
  tileW: number, tileH: number, scale: number
): string {
  const kf = frames.map((f, i) => {
    const pct = (i / frames.length * 100).toFixed(2)
    return `${pct}%{background-position:-${f[0] * tileW * scale}px -${f[1] * tileH * scale}px}`
  })
  // with step-end the 100% value isn't rendered, but hold the LAST frame for clarity
  const fl = frames[frames.length - 1]
  kf.push(`100%{background-position:-${fl[0] * tileW * scale}px -${fl[1] * tileH * scale}px}`)
  return `@keyframes ${name}{${kf.join('')}}`
}
