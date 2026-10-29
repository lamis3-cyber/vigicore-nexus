// Downscale an image file to a JPEG data URL (longest side <= max) so it stays small enough to send as JSON.
export function shrinkImage(file, max = 1200, quality = 0.95) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')) }
    img.src = url
  })
}

// PNG/WebP sources may carry transparency (typically from removeWhiteBackground);
// re-exporting those as JPEG would silently flatten the transparent areas to
// black, since JPEG has no alpha channel. Every function below that bakes an
// edit into a new image keeps PNG when the source could have transparency,
// and only uses the smaller JPEG when it's safe to.
const mayHaveAlpha = (src) => src.startsWith('data:image/png') || src.startsWith('data:image/webp')
const exportCanvas = (c, src) => (mayHaveAlpha(src) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.97))

// Natural width/height ratio of an image, used to decide whether cropping it
// into a placement would cut off too much of the product (see pickFit in
// lib/imageFrame.js).
export function getImageAspect(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img.width / img.height)
    img.onerror = () => reject(new Error('unreadable image'))
    img.src = src
  })
}

/** Loads a URL or Blob into a cross-origin-safe <img>. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('unreadable image'))
    img.src = src instanceof Blob ? URL.createObjectURL(src) : src
  })
}

// Builds the CSS filter used for a *live* (non-destructive) preview of the brightness/
// contrast/saturation sliders — cheap to animate on every drag since nothing is redrawn.
// Sliders are -100..100; 0 is untouched.
export function adjustCssFilter({ brightness = 0, contrast = 0, saturation = 0 } = {}) {
  if (!brightness && !contrast && !saturation) return 'none'
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100})`
}

// 3x3 unsharp-mask convolution, blended in by `amount` (0–1) so sharpening can be partial.
function sharpen(imageData, amount) {
  const { width: w, height: h, data: src } = imageData
  const out = new ImageData(w, h)
  const dst = out.data
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3]
        continue
      }
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0, ki = 0
        for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) sum += src[((y + ky) * w + (x + kx)) * 4 + ch] * k[ki++]
        dst[i + ch] = Math.min(255, Math.max(0, src[i + ch] + (sum - src[i + ch]) * amount))
      }
      dst[i + 3] = src[i + 3]
    }
  }
  return out
}

// Bakes brightness/contrast/saturation/sharpen permanently into a new image, so the edit
// survives exactly as chosen wherever the cover photo is shown (cards, the detail page, etc).
export async function applyAdjustments(src, { brightness = 0, contrast = 0, saturation = 0, sharpenAmount = 0 } = {}) {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.filter = adjustCssFilter({ brightness, contrast, saturation })
  ctx.drawImage(img, 0, 0)
  ctx.filter = 'none'
  if (sharpenAmount > 0) ctx.putImageData(sharpen(ctx.getImageData(0, 0, c.width, c.height), sharpenAmount / 100), 0, 0)
  return exportCanvas(c, src)
}

// Rotates the photo by 90° steps (clockwise, `steps` times).
export async function rotateImage(src, steps = 1) {
  const img = await loadImage(src)
  const n = ((steps % 4) + 4) % 4
  const swap = n === 1 || n === 3
  const c = document.createElement('canvas')
  c.width = swap ? img.height : img.width; c.height = swap ? img.width : img.height
  const ctx = c.getContext('2d')
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate((n * 90 * Math.PI) / 180)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  return exportCanvas(c, src)
}

// Mirrors the photo horizontally ('h', the common case) or vertically ('v').
export async function flipImage(src, axis = 'h') {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d')
  ctx.translate(axis === 'h' ? c.width : 0, axis === 'v' ? c.height : 0)
  ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1)
  ctx.drawImage(img, 0, 0)
  return exportCanvas(c, src)
}

// One-click fix for flat/dull product shots. Steps (transparent pixels are ignored):
//  1. per-channel histogram stretch (1% clipped at each end, ranges blended to avoid colour casts)
//  2. gamma to pull mid-tones toward 50% luminance
//  3. gentle S-curve for contrast
//  4. adaptive saturation lift (duller photo => bigger lift)
//  5. light sharpen
export async function autoEnhance(src) {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const px = data.data

  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  let n = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue
    n++
    hist[0][px[i]]++; hist[1][px[i + 1]]++; hist[2][px[i + 2]]++
  }
  if (!n) return src
  const clip = n * 0.01
  const lo = [0, 0, 0], hi = [255, 255, 255]
  for (let ch = 0; ch < 3; ch++) {
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[ch][v]; if (acc > clip) { lo[ch] = v; break } }
    acc = 0
    for (let v = 255; v >= 0; v--) { acc += hist[ch][v]; if (acc > clip) { hi[ch] = v; break } }
  }
  const avgLo = (lo[0] + lo[1] + lo[2]) / 3, avgHi = (hi[0] + hi[1] + hi[2]) / 3
  for (let ch = 0; ch < 3; ch++) {
    lo[ch] = lo[ch] * 0.4 + avgLo * 0.6
    hi[ch] = Math.max(lo[ch] + 8, hi[ch] * 0.4 + avgHi * 0.6)
  }

  // 1) stretch, collecting mean luminance + mean saturation
  let lumSum = 0, satSum = 0
  for (let i = 0; i < px.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.min(255, Math.max(0, ((px[i + ch] - lo[ch]) / (hi[ch] - lo[ch])) * 255))
    if (px[i + 3] >= 200) {
      const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2])
      lumSum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      satSum += mx ? (mx - mn) / mx : 0
    }
  }
  const mean = Math.min(235, Math.max(20, lumSum / n))
  const meanSat = satSum / n

  // 2) gamma + 3) S-curve, baked into one lookup table.
  // pow(v, e) with e < 1 brightens, e > 1 darkens. The exponent that moves the mean to 50% is
  // log(0.5)/log(mean); we only apply 60% of it, ignore means already in a healthy band
  // (white products on a light backdrop are meant to be bright) and keep it in a tight range.
  const m = mean / 255
  let e = 1
  if (m < 0.38 || m > 0.68) e = 1 + (Math.log(0.5) / Math.log(m) - 1) * 0.6
  e = Math.min(1.2, Math.max(0.8, e))
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const g = Math.pow(v / 255, e)
    const s = g * g * (3 - 2 * g) // smoothstep
    lut[v] = 255 * (g * 0.8 + s * 0.2)
  }

  // 4) adaptive saturation: 1.05 (already colourful) .. 1.25 (very dull)
  const SAT = Math.min(1.25, Math.max(1.05, 1 + (0.35 - meanSat) * 0.8))
  for (let i = 0; i < px.length; i += 4) {
    const r = lut[px[i]], g = lut[px[i + 1]], b = lut[px[i + 2]]
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    px[i] = l + (r - l) * SAT; px[i + 1] = l + (g - l) * SAT; px[i + 2] = l + (b - l) * SAT
  }
  ctx.putImageData(data, 0, 0)

  // 5) light sharpen
  ctx.putImageData(sharpen(ctx.getImageData(0, 0, c.width, c.height), 0.15), 0, 0)
  return exportCanvas(c, src)
}

// ── Shared cutout helpers ────────────────────────────────────────────────

/**
 * Removes the light fringe left around a cut-out product: erodes the alpha
 * mask by a pixel or two (dropping the half-blended white rim), replaces the
 * colour of the remaining semi-transparent edge pixels with their opaque
 * neighbours' colour (so they no longer carry background white), then
 * softens the edge with a light 3×3 alpha average so it isn't jagged.
 * Works in place on RGBA pixel data; pure, so it's unit-testable.
 */
