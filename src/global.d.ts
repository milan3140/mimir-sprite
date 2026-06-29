import type { Todo, StoreSnapshot, Attachment, Bubble } from './shared/types'

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
      sendCatContent: (rect: { x: number; y: number; w: number; h: number; tight?: boolean }) => void
      // Window
      windowExpand: () => void
      windowCollapse: () => void
      windowHide: () => void
      windowRestore: () => void
      // Events
      onAnchorChanged: (cb: (edge: string) => void) => () => void
      onAvatarChanged: (cb: (id: string) => void) => () => void
      onStoreChanged: (cb: (snap: StoreSnapshot) => void) => () => void
      onExpandedChanged: (cb: (v: { expanded: boolean; edge: string; catOffset?: number }) => void) => () => void
      onHiddenChanged: (cb: (v: { hidden: boolean; edge: string }) => void) => () => void
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
      storeGet: () => Promise<StoreSnapshot>
      sendPanelRects: (rects: unknown) => void
      // Attachments (M3b)
      attachmentSave: (p: { todoId: string; dataUrl: string; name?: string; width?: number; height?: number }) => Promise<Attachment>
      attachmentRead: (relPath: string) => Promise<string | null>
      panelResize: (w: number, h: number) => Promise<void>
      setResizing: (v: boolean) => void
      // M5 thinking bubbles
      thinkNow: (todoId: string) => Promise<void>
      onThinkBubble: (cb: (b: Bubble) => void) => () => void
      onThinkRemove: (cb: (idx: number) => void) => () => void
      onThinkClear: (cb: () => void) => () => void
    }
  }
}
