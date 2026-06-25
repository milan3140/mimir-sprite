import { create } from 'zustand'

interface AppState {
  anchorEdge: 'left' | 'right' | 'top' | 'bottom'
  setAnchorEdge: (edge: 'left' | 'right' | 'top' | 'bottom') => void
}

export const useAppStore = create<AppState>((set) => ({
  anchorEdge: 'right',
  setAnchorEdge: (edge) => set({ anchorEdge: edge })
}))
