import React, { useCallback, useRef, useState } from 'react'
import useSectionReveal from '../../hooks/useSectionReveal.js'
import { useI18n } from '../../i18n/index.jsx'

// Same technique as the dashboard mockup — a resting perspective
// angle plus cursor response, since this is the same idea (a screen
// floating slightly above the page) applied to a different frame.
function useFrameTilt() {
  const frameRef = useRef(null)
  const onMove = useCallback((e) => {
    const el = frameRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--tilt-x', `${(3 - py * 5).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(px * 6).toFixed(2)}deg`)
  }, [])
  const onLeave = useCallback(() => {
    const el = frameRef.current
    if (!el) return
    el.style.setProperty('--tilt-x', '3deg')
    el.style.setProperty('--tilt-y', '0deg')
  }, [])
  return { frameRef, onMouseMove: onMove, onMouseLeave: onLeave }
}

// The demo video is not recorded yet. Until a URL is provided (VITE_DEMO_VIDEO_URL in .env,
// or drop a file at public/demo.mp4 and set the variable to /demo.mp4) the section says so
// honestly and offers a live walkthrough instead of a play button that does nothing.
const DEMO_SRC = import.meta.env.VITE_DEMO_VIDEO_URL || ''
const DEMO_POSTER = import.meta.env.VITE_DEMO_VIDEO_POSTER || undefined
const SOON = {
  en: { tag: 'Video coming soon', desc: 'One incident, from the first report to the resolved alert. The video is being recorded: book a live walkthrough in the meantime.', cta: 'Book a live walkthrough', play: 'Play platform demo video' },
  fr: { tag: 'Vidéo bientôt disponible', desc: 'Un incident, du premier signalement à l’alerte résolue. La vidéo est en cours de tournage : réservez une démonstration en direct en attendant.', cta: 'Réserver une démo en direct', play: 'Lire la vidéo de démonstration' },
  ar: { tag: 'الفيديو قريبا', desc: 'حادثة واحدة، من أول بلاغ إلى التنبيه المحلول. الفيديو قيد التسجيل: احجز عرضا مباشرا في الانتظار.', cta: 'احجز عرضا مباشرا', play: 'تشغيل فيديو العرض' },
}

export default function VideoSection() {
  const { t, lang } = useI18n()
  const [playing, setPlaying] = useState(false)
  const soon = SOON[lang] || SOON.en
  const hasVideo = !!DEMO_SRC
  const { frameRef, onMouseMove, onMouseLeave } = useFrameTilt()
  const sectionRef = useSectionReveal()
  return (
    <section ref={sectionRef} className="scroll-section video-section" id="video-section">
    <div className="section-content reveal-stagger">
      <div className="section-eyebrow reveal-fade">See It Live</div>
      <h2 className="section-title reveal-fade">{t('video.title')}</h2>
      <p className="section-desc reveal-fade">{hasVideo ? t('video.desc') : soon.desc}</p>
      <div className="video-frame reveal-fade" ref={frameRef} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
        <div className="video-glow"></div>
        <div className="video-corner vc-tl"></div><div className="video-corner vc-tr"></div>
        <div className="video-corner vc-bl"></div><div className="video-corner vc-br"></div>
        
        {hasVideo && playing ? (
          <div className="video-placeholder" id="video-placeholder">
            <video src={DEMO_SRC} poster={DEMO_POSTER} controls autoPlay playsInline preload="metadata"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
          </div>
        ) : (
        <div className="video-placeholder" id="video-placeholder">
          <div className="vp-scanline" aria-hidden="true"></div>
          <div className="vp-grid" aria-hidden="true"></div>
          {!hasVideo && (
            <div className="vp-coming-tag">
              <span className="vp-coming-dot"></span>
              {soon.tag}
            </div>
          )}
          <div className="play-btn" id="play-btn"
            {...(hasVideo
              ? { role: 'button', tabIndex: 0, 'aria-label': soon.play, onClick: () => setPlaying(true),
                  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlaying(true) } },
                  style: { cursor: 'pointer' } }
              : { 'aria-hidden': 'true', style: { opacity: .45, pointerEvents: 'none' } })}>
            <svg viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="38" stroke="rgba(0,232,255,0.2)" strokeWidth="1"/>
              <circle cx="40" cy="40" r="30" stroke="rgba(0,232,255,0.4)" strokeWidth="1.5" fill="rgba(0,20,40,0.6)" className="vp-play-ring"/>
              <path d="M33 26 L56 40 L33 54 Z" fill="#00e8ff" opacity="0.9"/>
            </svg>
          </div>
          <div className="video-meta">
            <span className="vt">{t('video.label')}</span>
            {hasVideo && <span className="vd">{t('video.duration')}</span>}
          </div>
          <div className="video-topics">
            <span>What it is</span>
            <span>Why it matters</span>
            <span>How it works</span>
            <span>Who uses it</span>
          </div>
          {!hasVideo && (
            <a href="#contact-form" className="btn-primary" style={{ position: 'relative', zIndex: 2, marginTop: 6 }}>{soon.cta}</a>
          )}
          {hasVideo && (
            <div className="vp-progress-bar" aria-hidden="true">
              <div className="vp-progress-fill"></div>
            </div>
          )}
        </div>
        )}
        
      </div>
    </div>
  </section>
  )
}
