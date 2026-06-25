/**
 * Sprite sheet config — swap sheet by editing this file, no code changes needed.
 *
 * oneko.gif: 32x32 tiles, 8 cols x 4 rows (256x128 total).
 * Tile coords from oneko.js spriteSets (col, row) where (0,0) = top-left tile.
 */

export interface SpriteState {
  frames: [number, number][]  // [col, row] per frame
  fps: number
}

export interface SpriteSheet {
  src: string
  tileW: number
  tileH: number
  cols: number
  rows: number
  states: Record<string, SpriteState>
}

// ponytail: oneko spriteSets mapping — coords are (col, row) from top-left
export const spriteSheet: SpriteSheet = {
  src: new URL('../../assets/sprites/oneko.gif', import.meta.url).href,
  tileW: 32,
  tileH: 32,
  cols: 8,
  rows: 4,
  states: {
    idle: {
      frames: [[3, 3]],  // still/alert facing south
      fps: 1
    },
    walk: {
      // running-right frames (2-frame cycle)
      frames: [[4, 0], [4, 1]],
      fps: 4
    },
    sleep: {
      frames: [[2, 0], [2, 1]],
      fps: 1
    },
    alert: {
      frames: [[7, 3]],  // alert/surprised
      fps: 1
    }
  }
}
