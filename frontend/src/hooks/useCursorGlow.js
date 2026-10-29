import { useEffect } from 'react'

// Soft glow that trails the mouse (desktop only). Replaces the cursor-glow IIFE
// of public/script.js. Expects <div id="cursor-glow" /> in the page.
//
// Perf: the loop only runs while the glow is still catching up with the mouse
// (it used to run forever and rewrite left/top, i.e. layout, on every frame).
export default function useCursorGlow(id = 'cursor-glow') {
  useEffect(() => {
    const el = document.getElementById(id)
    if (!el || window.matchMedia('(pointer: coarse)').matches) return

    el.style.left = '0px'; el.style.top = '0px' // position comes from transform now
    let tx = 0, ty = 0, x = 0, y = 0, frame = 0
    const tick = () => {
      x += 0.12 * (tx - x)
      y += 0.12 * (ty - y)
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      if (Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) frame = requestAnimationFrame(tick)
      else frame = 0
    }
    const onMove = (e) => {
      tx = e.clientX; ty = e.clientY
      if (!frame) frame = requestAnimationFrame(tick)
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      document.removeEventListener('mousemove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [id])
}
