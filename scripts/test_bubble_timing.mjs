// Pure-logic unit test for the per-bubble timing schedule (mirrors electron/main/thinking.ts).
// Verifies char-based dwell/interval, the clamps, and the FIFO "no sequence break" rule.
// Run: node scripts/test_bubble_timing.mjs

const DWELL_PER_CHAR = 1500, DWELL_MIN = 4000, DWELL_MAX = 24000
const GAP_PER_CHAR = 500, GAP_MIN = 1500, GAP_MAX = 8000
const FADE_ORDER_GAP = 1000

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const charCount = (t) => t.replace(/\s/g, '').length

function schedule(texts, timeScale = 1) {
  let appearAt = 0, prevFadeAt = -Infinity
  return texts.map((t, i) => {
    const cc = charCount(t)
    const dwell = clamp(cc * DWELL_PER_CHAR, DWELL_MIN, DWELL_MAX) * timeScale
    const gap = clamp(cc * GAP_PER_CHAR, GAP_MIN, GAP_MAX) * timeScale
    const appear = appearAt
    const fade = Math.max(appear + dwell, prevFadeAt + FADE_ORDER_GAP * timeScale)
    prevFadeAt = fade
    appearAt += gap
    return { i, cc, appear, fade }
  })
}

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const ok = got === want
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ` — got ${got}, want ${want}`))
  ok ? pass++ : fail++
}
const ok = (name, cond, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' — ' + detail))
  cond ? pass++ : fail++
}

// ---- 1. the 9 real mock sentences match the agreed table ----
const MOCK = [
  '把這份報告做到主管能直接對外', '先把三個資料來源的權限要齊', '找出上一季的範本當骨架',
  '資料權限開始前一天就先申請', '需要 BI 匯出加上圖表模板', '不熟樞紐表就先看十分鐘教學',
  '準備約兩小時、本體約半天', '最可能卡在跨部門要數字', '現在先開空白檔貼上大綱',
]
const s = schedule(MOCK)
eq('mock #1 char count', s[0].cc, 14)
eq('mock #1 dwell→fade @ 21.0s', s[0].fade, 21000)
eq('mock #2 appears @ 7.0s', s[1].appear, 7000)
eq('mock #5 ("需要 BI…") count ignores spaces = 12', s[4].cc, 12)
eq('mock #9 last fade @ 66.0s', s[8].fade, 66000)

// ---- 2. fades are strictly ordered (FIFO) and ≥1s apart for the mocks ----
let mono = true, apart = true
for (let i = 1; i < s.length; i++) {
  if (s[i].fade <= s[i - 1].fade) mono = false
  if (s[i].fade - s[i - 1].fade < FADE_ORDER_GAP) apart = false
}
ok('mock fades strictly increasing (no sequence break)', mono)
ok('mock fades ≥1s apart', apart)

// ---- 3. THE edge case: a short sentence right after a long one must WAIT, not vanish first ----
const long20 = '一'.repeat(20), short2 = '好的'
const e = schedule([long20, short2])
ok('long sentence dwell capped at 24s', e[0].fade === 24000, `got ${e[0].fade}`)
ok('short sentence would NATURALLY fade earlier', 8000 + 4000 < e[0].fade) // appear(8000)+dwell(4000)=12000 < 24000
ok('FIFO forces short to fade AFTER long', e[1].fade > e[0].fade, `short=${e[1].fade} long=${e[0].fade}`)
eq('FIFO gap is exactly 1s after the long one', e[1].fade, e[0].fade + FADE_ORDER_GAP)

// ---- 4. clamps on the extremes ----
eq('2-char dwell floored at 4s', schedule(['好的'])[0].fade, 4000)            // 2*1500=3000 → floored 4000
eq('20-char dwell capped at 24s', schedule([long20])[0].fade, 24000)          // 20*1500=30000 → capped 24000
const twoLong = schedule([long20, long20])
eq('20-char interval capped at 8s', twoLong[1].appear, 8000)                  // 20*500=10000 → capped 8000
eq('1-char interval floored at 1.5s', schedule(['甲', '乙'])[1].appear, 1500) // 1*500=500 → floored 1500

console.log(`\n[TIMING] ${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
