import { create } from 'zustand'
import type { Todo, AppMode, StoreSnapshot } from '../shared/types'

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
  applySnapshot: (snap) => set({ todos: snap.todos, appMode: snap.appState }),
}))
