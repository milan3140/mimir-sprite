import { useEffect } from 'react'
import { SpriteAvatar } from './components/SpriteAvatar'
import { TodoPanel } from './components/TodoPanel'
import { useAppStore } from './store/useAppStore'

const CAT_W = 190 // must match WIN_W in windowManager
const CAT_H = 190 // must match WIN_H in windowManager
const PANEL_W = 267 // must match PANEL_W in windowManager
const PANEL_H = 360 // must match PANEL_H in windowManager
// ear-strip dims — must match EAR_W/EAR_D in windowManager (aspect ≈ Cat-1-Peek 30:13 to avoid stretch)
const EAR_W = 70
const EAR_D = 30
const peekImg = new URL('../assets/sprites/luizmelo/siamese/Cat-1-Peek.png', import.meta.url).href

// When hidden, the window is a small strip at the docked screen edge showing just two cat ears,
// their bases flush on the edge. The ears sprite points "up" (bases at the image bottom); we rotate
// it per edge so the bases always hug the docked edge. Click to restore.
function CatPeek({ edge }: { edge: string }) {
  const e = (edge as 'left' | 'right' | 'top' | 'bottom') ?? 'right'
  const rotate = ({ bottom: 0, top: 180, left: 90, right: -90 } as const)[e]

  // ears render at EAR_W×EAR_D, centred in the strip and rotated so the base row lands on the edge.
  const ears: React.CSSProperties = {
    position: 'absolute', left: '50%', top: '50%', width: EAR_W, height: EAR_D,
    transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
    imageRendering: 'pixelated',
    backgroundImage: `url("${peekImg}")`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat',
  }

  return (
    <div
      className="relative w-full h-full cursor-pointer"
      // ~1/255 alpha (imperceptible) so Windows hit-tests the WHOLE strip — fully-transparent
      // pixels let clicks fall through even with setIgnoreMouseEvents(false), so the gaps between
      // the ear triangles would otherwise swallow the restore click.
      style={{ background: 'rgba(0,0,0,0.004)' }}
      onClick={() => window.api.windowRestore()}
      title="Click to show Mimir (Ctrl+Alt+Space)"
    >
      <div style={ears} />
    </div>
  )
}

export default function App() {
  const expanded = useAppStore(s => s.expanded)
  const setExpandedState = useAppStore(s => s.setExpandedState)
  const hidden = useAppStore(s => s.hidden)
  const hiddenEdge = useAppStore(s => s.hiddenEdge)
  const setHiddenState = useAppStore(s => s.setHiddenState)
  const anchorEdge = useAppStore(s => s.anchorEdge)
  const catOffset = useAppStore(s => s.catOffset)
  const applySnapshot = useAppStore(s => s.applySnapshot)

  useEffect(() => window.api.onStoreChanged(applySnapshot), [applySnapshot])
  useEffect(() => { window.api.storeGet().then(applySnapshot) }, [applySnapshot])
  useEffect(() => window.api.onExpandedChanged(setExpandedState), [setExpandedState])
  useEffect(() => window.api.onHiddenChanged(setHiddenState), [setHiddenState])

  // ponytail: nub mode — tiny tab, nothing else
  if (hidden) return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <CatPeek edge={hiddenEdge} />
    </div>
  )

  // HUG: ~50% of the cat box's transparent padding on the panel side (~64h / ~74v) — pulls the
  // panel toward the visible cat so it doesn't look far away.
  const HUG_X = 32
  const HUG_Y = 37

  // FIXED-WINDOW MODEL (flicker-free): while docked the window is ALWAYS the expanded size — the cat
  // box is absolutely anchored to the docked edge (flush) and the panel is ALWAYS MOUNTED. Expand/
  // collapse never resizes the window; it just toggles `.is-open`, and the panel animates open via a
  // GPU transform+opacity transition with transform-origin at the cat. No native resize on the hover
  // path → no native-vs-renderer frame mismatch → no flicker/deform. (Research-validated approach.)
  const catBoxStyle = ({
    right:  { position: 'absolute', right: 0, top: 0, width: CAT_W, height: CAT_H },
    left:   { position: 'absolute', left: 0,  top: 0, width: CAT_W, height: CAT_H },
    top:    { position: 'absolute', top: 0,    left: catOffset, width: CAT_W, height: CAT_H },
    bottom: { position: 'absolute', bottom: 0, left: catOffset, width: CAT_W, height: CAT_H },
  })[anchorEdge] as React.CSSProperties

  // panel area (absolute), shifted ~HUG toward the cat to hug it; PANEL_W×PANEL_H content on every edge.
  // transform-origin points AT the cat so the panel grows out of it.
  const panelStyle = ({
    right:  { position: 'absolute', left: HUG_X,        top: 0, bottom: 0, width: PANEL_W, transformOrigin: 'right center' },
    left:   { position: 'absolute', right: HUG_X,       top: 0, bottom: 0, width: PANEL_W, transformOrigin: 'left center' },
    top:    { position: 'absolute', top: CAT_H - HUG_Y, left: 0, right: 0, height: PANEL_H, transformOrigin: 'center top' },
    bottom: { position: 'absolute', top: HUG_Y,         left: 0, right: 0, height: PANEL_H, transformOrigin: 'center bottom' },
  })[anchorEdge] as React.CSSProperties

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent relative">
      {/* panel ALWAYS mounted; `.is-open` drives the CSS disclosure (no remount, no reflow jump) */}
      <div className={`panel-disclosure ${expanded ? 'is-open' : ''}`} style={panelStyle}>
        <TodoPanel edge={anchorEdge} />
      </div>
      <div style={catBoxStyle}>
        <SpriteAvatar />
      </div>
    </div>
  )
}
