import { useEffect } from 'react'
import { SpriteAvatar } from './components/SpriteAvatar'
import { TodoPanel } from './components/TodoPanel'
import { useAppStore } from './store/useAppStore'
// Shared geometry — ONE source of truth with the main process (windowManager). Never redeclare here.
import { CELL, CAT_X, CAT_Y, HUG_X, HUG_Y, EAR_W, EAR_D } from './shared/geometry'

// UNIFIED FIXED-WINDOW, CAT-GLUED MODEL (see TEST_DESIGN.md §6): ONE fixed window size; the cat cell
// sits at a CONSTANT position (CAT_X, CAT_Y) on every edge — only the panel moves per edge.
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
  const storeW = useAppStore(s => s.panelW)    // user-resizable (persisted); main getPanelHitRect agrees
  const storeH = useAppStore(s => s.panelH)
  const livePanel = useAppStore(s => s.livePanel)  // transient size while dragging the resize handle
  const PANEL_W = livePanel?.w ?? storeW
  const PANEL_H = livePanel?.h ?? storeH
  const applySnapshot = useAppStore(s => s.applySnapshot)

  useEffect(() => {
    const h = (): void => { (window as unknown as { __mm: number }).__mm = ((window as unknown as { __mm?: number }).__mm || 0) + 1 }
    window.addEventListener('mousemove', h)
    return () => window.removeEventListener('mousemove', h)
  }, [])
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

  // CAT-GLUED: the cat cell is at the SAME window position on every edge. It NEVER moves on dock/drag/
  // hover — the window moves under it (main owns bounds), so main↔renderer never desync → no teleport.
  // pointerEvents:'none' — the 190×190 cell is rendered ON TOP of the panel and overlaps it (e.g. the
  // bottom-edge panel sits right under the cat), so a default 'auto' box would EAT clicks meant for the
  // panel's add-todo input. The sprite re-enables pointer-events on itself, so it stays grabbable.
  const catBoxStyle: React.CSSProperties = {
    position: 'absolute', left: CAT_X, top: CAT_Y, width: CELL, height: CELL, pointerEvents: 'none',
  }

  // panel (absolute, fixed size on every edge) positioned next to the constant cat cell, hugged, on the
  // screen-centre side. Matches getPanelHitRect() in windowManager. transform-origin points AT the cat.
  const PV_TOP = CAT_Y + CELL / 2 - PANEL_H / 2   // vertical-centre on cat (left/right edges)
  const PH_LEFT = CAT_X + CELL / 2 - PANEL_W / 2  // horizontal-centre on cat (top/bottom edges)
  const panelStyle = ({
    right:  { position: 'absolute', left: CAT_X - PANEL_W + HUG_X, top: PV_TOP, width: PANEL_W, height: PANEL_H, transformOrigin: 'right center' },
    left:   { position: 'absolute', left: CAT_X + CELL - HUG_X,    top: PV_TOP, width: PANEL_W, height: PANEL_H, transformOrigin: 'left center' },
    top:    { position: 'absolute', left: PH_LEFT, top: CAT_Y + CELL - HUG_Y,   width: PANEL_W, height: PANEL_H, transformOrigin: 'center top' },
    bottom: { position: 'absolute', left: PH_LEFT, top: CAT_Y - PANEL_H + HUG_Y, width: PANEL_W, height: PANEL_H, transformOrigin: 'center bottom' },
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
