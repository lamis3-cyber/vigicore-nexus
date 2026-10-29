import React from 'react'
import { tr } from '../../i18n/translate.js';

// Fixed layers every auth page (login, sign-up, organization registration)
// needs behind the card: toast/cursor-glow hosts, the three canvases and the
// fog/vignette overlays that useLoginScene paints into.
export function AuthLayers() {
  return (
    <>
      <div id="cg"></div>
      <div id="toast"></div>
      <canvas id="bg-c"></canvas>
      <canvas id="rays-c"></canvas>
      <canvas id="pt-c"></canvas>
      <div id="depth-fog" aria-hidden="true"></div>
      <div id="edge-vignette" aria-hidden="true"></div>
    </>
  )
}

// Invisible corner anchors the scene's connector lines attach to.
const ANCHORS = {
  'mod-tl': { top: '4%', left: '0' },
  'mod-tr': { top: '4%', right: '0' },
  'mod-bl': { bottom: '4%', left: '0' },
  'mod-br': { bottom: '4%', right: '0' },
}

export function AuthAnchors() {
  return Object.entries(ANCHORS).map(([id, pos]) => (
    <div key={id} id={id} style={{ position: 'absolute', ...pos, width: '1px', height: '1px', pointerEvents: 'none', visibility: 'hidden' }}></div>
  ))
}

// The access badge all auth views live in: a lanyard strap hanging from the navbar,
// a clip, then the glass card. The strap stays fixed; clip + card swing from the clip
// (see "ACCESS BADGE" in login.css). Corner brackets, scan line and the scrolling body
// stay inside the card.
export function AuthCard({ className, children }) {
  return (
    <div className="badge-rig">
      <div className="badge-strap" aria-hidden="true"><span>{tr("VIGICORE · VIGICORE · VIGICORE · VIGICORE · VIGICORE · VIGICORE · VIGICORE · VIGICORE ·")}</span></div>
      <div className="badge-swing">
        <div className="badge-clip" aria-hidden="true"><i></i></div>
        <div className={className} id="login-card">
          <div className="badge-bar" aria-hidden="true"></div>
          <div className="badge-slot" aria-hidden="true"></div>
          <div className="lc-scroll">{children}</div>
          <div className="badge-barcode" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  )
}
