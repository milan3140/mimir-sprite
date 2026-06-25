import { useEffect } from 'react'
import { SpriteAvatar } from './components/SpriteAvatar'
import { TodoPanel } from './components/TodoPanel'
import { useAppStore } from './store/useAppStore'

const CAT_W = 190 // must match WIN_W in windowManager
const CAT_H = 190 // must match WIN_H in windowManager

export default function App() {
  const expanded = useAppStore(s => s.expanded)
  const setExpandedState = useAppStore(s => s.setExpandedState)
  const anchorEdge = useAppStore(s => s.anchorEdge)
  const applySnapshot = useAppStore(s => s.applySnapshot)

  // Mirror store from main
  useEffect(() => window.api.onStoreChanged(applySnapshot), [applySnapshot])
  // ponytail: pull initial snapshot on mount (the push broadcast fires before this effect registers)
  useEffect(() => { window.api.storeGet().then(applySnapshot) }, [applySnapshot])
  // Expand/collapse is decided by MAIN (cursor poll); the renderer only reflects it.
  useEffect(() => window.api.onExpandedChanged(setExpandedState), [setExpandedState])

  if (!expanded) return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <SpriteAvatar />
    </div>
  )

  // ponytail: layout per edge — cat stays at the docked corner, panel fills the rest
  const isHoriz = anchorEdge === 'left' || anchorEdge === 'right'
  const flexDir = ({
    right: 'flex-row',           // [Panel | Cat] — cat on the right
    left:  'flex-row-reverse',   // [Panel | Cat] reversed → cat on the left
    top:   'flex-col-reverse',   // [Panel | Cat] reversed → cat on top
    bottom:'flex-col',           // [Panel | Cat] — cat on bottom
  } as const)[anchorEdge]

  // Slide-in direction: panel slides FROM the cat side
  const slideAnim = ({
    right: 'panel-slide-right',
    left:  'panel-slide-left',
    top:   'panel-slide-top',
    bottom:'panel-slide-bottom',
  } as const)[anchorEdge]

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <div className={`flex h-full ${flexDir}`}>
        {/* Panel — flex-1 fills the space the cat doesn't occupy */}
        {/* ponytail: no padding — panel border is the gap; sits flush to the cat */}
        <div className={`flex-1 min-w-0 min-h-0 ${slideAnim}`}>
          <TodoPanel edge={anchorEdge} />
        </div>
        {/* CatBox — fixed to the exact collapsed size, flush to docked edge */}
        <div
          style={isHoriz
            ? { width: CAT_W, minWidth: CAT_W, height: CAT_H }
            : { width: CAT_W, height: CAT_H, minHeight: CAT_H }
          }
          className={isHoriz ? 'self-start' : 'self-start'}
        >
          <SpriteAvatar />
        </div>
      </div>
    </div>
  )
}
