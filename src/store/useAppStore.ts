import { create } from 'zustand'
import type { Todo, AppMode, StoreSnapshot } from '../shared/types'

type Edge = 'left' | 'right' | 'top' | 'bottom'

interface AppStore {
  anchorEdge: Edge
  setAnchorEdge: (edge: Edge) => void
  avatarId: string
  setAvatarId: (id: string) => void
  expanded: boolean
  // ponytail: main sends {expanded, edge} — we set both at once
  setExpandedState: (v: { expanded: boolean; edge: string }) => void
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
  setExpandedState: (v) => set({ expanded: v.expanded, anchorEdge: v.edge as Edge }),
  todos: [],
  appMode: { mode: 'idle', expanded: false },
  applySnapshot: (snap) => set({ todos: snap.todos, appMode: snap.appState }),
}))
