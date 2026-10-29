// Scale the dense sections so their whole content is visible in one screen.
//
// Each target is a section whose inner wrapper may be taller than the space
// under the navbar. We measure it at natural size and apply CSS `zoom` (a real
// layout scale: the section really gets shorter, unlike transform) so it fits.
// The scale is never below FLOOR, so text stays readable; below that the user
// just scrolls a little. To fit another section, add a line to TARGETS.
const TARGETS = [
  { section: '#zoom-section', inner: '.wim-inner' },
  { section: '.actors-section', inner: '.section-content' },
  { section: '#features', inner: '.section-content' },
  { section: '#contact-form', inner: '.section-content' }, // "Request a demo" letter
]
const NAVBAR = 56 // px kept free at the top (fixed navbar)
const GAP = 10    // breathing room at the bottom
const FLOOR = 0.62
const MIN_WIDTH = 901 // below this the layout is the stacked mobile one: never scale

const scroller = () =>
  document.body.scrollHeight > document.body.clientHeight + 1 ? document.body : (document.scrollingElement || document.documentElement)

function fit() {
  const sc = scroller()
  const keep = sc.scrollTop
  run()
  // zoom flips change heights above the viewport: put the page back exactly where it was
  if (Math.abs(sc.scrollTop - keep) > 0.5) {
    const prev = sc.style.scrollBehavior
    sc.style.scrollBehavior = 'auto'
    sc.scrollTop = keep
    sc.style.scrollBehavior = prev
  }
}

function run() {
  const wide = window.innerWidth >= MIN_WIDTH
  for (const t of TARGETS) {
    const sec = document.querySelector(t.section)
    const el = sec && sec.querySelector(t.inner)
    if (!el) continue
    el.style.zoom = ''
    if (!wide) continue
    // The section may have its own padding around the inner wrapper: that space
    // is not available to the content (it used to be ignored, so the bottom of
    // the section — the caption under the cards — was cut off on short screens).
    const cs = getComputedStyle(sec)
    const secPad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    const room = window.innerHeight - NAVBAR - GAP - secPad
    const natural = el.getBoundingClientRect().height
    if (!natural || natural <= room) continue
    // `zoom` changes how text wraps, so the height does not scale exactly with
    // the factor: measure the result and correct it (a few passes are enough).
    let z = Math.max(FLOOR, room / natural)
    for (let i = 0; i < 4; i++) {
      el.style.zoom = z.toFixed(3)
      const h = el.getBoundingClientRect().height
      if (h <= room + 0.5 || z <= FLOOR) break
      z = Math.max(FLOOR, z * (room / h) - 0.002)
    }
  }
}

let timer = 0
let lastScroll = 0
const SCROLL_QUIET = 180 // ms without scrolling before a pass may run
const tick = () => {
  if (performance.now() - lastScroll < SCROLL_QUIET) { timer = setTimeout(tick, SCROLL_QUIET); return }
  fit()
}
const schedule = (ms = 120) => { clearTimeout(timer); timer = setTimeout(tick, ms) }

function start() {
  document.documentElement.style.overflowAnchor = 'none'
  document.body.style.overflowAnchor = 'none'
  fit()
  window.addEventListener('resize', () => schedule(), { passive: true })
  // `scroll` does not bubble from <body>, so listen in the capture phase on window
  window.addEventListener('scroll', () => { lastScroll = performance.now() }, { passive: true, capture: true })
  window.addEventListener('wheel', () => { lastScroll = performance.now() }, { passive: true })
  // fonts, translations and lazily mounted sections change the natural height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => schedule(50))
  document.addEventListener('click', () => schedule(400), true) // language / theme switches
  // only watch the sections we actually scale (watching the whole body fired on every canvas/UI change)
  const mo = new MutationObserver(() => schedule(250))
  for (const t of TARGETS) {
    const sec = document.querySelector(t.section)
    if (sec) mo.observe(sec, { childList: true, subtree: true, characterData: true })
  }
  setTimeout(fit, 800)
  setTimeout(fit, 2500)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
else start()
