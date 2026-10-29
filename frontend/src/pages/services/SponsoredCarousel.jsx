import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { imageFrameStyle } from '../../lib/imageFrame.js'
import { DEMO_ICONS } from './demoData.jsx'
import { getAccent, ARROW_ICON, getInitials } from './helpers.jsx'
import './sponsored-carousel.css'
import { tr } from '../../i18n/translate.js';

// Sponsored showcase: a 3D "cover-flow" carousel.
//   - the active partner sits in the middle, the previous / next ones are tilted
//     behind it (rotateY) and fade out; everything else is parked off-screen
//   - the section's glow takes the colour of the active partner's category
//   - the product (photo or icon) pops out of the top edge of the card and
//     follows the pointer a little (parallax)
//   - a rail of partners under the card doubles as navigation + progress bar
//
// It is a pure view: the parent owns the list and the auto-advance hook
// (useAutoIndex) and passes it in as `rotator`, so pause-on-hover, the 5.2 s
// pace and click tracking (data-listing-id) work exactly as before.

const SWIPE_PX = 48

export default function SponsoredCarousel({ promos, usingDemoData, rotator }) {
  const n = promos.length
  const stageRef = useRef(null)
  const swipeX = useRef(null)
  const index = n ? rotator.index % n : 0
  const active = promos[index]

  const go = (i) => rotator.goTo(((i % n) + n) % n)

  // 0 = active, 1 = next, -1 = previous, 2 = parked
  const rel = (i) => {
    const d = (((i - index) % n) + n) % n
    return d === 0 ? 0 : d === 1 ? 1 : d === n - 1 ? -1 : 2
  }

  const onPointerMove = (e) => {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--sp-px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3))
    el.style.setProperty('--sp-py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3))
  }
  const onPointerLeave = () => {
    const el = stageRef.current
    if (!el) return
    el.style.setProperty('--sp-px', '0')
    el.style.setProperty('--sp-py', '0')
  }
  const onPointerDown = (e) => { swipeX.current = e.clientX }
  const onPointerUp = (e) => {
    if (swipeX.current == null) return
    const dx = e.clientX - swipeX.current
    swipeX.current = null
    if (Math.abs(dx) > SWIPE_PX && n > 1) go(index + (dx < 0 ? 1 : -1))
  }
  const onKeyDown = (e) => {
    if (n < 2) return
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
  }

  return (
    <div
      className="sp3"
      style={{ '--sp-accent': getAccent(active?.category) }}
      onMouseEnter={rotator.onMouseEnter}
      onMouseLeave={rotator.onMouseLeave}
    >
      <div className="sp3-ambient" aria-hidden="true" />

      <div
        className="sp3-stage"
        ref={stageRef}
        tabIndex={n > 1 ? 0 : undefined}
        role="group"
        aria-roledescription="carousel"
        aria-label={tr("Sponsored partners")}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {promos.map((p, i) => {
          const o = rel(i)
          const on = o === 0
          const hasPhoto = Boolean(p.imageUrl)
          return (
            <article
              key={p.id ?? p.orgName}
              className={`sp3-slide${on ? ' is-active' : ''}${o === 1 ? ' is-next' : ''}${o === -1 ? ' is-prev' : ''}${o === 2 ? ' is-far' : ''}`}
              style={{ '--sp-accent': getAccent(p.category) }}
              aria-hidden={!on}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${n}`}
              data-listing-id={p.id}
              onClick={!on ? () => go(i) : undefined}
            >
              {usingDemoData && <span className="sp3-example">{tr("Example")}</span>}

              <div className="sp3-media">
                <span className="sp3-halo" aria-hidden="true" />
                <span className="sp3-ring" aria-hidden="true" />
                <div className="sp3-product" aria-hidden="true">
                  {hasPhoto
                    ? <div className="sp3-photo" style={imageFrameStyle(p)} />
                    : <div className="sp3-icon">{DEMO_ICONS[p.icon] ?? DEMO_ICONS.shield}</div>}
                </div>
              </div>

              <div className="sp3-body">
                <div className="sp3-meta">
                  <span className="sp-org">{p.orgName}</span>
                  {p.category && <span className="sp-cat">{tr(p.category)}</span>}
                </div>
                <h3>{tr(p.title)}</h3>
                {p.summary && <p>{tr(p.summary)}</p>}
                <div className="sp3-foot">
                  {p.stat && (
                    <div className="sp3-stat">
                      <div className="sp-stat"><b>{p.stat.value}</b><span>{tr(p.stat.label)}</span></div>
                    </div>
                  )}
                  {p.id != null && (
                    <Link to={`/services/${encodeURIComponent(p.id)}`} className="sp-cta" tabIndex={on ? 0 : -1}>
                      {tr("Voir détails")} {ARROW_ICON}
                    </Link>
                  )}
                </div>
              </div>
            </article>
          )
        })}

        {n > 1 && (
          <>
            <button type="button" className="sp3-nav sp3-prev" aria-label={tr("Previous sponsor")} onClick={() => go(index - 1)}>‹</button>
            <button type="button" className="sp3-nav sp3-next" aria-label={tr("Next sponsor")} onClick={() => go(index + 1)}>›</button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="sp3-rail" role="tablist" aria-label={tr("Sponsored listings")}>
          {promos.map((p, i) => (
            <button
              key={p.id ?? p.orgName}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={tr("Show {0}", [p.orgName])}
              className={`sp3-tab${i === index ? ' is-active' : ''}`}
              style={{ '--sp-accent': getAccent(p.category) }}
              onClick={() => go(i)}
            >
              <span className="sp3-tab-av" aria-hidden="true">{getInitials(p.orgName)}</span>
              <span className="sp3-tab-txt">
                <b>{p.orgName}</b>
                {p.category && <small>{tr(p.category)}</small>}
              </span>
              {i === index && <i key={index} className="sp3-tab-bar" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
