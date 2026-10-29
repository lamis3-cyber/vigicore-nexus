import React from 'react'
import { tr } from '../../i18n/translate.js';

// The fixed atmosphere layers every marketing page shares: scroll bar, cursor
// glow, the three canvases painted by effects/homeEffects.js, glow orbs, fog
// and vignette.
export default function PageBackdrop() {
  return (
    <>
      <div id="scroll-bar" aria-hidden="true"></div>
      <div id="cursor-glow" aria-hidden="true"></div>
      <canvas id="bg-canvas" role="img" aria-label={tr("Animated star field background")}></canvas>
      <canvas id="rays-canvas" role="img" aria-label={tr("Volumetric light rays")}></canvas>
      <canvas id="ambient-particles-canvas" role="img" aria-label={tr("Ambient particles")}></canvas>

      <div id="ambient-glow"></div>
      <div id="glow-orb"></div>
      <div id="depth-fog" aria-hidden="true"></div>
      <div id="edge-vignette" aria-hidden="true"></div>
    </>
  )
}
