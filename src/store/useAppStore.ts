import { create } from 'zustand'
import type { Todo, AppMode, StoreSnapshot } from '../shared/types'

interface AppStore {
  anchorEdge: 'left' | 'right' | 'top' | 'bottom'
  setAnchorEdge: (edge: 'left' | 'right' | 'top' | 'bottom') => void
  avatarId: string
  setAvatarId: (id: string) => void
  expanded: boolean
  setExpanded: (v: boolean) => void
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
  setExpanded: (v) => set({ expanded: v }),
  todos: [],
  appMode: { mode: 'idle', expanded: false },
  applySnapshot: (snap) => set({ todos: snap.todos, appMode: snap.appState }),
}))
