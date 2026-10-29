// Pure pixel helpers (no DOM) used by aiCutoutClassic.js:
//  - findViews():   splits a "collage" (several views of the product on one backdrop) into separate boxes
//  - recoverLost(): gives back the parts of the product the AI model wrongly erased (cables, side pieces…)
//  - closeAlphaGaps(): fills small notches/holes in the alpha silhouette by shape alone (dilate then
//    erode by the same radius) — for spots where the product is too close in colour to the backdrop
//    for any contrast-based test to help (a white device on a white background).
// All functions take RGBA Uint8ClampedArray data, as returned by getImageData().

const dist = (d, i, bg) => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]))

/** Backdrop colour = per-channel median of the image border. */
export function estimateBackground(d, w, h) {
  const rs = [], gs = [], bs = []
  const step = Math.max(1, Math.floor(Math.max(w, h) / 200))
  const push = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] < 128) return; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]) }
  for (let x = 0; x < w; x += step) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y += step) { push(0, y); push(w - 1, y) }
  if (!rs.length) return [255, 255, 255]
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1] }
  return [med(rs), med(gs), med(bs)]
}

/**
 * Restores product pixels the model erased. A pixel comes back when it is (1) transparent in the cutout,
 * (2) clearly different from the backdrop colour, and (3) reachable from the kept product through such
 * pixels within `reachRatio` of the image size. Edits `cut` in place. Returns the count restored.
 *
 * Cast shadows sit almost only BELOW the object and fade out smoothly, so they read as "different from
 * the backdrop" too and would otherwise come back along with genuine dropped parts (a cable, a side
 * piece). To tell them apart, each kept blob's own bottom edge is tracked, and pixels reached going
 * downward past that edge need a much stronger contrast (`thr * belowFactor`) to be restored than pixels
 * reached sideways or upward (`thr`) — a soft shadow rarely clears that bar, a real part usually does.
 */
export function recoverLost(orig, cut, w, h, bg, { thr = 36, reachRatio = 0.05, belowFactor = 2.2, margin = 2 } = {}) {
  const n = w * h, reach = Math.max(2, Math.round(reachRatio * Math.max(w, h)))
  const kept = (p) => cut[p * 4 + 3] >= 128

  // Label connected components of the kept mask, and record each one's bottom row.
  const compId = new Int32Array(n).fill(-1), compBottom = []
  const stack0 = new Int32Array(n)
  for (let p0 = 0; p0 < n; p0++) {
    if (!kept(p0) || compId[p0] !== -1) continue
    const id = compBottom.length
    let sp = 0; stack0[sp++] = p0; compId[p0] = id
    let maxY = (p0 / w) | 0
    while (sp) {
      const p = stack0[--sp], x = p % w, y = (p / w) | 0
      if (y > maxY) maxY = y
      const nb = [p - 1, p + 1, p - w, p + w]
      for (const q of nb) {
        if (q < 0 || q >= n) continue
        if (x === 0 && q === p - 1) continue
        if (x === w - 1 && q === p + 1) continue
        if (kept(q) && compId[q] === -1) { compId[q] = id; stack0[sp++] = q }
      }
    }
    compBottom.push(maxY)
  }

  const colBottom = new Int32Array(w).fill(-1)
  for (let p = 0; p < n; p++) if (kept(p)) { const x = p % w, y = (p / w) | 0; if (y > colBottom[x]) colBottom[x] = y }
  // columns with no kept pixel: borrow the nearest column's bottom so they behave sensibly
  for (let x = 1; x < w; x++) if (colBottom[x] < 0) colBottom[x] = colBottom[x - 1]
  for (let x = w - 2; x >= 0; x--) if (colBottom[x] < 0) colBottom[x] = colBottom[x + 1]
  const depth = new Int16Array(n).fill(-1), owner = new Int32Array(n).fill(-1), queue = new Int32Array(n)
  let qh = 0, qt = 0
  for (let p = 0; p < n; p++) {
    if (!kept(p)) continue
    const x = p % w, y = (p / w) | 0
    if ((x > 0 && !kept(p - 1)) || (x < w - 1 && !kept(p + 1)) || (y > 0 && !kept(p - w)) || (y < h - 1 && !kept(p + w))) {
      depth[p] = 0; owner[p] = compId[p]; queue[qt++] = p
    }
  }
  let restored = 0
  const visit = (q, dp, comp) => {
    if (depth[q] !== -1 || kept(q)) return
    const y = (q / w) | 0
    // per-COLUMN bottom edge: a slanted product has a shadow under its high side that is still
    // above the blob's overall lowest row, so a single per-blob bottom let that shadow come back.
    const limit = y > colBottom[q % w] + margin ? thr * belowFactor : thr
    if (dist(orig, q * 4, bg) <= limit) return
    depth[q] = dp + 1; owner[q] = comp; queue[qt++] = q
    cut[q * 4] = orig[q * 4]; cut[q * 4 + 1] = orig[q * 4 + 1]; cut[q * 4 + 2] = orig[q * 4 + 2]
    cut[q * 4 + 3] = Math.min(255, 160 + ((dist(orig, q * 4, bg) - thr) / thr) * 95)
    restored++
  }
  while (qh < qt) {
    const p = queue[qh++], dp = depth[p], comp = owner[p]
    if (dp >= reach) continue
    const x = p % w, y = (p / w) | 0
    if (x > 0) visit(p - 1, dp, comp); if (x < w - 1) visit(p + 1, dp, comp)
    if (y > 0) visit(p - w, dp, comp); if (y < h - 1) visit(p + w, dp, comp)
  }
  return restored
}

