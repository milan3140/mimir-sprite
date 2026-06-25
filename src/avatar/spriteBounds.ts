/**
 * Compute the cat's VISIBLE (non-transparent) pixel bounding box within a sprite cell,
 * unioned across all frames of a state. Used so snap can align the cat's real pixels to the
 * screen edge regardless of how much transparent padding a given sprite has around the cat.
 *
 * Returned box is in CELL pixels (0..tileW, 0..tileH); r/b are exclusive (maxIndex+1).
 */
export type CellBox = { l: number; t: number; r: number; b: number }

const boxCache = new Map<string, CellBox>()
const imgCache = new Map<string, Promise<HTMLImageElement>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
    imgCache.set(src, p)
  }
  return p
}

export async function getContentCellBox(
  image: string,
  frames: [number, number][],
  tileW: number,
  tileH: number,
  alphaMin = 16
): Promise<CellBox> {
  const key = `${image}|${tileW}x${tileH}|${frames.map((f) => f.join(',')).join(';')}`
  const cached = boxCache.get(key)
  if (cached) return cached

  const full: CellBox = { l: 0, t: 0, r: tileW, b: tileH }
  try {
    const img = await loadImage(image)
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth
    cv.height = img.naturalHeight
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return full
    ctx.drawImage(img, 0, 0)

    let l = tileW, t = tileH, r = 0, b = 0, any = false
    for (const [col, row] of frames) {
      const data = ctx.getImageData(col * tileW, row * tileH, tileW, tileH).data
      for (let y = 0; y < tileH; y++) {
        for (let x = 0; x < tileW; x++) {
          if (data[(y * tileW + x) * 4 + 3] >= alphaMin) {
            any = true
            if (x < l) l = x
            if (x + 1 > r) r = x + 1
            if (y < t) t = y
            if (y + 1 > b) b = y + 1
          }
        }
      }
    }
    const box = any ? { l, t, r, b } : full
    boxCache.set(key, box)
    return box
  } catch {
    return full // tainted canvas / load failure → fall back to full cell
  }
}
