/**
 * Final clean-up of a cutout's alpha channel (pure functions on an RGBA Uint8ClampedArray, no DOM).
 *
 * Why: the cutout keeps the user's own RGB (so a white product on a white photo has white pixels) and only the
 * model's alpha decides what is visible. On the dark product card any leftover faint alpha therefore shows up as
 * white "dust" around the product, and thin white fringes appear on the edges. This pass:
 *   1. hardenAlpha  - kills the faint haze (alpha < lo -> 0) and makes almost-opaque pixels fully opaque;
 *   2. removeSpecks - deletes small disconnected islands (dust, stray dots) but keeps every real part
 *                     of the product (the syringe next to the box is far bigger than any speck);
 *   3. tightenEdge  - pulls the silhouette in by ~1px and re-softens it so no white halo is left.
 */

export function hardenAlpha(d, w, h, lo = 48, hi = 232) {
  const span = hi - lo
  for (let p = 0, n = w * h; p < n; p++) {
    const i = p * 4 + 3, a = d[i]
    d[i] = a <= lo ? 0 : a >= hi ? 255 : Math.round(((a - lo) / span) * 255)
  }
}

/** Removes connected islands (alpha > 12) whose area is below `minRatio` of the largest island (and < minAbs px). */
export function removeSpecks(d, w, h, { minRatio = 0.015, minAbs = 40 } = {}) {
  const n = w * h
  const label = new Int32Array(n) // 0 = unvisited / transparent
  const areas = [0]
  const stack = new Int32Array(n)
  let count = 0
  for (let s = 0; s < n; s++) {
    if (label[s] || d[s * 4 + 3] <= 12) continue
    count++
    let sp = 0, area = 0
    stack[sp++] = s; label[s] = count
    while (sp) {
      const p = stack[--sp]; area++
      const x = p % w, y = (p - x) / w
      if (x > 0 && !label[p - 1] && d[(p - 1) * 4 + 3] > 12) { label[p - 1] = count; stack[sp++] = p - 1 }
      if (x < w - 1 && !label[p + 1] && d[(p + 1) * 4 + 3] > 12) { label[p + 1] = count; stack[sp++] = p + 1 }
      if (y > 0 && !label[p - w] && d[(p - w) * 4 + 3] > 12) { label[p - w] = count; stack[sp++] = p - w }
      if (y < h - 1 && !label[p + w] && d[(p + w) * 4 + 3] > 12) { label[p + w] = count; stack[sp++] = p + w }
    }
    areas.push(area)
  }
  if (!count) return 0
  const largest = Math.max(...areas)
  const limit = Math.max(minAbs, largest * minRatio)
  let removed = 0
  for (let p = 0; p < n; p++) {
    const l = label[p]
    if (l && areas[l] < limit) { d[p * 4 + 3] = 0; removed++ }
  }
  return removed
}

/** Shrinks the silhouette by `px` pixels (min filter) then softens the new edge with a light blur. */
export function tightenEdge(d, w, h, px = 1) {
  const n = w * h
  let a = new Uint8Array(n)
  for (let p = 0; p < n; p++) a[p] = d[p * 4 + 3]
  for (let it = 0; it < px; it++) {
    const b = new Uint8Array(n)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 255
      for (let dy = -1; dy <= 1 && m; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) { m = 0; break }
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) { m = 0; break }
          const v = a[yy * w + xx]; if (v < m) m = v
        }
      }
      b[y * w + x] = m
    }
    a = b
  }
  // soften: 3x3 mean, but only on pixels at the silhouette edge, so flat opaque areas are untouched
  const out = new Uint8Array(a)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x
    const c = a[p]
    if (c === 255 && a[p - 1] === 255 && a[p + 1] === 255 && a[p - w] === 255 && a[p + w] === 255) continue
    if (c === 0 && a[p - 1] === 0 && a[p + 1] === 0 && a[p - w] === 0 && a[p + w] === 0) continue
    out[p] = Math.round((a[p - w - 1] + a[p - w] + a[p - w + 1] + a[p - 1] + c + a[p + 1] + a[p + w - 1] + a[p + w] + a[p + w + 1]) / 9)
  }
  for (let p = 0; p < n; p++) d[p * 4 + 3] = out[p]
}

/** Full clean-up, in the right order. Returns the number of removed speck pixels (for tests/logging). */
export function cleanCutout(d, w, h) {
  hardenAlpha(d, w, h)
  const removed = removeSpecks(d, w, h)
  tightenEdge(d, w, h, 1)
  return removed
}
