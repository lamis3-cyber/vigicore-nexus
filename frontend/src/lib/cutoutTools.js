// Pure pixel helpers (no DOM) used by ImageEraser.jsx (manual cutout tools).
// Every function edits an RGBA Uint8ClampedArray in place.

/**
 * Removes the WHITE backdrop rim that survives around the silhouette (thin white outline, white corner
 * triangles, white specks on the top edge) after the mask + rescuePaleParts().
 *
 * How it stays safe for the product:
 *  - it only starts from pixels that touch the transparent outside and only walks INWARD through
 *    near-white, low-saturation pixels; the first coloured/dark pixel (teal border, print, bars) stops it,
 *    so the barcode / QR strip, the UPSA panel and every letter stay untouched;
 *  - depth is capped (a few px), so a white area that is really inside the product is never reached;
 *  - if the product itself is white (most of its rim is white) the whole step is skipped.
 */
export function peelWhiteRim(data, w, h, opts = {}) {
  const n = w * h
  const isWhite = (i, lumMin, satMax) => {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    return 0.299 * r + 0.587 * g + 0.114 * b >= lumMin && mx - mn <= satMax
  }
  // bbox of the product -> depth scale
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= 128) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  if (x1 < 0) return { peeled: 0, skipped: 'empty' }
  const minDim = Math.min(x1 - x0 + 1, y1 - y0 + 1)
  const maxDepth = opts.maxDepth ?? Math.max(4, Math.min(14, Math.round(minDim * 0.03)))
  const LUM = opts.lum ?? 205, SAT = opts.sat ?? 42

  const solid = (p) => data[p * 4 + 3] >= 128
  const N4 = (p, x, y, cb) => {
    if (x > 0) cb(p - 1, x - 1, y); if (x < w - 1) cb(p + 1, x + 1, y)
    if (y > 0) cb(p - w, x, y - 1); if (y < h - 1) cb(p + w, x, y + 1)
  }

  // White-product guard #1: share of the WHOLE product that is near-white. A white/light device
  // (or box) has 40-50 %; a coloured box with a few white panels/letters stays around 10-15 %.
  let solidN = 0, whiteN = 0
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] >= 128) { solidN++; if (isWhite(p * 4, LUM, SAT)) whiteN++ }
  if (!opts.force && solidN && whiteN / solidN > (opts.maxWhiteShare ?? 0.25)) return { peeled: 0, skipped: 'white-product', areaShare: whiteN / solidN }

  // Seeds = solid pixels touching the outside. White-product guard: how much of that rim is white?
  let rim = 0, rimWhite = 0
  const seeds = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (!solid(p)) continue
    let touch = x === 0 || y === 0 || x === w - 1 || y === h - 1
    if (!touch) N4(p, x, y, (q) => { if (!solid(q)) touch = true })
    if (!touch) continue
    rim++
    if (isWhite(p * 4, LUM, SAT)) { rimWhite++; seeds.push(p) }
  }
  if (!rim) return { peeled: 0, skipped: 'norim' }
  if (!opts.force && rimWhite / rim > 0.35) return { peeled: 0, skipped: 'white-product', share: rimWhite / rim }

  // Geodesic peel: BFS inward through near-white pixels, at most maxDepth steps.
  const depth = new Int16Array(n).fill(-1)
  let frontier = []
  for (const p of seeds) { depth[p] = 0; frontier.push(p) }
  const kill = [...seeds]
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = []
    for (const p of frontier) {
      const x = p % w, y = (p / w) | 0
      N4(p, x, y, (q) => {
        if (depth[q] >= 0 || !solid(q)) return
        if (!isWhite(q * 4, LUM, SAT)) return
        depth[q] = d; next.push(q); kill.push(q)
      })
    }
    frontier = next
  }
  for (const p of kill) data[p * 4 + 3] = 0

  // Second, gentler pass: 2 px of light, low-saturation fringe (white blended with the print) next to the cut.
  let fringe = 0
  for (let pass = 0; pass < 2; pass++) {
    const add = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!solid(p)) continue
      let touch = x === 0 || y === 0 || x === w - 1 || y === h - 1
      if (!touch) N4(p, x, y, (q) => { if (!solid(q)) touch = true })
      if (touch && isWhite(p * 4, 165, 80)) add.push(p)
    }
    for (const p of add) data[p * 4 + 3] = 0
    fringe += add.length
  }
  return { peeled: kill.length, fringe, maxDepth, share: rimWhite / rim }
}

/**
 * Alpha-aware, halo-safe unsharp mask. Only touches the RGB of solid product pixels:
 *  - the blur is weighted by alpha, so the (transparent) backdrop never leaks colour into the edge;
 *  - a small threshold leaves flat areas / JPEG noise alone;
 *  - the result is clamped to the local 3x3 min/max (+margin), so no white/dark ringing around text or edges.
 */
