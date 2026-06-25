import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { avatarSets, type AvatarState } from '../avatar/spriteConfig'

declare global {
  interface Window {
    api: {
      dragStart: () => void
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
  const ref = useRef<HTMLDivElement>(null)
  const anchorEdge = useAppStore((s) => s.anchorEdge)
  const setAnchorEdge = useAppStore((s) => s.setAnchorEdge)
  const avatarId = useAppStore((s) => s.avatarId)
  const setAvatarId = useAppStore((s) => s.setAvatarId)
  const [animState] = useState<AvatarState>('idle')

  const avatar = avatarSets[avatarId] ?? avatarSets.oneko
  const state = avatar.states[animState]

  // Report rect for click-through polling
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

  useEffect(() => window.api.onAnchorChanged((e) =>
    setAnchorEdge(e as 'left' | 'right' | 'top' | 'bottom')
  ), [setAnchorEdge])

  useEffect(() => window.api.onAvatarChanged(setAvatarId), [setAvatarId])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    window.api.dragStart()
    const onUp = () => { window.api.dragEnd(); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mouseup', onUp)
  }, [])

  const flipX = anchorEdge !== 'left'
  const { tileW, tileH, scale } = avatar
  const renderW = tileW * scale
  const renderH = tileH * scale
  const { frames, fps, cols, rows, image } = state
  const n = frames.length

  // ponytail: CSS steps() on a single strip/grid — works for both sheet shapes
  const bgW = cols * tileW * scale
  const bgH = rows * tileH * scale
  const f0 = frames[0]

  // Unique key per state+avatar to force re-mount when animation changes
  const key = `${avatar.id}-${animState}`

  return (
    <div
      ref={ref}
      className="flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing select-none"
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
            : { animation: `${key} ${n / fps}s steps(${n}) infinite` }
          )
        }}
      />
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
  const f0 = frames[0]
  kf.push(`100%{background-position:-${f0[0] * tileW * scale}px -${f0[1] * tileH * scale}px}`)
  return `@keyframes ${name}{${kf.join('')}}`
}
