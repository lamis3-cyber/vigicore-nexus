import { useEffect } from 'react'

// Highlights the navbar link whose section is currently in the middle band of
// the viewport (adds / removes `.active`). Replaces the scroll-spy IIFE of
// public/script.js. Links are matched by href: "#id" or "/#id".
//
// Call it from the component that renders the links (Navbar). The effect runs
// after the whole page has mounted, so the sections already exist.
export default function useScrollSpy({ linkSelector = '.nav-links a', rootMargin = '-35% 0px -60% 0px' } = {}) {
  useEffect(() => {
    const links = document.querySelectorAll(linkSelector)
    if (!links.length) return

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const id = entry.target.id
          links.forEach((a) => {
            const href = a.getAttribute('href')
            a.classList.toggle('active', href === `#${id}` || href === `/#${id}`)
          })
        })
      },
      { rootMargin },
    )
    document.querySelectorAll('section[id], div[id]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [linkSelector, rootMargin])
}
