import { useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

declare global {
  interface Window {
    api: {
      dragStart: (x: number, y: number) => void
      dragMove: (x: number, y: number) => void
      dragEnd: () => void
      enterCat: () => void
      leaveCat: () => void
      sendCatRect: (rect: { x: number; y: number; w: number; h: number }) => void
      getCursorPos: () => Promise<{ x: number; y: number }>
      getWindowPos: () => Promise<[number, number]>
      onAnchorChanged: (cb: (edge: string) => void) => () => void
    }
  }
}

export function Avatar() {
  const ref = useRef<HTMLDivElement>(null)
  const anchorEdge = useAppStore((s) => s.anchorEdge)
  const setAnchorEdge = useAppStore((s) => s.setAnchorEdge)

  // Report cat bounding rect to main for click-through polling
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

  // Listen for anchor changes from main
  useEffect(() => {
    return window.api.onAnchorChanged((edge) => {
      setAnchorEdge(edge as 'left' | 'right' | 'top' | 'bottom')
    })
  }, [setAnchorEdge])

  // Manual drag via IPC
  const onMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const cursor = await window.api.getCursorPos()
    window.api.dragStart(cursor.x, cursor.y)

    const onMove = async () => {
      const c = await window.api.getCursorPos()
      window.api.dragMove(c.x, c.y)
    }

    const onUp = () => {
      window.api.dragEnd()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const flipX = anchorEdge === 'left' ? '' : 'scale-x-[-1]'

  return (
    <div
      ref={ref}
      className="flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing select-none"
      onMouseDown={onMouseDown}
      onMouseEnter={() => window.api.enterCat()}
      onMouseLeave={() => window.api.leaveCat()}
    >
      {/* ponytail: pure CSS Siamese furball — placeholder until sprite sheet */}
      <div className={`relative ${flipX} transition-transform duration-slow ease-app`}>
        {/* Body — cream blob */}
        <div className="cat-body" />
        {/* Left ear */}
        <div className="cat-ear cat-ear-left" />
        {/* Right ear */}
        <div className="cat-ear cat-ear-right" />
        {/* Face patch */}
        <div className="cat-face" />
        {/* Eyes */}
        <div className="cat-eye cat-eye-left" />
        <div className="cat-eye cat-eye-right" />
        {/* Nose */}
        <div className="cat-nose" />
        {/* Tail */}
        <div className="cat-tail" />
      </div>
    </div>
  )
}
