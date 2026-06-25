# Mimir-Sprite — Run Notes (Slice 1c)

## How to run

```bash
npm install
npm run dev      # launches the transparent cat window
npm run build    # production build (electron-vite build)
npm run typecheck # tsc --noEmit
```

## What works

- Transparent frameless always-on-top window (128x128, `WIN_W`/`WIN_H` constant in windowManager.ts)
- **Two avatar sets** (oneko + LuizMelo Cat-1) via generalized `AvatarSet` config in `spriteConfig.ts`
- Supports both grid sheets (oneko: one image, col/row coords) and per-state strips (LuizMelo: one PNG per state, horizontal strip)
- **Live avatar switch** from tray menu: "Avatar: oneko → luizmelo" cycles between sets, sends IPC `avatar:changed` to renderer
- CSS `steps()` animation, `image-rendering: pixelated`; each set has its own `scale` (oneko 3x, LuizMelo 2x)
- States mapped: idle, walk, sleep, alert
- Manual drag: renderer signals start/end, **main polls `screen.getCursorScreenPoint()` at 16ms** — DPI-safe, no renderer screenX/Y
- All `win.setPosition` calls: `Math.round()` + `Number.isFinite()` guard (fixes Slice 1 crash)
- Snap animation: guarded against `win.isDestroyed()`, abortable (new drag cancels in-flight snap)
- Snap to nearest of 4 screen edges on release (animated ~320ms ease-out)
- Click-through + cursor-polling fallback (120ms)
- Tray icon + `Ctrl+Alt+Space` global shortcut
- `anchorEdge` flips sprite via `scaleX(-1)` (faces screen center)
- Design tokens wired to Tailwind

## Windows quirks

### Drag crash (fixed in Slice 1b)

Slice 1 crashed on drag-release: `TypeError: Error processing argument at index 0, conversion failure` in `setPosition`. Root cause: renderer `e.screenX/Y` are **floats under DPI scaling** (125%/150%). Electron requires integer args. Fix: all `setPosition` calls now `Math.round()` + NaN guard. Additionally, drag is now driven entirely from `screen.getCursorScreenPoint()` in main (polled every 16ms while dragging) — this returns DIP-correct integers regardless of display scaling. The renderer no longer sends coordinates at all.

### Wrong snap position under DPI (fixed in Slice 1b)

Under 150% scaling, renderer `screenX/Y` didn't match Electron's DIP coordinate space, causing the cat to snap to the wrong edge or not flush. Fix: snap uses `screen.getDisplayNearestPoint(cursor).workArea` from main (already DIP), no renderer coords involved.

### Transparency black-box

`app.commandLine.appendSwitch('disable-gpu-compositing')` applied before `app.whenReady()`. If still black, try `app.disableHardwareAcceleration()`.

### Click-through `mouseleave` unreliable

Cursor-polling fallback in `clickThrough.ts` (120ms, `screen.getCursorScreenPoint()` vs cat rect). Not optional — Electron issue #30808.

### `thickFrame: false` / `roundedCorners: false`

Required to prevent Win11 resize borders and auto-rounded corners on frameless windows.

## Stubs / TODO (later slices)

- No todo panel, persistence, store, thinking, or notebooks
- Sprite states are declared but only `idle` is active (walk/sleep/alert wired, need state machine triggers)
- No PPT/fullscreen detection (needs `get-windows`)
- Tray icon is a programmatic 16x16 circle — replace with proper `.ico`
- shadcn/ui configured but no components added yet
- Recolor LuizMelo to Siamese palette when hero is chosen
- Avatar switch is in-memory only, not persisted
