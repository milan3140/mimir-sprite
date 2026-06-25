# Mimir-Sprite — Run Notes (Slice M3a-polish)

## How to run

```bash
npm install
npm run dev      # launches the transparent cat window
npm run build    # production build (electron-vite build)
npm run typecheck # tsc --noEmit
```

## What works

- Transparent frameless always-on-top window (190x190 collapsed)
- **Two avatar sets** (oneko + LuizMelo Cat-1) via generalized `AvatarSet` config in `spriteConfig.ts`
- Supports both grid sheets (oneko) and per-state strips (LuizMelo)
- **Live avatar switch** from tray menu
- CSS `step-end` animation, `image-rendering: pixelated`
- Manual drag: main polls `screen.getCursorScreenPoint()` at 16ms — DPI-safe
- Snap to nearest of 4 screen edges (animated ease-out), visible-pixel snapping via `cat:content`
- Click-through + cursor-polling fallback (100ms)
- Tray icon + `Ctrl+Alt+Space` global shortcut
- `anchorEdge` flips sprite via `scaleX(-1)` (faces screen center)

### Slice M3a: Todo panel + store

- **lowdb store** at `userData/mimir-sprite/db.json` (schema v1 per docs/02)
  - lowdb v7 is ESM-only; loaded via `await import('lowdb')` in CJS main process
- **IPC channels**: `todo:list|add|update|remove|reorder|start|pause|complete`, `app:setMode`, `store:changed` broadcast
- **Zustand mirror**: renderer store mirrors `todos[]` + `appState` from main via `store:changed` events

### M3a-polish: 4-edge expand geometry + panel UX

- **4-edge expand/collapse**: panel grows toward screen center for all 4 edges (right/left/top/bottom)
  - Saves exact `collapsedBounds` on expand, restores on collapse (no position drift)
  - On-screen clamp ensures the expanded window is always fully visible within the display workArea
  - Layout adapts per edge: flex-row/row-reverse/col/col-reverse so cat stays at the docked corner
  - `window:expanded` event now sends `{expanded, edge}` — renderer applies both at once
- **150ms collapse debounce** (was 250ms) — panel closes promptly after leaving
- **CSS slide-in transition**: panel animates in from the cat side (~140ms ease-out) per edge direction
- **Drag-anywhere reorder**: `@dnd-kit/sortable` listeners on the whole row; `onPointerDown stopPropagation` on buttons, title, and detail popover prevents drag from starting there. GripVertical remains as visual affordance.
- **Inline title rename**: click title → autofocus input, select-all. Enter/blur commits via `todoUpdate`. Esc cancels. No drag while editing.
- **Title truncation**: long titles truncate to one line with ellipsis in the list
- **Detail popover**: click row (not buttons/title) toggles a detail popover below the row showing full title + editable notes (textarea, blur-saves). Seam left for attachments in later slice.
- **Expand dimensions**: left/right = WIN_W+PANEL_W × PANEL_H (440×360); top/bottom = WIN_W × WIN_H+PANEL_H (190×550)
- **TodoPanel** (dark, token-driven, Lucide icons):
  - Top bar: "Mimir" label, Coffee (rest toggle), EyeOff (hide)
  - Todo list sorted by `order`, filtered `status!='done'`
  - Each row: GripVertical visual, title (click=edit, truncated), Play/Pause/Check/Brain(stub)/Trash2 controls
  - Bottom add-todo input (Plus / Enter)
- **State machine** (per docs/02):
  - `start` → status=active, mode=working, pauses any other active todo
  - `pause` → status=paused, accumulates elapsed time, mode=idle
  - `complete` → status=done, accumulates if was active, writes completion log, mode=idle
  - `rest` toggle → pauses active todo, mode=resting ⇄ idle
  - Only one active todo at a time
- **Completion log**: jsonl at `userData/mimir-sprite/state/completion_log.jsonl`

## Windows quirks

### Drag crash (fixed in Slice 1b)

Renderer `e.screenX/Y` are floats under DPI scaling. All `setPosition` calls now `Math.round()` + NaN guard. Drag driven from `screen.getCursorScreenPoint()` in main.

### Wrong snap position under DPI (fixed in Slice 1b)

Snap uses `screen.getDisplayNearestPoint(cursor).workArea` from main (DIP-correct), no renderer coords.

### Transparency black-box

`app.commandLine.appendSwitch('disable-gpu-compositing')` applied before `app.whenReady()`.

### Click-through `mouseleave` unreliable

Cursor-polling fallback in `clickThrough.ts` (100ms). Not optional — Electron issue #30808.

### `thickFrame: false` / `roundedCorners: false`

Required to prevent Win11 resize borders and auto-rounded corners on frameless windows.

### Window size inflation (fixed)

`setBounds({width,height})` always pins explicit dimensions. Never use `setSize` alone — Win11 DPI scaling can inflate the window otherwise.

## Stubs / TODO (later slices)

- Brain/thinking icon is a stub (no-op) — thinking is a later slice
- No attachments/paste in detail popover (seam left), thinking sessions, or notebooks
- Sprite states only show `idle` (walk/sleep/alert wired, need mode→animation mapping)
- No PPT/fullscreen detection
- Tray icon is a programmatic pixel art — replace with proper `.ico`
- Avatar switch not persisted to store
