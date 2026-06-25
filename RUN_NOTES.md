# Mimir-Sprite — Run Notes (Slice 1)

## How to run

```bash
npm install
npm run dev      # launches the transparent cat window
npm run build    # production build (electron-vite build)
npm run typecheck # tsc --noEmit
```

## What works (Slice 1)

- Transparent frameless always-on-top window (240x280) with pure-CSS Siamese furball
- Manual drag via IPC (`mousedown` → cursor polling → `win.setPosition`)
- Snap to nearest of 4 screen edges on release (animated ~320ms ease-out)
- Click-through: transparent areas pass to desktop; hovering the cat makes it interactive
- Cursor-polling fallback (120ms) for click-through — required because Electron's `mouseleave` is unreliable after `setIgnoreMouseEvents(true, {forward:true})` on Windows
- Tray icon (programmatic 16x16 cream circle) with Show/Hide + Quit menu
- `Ctrl+Alt+Space` global shortcut to toggle visibility
- `anchorEdge` sent to renderer so the cat flips orientation (face toward screen center)
- Design tokens from `docs/03_design_tokens.md` wired into CSS vars + Tailwind config

## Windows quirks

### Transparency black-box

`BrowserWindow({ transparent: true })` often renders as a black rectangle on Windows 11 with GPU compositing. Fix applied:

```ts
app.commandLine.appendSwitch('disable-gpu-compositing')  // BEFORE app.whenReady()
```

This is set in `electron/main/index.ts`. If you still see black, try also:

```ts
app.disableHardwareAcceleration()  // nuclear option, last resort
```

### Click-through `mouseleave` unreliable

After `setIgnoreMouseEvents(true, {forward:true})`, Electron on Windows does NOT reliably fire `mouseleave` or `:hover` (Electron issue #30808). The cursor-polling fallback in `electron/main/clickThrough.ts` compares `screen.getCursorScreenPoint()` against the cat's bounding rect every 120ms. This is not optional — without it, the window gets stuck in interactive mode after moving the mouse quickly off the cat.

### `-webkit-app-region: drag` vs frameless

CSS `-webkit-app-region: drag` can cause issues with frameless transparent windows on Windows (double-click maximize, right-click system menu). This slice uses manual drag via IPC instead: renderer captures `mousedown` and polls cursor position, sends deltas to main process which calls `win.setPosition()`. More reliable for this use case.

### `thickFrame: false`

Required to prevent Windows from adding its own resize border and shadow to the frameless window. Without it, you get a visible 1px border around the transparent window.

### `roundedCorners: false`

Win11 auto-rounds window corners even for frameless windows. This flag disables that.

## Stubs / TODO (later slices)

- No todo panel, persistence, store, thinking, or notebooks
- No sprite sheet — avatar is pure CSS placeholder
- No PPT/fullscreen detection (needs `get-windows` package, deferred)
- No `lowdb` persistence
- Tray icon is a programmatic 16x16 circle — replace with proper `.ico` when available
- shadcn/ui components.json configured but no components added yet (wired for next slice)
