// Pause CSS animations in sections that are off screen.
//
// The home page runs ~190 infinite CSS animations (glows, scan lines, pulses…)
// all the time, even in sections nobody can see, and the browser still has to
// style and composite them every frame. This marks every <section>/<footer>
// that is outside the viewport with `vg-offscreen`; perf-polish.css pauses the
// animations inside it. The class is removed the moment the section is about
// to enter the viewport, so nothing visible changes.
const SEL = 'section, footer, .scroll-section'
const seen = new WeakSet()

function start() {
  if (typeof IntersectionObserver === 'undefined') return
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.classList.toggle('vg-offscreen', !e.isIntersecting)
    },
    { rootMargin: '120px 0px' }, // wake up slightly before it scrolls into view
  )
  const scan = () => {
    document.querySelectorAll(SEL).forEach((el) => {
      if (!seen.has(el)) { seen.add(el); io.observe(el) }
    })
  }
  scan()
  // sections are mounted lazily by React: pick up the new ones as they appear
  let t = 0
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 250) })
    .observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
else start()
