import { create } from 'zustand'

interface AppState {
  anchorEdge: 'left' | 'right' | 'top' | 'bottom'
  setAnchorEdge: (edge: 'left' | 'right' | 'top' | 'bottom') => void
  avatarId: string
  setAvatarId: (id: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  anchorEdge: 'right',
  setAnchorEdge: (edge) => set({ anchorEdge: edge }),
  avatarId: 'luizmelo',
  setAvatarId: (id) => set({ avatarId: id })
}))
