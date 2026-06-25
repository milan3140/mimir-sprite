# Mimir-Sprite — Run Notes (Slice M3a)

## How to run

```bash
npm install
npm run dev      # launches the transparent cat window
npm run build    # production build (electron-vite build)
npm run typecheck # tsc --noEmit
```

## What works

- Transparent frameless always-on-top window (190x190 collapsed, 420x380 expanded)
- **Two avatar sets** (oneko + LuizMelo Cat-1) via generalized `AvatarSet` config in `spriteConfig.ts`
- Supports both grid sheets (oneko) and per-state strips (LuizMelo)
- **Live avatar switch** from tray menu
- CSS `step-end` animation, `image-rendering: pixelated`
- Manual drag: main polls `screen.getCursorScreenPoint()` at 16ms — DPI-safe
- Snap to nearest of 4 screen edges (animated ease-out), visible-pixel snapping via `cat:content`
- Click-through + cursor-polling fallback (120ms)
- Tray icon + `Ctrl+Alt+Space` global shortcut
- `anchorEdge` flips sprite via `scaleX(-1)` (faces screen center)

### Slice M3a: Todo panel + store

- **lowdb store** at `userData/mimir-sprite/db.json` (schema v1 per docs/02)
  - lowdb v7 is ESM-only; loaded via `await import('lowdb')` in CJS main process
- **IPC channels**: `todo:list|add|update|remove|reorder|start|pause|complete`, `app:setMode`, `store:changed` broadcast
- **Zustand mirror**: renderer store mirrors `todos[]` + `appState` from main via `store:changed` events
- **Hover-expand panel**: hovering the cat opens TodoPanel beside it; leaving collapses after 250ms debounce
  - `setBounds` resize keeps cat anchored at its screen edge (panel grows toward screen center per `anchorEdge`)
  - Expanded: `setIgnoreMouseEvents(false)` — whole window interactive
  - Collapsed: restores `setIgnoreMouseEvents(true, {forward:true})` click-through
  - Drag auto-collapses before starting
- **TodoPanel** (dark, token-driven, Lucide icons):
  - Top bar: "Mimir" label, Coffee (rest toggle), EyeOff (hide)
  - Todo list sorted by `order`, filtered `status!='done'`
  - Each row: GripVertical drag handle, title, Play/Pause/Check/Brain(stub)/Trash2 controls
  - `@dnd-kit/sortable` drag-reorder persists `order` across restart
  - Bottom add-todo input (Plus / Enter)
- **State machine** (per docs/02):
  - `start` → status=active, mode=working, pauses any other active todo
  - `pause` → status=paused, accumulates elapsed time, mode=idle
  - `complete` → status=done, accumulates if was active, writes completion log, mode=idle
  - `rest` toggle → pauses active todo, mode=resting ⇄ idle
  - Only one active todo at a time
- **Completion log**: jsonl at `userData/mimir-sprite/state/completion_log.jsonl`
  - Written on complete with todoId, title, timestamps, totalActiveMs, empty thinking/notebook arrays

## Windows quirks

### Drag crash (fixed in Slice 1b)

Renderer `e.screenX/Y` are floats under DPI scaling. All `setPosition` calls now `Math.round()` + NaN guard. Drag driven from `screen.getCursorScreenPoint()` in main.

### Wrong snap position under DPI (fixed in Slice 1b)

Snap uses `screen.getDisplayNearestPoint(cursor).workArea` from main (DIP-correct), no renderer coords.

### Transparency black-box

`app.commandLine.appendSwitch('disable-gpu-compositing')` applied before `app.whenReady()`.

### Click-through `mouseleave` unreliable

Cursor-polling fallback in `clickThrough.ts` (120ms). Not optional — Electron issue #30808.

### `thickFrame: false` / `roundedCorners: false`

Required to prevent Win11 resize borders and auto-rounded corners on frameless windows.

### Window size inflation (fixed)

`setBounds({width,height})` always pins explicit dimensions. Never use `setSize` alone — Win11 DPI scaling can inflate the window otherwise.

## Stubs / TODO (later slices)

- Brain/thinking icon is a stub (no-op) — thinking is a later slice
- No attachments/paste, item-detail modal, thinking sessions, or notebooks
- Sprite states only show `idle` (walk/sleep/alert wired, need mode→animation mapping)
- No PPT/fullscreen detection
- Tray icon is a programmatic pixel art — replace with proper `.ico`
- Avatar switch not persisted to store
- Top/bottom anchor edge panel layout is horizontal (same as left/right) — works but could be vertical
