// Marque « l'utilisateur est en train de défiler » : <html class="vg-scrolling"> + window.__vgScrolling.
// Pendant le défilement, le thread principal ne redessine plus les canvas d'ambiance (étoiles, rayons, particules,
// ECG…) et perf-polish.css coupe les flous d'arrière-plan : le défilement reste fluide. 140 ms après le dernier
// mouvement tout reprend. `scroll` ne remonte pas depuis <body> (c'est lui qui défile) : écoute en phase de capture.
const QUIET = 140
let timer = 0
const root = document.documentElement

function onScroll() {
  if (!window.__vgScrolling) {
    window.__vgScrolling = true
    root.classList.add('vg-scrolling')
  }
  clearTimeout(timer)
  timer = setTimeout(() => {
    window.__vgScrolling = false
    root.classList.remove('vg-scrolling')
  }, QUIET)
}

window.__vgScrolling = false
document.addEventListener('scroll', onScroll, { passive: true, capture: true })