/**
 * Fills small notches and holes in the alpha silhouette using shape alone — no colour test at all.
 * This is what fixes a corner/edge of a WHITE product on a WHITE backdrop that `recoverLost` cannot:
 * when the missing area is barely different from the background in colour, no contrast threshold can
 * tell them apart, but the *shape* of a real product edge is a smooth, convex-ish boundary, so a small
 * concave notch cut into it is almost certainly a segmentation mistake, not a real feature.
 *
 * Standard morphological "closing": dilate the kept mask by `radius`, then erode the result by the
 * same `radius`. Dilating bridges the notch; eroding shrinks the outer boundary back down to where it
 * was, so (unlike a plain dilate) this does not fatten the whole silhouette — it only fills concavities
 * and holes smaller than ~2×radius. Runs in O(w·h) regardless of radius (sliding-window max/min).
 *
 * Returns a new Uint8Array mask (0 or 255), the same size as `alpha`. Caller decides how to use it
 * (typically: restore original pixels wherever this mask is 255 but the cutout's alpha was low).
 */

export function closeAlphaGaps(alpha, w, h, radius) {
  radius = Math.min(radius, 6) // hard cap: closing must only bridge fine notches, never balloon the silhouette
  if (radius <= 0) return Uint8Array.from(alpha, (a) => (a >= 128 ? 255 : 0))
  const bin = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) bin[i] = alpha[i] >= 128 ? 1 : 0
  const dilated = slidingMinMax(bin, w, h, radius, true)
  const closed = slidingMinMax(dilated, w, h, radius, false)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = closed[i] ? 255 : 0
  return out
}

/** Sliding-window max (isMax=true) or min filter, radius `r`, separable (horizontal then vertical). */
function slidingMinMax(src, w, h, r, isMax) {
  const cmp = isMax ? (a, b) => a <= b : (a, b) => a >= b
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    const dq = new Int32Array(w + 1); let dh = 0, dt = 0
    for (let x = 0; x < w + r; x++) {
      if (x < w) {
        const v = src[row + x]
        while (dt > dh && cmp(src[row + dq[dt - 1]], v)) dt--
        dq[dt++] = x
      }
      while (dt > dh && dq[dh] <= x - (2 * r + 1)) dh++
      const c = x - r
      if (c >= 0 && c < w) tmp[row + c] = src[row + dq[dh]]
    }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) {
    const dq = new Int32Array(h + 1); let dh = 0, dt = 0
    for (let y = 0; y < h + r; y++) {
      if (y < h) {
        const v = tmp[y * w + x]
        while (dt > dh && cmp(tmp[dq[dt - 1] * w + x], v)) dt--
        dq[dt++] = y
      }
      while (dt > dh && dq[dh] <= y - (2 * r + 1)) dh++
      const c = y - r
      if (c >= 0 && c < h) out[c * w + x] = tmp[dq[dh] * w + x]
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 *  refineAlpha / finishEdges  — CONSERVATIVE alpha clean-up
 * ------------------------------------------------------------------ *
 * The alpha comes from the AI model (RMBG 2.0 / IMG.LY); the RGB always stays the
 * user's original photo. None of these functions looks at "how white/bright" a pixel is,
 * and none of them erodes the silhouette, so a white device on a white backdrop keeps all
 * of its panels, edges, cables and small parts.
 */