export function cleanEdges(px, w, h, radius = Math.max(1, Math.round(Math.max(w, h) / 1000))) {
  let cur = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) cur[i] = px[i * 4 + 3]

  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8ClampedArray(cur)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (cur[i] === 0) continue
        let m = cur[i]
        if (x > 0 && cur[i - 1] < m) m = cur[i - 1]
        if (x < w - 1 && cur[i + 1] < m) m = cur[i + 1]
        if (y > 0 && cur[i - w] < m) m = cur[i - w]
        if (y < h - 1 && cur[i + w] < m) m = cur[i + w]
        next[i] = m
      }
    }
    cur = next
  }

  const soft = new Uint8ClampedArray(cur)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      let sum = 0, same = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) { const v = cur[i + dy * w + dx]; sum += v; if (v !== cur[i]) same = false }
      }
      if (!same) soft[i] = Math.round(sum / 9)
    }
  }

  // Recolour AFTER softening: every edge pixel that ends up partly see-through
  // (including ones the softening just brought back) takes its colour from
  // the solid pixels beside it, never from the old background.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (soft[i] === 0 || soft[i] === 255) continue
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (soft[j] !== 255) continue
          r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++
        }
      }
      if (n) { px[i * 4] = r / n; px[i * 4 + 1] = g / n; px[i * 4 + 2] = b / n }
    }
  }
  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = soft[i]
}


/**
 * Clears the soft floor shadow / white haze that sits under a product shot.
 * The main flood fill leaves it half-visible because the shadow is a gradient
 * that never quite reaches the "background" colour. A shadow differs from the
 * product in two ways: it is colourless like the backdrop and it is SMOOTH
 * (almost no local gradient), whereas even a white product has edges and
 * texture. So we grow the cleared region through smooth, backdrop-coloured
 * pixels only. `dist` = per-pixel distance from the backdrop colour,
 * `neutral` = 1 where the pixel is as colourless as the backdrop. Works in
 * place on the alpha channel of `px`; pure, so it's unit-testable.
 */
export function clearShadowHaze(px, dist, neutral, w, h, { maxDist = 62, maxGrad = 1.6 } = {}) {
  // 5x5 box blur of `dist` (separable) so JPEG noise doesn't read as texture.
  const tmp = new Float32Array(w * h), ds = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0
    for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx < 0 || xx >= w) continue; s += dist[y * w + xx]; n++ }
    tmp[y * w + x] = s / n
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0
    for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; s += tmp[yy * w + x]; n++ }
    ds[y * w + x] = s / n
  }
  const ok = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    if (!neutral[i] || ds[i] >= maxDist) continue
    const gx = (ds[i + 1] - ds[i - 1]) / 2, gy = (ds[i + w] - ds[i - w]) / 2
    if (Math.hypot(gx, gy) < maxGrad) ok[i] = 1
  }
  // A floor shadow only ever sits BELOW the product. Anything with real
  // product above-and-around it (a white side panel, a highlight strip next
  // to a dark bezel) is protected: in each column, only pixels that lie
  // beneath the lowest solid product pixel (plus a small margin so the
  // product's own pale bottom rim survives) may be treated as shadow.
  const margin = Math.round(h * 0.03)
  const floorY = new Int32Array(w).fill(-1)
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      const i = y * w + x
      if (px[i * 4 + 3] >= 128 && !ok[i]) { floorY[x] = y; break }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (floorY[x] >= 0 && y <= floorY[x] + margin) ok[y * w + x] = 0
  }
  const seen = new Uint8Array(w * h), queue = new Int32Array(w * h)
  let qLen = 0
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] < 13) { seen[i] = 1; queue[qLen++] = i }
  for (let qi = 0; qi < qLen; qi++) {
    const i = queue[qi], x = i % w, y = (i / w) | 0
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || seen[j] || !ok[j]) continue
      seen[j] = 1; queue[qLen++] = j
      px[j * 4 + 3] = 0
    }
  }
}


