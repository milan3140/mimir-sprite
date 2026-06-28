# BUILD BRIEF — Panel and cat must sit ADJACENT (tiny gap), all 4 edges

## Problem (measured)
When expanded, there is a ~65px transparent gap between the panel's inner edge and the cat's
VISIBLE pixels. Root cause: the cat is CENTERED in a `CAT_W=190` box (chosen so the cat doesn't
move on expand), but the cat's visible pixels are only ~60px wide → box padding (20) + sprite
internal padding (~45) = ~65px of empty space between the panel and the visible cat. Same on all
4 edges (the perpendicular box for top/bottom).

## Goal
The panel should sit RIGHT NEXT TO the cat with only a small gap (~6–10px), on all 4 docked edges.
The cat's VISIBLE content must stay at the docked screen edge (it's snapped flush there); the panel
fills everything from the window's inner side up to the cat's inner visible edge.

## Approach (you choose the cleanest implementation; suggestions)
- The cat's visible content should remain flush to the screen edge in BOTH collapsed and expanded
  states (the snap already flushes cat CONTENT to the edge). So align the cat to the docked-edge
  side, not centered, and make the cat's reserved strip in the expanded layout only as wide as the
  cat's visible content + the small gap — NOT 190.
- Concretely: in `App.tsx`, replace the fixed `CAT_W=190` cat box with a tight cat strip whose size
  ≈ the cat's rendered visible width, and position the cat flush to the docked edge (right edge →
  cat at the strip's right; left → left; top → top; bottom → bottom). The panel (`flex-1`) then
  extends up to the cat's inner edge with a small gap.
- Adjust the expand geometry in `windowManager.ts` if needed so the expanded window width/height =
  `PANEL_W + catStrip` (not `WIN_W + PANEL_W`), keeping the cat's docked screen position unchanged.
  You may need the renderer to report the cat's visible width (it already logs `cat:content` /
  `cat:screen`); or measure the sprite's content box from `spriteConfig`/`spriteBounds`.
- Keep the cat's actual on-screen position the SAME as before (do not push it off-screen or move it
  noticeably). A tiny settle is OK; a big jump is not.

## MUST NOT break (verified green — re-checked by probe)
- `scripts/probe_suite.py` must still pass 21/21: grab, four-edge snap, expand (panel ON-SCREEN),
  collapse. The cat must stay grabbable at the docked edge.
- Don't change the snap/collapse/drag/click-through logic.

## Done when
- Expanded: panel and cat are adjacent with only a ~6–10px gap, on all 4 edges.
- `npm run typecheck` clean. `git commit`. (I will verify by measuring panel-right→cat-visible-left
  gap on a LIGHT background and re-running probe_suite for 21/21.)
