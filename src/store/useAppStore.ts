import { create } from 'zustand'
import type { Todo, AppMode, StoreSnapshot, Bubble } from '../shared/types'
import { DEFAULT_PANEL_W, DEFAULT_PANEL_H } from '../shared/geometry'

type Edge = 'left' | 'right' | 'top' | 'bottom'

interface AppStore {
  anchorEdge: Edge
  setAnchorEdge: (edge: Edge) => void
  avatarId: string
  setAvatarId: (id: string) => void
  expanded: boolean
  catOffset: number   // cat box's horizontal offset inside the expanded window (top/bottom layout)
  setExpandedState: (v: { expanded: boolean; edge: string; catOffset?: number }) => void
  hidden: boolean
  hiddenEdge: Edge
  setHiddenState: (v: { hidden: boolean; edge: string }) => void
  // Store mirror from main
  todos: Todo[]
  appMode: AppMode
  panelW: number
  panelH: number
  livePanel: { w: number; h: number } | null   // transient size during a resize drag (not persisted)
  setLivePanel: (v: { w: number; h: number } | null) => void
  // M5 thinking bubbles (transient, streamed from main; per-bubble independent lifecycle)
  bubbles: Bubble[]
  thinking: boolean
  pushBubble: (b: Bubble) => void
  fadeBubble: (idx: number) => void
  removeBubble: (idx: number) => void
  clearBubbles: () => void
  applySnapshot: (snap: StoreSnapshot) => void
}

export const useAppStore = create<AppStore>((set) => ({
  anchorEdge: 'right',
  setAnchorEdge: (edge) => set({ anchorEdge: edge }),
  avatarId: 'luizmelo',
  setAvatarId: (id) => set({ avatarId: id }),
  expanded: false,
  catOffset: 0,
  setExpandedState: (v) => set({ expanded: v.expanded, anchorEdge: v.edge as Edge, ...(typeof v.catOffset === 'number' ? { catOffset: v.catOffset } : {}) }),
  hidden: false,
  hiddenEdge: 'right',
  setHiddenState: (v) => set({ hidden: v.hidden, hiddenEdge: v.edge as Edge }),
  todos: [],
  appMode: { mode: 'idle', expanded: false },
  panelW: DEFAULT_PANEL_W,
  panelH: DEFAULT_PANEL_H,
  livePanel: null,
  setLivePanel: (v) => set({ livePanel: v }),
  bubbles: [],
  thinking: false,
  // each bubble has its own lifecycle; cap at 8 as a safety backstop (independent fades usually keep ~3-4)
  pushBubble: (b) => set((s) => ({ thinking: true, bubbles: [...s.bubbles.filter((x) => x.idx !== b.idx), b].slice(-8) })),
  fadeBubble: (idx) => set((s) => ({ bubbles: s.bubbles.map((b) => (b.idx === idx ? { ...b, fading: true } : b)) })),
  removeBubble: (idx) => set((s) => {
    const left = s.bubbles.filter((b) => b.idx !== idx)
    return { bubbles: left, thinking: left.length > 0 }
  }),
  clearBubbles: () => set({ bubbles: [], thinking: false }),
  applySnapshot: (snap) => set({
    todos: snap.todos, appMode: snap.appState,
    ...(snap.panel ? { panelW: snap.panel.w, panelH: snap.panel.h } : {}),
  }),
}))