/**
 * Restores thin see-through lines cut INSIDE the product. A pale highlight or
 * panel seam on a white product is almost the background colour, so the flood
 * fill leaks along it and leaves a dotted hole the card colour shows through.
 * A genuine cutout edge has solid pixels on only one side; a slit has solid on
 * both, within `maxWidth` pixels, across a row or a column, so only those are
 * put back. Works in place on RGBA `px`.
 */
export function healThinSlits(px, w, h, maxWidth = 7) {
  const fix = []
  const solid = (i) => px[i * 4 + 3] >= 128
  const scan = (len, lines, at) => {
    for (let l = 0; l < lines; l++) {
      let run = -1
      for (let t = 0; t <= len; t++) {
        const clear = t < len && !solid(at(l, t))
        if (clear && run < 0) run = t
        if (!clear && run >= 0) {
          if (run > 0 && t < len && t - run <= maxWidth) for (let k = run; k < t; k++) fix.push(at(l, k))
          run = -1
        }
      }
    }
  }
  scan(w, h, (y, x) => y * w + x)
  scan(h, w, (x, y) => y * w + x)
  for (const i of fix) px[i * 4 + 3] = 255
}

/**
 * Fills small see-through holes and thin channels inside the product. Where
 * two seams cross, the flood fill leaves a diamond hole too wide for
 * healThinSlits to catch. Transparent regions are "opened" (eroded by `r`,
 * then grown back by `r` inside themselves): the big backdrop area survives,
 * anything narrower than about 2r pixels does not and is made solid again.
 * Works in place on RGBA `px`.
 */
export function fillThinHoles(px, w, h, r = 5) {
  const total = w * h
  const nb = (i) => { const x = i % w, y = (i / w) | 0; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1] }
  const isT = (i) => px[i * 4 + 3] < 128
  // distance from every transparent pixel to the nearest solid one
  const dist = new Int16Array(total).fill(-1), q = new Int32Array(total)
  let qLen = 0
  for (let i = 0; i < total; i++) if (!isT(i)) { dist[i] = 0; q[qLen++] = i }
  for (let qi = 0; qi < qLen; qi++) {
    const i = q[qi]
    for (const j of nb(i)) if (j >= 0 && dist[j] < 0) { dist[j] = dist[i] + 1; q[qLen++] = j }
  }
  // core = transparent pixels deeper than r; grow it back r steps inside transparency
  const keep = new Uint8Array(total), g = new Int32Array(total)
  let gLen = 0
  for (let i = 0; i < total; i++) if (isT(i) && dist[i] > r) { keep[i] = 1; g[gLen++] = i }
  let start = 0
  for (let step = 0; step < r; step++) {
    const end = gLen
    for (let qi = start; qi < end; qi++) for (const j of nb(g[qi])) if (j >= 0 && !keep[j] && isT(j)) { keep[j] = 1; g[gLen++] = j }
    start = end
  }
  for (let i = 0; i < total; i++) if (isT(i) && !keep[i]) px[i * 4 + 3] = 255
}


/**
 * Clears the white "lines" / blobs a silhouette cutout leaves around the
 * product. The silhouette closes gaps wider than the product's own rim (so a
 * white rim survives), which also swallows backdrop-coloured slivers between
 * parts (bottle vs. box) and along jagged outlines. Here we grow the
 * transparent area INTO those slivers: from every see-through pixel we walk
 * through pixels that are still backdrop-coloured (`dist` <= `maxDist`), but
 * only `depth` pixels deep, so a white product body is never eaten from the
 * outside in. If it would remove an implausible share of the product
 * (`maxShare`), nothing is changed. Works in place on RGBA `px`; returns the
 * number of pixels cleared. Pure, so it's unit-testable.
 */
export function clearBackdropSlivers(px, dist, w, h, { maxDist = 48, depth = 12, maxShare = 0.3 } = {}) {
  const n = w * h
  const depthAt = new Int16Array(n).fill(-1), queue = new Int32Array(n)
  let qLen = 0, area = 0
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] >= 13) area++
    else { depthAt[i] = 0; queue[qLen++] = i }
  }
  if (!area || !qLen) return 0
  const hit = []
  for (let qi = 0; qi < qLen; qi++) {
    const i = queue[qi]
    if (depthAt[i] >= depth) continue
    const x = i % w, y = (i / w) | 0
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || depthAt[j] >= 0 || px[j * 4 + 3] < 13 || dist[j] > maxDist) continue
      depthAt[j] = depthAt[i] + 1; queue[qLen++] = j; hit.push(j)
    }
  }
  if (!hit.length || hit.length > area * maxShare) return 0
  for (const j of hit) px[j * 4 + 3] = 0
  return hit.length
}

