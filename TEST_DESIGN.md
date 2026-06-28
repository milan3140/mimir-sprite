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