export function sharpenCutout(data, w, h, opts = {}) {
  const n = w * h
  const sigma = opts.sigma ?? Math.max(0.7, Math.min(1.6, Math.max(w, h) / 1100))
  const amount = opts.amount ?? 0.7
  const thr = opts.threshold ?? 3
  const margin = opts.margin ?? 6
  const r = Math.max(1, Math.ceil(sigma * 2.5))
  const k = new Float32Array(2 * r + 1); let ks = 0
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); ks += k[i + r] }
  for (let i = 0; i < k.length; i++) k[i] /= ks

  // planes: premultiplied R,G,B + weight (alpha)
  const P = [0, 1, 2, 3].map(() => new Float32Array(n))
  for (let p = 0; p < n; p++) {
    const a = data[p * 4 + 3] / 255
    P[0][p] = data[p * 4] * a; P[1][p] = data[p * 4 + 1] * a; P[2][p] = data[p * 4 + 2] * a; P[3][p] = a
  }
  const tmp = new Float32Array(n)
  const blur = (src) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0
      for (let i = -r; i <= r; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); s += src[y * w + xx] * k[i + r] }
      tmp[y * w + x] = s
    }
    const out = new Float32Array(n)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0
      for (let i = -r; i <= r; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); s += tmp[yy * w + x] * k[i + r] }
      out[y * w + x] = s
    }
    return out
  }
  const B = P.map(blur)

  const src = new Uint8ClampedArray(data) // untouched copy for the 3x3 clamp
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4
    if (src[i + 3] < 128 || B[3][p] < 0.05) continue
    for (let c = 0; c < 3; c++) {
      const blurred = B[c][p] / B[3][p]
      const d = src[i + c] - blurred
      const mag = Math.abs(d)
      if (mag < thr) continue
      let v = src[i + c] + amount * (mag - thr) * Math.sign(d)
      // local clamp (solid neighbours only)
      let lo = 255, hi = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const j = (yy * w + xx) * 4
        if (src[j + 3] < 128) continue
        const t = src[j + c]; if (t < lo) lo = t; if (t > hi) hi = t
      }
      data[i + c] = Math.max(lo - margin, Math.min(hi + margin, v))
    }
  }
}

/** Grow (px > 0) or shrink (px < 0) the silhouette by |px| pixels. New pixels take the colour of the nearest product pixel. */
export function growShrinkAlpha(data, w, h, px) {
  const steps = Math.min(24, Math.abs(Math.round(px)))
  if (!steps) return
  const grow = px > 0, n = w * h
  let a = new Uint8Array(n), rgb = new Uint8Array(n * 3)
  for (let p = 0; p < n; p++) { a[p] = data[p * 4 + 3]; rgb[p * 3] = data[p * 4]; rgb[p * 3 + 1] = data[p * 4 + 1]; rgb[p * 3 + 2] = data[p * 4 + 2] }
  for (let s = 0; s < steps; s++) {
    const diag = s % 2 === 1 // alternate cross / square so the result stays round, not boxy
    const na = new Uint8Array(n), nrgb = new Uint8Array(rgb)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x
      let best = a[p], bp = p
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        if (!diag && dx && dy) continue
        const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy))
        const q = yy * w + xx, v = a[q]
        if (grow ? v > best : v < best) { best = v; bp = q }
      }
      na[p] = best
      if (grow && bp !== p && a[p] < best) { nrgb[p * 3] = rgb[bp * 3]; nrgb[p * 3 + 1] = rgb[bp * 3 + 1]; nrgb[p * 3 + 2] = rgb[bp * 3 + 2] }
    }
    a = na; rgb = nrgb
  }
  for (let p = 0; p < n; p++) { data[p * 4 + 3] = a[p]; if (grow) { data[p * 4] = rgb[p * 3]; data[p * 4 + 1] = rgb[p * 3 + 1]; data[p * 4 + 2] = rgb[p * 3 + 2] } }
}

/** Feather the edge INWARD (the outer silhouette stays where it is): alpha = min(alpha, blurred alpha). */
export function softenAlpha(data, w, h, sigma) {
  if (!(sigma > 0)) return
  const n = w * h, r = Math.max(1, Math.ceil(sigma * 2.5))
  const k = new Float32Array(2 * r + 1); let ks = 0
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); ks += k[i + r] }
  for (let i = 0; i < k.length; i++) k[i] /= ks
  const src = new Float32Array(n), tmp = new Float32Array(n), out = new Float32Array(n)
  for (let p = 0; p < n; p++) src[p] = data[p * 4 + 3]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r]; tmp[y * w + x] = s }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r]; out[y * w + x] = s }
  for (let p = 0; p < n; p++) data[p * 4 + 3] = Math.round(Math.min(src[p], out[p]))
}

/** Brightness / contrast / saturation (each -100..100, same maths as the CSS filters used for the live preview). */
export function adjustLook(data, { brightness = 0, contrast = 0, saturation = 0 } = {}) {
  if (!brightness && !contrast && !saturation) return
  const b = 1 + brightness / 100, c = 1 + contrast / 100, s = 1 + saturation / 100
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue
    let r = data[i] * b, g = data[i + 1] * b, bl = data[i + 2] * b
    r = (r - 127.5) * c + 127.5; g = (g - 127.5) * c + 127.5; bl = (bl - 127.5) * c + 127.5
    const gray = 0.299 * r + 0.587 * g + 0.114 * bl
    data[i] = gray + (r - gray) * s; data[i + 1] = gray + (g - gray) * s; data[i + 2] = gray + (bl - gray) * s
  }
}
