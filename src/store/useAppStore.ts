import { create } from 'zustand'
import type { Todo, AppMode, StoreSnapshot } from '../shared/types'
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
  applySnapshot: (snap) => set({
    todos: snap.todos, appMode: snap.appState,
    ...(snap.panel ? { panelW: snap.panel.w, panelH: snap.panel.h } : {}),
  }),
}))
