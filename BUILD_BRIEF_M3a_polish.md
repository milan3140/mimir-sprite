# BUILD BRIEF — M3a polish (expand geometry for 4 edges + panel UX)

Fix the user-reported issues. The window/expand GEOMETRY is the high-risk part — follow the
explicit spec below exactly. Keep the working drag/snap/click-through/size-pinning intact.
Verify with `npm run typecheck` and update RUN_NOTES.md. Commit at the end.

## Current architecture (don't regress)
- Expand/collapse is driven by MAIN cursor poll in `clickThrough.ts` (single authority); it calls
  `expandWindow(win)` / `collapseWindow(win)` in `windowManager.ts`, which send `window:expanded`
  to the renderer. App.tsx reflects that event (passive). Keep this model.
- `currentEdge` (set by snap) is the screen edge the cat is docked to. Size pinned via setBounds.

## BUG 1 + 6 — 4-edge-aware expand; cat STAYS PUT; nothing flies off-screen
Today expand only handles left/right and vertically re-centers the cat (it jumps DOWN), and at
top/bottom edges the panel direction is wrong / off-screen.

Rewrite `expandWindow`/`collapseWindow` with this EXACT geometry. Constants: `WIN_W=WIN_H=190`,
`PANEL_W=250`, `PANEL_H=360`.

```
// Save the exact collapsed bounds so collapse restores precisely (no drift):
let collapsedBounds: Rectangle | null = null

expandWindow(win):
  if currentlyExpanded: return
  collapsedBounds = win.getBounds()           // {x,y,width,height}
  const {x:wx, y:wy} = collapsedBounds
  let b
  switch (currentEdge) {
    case 'right':  b = { x: wx - PANEL_W, y: wy,            w: WIN_W + PANEL_W, h: PANEL_H }; break
    case 'left':   b = { x: wx,           y: wy,            w: WIN_W + PANEL_W, h: PANEL_H }; break
    case 'top':    b = { x: wx,           y: wy,            w: WIN_W,           h: WIN_H + PANEL_H }; break
    case 'bottom': b = { x: wx,           y: wy - PANEL_H,  w: WIN_W,           h: WIN_H + PANEL_H }; break
  }
  // ON-SCREEN CLAMP so the panel is ALWAYS fully visible (fixes "flies off / panel hidden"):
  const wa = screen.getDisplayMatching(collapsedBounds).workArea
  b.x = clamp(b.x, wa.x, wa.x + wa.width  - b.w)
  b.y = clamp(b.y, wa.y, wa.y + wa.height - b.h)
  currentlyExpanded = true
  win.setBounds({ x: round(b.x), y: round(b.y), width: b.w, height: b.h })
  win.setIgnoreMouseEvents(false)
  win.webContents.send('window:expanded', { expanded: true, edge: currentEdge })

collapseWindow(win):
  if (!currentlyExpanded) return
  currentlyExpanded = false
  if (collapsedBounds) win.setBounds(collapsedBounds)   // restore exact pre-expand position
  win.setIgnoreMouseEvents(true, { forward: true })
  win.webContents.send('window:expanded', { expanded: false, edge: currentEdge })
```
> Note the event payload becomes `{expanded, edge}` (renderer needs the edge to lay out). Update
> preload `onExpandedChanged` and App.tsx accordingly.

### Renderer layout (App.tsx) — cat stays where it was, panel grows toward center
The cat must render at the SAME screen spot as collapsed. Lay out by edge:
- `right`:  flex-row,         [ Panel (flex-1) | CatBox ]   CatBox = WIN_W wide, cat TOP-aligned
- `left`:   flex-row-reverse, [ Panel (flex-1) | CatBox ]   (cat ends on the left)
- `top`:    flex-col,         [ CatBox | Panel (flex-1) ]   CatBox = WIN_H tall, cat at top
- `bottom`: flex-col-reverse, [ CatBox | Panel (flex-1) ]   (cat ends at bottom)

CatBox for left/right = `width:WIN_W; height:WIN_H` (NOT full height) pinned to the cat's corner so
the cat does not move vertically. For top/bottom, CatBox = `width:WIN_W; height:WIN_H`. Use a
spacer/`align-items` so the CatBox sits flush to the docked edge and the Panel fills the rest.

## BUG 2 — collapse sooner / more responsive
The main poll collapses when the cursor leaves the expanded window bounds. Lower the debounce to
**150ms**. With the clamped, content-filling window above, leaving the panel collapses promptly.

## BUG 3 — expand/collapse transition
Add a smooth feel. Simplest robust approach: window resizes instantly (transparent), but the Panel
animates IN via CSS when `expanded` turns true — `@keyframes` slide from the cat side + fade
(~140ms ease-out). Direction depends on edge (right→slide from right, top→from top, etc.). On
collapse it can unmount immediately (or a quick fade-out is a bonus, not required).

## Drag-anywhere reorder
@dnd-kit: move the drag listeners from the grip handle to the WHOLE row, EXCEPT interactive bits
(the control buttons and the editable title). Keep the grip as a visual affordance. Use
`PointerSensor` with a small activation distance (e.g. 4px) so clicks still register.

## BUG 4 — click title to rename
Click (or double-click) the todo title → it becomes an inline text input (autofocus, select-all).
Enter or blur commits via `todoUpdate(id, {title})`; Esc cancels. While editing, that row must not
start a drag.

## BUG 5 — long content (notes / substeps / steps)
Titles can be long and a todo may carry `notes`. In the list: **truncate the title to one line**
(ellipsis). Add an item-detail affordance: clicking the row (not buttons, not while editing) opens
a small **detail popover/expander** showing the full title + `notes` (multiline, scrollable, max
height). Include an edit affordance for notes (`todoUpdate(id,{notes})`). This is the start of the
item-detail view; attachments/screenshots come in a later slice — leave a clear seam.

## Done when
- Cat does NOT move when the panel opens (any of the 4 edges).
- Panel grows toward screen center and is ALWAYS fully on-screen at every edge (drag the cat to
  top/left/right/bottom and hover — panel shows correctly each time; nothing flies off).
- Collapsing is prompt after leaving the panel.
- Panel animates in.
- Rows drag-reorder by grabbing anywhere non-interactive; titles rename inline; long titles
  truncate and a detail view shows full title+notes.
- `npm run typecheck` clean. Commit. Update RUN_NOTES.md. Keep dlog probes for expand/collapse.
```
