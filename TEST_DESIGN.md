# Mimir-Sprite — Test Design (design BEFORE testing)

Method (see memory `feedback-test-design-cross-product`): list each feature's **goal + use-path**,
then **cross-overlay** scenarios — most bugs live at the overlap, not the happy path. Every overlap
cell must map to an automated probe assertion or be explicitly marked UNCOVERED.

## 1. Features (goal + use-path)

| ID | Feature | Goal | Use-path |
|----|---------|------|----------|
| F1  | Drag cat | Move sprite; only the cat pixels grab (not the transparent window) | mousedown on cat → cursor-poll moves window → mouseup |
| F2  | Snap to edge | Cat's visible pixels sit flush on nearest of 4 edges | drag-release → `snapToNearestEdge` → `snap:done` |
| F3  | Hover-expand | Panel grows toward screen centre, cat stays put | cursor enters cat → `window:expand` (perp-axis clamp only) |
| F4  | Leave-collapse | Panel closes back to cat-only | cursor outside 150ms → `window:collapse` → restore docked bounds |
| F5  | Add todo | New item from input | type in textarea → Enter (Shift+Enter = newline) → `todo:add` |
| F6  | Rename todo | Edit title in place | double-click title → edit → blur/Enter |
| F7  | Detail toggle | Show item detail inline (pushes rows down, not overlay) | click chevron → inline detail |
| F8  | Reorder | Change priority order | drag row (@dnd-kit, 4px) → `todo:reorder` |
| F9  | Start/pause/complete | Per-item state, icon-only | click icon button → `todo:start/pause/complete` |
| F10 | Remove todo | Delete item | click remove |
| F11 | Hide → ears | Sprite hides to two cat ears flush on the docked edge | EyeOff / Ctrl+Alt+Space → `hideToNub` |
| F12 | Restore | Click ears → sprite returns at same docked spot | click ears strip → `window:restore` → `restoreFromNub` |
| F13 | Initial load | Existing todos appear on open (no add needed) | mount → `store:get` → render |
| F14 | Tray / hotkey | Show/hide + summon; Ctrl+Alt+Space | tray click / global shortcut → `toggleVisibility` |
| F15 | Avatar switch | Cycle avatar | Ctrl+Alt+A → `avatar:changed` |

## 2. Scenario dimensions (context that can overlay any feature)

- **Edge** ∈ {top, bottom, left, right}  (docked position)
- **Window state** ∈ {collapsed, expanded, hidden(ears)}
- **List** ∈ {empty, has-items, long-content}

## 3. Cross-product matrix (overlaps that must hold)

| Overlap | Why it can break | Probe | Status |
|---------|------------------|-------|--------|
| F2 snap × Edge×4 | wrong edge / not flush | probe_suite | ✅ 21/21 |
| F3 expand × Edge×4 | panel grows off-screen; **docked clamp displaces cat** (real bug found) | probe_suite (panel ON-SCREEN) | ✅ |
| F4 collapse × Edge×4 | returns to wrong/old position | probe_suite | ✅ |
| F1 grab × expanded | re-hover mid-animation grabs stale bounds | probe_suite (grab→snap) | ✅ |
| F11 hide × Edge×4 | ears off-screen (window hangs off edge) / not flush | probe_nub | ✅ 13/13 |
| F12 restore × Edge×4 | ears in transparent gap → click falls through | probe_nub (click ears) | ✅ |
| **F3 expand × hidden** | hover must NOT expand while showing ears | probe_nub (hover loop after hide) | ⚠️ implicit only |
| **F11 hide × expanded** | must collapse first, then ears (not ears over panel) | — | ❌ UNCOVERED |
| **F12 restore → F3** | after restore, hover-expand must work again | probe_nub restores, then next grab | ⚠️ partial |
| **F5/F6/F8/F9/F10 CRUD × Edge×4** | panel buttons/rows reachable+working each edge | (planned panel-CRUD probe) | ❌ UNCOVERED |
| **F7 detail × long-content × Edge** | inline detail pushes rows; panel must scroll, stay on-screen | — | ❌ UNCOVERED |
| **F4 collapse × F7 detail-open** | collapse while a detail is open | — | ❌ UNCOVERED |
| F13 initial-load × first-open | items only appeared after first add (fixed) | manual/screenshot | ✅ fixed |

## 4. Coverage summary & next probes

- **Covered (automated):** window geometry contract — F1–F4 × 4 edges (probe_suite 21/21);
  recall — F11/F12 × 4 edges (probe_nub 13/13).
