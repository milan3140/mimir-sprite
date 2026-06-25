import type { Todo, StoreSnapshot } from './shared/types'

declare global {
  interface Window {
    api: {
      // Drag
      dragStart: (catScreenRect: { x: number; y: number; w: number; h: number }) => void
      dragEnd: () => void
      // Click-through
      enterCat: () => void
      leaveCat: () => void
      sendCatRect: (rect: { x: number; y: number; w: number; h: number }) => void
      sendCatContent: (rect: { x: number; y: number; w: number; h: number }) => void
      // Window
      windowExpand: () => void
      windowCollapse: () => void
      windowHide: () => void
      // Events
      onAnchorChanged: (cb: (edge: string) => void) => () => void
      onAvatarChanged: (cb: (id: string) => void) => () => void
      onStoreChanged: (cb: (snap: StoreSnapshot) => void) => () => void
      // Todos
      todoList: () => Promise<Todo[]>
      todoAdd: (title: string) => Promise<Todo>
      todoUpdate: (id: string, patch: { title?: string; notes?: string }) => Promise<void>
      todoRemove: (id: string) => Promise<void>
      todoReorder: (ids: string[]) => Promise<void>
      todoStart: (id: string) => Promise<void>
      todoPause: (id: string) => Promise<void>
      todoComplete: (id: string) => Promise<void>
      appSetMode: (mode: string) => Promise<void>
    }
  }
}
