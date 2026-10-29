import useCursorGlow from './useCursorGlow.js'
import useHomeEffects from './useHomeEffects.js'
import useReveal from './useReveal.js'
import useSmoothAnchors from './useSmoothAnchors.js'
import useTheme from './useTheme.js'

// Everything public/script.js used to do for a full-width marketing page, as
// one call. Home, About and Services (the three pages that loaded script.js)
// call it once at the top.
export default function usePageEffects() {
  useTheme()
  useReveal()
  useSmoothAnchors()
  useCursorGlow()
  useHomeEffects()
}
