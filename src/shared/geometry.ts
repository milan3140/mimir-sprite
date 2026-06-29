// SINGLE SOURCE OF TRUTH for the window / cat-cell / panel geometry, imported by BOTH the main process
// (windowManager: window bounds + panel HIT rect) and the renderer (App: cat + panel RENDER position).
// These were duplicated in two files — a dual-source-of-truth hazard: if the two copies drift, main's
// panel hit-rect disagrees with the renderer's panel render, so clicks land in the wrong place (or
// miss). One module, imported both sides, makes drift impossible.
export const CELL = 190                    // the cat cell (the sprite lives in a 190×190 box)
export const PANEL_W = 267
export const PANEL_H = 360
export const WIN_W = CELL + 2 * PANEL_W    // 724 — ONE fixed window size on every edge/state
export const WIN_H = CELL + 2 * PANEL_H    // 910
export const CAT_X = PANEL_W               // cat cell's constant x inside the window (267)
export const CAT_Y = PANEL_H               // cat cell's constant y inside the window (360)
export const HUG_X = 32                     // panel pulled toward the cat (left/right edges)
export const HUG_Y = 37                     // panel pulled toward the cat (top/bottom edges)
export const EAR_W = 70                     // recall-nub ear span ALONG the edge
export const EAR_D = 30                     // recall-nub ear depth INTO the screen
