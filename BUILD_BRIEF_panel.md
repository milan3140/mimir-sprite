# BUILD BRIEF — Panel UX fixes + element-rect instrumentation

Fix these user-reported panel bugs. Keep the VERIFIED-GREEN window geometry intact (windowManager
expand/collapse/snap/drag, clickThrough). Keep `npm run typecheck` clean. Commit at the end.

## FIX 1 (#A) — todos must appear on load, not only after the first add
Root cause: the renderer registers its `onStoreChanged` listener in a React effect, which runs
AFTER the main process's initial `store:changed` broadcast (and after did-finish-load), so the
initial snapshot is lost → panel shows "No todos yet" until the first mutation re-broadcasts.
Fix with a renderer-PULL on mount:
- `store.ts`: add `export function getSnapshot(): StoreSnapshot { return { todos: getTodos(), appState: getAppState() } }`.
- `ipc.ts`: add `ipcMain.handle('store:get', () => getSnapshot())` (import getSnapshot).
- `preload`: add `storeGet: () => ipcRenderer.invoke('store:get')`; `global.d.ts`: `storeGet: () => Promise<StoreSnapshot>`.
- `App.tsx`: on mount, `useEffect(() => { window.api.storeGet().then(applySnapshot) }, [applySnapshot])`.

## FIX 3 + 4 (#3/#4) — item detail must EXPAND INLINE, not overlay; full panel width
Today `DetailPopover` is `position:absolute` (`top:100%`) and `w-64` → it COVERS the rows below
and overflows the panel width (causing the right side to be hidden and a horizontal scrollbar).
- Make the detail render IN-FLOW (in the normal column), directly under its row, so it pushes the
  following rows DOWN (multiple open details must stack without overlapping). Remove `absolute`/`top:100%`.
- Width = full panel width: use `w-full` (not `w-64`), `box-border`, no fixed width. Ensure no
  horizontal overflow (`overflow-x:hidden`, `break-words`, `whitespace-pre-wrap` already on title).
- The list container is `overflow-y-auto`; expanded details just add height there. No horizontal scroll.

## FIX 2 (#2) — too much empty space between panel and the cat
The expanded window is `WIN_W + PANEL_W` wide for left/right; the panel sits far from the cat.
- Reduce `PANEL_W` from 250 to ~200 (`windowManager.ts`).
- In `App.tsx`, ensure the panel card sits flush next to the cat (no large gap): the panel is
  `flex-1` adjacent to the `CatBox`. Trim the cat-side breathing room — the cat box can be tighter
  (the cat sprite is ~150px; the 190px box has 20px pad each side; reduce the gap so the panel's
  edge is close to the cat). Keep the cat itself unmoved (don't touch the docked-edge geometry).
- Net: the panel should feel attached to the cat, not floating far away.

## FIX 5 (#5) — after hiding, the sprite can't be summoned back
Hiding calls `window.hide()`. Recall must work and be discoverable:
- Verify the `Ctrl+Alt+Space` globalShortcut in `tray.ts` actually toggles show/hide (test the code path).
- Ensure the Tray icon is created and visible (it may be in the Windows overflow `^`). Keep the
  high-contrast icon. The tray click + menu Show must restore the window (`win.show()` +
  `setAlwaysOnTop(true,'screen-saver')`).
- Make recall MORE discoverable: when hiding via the EyeOff button, ALSO ensure the tray tooltip /
  a one-time hint conveys "Ctrl+Alt+Space to bring back". (Don't add intrusive UI; a tooltip is enough.)

## FIX 6 (#6) — remove the clipped half-shadow around the panel
The panel uses `boxShadow: var(--shadow)`, but the transparent frameless window clips it, leaving an
ugly half-gradient/half-cut shadow ring. **Remove the box-shadow entirely** from the TodoPanel card
(and any detail/bubble that shows a clipped shadow). No shadow. If depth is wanted later, use only a
1px border (already present). Check the panel has NO shadow artifacts at any edge after this.

## INSTRUMENTATION — element rects so a self-test can locate panel controls
So the probe can reliably click panel elements (add-input, rows, buttons), emit their SCREEN rects:
- In `TodoPanel`/`TodoRow`, when `MIMIR_DEBUG !== '0'`, report key element screen rects via a new
  IPC `panel:rects` (main `dlog('panel:rects', {...})`). Report on an interval (~400ms) like cat:rect.
  Include: the add-input rect, and for each visible row its id + rect + the rects of its Start/Complete/
  Delete/chevron buttons (use `data-*` attrs + getBoundingClientRect + window.screenX/Y).
- Add `sendPanelRects` to preload + the `panel:rects` handler in main (windowManager or ipc) → dlog.
- This mirrors how `cat:screen` enabled reliable cat grabbing.

## Done when
- `npm run dev`: todos show immediately on launch (not after first add); item detail expands inline
  (pushes rows, full panel width, no horizontal scroll, multiple can open); panel sits close to the
  cat; hiding then `Ctrl+Alt+Space` brings it back; tray Show works.
- `panel:rects` appears in mimir-debug.log with the add-input + row/button rects.
- `npm run typecheck` clean. Don't break window geometry. Commit with a clear message.
