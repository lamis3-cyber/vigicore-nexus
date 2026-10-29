import { useCallback, useEffect, useRef, useState } from 'react'

// Mobile hamburger + drawer. Replaces the hamburger IIFE of public/script.js,
// which bound its listeners once, to whichever <Navbar> existed when the script
// loaded — later mounts got a button that did nothing.
//
//   const { open, toggle, close, buttonRef, drawerRef } = useNavDrawer()
//   <button ref={buttonRef} aria-expanded={open} onClick={toggle} />
//   <nav ref={drawerRef} className={`nav-mobile-drawer${open ? ' open' : ''}`} />
//
// Closes on: link click inside the drawer, click outside, Escape.
export default function useNavDrawer() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  const drawerRef = useRef(null)

  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      const inDrawer = drawerRef.current?.contains(e.target)
      const inButton = buttonRef.current?.contains(e.target)
      if (inDrawer && e.target.closest?.('a')) return setOpen(false)
      if (!inDrawer && !inButton) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, toggle, close, buttonRef, drawerRef }
}
