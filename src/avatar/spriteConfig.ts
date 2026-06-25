/**
 * Sprite config — supports grid sheets (oneko) and per-state strips (LuizMelo).
 * Swap/add sets here, no component code changes needed.
 */

export type AvatarState = 'idle' | 'walk' | 'sleep' | 'alert'

export interface StateConfig {
  image: string                // URL to sheet or strip image
  cols: number                 // total columns in this image
  rows: number                 // total rows in this image
  frames: [number, number][]   // [col, row] per animation frame
  fps: number
}

export interface AvatarSet {
  id: string
  label: string
  tileW: number
  tileH: number
  scale: number
  states: Record<AvatarState, StateConfig>
}

// ponytail: helper — horizontal strip frames [0,0],[1,0],...,[n-1,0]
const strip = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, i): [number, number] => [i, 0])

const onekoImg = new URL('../../assets/sprites/oneko.gif', import.meta.url).href

export const avatarSets: Record<string, AvatarSet> = {
  oneko: {
    id: 'oneko',
    label: 'Oneko',
    tileW: 32,
    tileH: 32,
    scale: 3,
    states: {
      idle:  { image: onekoImg, cols: 8, rows: 4, frames: [[3, 3]],              fps: 1 },
      walk:  { image: onekoImg, cols: 8, rows: 4, frames: [[4, 0], [4, 1]],      fps: 4 },
      sleep: { image: onekoImg, cols: 8, rows: 4, frames: [[2, 0], [2, 1]],      fps: 1 },
      alert: { image: onekoImg, cols: 8, rows: 4, frames: [[7, 3]],              fps: 1 },
    }
  },
  luizmelo: {
    id: 'luizmelo',
    label: 'LuizMelo Cat',
    tileW: 50,
    tileH: 50,
    scale: 3,
    states: {
      idle:  { image: new URL('../../assets/sprites/luizmelo/siamese/Cat-1-Idle.png', import.meta.url).href,     cols: 10, rows: 1, frames: strip(10), fps: 8 },
      walk:  { image: new URL('../../assets/sprites/luizmelo/siamese/Cat-1-Walk.png', import.meta.url).href,     cols: 8,  rows: 1, frames: strip(8),  fps: 8 },
      sleep: { image: new URL('../../assets/sprites/luizmelo/siamese/Cat-1-Sleeping.png', import.meta.url).href, cols: 2,  rows: 1, frames: strip(2),  fps: 1 },
      alert: { image: new URL('../../assets/sprites/luizmelo/siamese/Cat-1-Meow.png', import.meta.url).href,     cols: 4,  rows: 1, frames: strip(4),  fps: 4 },
    }
  }
}

export const avatarIds = Object.keys(avatarSets)
