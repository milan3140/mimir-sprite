import { useRef, useCallback, useEffect } from 'react'
import { SpriteAvatar } from './components/SpriteAvatar'
import { TodoPanel } from './components/TodoPanel'
import { useAppStore } from './store/useAppStore'

const CAT_SIZE = 190 // must match WIN_W/WIN_H in windowManager

export default function App() {
  const expanded = useAppStore(s => s.expanded)
  const setExpanded = useAppStore(s => s.setExpanded)
  const anchorEdge = useAppStore(s => s.anchorEdge)
  const applySnapshot = useAppStore(s => s.applySnapshot)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mirror store from main
  useEffect(() => window.api.onStoreChanged(applySnapshot), [applySnapshot])

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current) { clearTimeout(collapseTimer.current); collapseTimer.current = null }
  }, [])

  // ponytail: onMouseOver bubbles from the cat sprite (pointer-events:auto)
  // even through pointer-events:none ancestors. mouseenter does not bubble.
  const handleMouseOver = useCallback(() => {
    cancelCollapse()
    if (!expanded) {
      setExpanded(true)
      window.api.windowExpand()
    }
  }, [expanded, setExpanded, cancelCollapse])

  const scheduleCollapse = useCallback(() => {
    cancelCollapse()
    if (!expanded) return
    collapseTimer.current = setTimeout(() => {
      setExpanded(false)
      window.api.windowCollapse()
    }, 250)
  }, [expanded, setExpanded, cancelCollapse])

  // Panel on the side opposite the screen edge the cat is snapped to
  const isRight = anchorEdge === 'right'

  return (
    <div
      className="w-screen h-screen overflow-hidden bg-transparent"
      onMouseOver={handleMouseOver}
      onMouseLeave={scheduleCollapse}
    >
      {expanded ? (
        <div className={`flex h-full ${isRight ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className="flex-1 min-w-0 p-1">
            <TodoPanel />
          </div>
          <div style={{ width: CAT_SIZE, minWidth: CAT_SIZE }} className="flex items-center justify-center">
            <SpriteAvatar />
          </div>
        </div>
      ) : (
        <SpriteAvatar />
      )}
    </div>
  )
}
