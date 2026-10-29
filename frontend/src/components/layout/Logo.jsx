import React from 'react'
import ShieldMark from './ShieldMark.jsx'

// Single source of truth for the VigiCore NEXUS DZ logo (mark + text), used by
// Navbar, Footer, DashboardHeader, LoginPage and RegisterOrganizationPage.
//
// `idPrefix` must be unique per place this is rendered on a page (SVG ids
// are global to the document), e.g. "main-nav", "footer", "login-nav".
export default function Logo({ idPrefix }) {
  return (
    <>
      <ShieldMark idPrefix={idPrefix} />
      <span className="nav-logo-text" data-no-translate>Vigi<span>Core<br/><span style={{ fontWeight: '400' }}>NEXUS</span>{' '}<span style={{ fontWeight: '700', letterSpacing: '0.16em' }}>DZ</span></span></span>
    </>
  )
}
