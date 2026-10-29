// Shared by the studio, the dashboard gallery and the public Services page so
// a product's cover image is framed identically everywhere it appears.
//
// fit: 'contain' always shows the whole photo, untouched, letterboxed — the
// safe choice when photos come in very different sizes/aspect ratios, since
// nothing of the product or its label can be cropped out. 'cover' (default)
// fills the frame and crops, using the zoom/focus the person chose.
export function imageFrameStyle({ imageUrl, imageFit = 'cover', imageZoom = 100, imageFocusX = 50, imageFocusY = 50 } = {}) {
  if (!imageUrl) return {}
  const base = { backgroundImage: `url(${JSON.stringify(imageUrl)})`, backgroundRepeat: 'no-repeat' }
  return imageFit === 'contain'
    ? { ...base, backgroundSize: 'contain', backgroundPosition: 'center' }
    : { ...base, backgroundSize: `${imageZoom}%`, backgroundPosition: `${imageFocusX}% ${imageFocusY}%` }
}

export function isContainFit(product = {}) {
  return product.imageFit === 'contain'
}

// The real on-page image area of each placement has a different shape (a
// wide card thumbnail vs. the near-square Featured panel) — used by the
// studio's framing editor and by pickFit below, so both reason about the
// same shapes.
export const ZONE_ASPECT = { FEATURED: 1.13, SPONSORED: 1.36, RECOMMENDED: 1.76, STANDARD: 1.76 }

/**
 * How far a photo's own aspect ratio is from a placement's shape, as a 0–1
 * fraction: the share of one dimension that would be lost to cropping in
 * 'cover' mode, or left as empty margin in 'contain' mode — the two are the
 * same geometry, just which side gives way. Shared by pickFit (crop-safety)
 * and pickAccentColor (how much backdrop will actually be visible).
 */
export function shapeMismatch(imageAspect, zone) {
  const target = ZONE_ASPECT[zone] ?? ZONE_ASPECT.RECOMMENDED
  if (!imageAspect || !Number.isFinite(imageAspect)) return 1
  const r = imageAspect / target
  return 1 - Math.min(r, 1 / r)
}

/**
 * Decides whether a photo should be cropped to fill a placement ('cover') or
 * shown whole ('contain'), based on how close the photo's own aspect ratio is
 * to that placement's shape — not a fixed choice.
 *
 * The photo reaching this function has normally already been trimmed to the
 * product's own bounding box (see removeWhiteBackground in lib/image.js), so
 * there is no empty margin left to safely crop into — every pixel at the
 * edges is real product or label. `maxCropped` therefore stays tight: it's
 * the largest fraction of one dimension we're willing to trim before
 * switching to 'contain', not a generous "close enough" allowance.
 */
export function pickFit(imageAspect, zone, maxCropped = 0.08) {
  return shapeMismatch(imageAspect, zone) <= maxCropped ? 'cover' : 'contain'
}

/**
 * With no backdrop mat (the default — see the "Backdrop colour" picker) there
 * is no frame for the photo to sit inside, so it doesn't need the wide
 * breathing margin that a coloured mat calls for: let the product use almost
 * the whole card. With a mat chosen, the default inset stays.
 */
export const fgInset = (product = {}) =>
  (!product.imageAccent || product.imageAccent === 'transparent' ? { inset: '2%' } : undefined)
