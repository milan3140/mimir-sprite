// SINGLE SOURCE OF TRUTH for the window / cat-cell / panel geometry, imported by BOTH the main process
// (windowManager: window bounds + panel HIT rect) and the renderer (App: cat + panel RENDER position).
// One module so the two sides can never drift (a drift makes main's hit-rect disagree with the render).
export const CELL = 190                    // the cat cell (the sprite lives in a 190×190 box)

// The panel is USER-RESIZABLE (drag handle). Its size is stored per-user (settings.panelW/H), clamped
// to [MIN, MAX]. The window stays a FIXED size big enough for the MAX panel and the panel grows WITHIN
// it via CSS — so resizing never triggers a native window resize (no flicker, keeps the cat-glued model).
export const MIN_PANEL_W = 230
export const MIN_PANEL_H = 280
export const DEFAULT_PANEL_W = 267
export const DEFAULT_PANEL_H = 360
export const MAX_PANEL_W = 400
export const MAX_PANEL_H = 520

export const WIN_W = CELL + 2 * MAX_PANEL_W   // 990 — ONE fixed window size (room for max panel either side)
export const WIN_H = CELL + 2 * MAX_PANEL_H   // 1230
export const CAT_X = MAX_PANEL_W               // cat cell's constant x inside the window (centred)
export const CAT_Y = MAX_PANEL_H               // cat cell's constant y inside the window (centred)
export const HUG_X = 32                         // panel pulled toward the cat (left/right edges)
export const HUG_Y = 37                         // panel pulled toward the cat (top/bottom edges)
export const EAR_W = 70                         // recall-nub ear span ALONG the edge
export const EAR_D = 30                         // recall-nub ear depth INTO the screen

export function clampPanel(w: number, h: number): { w: number; h: number } {
  return {
    w: Math.max(MIN_PANEL_W, Math.min(MAX_PANEL_W, Math.round(w))),
    h: Math.max(MIN_PANEL_H, Math.min(MAX_PANEL_H, Math.round(h))),
  }
}