/** Approximate distance (chamfer 1 / 1.414) from every pixel to the nearest pixel where flag === want. */
function chamfer(flag, want, w, h) {
  const n = w * h, d = new Float32Array(n), INF = 1e9
  for (let i = 0; i < n; i++) d[i] = flag[i] === want ? 0 : INF
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i]
    if (x > 0) v = Math.min(v, d[i - 1] + 1)
    if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414) }
    d[i] = v
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i]
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1)
    if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414); if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414) }
    d[i] = v
  }
  return d
}

/**
 * Cutout by SILHOUETTE. A white product on a white backdrop has no reliable
 * colour edge (its rim is the same white as the backdrop), so instead of
 * chasing that edge we take the parts that are clearly NOT backdrop (dist >
 * `strong`), close the gaps between them (radius `r`, wider than the white
 * rim), fill small holes, keep the largest object and feather the edge. The
 * white rim ends up inside the silhouette and stays; the empty backdrop and
 * soft floor haze fall outside and go. `dist[i]` = colour distance from the
 * backdrop. Returns alpha 0..255 (Uint8Array), or null when the result is
 * implausible (nothing found / almost everything found), so callers can fall
 * back to the flood-fill result. Pure, so it's unit-testable.
 */
export function silhouetteAlpha(dist, w, h, { strong = 45, radiusRatio = 0.02, holeMax = 0.02 } = {}) {
  const n = w * h
  const seed = new Uint8Array(n)
  let cnt = 0
  for (let i = 0; i < n; i++) if (dist[i] > strong) { seed[i] = 1; cnt++ }
  if (cnt < n * 0.01 || cnt > n * 0.92) return null
  const r = Math.max(3, Math.round(Math.max(w, h) * radiusRatio))
  // closing = dilate by r, then erode by r (borders don't erode, so a product touching the frame stays whole)
  const dS = chamfer(seed, 1, w, h)
  const dil = new Uint8Array(n)
  for (let i = 0; i < n; i++) dil[i] = dS[i] <= r ? 1 : 0
  const dN = chamfer(dil, 0, w, h)
  const cl = new Uint8Array(n)
  for (let i = 0; i < n; i++) cl[i] = dN[i] > r ? 1 : 0
  for (let i = 0; i < n; i++) if (seed[i]) cl[i] = 1
  // components of the closed shape: keep the largest one
  const label = new Int32Array(n).fill(-1), q = new Int32Array(n), sizes = []
  const grow = (s0, on, id) => {
    let qh = 0, qt = 0; label[s0] = id; q[qt++] = s0
    while (qh < qt) {
      const i = q[qh++], x = i % w
      if (x > 0 && on[i - 1] && label[i - 1] < 0) { label[i - 1] = id; q[qt++] = i - 1 }
      if (x < w - 1 && on[i + 1] && label[i + 1] < 0) { label[i + 1] = id; q[qt++] = i + 1 }
      if (i >= w && on[i - w] && label[i - w] < 0) { label[i - w] = id; q[qt++] = i - w }
      if (i < n - w && on[i + w] && label[i + w] < 0) { label[i + w] = id; q[qt++] = i + w }
    }
    return qt
  }
  for (let s0 = 0; s0 < n; s0++) if (cl[s0] && label[s0] < 0) sizes.push(grow(s0, cl, sizes.length))
  if (!sizes.length) return null
  let best = 0
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = label[i] === best ? 1 : 0
  // fill enclosed holes that are small; big see-through openings (a handle, a ring) stay open
  label.fill(-1)
  const holes = []
  const empty = new Uint8Array(n)
  for (let i = 0; i < n; i++) empty[i] = mask[i] ? 0 : 1
  for (let s0 = 0; s0 < n; s0++) {
    if (!empty[s0] || label[s0] >= 0) continue
    const id = holes.length, size = grow(s0, empty, id)
    let border = false
    for (let k = 0; k < size; k++) { const i = q[k], x = i % w, y = (i / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { border = true; break } }
    holes.push({ size, border })
  }
  for (let i = 0; i < n; i++) { const hl = label[i] >= 0 ? holes[label[i]] : null; if (hl && !hl.border && hl.size <= n * holeMax) mask[i] = 1 }
  // shave one pixel (kills the last backdrop-coloured fringe), then feather ~1.5px
  const dE = chamfer(mask, 0, w, h)
  let f = new Float32Array(n)
  for (let i = 0; i < n; i++) f[i] = mask[i] && dE[i] > 1 ? 1 : 0
  const tmp = new Float32Array(n)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; tmp[i] = (f[x > 0 ? i - 1 : i] + f[i] + f[x < w - 1 ? i + 1 : i]) / 3 }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; f[i] = (tmp[y > 0 ? i - w : i] + tmp[i] + tmp[y < h - 1 ? i + w : i]) / 3 }
  }
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.min(1, Math.max(0, (f[i] - 0.15) / 0.7)) * 255)
  return out
}

/**
 * Cutout by OUTLINE, for products whose body is almost the backdrop colour
 * (white device on a light-grey studio backdrop): colour alone can't see them,
 * but their outline is still a closed line of faint edges. Find those edges
 * (gradient of the luminance `lum`), thicken them by `d` px so tiny gaps seal,
 * fill what they enclose, thin back, round off the outline (opening + closing,
 * radius ~2% of the size), keep the largest object and feather it. The edge
 * threshold adapts to the photo's own noise. Returns a 0..255 alpha or null.
 */
