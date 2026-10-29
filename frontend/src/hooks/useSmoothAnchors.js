import { useEffect } from 'react'

// In-page anchors: a click on <a href="#id"> or <a href="/#id"> that points at
// the page we are already on scrolls smoothly to the element. One delegated
// listener (so links rendered later work too) instead of one per link.
//
// <Link to="/#id"> clicks are handled by react-router first (it updates the
// hash, App.jsx scrolls on hash change); this also covers the case the hash is
// already in the URL, where no hash change would fire.
export default function useSmoothAnchors() {
  useEffect(() => {
    const onClick = (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.('a[href^="#"], a[href^="/#"]')
      if (!a) return
      const href = a.getAttribute('href')
      const hashAt = href.indexOf('#')
      if ((href.slice(0, hashAt) || '/') !== window.location.pathname) return
      const target = document.querySelector(href.slice(hashAt))
      if (!target) return
      e.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
}
