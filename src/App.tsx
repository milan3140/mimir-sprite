import { useEffect } from 'react'
import { SpriteAvatar } from './components/SpriteAvatar'
import { TodoPanel } from './components/TodoPanel'
import { useAppStore } from './store/useAppStore'

const CAT_W = 190 // must match WIN_W in windowManager
const CAT_H = 190 // must match WIN_H in windowManager
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

  if (!expanded) return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <SpriteAvatar />
    </div>
  )

  const isHoriz = anchorEdge === 'left' || anchorEdge === 'right'
  const flexDir = ({
    right: 'flex-row',
    left:  'flex-row-reverse',
    top:   'flex-col-reverse',
    bottom:'flex-col',
  } as const)[anchorEdge]

  const slideAnim = ({
    right: 'panel-slide-right',
    left:  'panel-slide-left',
    top:   'panel-slide-top',
    bottom:'panel-slide-bottom',
  } as const)[anchorEdge]

  // top/bottom: panel is wider than the cat and centred on it; pin the cat box to its true x via
  // catOffset (= catX - windowX from main) so the cat never moves. left/right: cat sits at the edge.
  //
  // HUG: the cat box (CAT_W/H) leaves wide transparent padding on the panel side (~64h / ~74v),
  // so the panel card looks far from the visible cat. WITHOUT touching the flex sizing (cat stays
  // fixed) and WITHOUT resizing the panel (width must stay consistent across edges), SHIFT the panel
  // CARD ~50% of that gap toward the cat via an absolute layer (both opposite insets move by HUG, so
  // size is unchanged). HUG < gap so the card never covers the cat; the freed space is on the panel's
  // far (screen-centre) side and is transparent.
  const HUG_X = 32  // ≈ 50% of the ~64px horizontal gap
  const HUG_Y = 37  // ≈ 50% of the ~74px vertical gap
  const panelShift = ({
    right:  { left: HUG_X,  right: -HUG_X },
    left:   { left: -HUG_X, right: HUG_X },
    top:    { top: -HUG_Y,  bottom: HUG_Y },
    bottom: { top: HUG_Y,   bottom: -HUG_Y },
  } as const)[anchorEdge]

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <div className={`flex h-full ${flexDir}`}>
        <div className="flex-1 min-w-0 min-h-0 relative">
          {/* card shifted toward the cat (same size) so it sits ~half-as-far from it */}
          <div className={`absolute inset-0 ${slideAnim}`} style={panelShift}>
            <TodoPanel edge={anchorEdge} />
          </div>
        </div>
        <div
          style={isHoriz
            ? { width: CAT_W, minWidth: CAT_W, height: CAT_H }
            : { width: CAT_W, height: CAT_H, minHeight: CAT_H, marginLeft: catOffset }
          }
          className="self-start"
        >
          <SpriteAvatar />
        </div>
      </div>
    </div>
  )
}