export function outlineAlpha(lum, w, h, { d = Math.max(5, Math.round(Math.max(w, h) * 0.011)), radiusRatio = 0.02 } = {}) {
  const n = w * h
  // light blur (2 box passes) so JPEG noise doesn't read as edges
  let a = new Float32Array(lum), b = new Float32Array(n)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; b[i] = (a[x > 0 ? i - 1 : i] + a[i] + a[x < w - 1 ? i + 1 : i]) / 3 }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; a[i] = (b[y > 0 ? i - w : i] + b[i] + b[y < h - 1 ? i + w : i]) / 3 }
  }
  const g = new Float32Array(n)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    const gx = (a[i - w + 1] + 2 * a[i + 1] + a[i + w + 1]) - (a[i - w - 1] + 2 * a[i - 1] + a[i + w - 1])
    const gy = (a[i + w - 1] + 2 * a[i + w] + a[i + w + 1]) - (a[i - w - 1] + 2 * a[i - w] + a[i - w + 1])
    g[i] = Math.hypot(gx, gy) / 8
  }
  // noise level = 99th percentile of the gradient on a thin frame around the photo (that's backdrop)
  const fr = []
  const m = Math.max(2, Math.round(Math.min(w, h) * 0.015))
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (x < m || y < m || x >= w - m || y >= h - m) fr.push(g[y * w + x])
  fr.sort((p, q) => p - q)
  const T = Math.max(0.9, 1.6 * (fr[Math.floor(fr.length * 0.99)] || 0))
  const edge = new Uint8Array(n)
  for (let i = 0; i < n; i++) edge[i] = g[i] > T ? 1 : 0
  // drop tiny isolated specks
  const label = new Int32Array(n).fill(-1), q = new Int32Array(n)
  const flood = (s0, on, id, diag) => {
    let qh = 0, qt = 0; label[s0] = id; q[qt++] = s0
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diag && dx && dy)) continue
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const j = yy * w + xx
        if (on[j] && label[j] < 0) { label[j] = id; q[qt++] = j }
      }
    }
    return qt
  }
  const minSpeck = Math.max(25, Math.round(n * 2e-5))
  for (let s0 = 0; s0 < n; s0++) {
    if (!edge[s0] || label[s0] >= 0) continue
    const size = flood(s0, edge, 1, true)
    if (size < minSpeck) for (let k = 0; k < size; k++) edge[q[k]] = 0
  }
  // thicken edges by d, fill enclosed areas, thin back by d
  const dE = chamfer(edge, 1, w, h)
  const thick = new Uint8Array(n)
  for (let i = 0; i < n; i++) thick[i] = dE[i] <= d ? 1 : 0
  const empty = new Uint8Array(n)
  for (let i = 0; i < n; i++) empty[i] = thick[i] ? 0 : 1
  label.fill(-1)
  const outside = new Uint8Array(n).fill(1) // 1 = still "outside" (empty and reachable from the frame)
  const seen = new Uint8Array(n)
  for (let s0 = 0; s0 < n; s0++) {
    if (!empty[s0] || seen[s0]) continue
    const x0 = s0 % w, y0 = (s0 / w) | 0
    // flood this empty area; it's outside if it touches the frame
    let qh = 0, qt = 0, touches = false; q[qt++] = s0; seen[s0] = 1
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true
      if (x > 0 && empty[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; q[qt++] = i - 1 }
      if (x < w - 1 && empty[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; q[qt++] = i + 1 }
      if (y > 0 && empty[i - w] && !seen[i - w]) { seen[i - w] = 1; q[qt++] = i - w }
      if (y < h - 1 && empty[i + w] && !seen[i + w]) { seen[i + w] = 1; q[qt++] = i + w }
    }
    if (!touches) for (let k = 0; k < qt; k++) outside[q[k]] = 0
    void x0; void y0
  }
  let filled = new Uint8Array(n)
  for (let i = 0; i < n; i++) filled[i] = empty[i] && outside[i] ? 0 : 1
  const dF = chamfer(filled, 0, w, h)
  let mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = dF[i] > d ? 1 : 0
  // round off: opening then closing
  const R = Math.max(3, Math.round(Math.max(w, h) * radiusRatio))
  const morph = (src, r, grow) => { const dd = chamfer(src, grow ? 1 : 0, w, h), o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = grow ? (dd[i] <= r ? 1 : 0) : (dd[i] > r ? 1 : 0); return o }
  mask = morph(morph(mask, R, false), R, true)   // opening
  mask = morph(morph(mask, R, true), R, false)   // closing
  // largest object only
  label.fill(-1)
  let best = -1, bestSize = 0
  for (let s0 = 0; s0 < n; s0++) {
    if (!mask[s0] || label[s0] >= 0) continue
    const size = flood(s0, mask, s0 + 1, false)
    if (size > bestSize) { bestSize = size; best = s0 + 1 }
  }
  if (best < 0 || bestSize < n * 0.02 || bestSize > n * 0.95) return null
  for (let i = 0; i < n; i++) mask[i] = label[i] === best ? 1 : 0
  const dM = chamfer(mask, 0, w, h)
  const f = new Float32Array(n)
  for (let i = 0; i < n; i++) f[i] = mask[i] && dM[i] > 1 ? 1 : 0
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; b[i] = (f[x > 0 ? i - 1 : i] + f[i] + f[x < w - 1 ? i + 1 : i]) / 3 }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; f[i] = (b[y > 0 ? i - w : i] + b[i] + b[y < h - 1 ? i + w : i]) / 3 }
  }
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.min(1, Math.max(0, (f[i] - 0.15) / 0.7)) * 255)
  return out
}

