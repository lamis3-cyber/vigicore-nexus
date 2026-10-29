import { useCallback, useEffect, useRef, useState } from 'react'

// Pauses a react-three-fiber <Canvas> while it is scrolled out of view (or the tab is hidden),
// so the WebGL scene does not burn GPU/CPU where nobody can see it.
// Usage: const { onScreen, onCreated } = useOnScreen();
//        <Canvas onCreated={onCreated} frameloop={onScreen ? 'always' : 'never'} />
export default function useOnScreen() {
  const [onScreen, setOnScreen] = useState(true)
  const ioRef = useRef(null)
  const onCreated = useCallback(({ gl }) => {
    if (typeof IntersectionObserver === 'undefined') return
    ioRef.current?.disconnect()
    ioRef.current = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: '80px' })
    ioRef.current.observe(gl.domElement)
  }, [])
  useEffect(() => () => ioRef.current?.disconnect(), [])
  return { onScreen, onCreated }
}
