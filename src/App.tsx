import { useEffect } from 'react'
import { SpriteAvatar } from './components/SpriteAvatar'
import { TodoPanel } from './components/TodoPanel'
import { useAppStore } from './store/useAppStore'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'

const CAT_W = 190 // must match WIN_W in windowManager
const CAT_H = 190 // must match WIN_H in windowManager

// ponytail: tiny clickable tab at the docked edge when hidden
function Nub({ edge }: { edge: string }) {
  const Chevron = ({ right: ChevronLeft, left: ChevronRight, top: ChevronDown, bottom: ChevronUp } as const)[
    edge as 'left' | 'right' | 'top' | 'bottom'
  ] ?? ChevronLeft

  return (
    <div
      className="w-full h-full flex items-center justify-center cursor-pointer"
      style={{ background: 'var(--surface)', borderRadius: 3 }}
      onClick={() => window.api.windowRestore()}
      title="Click to show Mimir (Ctrl+Alt+Space)"
    >
      <Chevron size={10} style={{ color: 'var(--brand)' }} />
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
      <Nub edge={hiddenEdge} />
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
