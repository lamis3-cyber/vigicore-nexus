import { useCallback, useEffect, useState } from 'react'

// Theme (dark / light) — single owner of the `data-theme` attribute and of the
// `vg-theme` storage key. Replaces the theme IIFEs of public/script.js and the
// copy-pasted "read vg-theme, set data-theme" effects in App / About / Login.
//
// index.html still sets the attribute in a tiny inline <script> before first
// paint (that one must stay: it prevents the dark -> light flash).

const KEY = 'vg-theme'
const HINT_KEY = 'vg-theme-seen'

const read = () => {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applySavedTheme() {
  document.documentElement.setAttribute('data-theme', read())
}

export default function useTheme() {
  const [theme, setThemeState] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
  )

  useEffect(() => {
    applySavedTheme()
    setThemeState(read())
  }, [])

  const toggle = useCallback(() => {
    const root = document.documentElement
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
    root.setAttribute('data-theme', next)
    try { localStorage.setItem(KEY, next) } catch { /* private mode */ }
    setThemeState(next)
  }, [])

  return { theme, toggle }
}

// First-visit pulse on the desktop theme button: shown once, for ~4 s, or until
// the first click. Returns { hint, dismiss } — put `first-visit-hint` on the
// button while `hint` is true and call `dismiss` from its onClick.
export function useThemeHint() {
  const [hint, setHint] = useState(false)

  useEffect(() => {
    let seen = true
    try { seen = !!localStorage.getItem(HINT_KEY) } catch { /* private mode */ }
    if (seen) return
    setHint(true)
    const id = setTimeout(() => {
      setHint(false)
      try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode */ }
    }, 4200)
    return () => clearTimeout(id)
  }, [])

  const dismiss = useCallback(() => {
    setHint(false)
    try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode */ }
  }, [])

  return { hint, dismiss }
}