- **Gaps to close (priority order):**
  1. Panel CRUD functional probe (F5/F6/F8/F9/F10) on each edge via `panel:rects` targeting — net-zero
     (add N, complete/remove N, end state == start).
  2. F3-while-hidden explicit assertion (hover over ears → expect NO `window:expand`).
  3. F11-from-expanded (hide while panel open → expect `window:collapse` then `window:hideToNub`).
  4. F7 detail × long-content × edge (rows push + scroll, panel stays on-screen).

Probes live in `scripts/` and reuse `2_Toolkit/Harness/gui_visual_probe`. Run on Opus.

## 5. Transition × invariant oracle (added after the grab-flash miss)

A flicker/flash is a TRANSITION defect. The oracle must assert the no-flicker invariant on EVERY
user-facing transition — including ones used only as test scaffolding (grab/drag), which are the most
likely to be left unasserted. Dynamic invariant = "no native setBounds resize/move that desyncs from
the renderer" (proxy for the 1-frame flash a log probe can't perceive).

| Transition | assertion | Probe | Status |
|---|---|---|---|
| hover-expand   | docked bounds == expand bounds | `expand NO-resize` | OK |
| hover-collapse | no setBounds on collapse | (collapse logs no bounds) | OK implicit |
| grab/drag-start | drag window size > 190 (not shrunk) | `grab NO-resize` | OK (was the MISS) |
| snap (dock) | deliberate animated motion - resize allowed | `snapped` | OK intended |
| hide / restore | resize allowed (deliberate) | probe_nub | OK |

Rule: when adding/altering ANY transition, add its row + assertion here BEFORE coding. "This resize
is invisible" is an assumption -> must become an assertion, never a code comment.

**MISS #2 (snap teleport + not-flush, found by the user, NOT the suite):** the row above marked snap
"OK intended" — that exemption was the blind spot. `snapped` only checked `snap:done.edge`, reading
`cat:screen` which main *computes* (`tx+sc.x`). The oracle lived entirely in **main's self-report**, so
it could not see (a) the cat TELEPORTING 557px mid-snap (renderer re-anchored to the new edge while the
window was still at the drag position) nor (b) the cat docking 59px OFF the edge (sc captured the wrong
150×150 box at boot). Both are main↔renderer desyncs — invisible to any log-only oracle by construction.
Fix: `probe_snap_visual.py` measures the cat's REAL drawn pixels (mss burst + bg-diff): trajectory must
be smooth (bounded per-frame jump, no backtrack) and the settled cat must be flush (gap ≈ 0).

## 6. L2 CONTRACT — unified fixed-window, cat-glued model (architecture rework after MISS #2)

The flicker/desync class failed 3×: hover-flicker → grab-flash → snap-teleport. Root: the cat's screen
position was co-owned by main (window bounds) and renderer (per-edge anchor + `catOffset`), updated on
different clocks; every edge change had to mutate both atomically across IPC — impossible. Escalation
rule → fix the architecture.

**State owners / who must agree:**
- main owns the WINDOW BOUNDS (a single fixed size on all edges) and moves it.
- renderer owns LAYOUT, but the **cat cell is at a CONSTANT window position on every edge**
  (`CAT_X,CAT_Y`); only the PANEL repositions per edge, and only while collapsed (invisible).
- They agree on the cat's screen position **trivially**, because the cat's window-relative position
  never changes — the cat is rigidly glued to the window. Moving the window moves the cat, in sync.

**Invariants (oracle — static AND dynamic, each checkable):**
1. static — settled cat content is FLUSH to the docked edge (gap −6..16px), all 4 edges. (`probe_snap_visual` gap)
2. static — panel width consistent (±16) + centred on cat (±10, top/bottom) + hugging (gap 0..45). (`probe_suite`)
3. dynamic — snap motion is SMOOTH: cat centroid moves monotonically to the dock, no teleport
   (per-frame jump < ~140px, backtrack < ~90px). (`probe_snap_visual` SMOOTH)
4. dynamic — NO native `setBounds` resize on hover expand/collapse; NO resize on grab. (`probe_suite`)
5. dynamic — snap RESIZES NEVER (window is one fixed size always); snap only MOVES. (new assertion)

**Architectural red lines (never-do):**
- Never re-anchor / change the cat's window-relative position during a transition.
- Never change the window SIZE (it is one fixed size for all edges/states); only MOVE it.
- The cat's flush content box (`spriteContentBox`) must come from a TIGHT (cellBox-ready) report,
  never the boot fallback full render box.