/**
 * Trims the soft floor shadow / backdrop-coloured skirt that a silhouette can
 * drag along at the product's foot. It differs from the product in three
 * ways: it is as colourless as the backdrop, no brighter than it (a shadow
 * only darkens), and it forms a THIN band bounded by an edge, while the
 * product's own faces are thick. So: model the backdrop as a smooth surface,
 * mark the inside pixels that match that description, keep only their thin
 * parts that touch the outline, and cut those away. Works on `alpha`
 * (0..255) in place; does nothing when it would remove an implausible share
 * of the product. `px` is the RGBA photo.
 */

/** Bounding box of the pixels that are actually visible (alpha ≥ alphaMin), or null when there are none. */
export function alphaBounds(alphaAt, w, h, alphaMin = 10) {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(x, y) < alphaMin) continue
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null
}

/** Crops a canvas to its visible content plus a small margin; returns the same canvas when there's nothing to trim. */
export function trimTransparentCanvas(canvas, { alphaMin = 10, padRatio = 0.02 } = {}) {
  const w = canvas.width, h = canvas.height
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
  const box = alphaBounds((x, y) => px[(y * w + x) * 4 + 3], w, h, alphaMin)
  if (!box) return canvas
  const pad = Math.round(Math.max(w, h) * padRatio)
  const bx = Math.max(0, box.minX - pad), by = Math.max(0, box.minY - pad)
  const bw = Math.min(w, box.maxX + pad + 1) - bx, bh = Math.min(h, box.maxY + pad + 1) - by
  if (bw >= w && bh >= h) return canvas
  const out = document.createElement('canvas')
  out.width = bw; out.height = bh
  out.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh)
  return out
}

// The photo travels inside a JSON request as a base64 data URL, and the
// server rejects bodies over ~3 MB (app.ts). A transparent PNG at working
// resolution can blow past that, which would make saving fail outright — so
// step the size down until it fits, rather than let the save break.
export const MAX_DATA_URL_CHARS = 2_300_000
export function canvasToPngWithinBudget(canvas, maxChars = MAX_DATA_URL_CHARS) {
  // PNG first (lossless). If it is over budget, try WebP-with-alpha at 0.95 (visually the same, ~5-8x smaller)
  // BEFORE resorting to shrinking the picture - shrinking is what used to make big cutouts look soft.
  // Browsers without WebP encoding (Safari) silently return PNG, which we detect by the prefix.
  const encode = (c) => {
    const png = c.toDataURL('image/png')
    if (png.length <= maxChars) return png
    const webp = c.toDataURL('image/webp', 0.95)
    return webp.startsWith('data:image/webp') && webp.length < png.length ? webp : png
  }
  let cv = canvas
  let url = encode(cv)
  while (url.length > maxChars && cv.width > 480) {
    const next = document.createElement('canvas')
    next.width = Math.round(cv.width * 0.9); next.height = Math.round(cv.height * 0.9)
    const nctx = next.getContext('2d')
    nctx.imageSmoothingQuality = 'high'
    nctx.drawImage(cv, 0, 0, next.width, next.height)
    cv = next
    url = encode(cv)
  }
  return url
}

/**
 * Removes a solid-ish background — white, black, or any other flat studio
 * colour, including a soft vignette/gradient backdrop (very common in real
 * product photography, where the corners are darker than the centre) —
 * and returns a transparent PNG data URL. Works like a "magic wand" flood
 * fill from the image's edges inward, so a patch of similar colour trapped
 * inside the product (a highlight, a label) is left alone.
 *
 * Two things make this hold up on real photos, not just perfectly flat
 * background swatches:
 *  - RELATIVE matching: each pixel is compared to the *neighbour* that just
 *    got cleared, not to one fixed reference colour. A gradient background
 *    drifts smoothly from the corner colour toward the centre; relative
 *    matching follows that drift a step at a time, where the old fixed-
 *    reference version gave up a few pixels in and left most of the
 *    background untouched.
 *  - FEATHERED edges: instead of a hard 0/255 alpha cutoff (which leaves a
 *    jagged, "cut with scissors" outline), pixels near the matching
 *    threshold get partial transparency, so the cutout edge is soft.
 * Caps the working size at 1200px for performance.
 */
