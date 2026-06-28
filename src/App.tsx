import { useEffect } from 'react'
import { SpriteAvatar } from './components/SpriteAvatar'
import { TodoPanel } from './components/TodoPanel'
import { useAppStore } from './store/useAppStore'

const CAT_W = 190 // must match WIN_W in windowManager
const CAT_H = 190 // must match WIN_H in windowManager
// peek-face dims — must match FACE_W/FACE_H/SIDE_W in windowManager
const FACE_W = 74
const FACE_H = 48
const SIDE_W = 42
const peekImg = new URL('../assets/sprites/luizmelo/siamese/Cat-1-Peek.png', import.meta.url).href

// When hidden, the window is a small strip at the docked screen edge showing a dedicated
// "cat ears peeking" face. Click it to restore. top/bottom show the whole face; left/right show a
// vertical slice peeking around the edge (the face's bottom is the "ledge" it peeks over).
function CatPeek({ edge }: { edge: string }) {
  const e = (edge as 'left' | 'right' | 'top' | 'bottom') ?? 'right'
  // face fills FACE_W×FACE_H; the strip window crops it per edge (overflow hidden)
  const face: React.CSSProperties = {
    position: 'absolute', width: FACE_W, height: FACE_H, imageRendering: 'pixelated',
    backgroundImage: `url("${peekImg}")`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat',
  }
  switch (e) {
    case 'bottom': face.left = 0;             face.top = 0; break                       // whole face, ledge at bottom
    case 'top':    face.left = 0;             face.top = 0; face.transform = 'scaleY(-1)'; break // flipped, ledge at top
    case 'left':   face.left = SIDE_W - FACE_W; face.top = 0; break                     // right slice peeks in
    case 'right':  face.left = 0;             face.top = 0; break                       // left slice peeks in
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden cursor-pointer cat-peek-bob"
      style={{ background: 'transparent' }}
      onClick={() => window.api.windowRestore()}
      title="Click to show Mimir (Ctrl+Alt+Space)"
    >
      <div style={face} />
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

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <div className={`flex h-full ${flexDir}`}>
        {/* ponytail: no padding — panel border is the gap; sits flush to the cat */}
        <div className={`flex-1 min-w-0 min-h-0 ${slideAnim}`}>
          <TodoPanel edge={anchorEdge} />
        </div>
        <div
          style={isHoriz
            ? { width: CAT_W, minWidth: CAT_W, height: CAT_H }
            : { width: CAT_W, height: CAT_H, minHeight: CAT_H }
          }
          className="self-start"
        >
          <SpriteAvatar />
        </div>
      </div>
    </div>
  )
}
