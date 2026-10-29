import React, { useLayoutEffect } from 'react'
import { useParams } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import PageBackdrop from '../components/layout/PageBackdrop.jsx'
import Footer from '../components/layout/Footer.jsx'
import usePageEffects from '../hooks/usePageEffects.js'
import ServiceDetail from './services/ServiceDetail.jsx'

/** /services/:id — fiche d'un produit publié (ou d'un exemple demo-N). */
export default function ServiceDetailPage() {
  const { id } = useParams()
  usePageEffects()
  // React Router keeps the previous page's scroll position: coming from the long /services page the
  // fiche would open scrolled down to the footer. Always start at the top (instant, not the smooth-scroll animation).
  useLayoutEffect(() => {
    const top = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
    top()
    // the fiche / lazy chunks / reveal effects can restore or shift the scroll right after mount: repeat once or twice
    const r = requestAnimationFrame(top)
    const t = setTimeout(top, 150)
    return () => { cancelAnimationFrame(r); clearTimeout(t) }
  }, [id])
  return (
    <>
      <PageBackdrop />
      <Navbar />
      <main className="sdp-page">
        <ServiceDetail key={id} id={id} />
      </main>
      <Footer />
    </>
  )
}
