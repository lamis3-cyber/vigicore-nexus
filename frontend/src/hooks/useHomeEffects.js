import { useEffect } from 'react'
import { startHomeEffects } from '../effects/homeEffects.js'

// Starts the canvas / animation engine for the mounted page and stops it on
// unmount. See src/effects/homeEffects.js.
export default function useHomeEffects() {
  useEffect(() => startHomeEffects(), [])
}
