# BUILD BRIEF — Discoverable recall via an edge "nub"

Problem: the EyeOff "hide" button calls `window.hide()` → the sprite vanishes and a NEW user has NO
idea how to bring it back (Ctrl+Alt+Space / tray are not discoverable). Spec requires "hide, and an
easy way to summon it back".

Solution: hiding does NOT fully vanish — it shrinks the window to a tiny, always-visible **nub**
flush at the docked screen edge. Clicking the nub restores the full sprite. Keep tray + shortcut as
advanced backups. Do NOT break the verified window geometry (expand/collapse/snap/drag).

## windowManager.ts
- Add state: `let hidden = false; let preHideBounds: Rectangle | null = null`. Export `isHidden()`.
- `export function hideToNub(win)`: if already hidden return. If expanded, `collapseWindow(win)`.
  Save `preHideBounds = dockedBounds ?? win.getBounds()`. Compute a nub rect flush at `currentEdge`
  on that display's workArea: left/right → a vertical bar `NUB_W=12 × NUB_H=46` at the edge,
  y = preHideBounds.y + (WIN_H-NUB_H)/2; top/bottom → a horizontal bar `46 × 12` at the edge,
  x = preHideBounds.x + (WIN_W-46)/2. `setBounds` to the nub (rounded). `setIgnoreMouseEvents(false)`
  (nub fully clickable). `win.webContents.send('window:hidden', { hidden: true, edge: currentEdge })`.
  `hidden = true`.
- `export function restoreFromNub(win)`: if not hidden return. `hidden = false`. If `preHideBounds`,
  `setBounds(preHideBounds)`. `setIgnoreMouseEvents(true, { forward: true })`.
  `win.webContents.send('window:hidden', { hidden: false, edge: currentEdge })`.
- IPC (add in windowManager's createWindow or ipc.ts): `ipcMain.on('window:hide', () => hideToNub(win))`
  (REPLACE the existing `win.hide()` handler in ipc.ts), and `ipcMain.on('window:restore', () => restoreFromNub(win))`.

## clickThrough.ts
- At the top of the poll, `if (isHidden()) return` — no expand/collapse logic while showing the nub.

## preload + global.d.ts
- `windowRestore: () => ipcRenderer.send('window:restore')`.
- `onHiddenChanged: (cb: (v: { hidden: boolean; edge: string }) => void) => () => void` (listens 'window:hidden').

## Renderer (App.tsx + a Nub component)
- Listen `onHiddenChanged` → store `hidden` + `hiddenEdge`.
- When `hidden`, render ONLY a `<Nub edge={hiddenEdge} onClick={() => window.api.windowRestore()} />`
  filling the tiny window: a small rounded tab using `--brand`/`--surface`, with a Lucide chevron
  pointing AWAY from the edge (toward screen center, i.e. the direction the sprite will pop out:
  right edge → ChevronLeft, left → ChevronRight, top → ChevronDown, bottom → ChevronUp),
  `cursor-pointer`, `title="Click to show Mimir (Ctrl+Alt+Space)"`. It must be clearly clickable.
- The EyeOff button still calls `window.api.windowHide()` (now routed to hideToNub).

## tray.ts
- Keep tray Show + Ctrl+Alt+Space, but they should `restoreFromNub` if currently nubbed (or show()).
  Make `toggleVisibility` aware: if hidden(nub) → restore; else hide→nub. (Import isHidden/restoreFromNub.)

## Done when
- Clicking EyeOff shrinks the sprite to a small tab at the docked edge (not fully gone); the tab is
  visible and clickable; clicking it restores the full sprite at the same docked position.
- Ctrl+Alt+Space and tray Show also restore. `npm run typecheck` clean. Don't break window geometry.
  Commit with a clear message.