export function removeWhiteBackground(src, { tolerance = 26, max = 1600, edgeGuard = 9, silhouette = true, trim = true } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * k))
        const h = Math.max(1, Math.round(img.height * k))
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h)
        const px = data.data
        const idx = (x, y) => y * w + x

        // Median of several border samples (corners + edge midpoints), so a
        // logo or glare sitting in one corner can't throw off the reference
        // colour the way a plain average would.
        const sampleAt = (x0, y0) => {
          let r = 0, g = 0, b = 0, n = 0
          for (let y = y0; y < y0 + 6 && y < h; y++) {
            for (let x = x0; x < x0 + 6 && x < w; x++) { const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++ }
          }
          return [r / n, g / n, b / n]
        }
        const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
        const samples = [
          sampleAt(0, 0), sampleAt(w - 6, 0), sampleAt(0, h - 6), sampleAt(w - 6, h - 6),
          sampleAt(Math.floor(w / 2) - 3, 0), sampleAt(Math.floor(w / 2) - 3, h - 6),
          sampleAt(0, Math.floor(h / 2) - 3), sampleAt(w - 6, Math.floor(h / 2) - 3),
        ]
        const bg = [median(samples.map((s) => s[0])), median(samples.map((s) => s[1])), median(samples.map((s) => s[2]))]

        // Soft threshold: fully kept above `hi`, fully cleared below `lo`,
        // linearly feathered in between — this is what makes edges smooth
        // instead of jagged.
        const lo = tolerance, hi = tolerance * 1.8
        const distAt = (i) => { const dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2]; return Math.sqrt((dr * dr + dg * dg + db * db) / 3) }
        const alphaFor = (d) => d >= hi ? 1 : d <= lo ? 0 : (d - lo) / (hi - lo)

        // Sobel gradient of a lightly blurred luminance: marks where the product's outline is.
        const edge = new Uint8Array(w * h)
        if (edgeGuard) {
          const L = new Float32Array(w * h)
          for (let i = 0; i < w * h; i++) L[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
          for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const i = y * w + x
            const gx = (L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1]) - (L[i - w - 1] + 2 * L[i - 1] + L[i + w - 1])
            const gy = (L[i + w - 1] + 2 * L[i + w] + L[i + w + 1]) - (L[i - w - 1] + 2 * L[i - w] + L[i - w + 1])
            if (Math.hypot(gx, gy) > edgeGuard * 4) edge[i] = 1
          }
        }
        const visited = new Uint8Array(w * h) // in the flood region (may still be partially opaque at the fringe)
        const queue = new Int32Array(w * h)
        let qLen = 0
        const tryAdd = (x, y, refD) => {
          if (x < 0 || y < 0 || x >= w || y >= h) return
          const i = idx(x, y)
          if (visited[i]) return
          const d = distAt(i * 4)
          // Relative step: allow drifting further from the *original* bg colour
          // than a fixed-reference check would, as long as each hop from an
          // already-cleared neighbour is a small, gradual change.
          // Edge guard: a strong luminance edge is the product's own outline (e.g. a white
          // casing on a white backdrop). Never flood across it, unless the pixel is truly backdrop-coloured.
          if (edge[i] && d > lo * 0.5) return
          if (d < hi + tolerance * 0.6 && Math.abs(d - refD) < tolerance * 1.1) { visited[i] = 1; queue[qLen++] = i }
        }
        for (let x = 0; x < w; x++) {
          for (const y of [0, h - 1]) { const i = idx(x, y); const d = distAt(i * 4); if (d < hi) { visited[i] = 1; queue[qLen++] = i } }
        }
        for (let y = 0; y < h; y++) {
          for (const x of [0, w - 1]) { const i = idx(x, y); const d = distAt(i * 4); if (d < hi) { visited[i] = 1; queue[qLen++] = i } }
        }
        for (let qi = 0; qi < qLen; qi++) {
          const i = queue[qi]
          const x = i % w, y = (i / w) | 0
          const refD = distAt(i * 4)
          tryAdd(x - 1, y, refD); tryAdd(x + 1, y, refD); tryAdd(x, y - 1, refD); tryAdd(x, y + 1, refD)
        }

        let clearedPixels = 0
        for (let i = 0; i < w * h; i++) {
          if (!visited[i]) continue
          const a = alphaFor(distAt(i * 4))
          px[i * 4 + 3] = Math.round(px[i * 4 + 3] * a)
          if (a < 0.5) clearedPixels++
        }
        ctx.putImageData(data, 0, 0)

        // If almost nothing was cleared (e.g. an unusually low-contrast or
        // very noisy backdrop), retry once with a looser tolerance instead
        // of silently handing back a result that looks untouched.
        const border = 2 * w + 2 * h
        if (clearedPixels < border * 0.6 && tolerance < 55) {
          resolve(removeWhiteBackground(src, { tolerance: tolerance + 16, max, edgeGuard, silhouette }))
          return
        }

        // Preferred: cut out by silhouette (keeps a white rim on a white backdrop). The flood-fill
        // result above is the fallback for the rare photo where no plausible silhouette exists.
        const dAll = new Float32Array(w * h)
        for (let i = 0; i < w * h; i++) dAll[i] = distAt(i * 4)
        let sil = silhouette ? silhouetteAlpha(dAll, w, h, { strong: Math.max(40, tolerance * 1.7) }) : null
        if (silhouette) {
          // A body almost the colour of the backdrop leaves the colour silhouette much smaller than
          // the outline silhouette (parts of the product are missing) - then the outline one wins.
          const lum = new Float32Array(w * h)
          for (let i = 0; i < w * h; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
          const alt = outlineAlpha(lum, w, h)
          if (alt) {
            const area = (al) => { let t = 0; for (let i = 0; i < al.length; i++) t += al[i]; return t }
            if (!sil || area(sil) < 0.85 * area(alt)) sil = alt
          }
        }
        if (sil) {
          for (let i = 0; i < w * h; i++) px[i * 4 + 3] = sil[i]
          // Remove the white slivers/lines the silhouette dragged in, then re-clean the edge
          // (erode the last backdrop-coloured rim, recolour from solid neighbours, soften).
          const r = Math.max(3, Math.round(Math.max(w, h) * 0.02))
          const cleared = clearBackdropSlivers(px, dAll, w, h, { maxDist: Math.max(40, tolerance * 1.8), depth: r * 3 })
          if (cleared) {
            // hard-cut cleared pixels stay at alpha 0; soften only the boundary
            cleanEdges(px, w, h, 1)
          }
          ctx.putImageData(data, 0, 0)
          resolve(canvasToPngWithinBudget(trimTransparentCanvas(c)))
          return
        }

        // Put back thin seams/highlights the flood fill leaked along inside the product.
        healThinSlits(px, w, h)
        fillThinHoles(px, w, h)

        // Soft floor shadow / white haze under the product (see clearShadowHaze).
        {
          const dist = new Float32Array(w * h), neutral = new Uint8Array(w * h)
          const bgSat = Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2])
          for (let i = 0; i < w * h; i++) {
            dist[i] = distAt(i * 4)
            const sat = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) - Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])
            neutral[i] = Math.abs(sat - bgSat) < 14 ? 1 : 0
          }
          clearShadowHaze(px, dist, neutral, w, h, { maxDist: tolerance * 2.4 })
        }

        // The cutout edge still carries a faint rim of the old background
        // (the anti-aliased pixels where product met white). On a dark card
        // that rim reads as a bright outline; clean it up before trimming.
        cleanEdges(px, w, h)
        ctx.putImageData(data, 0, 0)

        // Then trim the canvas to the product's own bounding box, so the
        // leftover empty margin doesn't shrink the product on the card.
        resolve(canvasToPngWithinBudget(trim ? trimTransparentCanvas(c) : c))
      } catch (err) {
        // Cross-origin images without CORS headers "taint" the canvas and
        // block reading pixels back out — the only case this can throw.
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('unreadable image'))
    img.src = src
  })
}

