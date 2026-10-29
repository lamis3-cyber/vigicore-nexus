import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import usePageEffects from './hooks/usePageEffects.js'
import Navbar from './components/layout/Navbar.jsx'
import PageBackdrop from './components/layout/PageBackdrop.jsx'
import Hero from './components/home/Hero.jsx'
import MissionSection from './components/home/MissionSection.jsx'
import WhySection from './components/home/WhySection.jsx'
import SolutionSection from './components/home/SolutionSection.jsx'
import VideoSection from './components/home/VideoSection.jsx'
import DashboardSection from './components/home/DashboardSection.jsx'
import StakeholderRelay from './components/home/StakeholderRelay.jsx'
import NetworkEcosystemSection from './components/home/NetworkEcosystemSection.jsx'
import WorkflowSection from './components/home/WorkflowSection.jsx'
import MarketplaceSection from './components/home/MarketplaceSection.jsx'
import ContactSection from './components/home/ContactSection.jsx'
import CtaSection from './components/home/CtaSection.jsx'
import Footer from './components/layout/Footer.jsx'

export default function App() {
  // Theme, scroll reveal, smooth anchors, cursor glow and the canvas engine
  // (was public/script.js, injected once per session): now mounted and torn
  // down with the page.
  usePageEffects()

  // Navbar links to sections use "/#id" targets (e.g. from /about or
  // /login). These are now client-side <Link> navigations (see Navbar.jsx),
  // so no browser page load/hash-scroll ever happens for them — this effect
  // does that scroll itself instead. It re-runs whenever the hash changes
  // (not just on mount), so it covers both "arrive at / with a hash already
  // in the URL" and "already on / and click a section link" alike.
  const location = useLocation()
  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    const scrollToTarget = () => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const raf = requestAnimationFrame(() => setTimeout(scrollToTarget, 50))
    return () => cancelAnimationFrame(raf)
  }, [location.hash])

  return (
    <>
      <PageBackdrop />

      <Navbar />

      <main>
        <Hero />
        <WhySection />
        <MissionSection />
        <SolutionSection />
        <DashboardSection />
        <div id="actors">
          <StakeholderRelay />
        </div>
        <NetworkEcosystemSection />
        <WorkflowSection />
        <MarketplaceSection />
        <VideoSection />
        <ContactSection />
        <CtaSection />
      </main>

      <Footer />
    </>
  )
}
