# Mimir-Sprite — Run Notes (panel-fixes)

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
- CSS `step-end` animation, `image-rendering: pixelated`
- Manual drag: main polls `screen.getCursorScreenPoint()` at 16ms — DPI-safe
- Snap to nearest of 4 screen edges, visible-pixel snapping via `cat:content`
- Click-through + cursor-polling fallback (100ms)
- Tray icon + `Ctrl+Alt+Space` global shortcut (show/hide), tray click toggles, tooltip shows shortcut

### Todo panel + store

- **lowdb store** at `userData/mimir-sprite/db.json`; lowdb v7 ESM dynamic-import
- **Renderer-pull on mount** (`store:get` IPC) — todos show on launch, not only after first add
- **IPC**: `todo:*`, `app:setMode`, `store:changed` push, `store:get` pull, `panel:rects` instrumentation
- **Zustand mirror**: renderer reflects `todos[]` + `appState` from main

### 4-edge expand geometry

- Panel grows toward screen center for all 4 edges
- Saves exact `collapsedBounds` on expand, restores on collapse (no drift)
- On-screen clamp (perpendicular axis only — docked axis stays flush)
- `window:expanded` sends `{expanded, edge}` — renderer layout adapts per edge
- `PANEL_W=200` (was 250) — panel sits flush close to the cat, no empty gap

### Panel UX

- **150ms collapse debounce** — panel closes promptly after leaving
- **CSS slide-in** per edge (~140ms ease-out)
- **No box-shadow** on panel — transparent window clips shadows; 1px border only
- **Drag-anywhere reorder**: listeners on whole row; `stopPropagation` on buttons/title/detail
- **Double-click title → inline rename**: Enter/blur commits, Esc cancels
- **Title truncation**: first line with ellipsis in list
- **Inline detail**: chevron toggles in-flow detail (pushes rows down, full panel width, no overlay). Multiple can open. Full title + editable notes textarea. Seam for attachments.
- **Hide → recall**: EyeOff tooltip says "Ctrl+Alt+Space to bring back"; tray tooltip shows shortcut; tray click + menu Show both restore the window
- **panel:rects instrumentation**: emits screen rects of add-input + each row (id, rect, button rects) to `mimir-debug.log` every 400ms when expanded

### State machine

- `start` → active, `pause` → paused, `complete` → done + jsonl log, `rest` toggle
- Only one active todo at a time

## Windows quirks

### Drag crash (fixed in Slice 1b)

Renderer `e.screenX/Y` are floats under DPI scaling. All `setPosition` calls `Math.round()` + NaN guard. Drag from `screen.getCursorScreenPoint()` in main.

### Transparency black-box

`app.commandLine.appendSwitch('disable-gpu-compositing')` before `app.whenReady()`.

### Click-through `mouseleave` unreliable

Cursor-polling fallback in `clickThrough.ts` (100ms). Electron issue #30808.

### `thickFrame: false` / `roundedCorners: false`

Prevents Win11 resize borders and auto-rounded corners on frameless windows.

### Window size inflation (fixed)

`setBounds({width,height})` always pins explicit dimensions.

## Stubs / TODO (later slices)

- Brain/thinking icon is a stub
- No attachments in detail view (seam left), thinking sessions, or notebooks
- Sprite states only show `idle` (walk/sleep/alert wired, need mode→animation mapping)
- No PPT/fullscreen detection
- Tray icon programmatic — replace with proper `.ico`
- Avatar switch not persisted to store
