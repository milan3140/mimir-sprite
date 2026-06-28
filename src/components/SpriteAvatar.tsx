import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { avatarSets, type AvatarState } from '../avatar/spriteConfig'
import { getContentCellBox, type CellBox } from '../avatar/spriteBounds'

// Window.api types in src/global.d.ts

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
  const { tileW, tileH, scale } = avatar
  const flipX = anchorEdge !== 'left'

  // Visible-pixel bbox of the cat within a cell, used so snap can flush the real cat pixels to the
  // edge. Use the RESTING frame (frames[0]) only — a union over all idle frames is wider than the
  // resting pose, which left the docked cat inset by up to ~19px (the animation's reach). Flushing
  // the resting silhouette plants the cat on the edge; the occasional wider idle frame just brushes it.
  const [cellBox, setCellBox] = useState<CellBox | null>(null)
  useEffect(() => {
    let alive = true
    const restFrame = state.frames.length ? [state.frames[0]] : state.frames
    getContentCellBox(state.image, restFrame, tileW, tileH).then((b) => { if (alive) setCellBox(b) })
    return () => { alive = false }
  }, [state.image, state.frames, tileW, tileH])

  // Report (a) the generous sprite box for click/drag hit-testing, and
  //        (b) the tight visible-content rect for edge snapping.
  const reportRect = useCallback(() => {
    if (!spriteRef.current) return
    const r = spriteRef.current.getBoundingClientRect()
    window.api.sendCatRect({ x: r.x, y: r.y, w: r.width, h: r.height })

    if (cellBox) {
      const wpx = (cellBox.r - cellBox.l) * scale
      const hpx = (cellBox.b - cellBox.t) * scale
      // flip mirrors the content horizontally within the render box
      const leftInBox = flipX ? (tileW - cellBox.r) * scale : cellBox.l * scale
      // `tight: true` = this is the real visible-pixel box; main captures spriteContentBox ONLY from a
      // tight report (the boot fallback below is the full render box → caused the not-flush-by-54px bug).
      window.api.sendCatContent({ x: r.x + leftInBox, y: r.y + cellBox.t * scale, w: wpx, h: hpx, tight: true })
    } else {
      window.api.sendCatContent({ x: r.x, y: r.y, w: r.width, h: r.height, tight: false })
    }
  }, [cellBox, scale, tileW, flipX])

  useEffect(() => {
    reportRect()
    const iv = setInterval(reportRect, 400)
    return () => clearInterval(iv)
  }, [reportRect])

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