// ── Smart backdrop decision (used by "Make it look professional") ────────────

/** Median colour of the photo's border (corners + edge midpoints) as [r, g, b]; pure, takes RGBA pixels. */
export function borderBackdrop(px, w, h) {
  const at = (x0, y0) => {
    let r = 0, g = 0, b = 0, n = 0
    for (let y = y0; y < Math.min(h, y0 + 6); y++) for (let x = x0; x < Math.min(w, x0 + 6); x++) { const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++ }
    return [r / n, g / n, b / n]
  }
  const S = [at(0, 0), at(w - 6, 0), at(0, h - 6), at(w - 6, h - 6), at(Math.max(0, (w >> 1) - 3), 0), at(Math.max(0, (w >> 1) - 3), h - 6), at(0, Math.max(0, (h >> 1) - 3)), at(w - 6, Math.max(0, (h >> 1) - 3))]
  const med = (k) => { const s = S.map((v) => v[k]).sort((a, b) => a - b); return s[s.length >> 1] }
  return [med(0), med(1), med(2)]
}

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b
export const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b)
export const isLightNeutral = (r, g, b, minLuma = 170, maxChroma = 30) => luma(r, g, b) >= minLuma && chroma(r, g, b) <= maxChroma

/**
 * Should the background be kept? A cutout only looks clean when the product
 * stands out from its backdrop. A WHITE product on a white backdrop has no
 * real edge, so any cutout comes out ragged (like a child's drawing) and eats
 * the product's own white panels. We detect that case: the backdrop is light
 * AND most of the cut-out product is itself light and colourless.
 * `cutPx` = RGBA of the cutout (alpha marks the product). Pure / unit-testable.
 */
export function shouldKeepBackdrop(bg, cutPx, { minShare = 0.4 } = {}) {
  if (!isLightNeutral(bg[0], bg[1], bg[2], 165, 36)) return { keep: false, lightShare: 0, reason: 'backdrop-not-light' }
  let solid = 0, light = 0
  for (let i = 0; i < cutPx.length; i += 4) {
    if (cutPx[i + 3] < 200) continue
    solid++
    if (isLightNeutral(cutPx[i], cutPx[i + 1], cutPx[i + 2])) light++
  }
  if (solid < 50) return { keep: true, lightShare: 0, reason: 'cutout-failed' } // nothing sensible was cut out
  const lightShare = light / solid
  return { keep: lightShare >= minShare, lightShare, reason: lightShare >= minShare ? 'light-product' : 'contrasting-product' }
}

/** Makes a light, slightly grey/tinted backdrop read as clean white by a gentle per-channel gain (capped, so product detail isn't blown out). */
export async function whitenBackdrop(src, { maxGain = 1.12 } = {}) {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height), px = data.data
  const bg = borderBackdrop(px, c.width, c.height)
  const gain = bg.map((v) => Math.min(maxGain, 255 / Math.max(v, 1)))
  for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.min(255, px[i + ch] * gain[ch])
  ctx.putImageData(data, 0, 0)
  return exportCanvas(c, src)
}

/**
 * Chooses between a transparent cutout and a clean white backdrop, per photo.
 * Returns { url, mode: 'removed' | 'kept-white' }. Throws when the photo can't
 * be read (cross-origin), like removeWhiteBackground.
 */
export async function smartBackdrop(src) {
  const cut = await removeWhiteBackground(src)
  const analyse = async () => {
    const [orig, cutImg] = await Promise.all([loadImage(src), loadImage(cut)])
    const k = Math.min(1, 260 / Math.max(orig.width, orig.height))
    const w = Math.max(8, Math.round(orig.width * k)), h = Math.max(8, Math.round(orig.height * k))
    const read = (im, cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, cw, ch); return x.getImageData(0, 0, cw, ch).data }
    const bg = borderBackdrop(read(orig, w, h), w, h)
    const cw = Math.max(8, Math.round(cutImg.width * Math.min(1, 260 / Math.max(cutImg.width, cutImg.height)))), ch = Math.max(8, Math.round(cutImg.height * (cw / cutImg.width)))
    return shouldKeepBackdrop(bg, read(cutImg, cw, ch))
  }
  let verdict
  try { verdict = await analyse() } catch { return { url: cut, mode: 'removed' } }
  if (!verdict.keep) return { url: cut, mode: 'removed' }
  return { url: await whitenBackdrop(src), mode: 'kept-white' }
}
