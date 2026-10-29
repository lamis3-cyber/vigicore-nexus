import { canvasToPngWithinBudget, trimTransparentCanvas, loadImage } from './image.js'
import { estimateBackground, recoverLost, closeAlphaGaps } from './cutoutRecover.js'
import { hardenAlpha, removeSpecks, cleanCutout } from './cutoutClean.js'

/**
 * Classic cutout engine — the pipeline of the build where "Make it look professional" /
 * "Remove white background" gave the good result (aiCutout.working-0.07.js):
 *
 *   original photo -> IMG.LY 'medium' model (on the device, no cloud call)
 *   -> AI ALPHA only, RGB always taken from the user's own photo
 *   -> pass 1: colour-contrast recovery of parts the model erased (cables, side pieces)
 *   -> pass 2: shape closing for notches in the silhouette
 *   -> transparent PNG trimmed to the product.
 *
 * Crash fix: the 'medium' model (~88 MB) can run the browser tab out of memory (Edge: "This page is
 * having a problem"), so this version uses the 'small' model (~44 MB, the one the app was designed for),
 * works on a smaller canvas, frees its canvases as soon as it is done and never runs two cutouts at
 * the same time (a double click used to load the model twice).
 *
 * Public API: removeBackgroundAI, cutoutStore, warmUpCutout, preloadCutoutModel.
 * Model + wasm are self-hosted in /public/imgly (see scripts/copy-bg-model.mjs) because the site CSP
 * only allows same-origin requests.
 */
const CONFIG = {
  publicPath: `${window.location.origin}/imgly/`,
  model: 'small', // 'medium' is sharper but ~2x the memory and crashes low-RAM machines
  output: { format: 'image/png' },
}

// Last cutout produced, keyed by its final (trimmed) url. ProductStudio reads this to feed the eraser:
// `full` is the untrimmed cutout (same pixel grid as `orig`), `orig` is the original photo, so
// 'Restore' in the eraser can bring back exactly the pixels the AI/recovery dropped.
export const cutoutStore = { last: null }

let modulePromise = null
const load = () => (modulePromise ??= import('@imgly/background-removal').catch((e) => { modulePromise = null; throw e }))

/** Same as preloadCutoutModel() but returns a promise (never rejects); ProductStudio calls this name. */
export function warmUpCutout() {
  return load().then(() => true, () => false)
}

const WORK_MAX = 1000 // long side of the working canvas (was 1200): ~30% less memory for the pixel arrays

/** Releases a canvas' backing store right away instead of waiting for the garbage collector. */
function freeCanvas(c) { if (c) { c.width = 0; c.height = 0 } }

// One cutout at a time: a second call waits for the first instead of loading a second model copy.
let queue = Promise.resolve()

function blobToCanvas(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url); resolve(c)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable cutout')) }
    img.src = url
  })
}

const canvasToBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'))

/** Draws `img` into a fresh canvas capped to `max` on the long side. */
function drawFrom(img, max) {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height)
  return c
}

/**
 * AI cutout: segments the product by shape (not colour), so white products on white backdrops come
 * out clean. Returns a transparent PNG data URL trimmed to the product, and stashes the untrimmed
 * version + original photo in `cutoutStore.last` for the eraser's 'Restore' tool. Throws if the model
 * can't load or run; callers fall back to removeWhiteBackground.
 * `onProgress(0..1)` is optional (first run downloads the model).
 */
export function removeBackgroundAI(src, onProgress) {
  const run = queue.then(() => cutout(src, onProgress))
  queue = run.catch(() => {}) // a failed cutout must not block the next one
  return run
}

async function cutout(src, onProgress) {
  const mod = await load()

  // Work at a size that's good enough for the final asset; the model only "sees" ~1024px anyway.
  // The source image is decoded once, both canvases are derived from it.
  const srcImg = await loadImage(src)
  const workCanvas = drawFrom(srcImg, WORK_MAX)
  const w = workCanvas.width, h = workCanvas.height
  const orig = workCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data

  const inputCanvas = drawFrom(srcImg, 1024)
  const modelInput = await canvasToBlob(inputCanvas)
  freeCanvas(inputCanvas)
  const blob = await mod.removeBackground(modelInput, {
    ...CONFIG,
    device: 'cpu', // the self-hosted wasm has no WebGPU (jsep) build
    progress: onProgress ? (key, cur, total) => { if (total) onProgress(Math.min(1, cur / total)) } : undefined,
  })
  const aiCanvas = await blobToCanvas(blob)

  // Upscale the AI's alpha onto the full working canvas; RGB is ALWAYS the user's own photo
  // (no colour halo from the model's output).
  const cutCanvas = document.createElement('canvas'); cutCanvas.width = w; cutCanvas.height = h
  const cctx = cutCanvas.getContext('2d', { willReadFrequently: true })
  cctx.imageSmoothingEnabled = true; cctx.imageSmoothingQuality = 'high'
  cctx.drawImage(aiCanvas, 0, 0, w, h)
  freeCanvas(aiCanvas)
  const cutData = cctx.getImageData(0, 0, w, h)
  for (let i = 0; i < cutData.data.length; i += 4) {
    cutData.data[i] = orig[i]; cutData.data[i + 1] = orig[i + 1]; cutData.data[i + 2] = orig[i + 2]
  }

  // Clean the model's alpha BEFORE recovery: no faint haze, no dust islands that the shape-closing below
  // could otherwise glue onto the product.
  hardenAlpha(cutData.data, w, h)
  removeSpecks(cutData.data, w, h)

  // Restore product pixels the model wrongly erased (cables, side pieces, a second view in a collage…),
  // using the ORIGINAL photo as the source of truth.
  const bg = estimateBackground(orig, w, h)
  // Pass 1: contrast-based recovery - parts that ARE visibly different from the backdrop.
  recoverLost(orig, cutData.data, w, h, bg, { thr: 30, reachRatio: 0.08, belowFactor: 1.8, margin: 3 })

  // Pass 2: shape-based recovery (no colour test) - fixes notches/holes in the silhouette where the
  // missing area is nearly the same colour as the backdrop (a white device on a white background).
  const alphaArr = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) alphaArr[p] = cutData.data[p * 4 + 3]
  const closeRadius = Math.max(18, Math.round(Math.min(w, h) * 0.07))
  const closedMask = closeAlphaGaps(alphaArr, w, h, closeRadius)
  for (let p = 0; p < w * h; p++) {
    if (closedMask[p] && cutData.data[p * 4 + 3] < 200) {
      const i = p * 4
      cutData.data[i] = orig[i]; cutData.data[i + 1] = orig[i + 1]; cutData.data[i + 2] = orig[i + 2]
      cutData.data[i + 3] = 255
    }
  }
  // Final pass: drop leftover specks and pull the edge in ~1px so no white fringe/dust shows on the dark card.
  cleanCutout(cutData.data, w, h)
  cctx.putImageData(cutData, 0, 0)

  // JPEG for the plain photo (no transparency needed): much faster to encode; PNG only for the cutout.
  const origDataUrl = workCanvas.toDataURL('image/jpeg', 0.92)
  const fullDataUrl = cutCanvas.toDataURL('image/png')
  const trimmed = trimTransparentCanvas(cutCanvas)
  const trimmedUrl = canvasToPngWithinBudget(trimmed)
  if (trimmed !== cutCanvas) freeCanvas(trimmed)
  freeCanvas(cutCanvas); freeCanvas(workCanvas)

  cutoutStore.last = { url: trimmedUrl, full: fullDataUrl, orig: origDataUrl, source: 'local', notice: null }
  return trimmedUrl
}
