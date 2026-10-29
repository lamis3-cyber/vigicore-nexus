// Photo advisor: decides, per photo, which presentation looks best on a product card:
//   'remove' -> transparent cutout | 'keep' -> the original photo | 'color' -> cutout on a background colour
//
// 1. AI (preferred): POST /api/image/advise -> a vision model looks at the original AND the cutout.
// 2. On-device analysis (always computed, used when the AI is unavailable / not configured / slow):
//    background cleanliness, cutout quality (ragged edge, white rim, specks), product palette.
// Never throws: the caller always gets an answer.

import { API_BASE } from './api.js'
import { loadImage, isLightNeutral, luma } from './image.js'

const ADVISE_ENDPOINT = `${API_BASE}/image/advise`
const ADVISE_TIMEOUT_MS = 12_000
let aiBlockedUntil = 0

// ---------------------------------------------------------------- pure analysis (unit-testable) ----
const isLightPixel = (r, g, b) => isLightNeutral(r, g, b, 185, 40)

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return [h, s, l]
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hx = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hx(r)}${hx(g)}${hx(b)}`
}

/** How busy / how light the ORIGINAL background is, from the 1-px ring around the photo. */
export function backgroundStats(px, w, h) {
  const ring = []
  for (let x = 0; x < w; x++) { ring.push((x) * 4, ((h - 1) * w + x) * 4) }
  for (let y = 1; y < h - 1; y++) { ring.push((y * w) * 4, (y * w + w - 1) * 4) }
  let r = 0, g = 0, b = 0
  for (const i of ring) { r += px[i]; g += px[i + 1]; b += px[i + 2] }
  const n = ring.length; r /= n; g /= n; b /= n
  let dev = 0
  for (const i of ring) dev += Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b)
  dev /= n * 3
  return { rgb: [r, g, b], busy: dev > 22, deviation: dev, light: isLightPixel(r, g, b), luma: luma(r, g, b) }
}

/** Quality + colour facts about the cutout (RGBA, alpha marks the product). */
export function cutoutStats(px, w, h) {
  const n = w * h
  const solid = new Uint8Array(n)
  let area = 0, lumaSum = 0, lightN = 0
  const hue = new Float32Array(12)
  let satN = 0, hr = 0, hg = 0, hb = 0
  for (let p = 0; p < n; p++) {
    if (px[p * 4 + 3] < 128) continue
    solid[p] = 1; area++
    const r = px[p * 4], g = px[p * 4 + 1], b = px[p * 4 + 2]
    lumaSum += luma(r, g, b)
    if (isLightPixel(r, g, b)) lightN++
    const [hh, s, l] = rgbToHsl(r, g, b)
    if (s > 0.3 && l > 0.18 && l < 0.85) { hue[Math.floor(hh / 30) % 12] += s; satN++; hr += r; hg += g; hb += b }
  }
  if (area < 40) return { failed: true, area, share: 0 }
  // rim pixels (solid with a transparent 4-neighbour) -> perimeter, white share, specks
  let rim = 0, rimWhite = 0, rimLumaSum = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (!solid[p]) continue
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !solid[p - 1] || !solid[p + 1] || !solid[p - w] || !solid[p + w]
    if (!edge) continue
    rim++
    rimLumaSum += luma(px[p * 4], px[p * 4 + 1], px[p * 4 + 2])
    if (isLightPixel(px[p * 4], px[p * 4 + 1], px[p * 4 + 2])) rimWhite++
  }
  // raggedness: perimeter of the mask vs perimeter of its own 2 px "opening" (smooth version) - ragged edges have far more
  const smooth = new Uint8Array(n)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x
    let c = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < h && xx < w) c += solid[yy * w + xx] }
    smooth[p] = c >= 13 ? 1 : 0
  }
  let smoothRim = 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x; if (smooth[p] && (!smooth[p - 1] || !smooth[p + 1] || !smooth[p - w] || !smooth[p + w])) smoothRim++ }
  const ragged = smoothRim ? rim / smoothRim : 1
  const peak = hue.indexOf(Math.max(...hue))
  const colourful = satN / area > 0.28
  return {
    failed: false, area, meanLuma: lumaSum / area, whiteShare: lightN / area,
    rimWhiteShare: rim ? rimWhite / rim : 0, rimLuma: rim ? rimLumaSum / rim : lumaSum / area, ragged, colourful,
    hue: colourful ? peak * 30 + 15 : null,
    mainRgb: satN ? [hr / satN, hg / satN, hb / satN] : null,
  }
}

// Typical hue (0-360) per product family, used when the product itself is colourless (white / grey / black).
const CATEGORY_HUES = [
  [/medic|sant|health|clinic|hospital|dental|pharma|physio/i, 178],   // medical: clean teal
  [/lab|scien|analy|research|biolog/i, 232],                          // laboratory: deep indigo-blue
  [/cosmet|beaut|skin|hair|perfum|soin/i, 335],                       // beauty: soft rose
  [/food|alim|agri|drink|boisson/i, 32],                              // food: warm amber
  [/farm|plant|garden|green|eco/i, 140],                              // agriculture / eco: green
  [/electr|inform|computer|network|security|camera|it\b/i, 258],      // tech: violet-blue
  [/industr|tool|outil|machine|equip|build|btp/i, 212],               // industry: steel blue
]
const categoryHue = (category = '') => (CATEGORY_HUES.find(([re]) => re.test(category)) || [null, null])[1]

function hslToRgb(h, s, l) {
  const hex = hslToHex(h, s, l)
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
const hueDist = (a, b) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return d > 180 ? 360 - d : d }

/**
 * Pick the backdrop colour that makes THIS product stand out, by scoring a palette of candidates:
 *  - luminance contrast against the product's EDGE (what actually separates it from the backdrop)
 *    and against its body -> a white device gets a mid-tone, a dark one gets a light tint;
 *  - hue: a coloured product gets the complementary hue and never its own hue; a colourless one
 *    (white / grey / black) gets its category's family colour (medical = teal, lab = blue, ...);
 *  - calm, modern saturation, no muddy yellow-greens, nothing so dark it vanishes on the dark card.
 * Deterministic, so the same photo always gives the same answer.
 */
export function suggestBackground(c, category = '') {
  const bodyLuma = c.meanLuma ?? 128
  const edgeLuma = c.rimLuma ?? bodyLuma
  const prodHue = c.colourful && c.mainRgb ? rgbToHsl(...c.mainRgb)[0] : null
  const wantDark = bodyLuma > 150 || edgeLuma > 165   // light product -> richer mid-tone backdrop
  // No category match: a light product gets a warm sand/tan (what reads best against white), anything else a calm steel blue.
  const family = categoryHue(category) ?? (wantDark ? 36 : 205)
  // Light product: aim for a MID-tone backdrop (not the darkest one, which vanishes on the dark card);
  // dark product: aim for a light one. Contrast is rewarded up to a plateau, so hue and saturation decide among good candidates.
  const targetLuma = wantDark ? Math.max(170, Math.min(200, edgeLuma - 15)) : Math.min(215, edgeLuma + 110)
  let best = null
  for (let h = 0; h < 360; h += 10) {
    for (const s of [0.25, 0.32, 0.42, 0.55]) {
      for (const l of [0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.74, 0.82]) {
        const [r, g, b] = hslToRgb(h, s, l)
        const lu = luma(r, g, b)
        let score = 3 - Math.abs(lu - targetLuma) / 40
        if (prodHue != null) {
          score += (1 - hueDist(h, prodHue + 180) / 180) * 1.6
          if (hueDist(h, prodHue) < 40) score -= 1.5
        } else {
          score += (1 - hueDist(h, family) / 180) * 1.6
        }
        score -= Math.abs(s - 0.3) * 1.4
        if (h >= 50 && h <= 105) score -= 0.5              // muddy yellow-green
        if (lu < 100) score -= (100 - lu) / 40             // vanishes on the dark card
        if (wantDark && lu > 212) score -= 1               // pale backdrop swallows a light product
        if (!wantDark && bodyLuma < 90 && lu < 150) score -= 1 // dark product needs a light one
        if (!best || score > best.score) best = { score, hex: hslToHex(h, s, l) }
      }
    }
  }
  return best.hex
}

/**
 * Returns RGBA pixels where only the PRODUCT is opaque. A cut-out is returned untouched; for an opaque photo with a plain
 * background, the background is flood-filled from the border and made transparent, so the colour analysis measures the
 * product itself and not the white/grey wall behind it. Busy backgrounds are left as they are (no single colour to remove).
 */
export function isolateProduct(px, w, h) {
  const n = w * h
  let clear = 0
  for (let p = 0; p < n; p++) if (px[p * 4 + 3] < 128) clear++
  if (clear / n > 0.03) return px
  const ring = backgroundStats(px, w, h)
  if (ring.busy) return px
  const [br, bgc, bb] = ring.rgb
  const near = (p) => Math.max(Math.abs(px[p * 4] - br), Math.abs(px[p * 4 + 1] - bgc), Math.abs(px[p * 4 + 2] - bb)) <= 34
  const seen = new Uint8Array(n), stack = []
  const push = (p) => { if (!seen[p] && near(p)) { seen[p] = 1; stack.push(p) } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 1; y < h - 1; y++) { push(y * w); push(y * w + w - 1) }
  let reached = 0
  while (stack.length) {
    const p = stack.pop(); reached++
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < n - w) push(p + w)
  }
  if (reached / n < 0.05 || reached / n > 0.95) return px
  const out = new Uint8ClampedArray(px)
  for (let p = 0; p < n; p++) if (seen[p]) out[p * 4 + 3] = 0
  return out
}

const NEUTRAL_STATS = { meanLuma: 128, whiteShare: 0, colourful: false }

/**
 * Best backdrop colour for the photo currently in the studio (cut-out OR original photo).
 * Never returns null: if the pixels can't be read (e.g. a cross-origin image), it falls back to the category colour.
 */
export async function suggestColourFor(imageUrl, category = '') {
  try {
    const img = await loadImage(imageUrl)
    const c = draw(img, 260)
    const { width: w, height: h } = c
    const px = isolateProduct(c.getContext('2d').getImageData(0, 0, w, h).data, w, h)
    const stats = cutoutStats(px, w, h)
    return suggestBackground(stats.failed ? NEUTRAL_STATS : stats, category)
  } catch { return suggestBackground(NEUTRAL_STATS, category) }
}

/** Decision from the measurements alone. */
export function decideLocally(bg, c, category = '') {
  const bgHex = suggestBackground(c.failed ? { meanLuma: 128, whiteShare: 0, colourful: false } : c, category)
  if (c.failed) return { decision: 'keep', background: bgHex, confidence: 0.7, quality: 2, issues: ['missing_parts'], reason: 'The cutout could not find the product, so the original photo is kept.' }
  const issues = []
  if (c.ragged > 1.7) issues.push('jagged_edges')
  if (c.rimWhiteShare > 0.3 && c.whiteShare < 0.4) issues.push('white_rim')
  let quality = 9 - (c.ragged > 1.7 ? 3 : c.ragged > 1.35 ? 1.5 : 0) - (issues.includes('white_rim') ? 1.5 : 0)
  quality = Math.max(1, Math.min(10, quality))

  // A clean studio shot of a light product: the original is already as good as it gets (and a cutout would be ragged).
  if (bg.light && !bg.busy && c.whiteShare >= 0.4) return { decision: 'keep', background: bgHex, confidence: 0.75, quality, issues, reason: 'A light product on a clean white background already looks professional, so the original is kept.' }
  if (quality < 5.5) return { decision: 'keep', background: bgHex, confidence: 0.65, quality, issues, reason: 'The automatic cutout has rough edges on this photo, so the original looks better.' }
  if (c.whiteShare > 0.4 || c.meanLuma > 175) return { decision: 'color', background: bgHex, confidence: 0.7, quality, issues, reason: 'A light product disappears on a plain background; a soft colour gives it depth.' }
  if (c.meanLuma < 90) return { decision: 'color', background: bgHex, confidence: 0.65, quality, issues, reason: 'A dark product stands out much better on a light background.' }
  if (bg.busy) return { decision: 'remove', background: bgHex, confidence: 0.8, quality, issues, reason: 'The original background is busy; the clean cutout puts the focus on the product.' }
  return { decision: 'remove', background: bgHex, confidence: 0.6, quality, issues, reason: 'The cutout is clean and the product stands out well without its background.' }
}

// ---------------------------------------------------------------------------- browser glue ----
function draw(img, max, fill) {
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.max(8, Math.round(img.width * k)); c.height = Math.max(8, Math.round(img.height * k))
  const x = c.getContext('2d', { willReadFrequently: true })
  if (fill) { x.fillStyle = fill; x.fillRect(0, 0, c.width, c.height) }
  x.drawImage(img, 0, 0, c.width, c.height)
  return c
}

/**
 * @returns {Promise<{decision, background, confidence, quality, issues, reason, source: 'ai'|'auto'}>}
 */
export async function getPhotoAdvice({ originalUrl, cutUrl, title = '', category = '' }) {
  const [orig, cut] = await Promise.all([loadImage(originalUrl), cutUrl ? loadImage(cutUrl).catch(() => null) : null])
  const oc = draw(orig, 260)
  const bg = backgroundStats(oc.getContext('2d').getImageData(0, 0, oc.width, oc.height).data, oc.width, oc.height)
  let stats = { failed: true, area: 0 }
  if (cut) { const cc = draw(cut, 260); stats = cutoutStats(cc.getContext('2d').getImageData(0, 0, cc.width, cc.height).data, cc.width, cc.height) }
  else stats = { failed: true, area: 0 }
  const local = cut ? decideLocally(bg, stats, category) : { decision: 'keep', background: null, confidence: 0.7, quality: 0, issues: [], reason: 'Background removal was not possible for this photo, so the original is kept.' }

  // ---- AI ----
  if (cut && Date.now() >= aiBlockedUntil) {
    try {
      const a = draw(orig, 640).toDataURL('image/jpeg', 0.8)
      const b = draw(cut, 640, '#808080').toDataURL('image/jpeg', 0.8) // mid-grey: white rims / leftovers become visible
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ADVISE_TIMEOUT_MS)
      let res
      try {
        res = await fetch(ADVISE_ENDPOINT, {
          method: 'POST', credentials: 'include', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ original: a, cutout: b, title, category }),
        })
      } finally { clearTimeout(t) }
      if (res.ok) {
        const { advice } = await res.json()
        if (advice?.decision) {
          const background = advice.decision === 'color' ? (advice.background || local.background || suggestBackground(stats, category)) : (local.background || null)
          return { ...advice, background, source: 'ai', localSuggestion: local }
        }
      } else {
        let code = ''
        try { code = (await res.json()).code } catch { /* not JSON */ }
        aiBlockedUntil = Date.now() + (code === 'not_configured' ? 10 * 60_000 : 30_000)
      }
    } catch { aiBlockedUntil = Date.now() + 30_000 }
  }
  return { ...local, source: 'auto' }
}
