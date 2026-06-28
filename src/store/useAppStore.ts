import { create } from 'zustand'
import type { Todo, AppMode, StoreSnapshot } from '../shared/types'

type Edge = 'left' | 'right' | 'top' | 'bottom'

interface AppStore {
  anchorEdge: Edge
  setAnchorEdge: (edge: Edge) => void
  avatarId: string
  setAvatarId: (id: string) => void
  expanded: boolean
  catSide: 'left' | 'right'   // which side the cat sits on (top/bottom layout aligns the cat box to it)
  setExpandedState: (v: { expanded: boolean; edge: string; catSide?: 'left' | 'right' }) => void
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
  catSide: 'left',
  setExpandedState: (v) => set({ expanded: v.expanded, anchorEdge: v.edge as Edge, ...(v.catSide ? { catSide: v.catSide } : {}) }),
  hidden: false,
  hiddenEdge: 'right',
  setHiddenState: (v) => set({ hidden: v.hidden, hiddenEdge: v.edge as Edge }),
  todos: [],
  appMode: { mode: 'idle', expanded: false },
  applySnapshot: (snap) => set({ todos: snap.todos, appMode: snap.appState }),
}))
