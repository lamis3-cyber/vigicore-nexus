import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccent, getInitials, ARROW_ICON } from './helpers.jsx'
import './featured-partner-card.css'
import { tr } from '../../i18n/translate.js';

/* Featured partner: ONE wide card, ONE organization at a time.
   Left  = the organization's picture. Right = logo + info.
   Picture fallback chain:  coverImageUrl  ->  product image (blur-fill)  ->  grid + monogram.
   Rotation is owned by useAutoIndex in ServicesPage; this renders `index` and calls goTo(). */

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// "ISO 17025" -> ISO, "24/7 alerting" -> 24, "Ministry of Commerce" -> MC
const sealMark = (t) => {
  const first = t.trim().split(/\s+/)[0]
  if (/^[A-Z]{2,4}$/.test(first)) return first
  const digits = t.trim().match(/^\d{1,3}/)
  if (digits) return digits[0]
  const words = t.split(/\s+/).filter((w) => w.length > 2)
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function Spark({ data }) {
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 150},${v}`).join(' ')
  const last = data[data.length - 1]
  return (
    <svg className="fpc-spark" viewBox="0 0 150 46" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="rgb(var(--k))" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="150" cy={last} r="4" fill="#fff" />
    </svg>
  )
}

export default function FeaturedPartnerCard({
  spotlights, index, goTo, onMouseEnter, onMouseLeave, usingDemoData, onSeeListings, intervalMs = 6500,
}) {
  const [hover, setHover] = useState(false)
  const n = spotlights.length
  if (!n) return null
  const i = index % n
  const org = spotlights[i]
  const accent = getAccent(org.category)
  const rgb = hexToRgb(accent)
  const stats = org.stats ?? (org.stat ? [org.stat] : [])
  const step = (d) => goTo((i + d + n) % n)
  const initials = getInitials(org.orgName)
  const photo = org.coverImageUrl || org.imageUrl

  return (
    <div
      className={`fpc${hover ? ' is-held' : ''}`}
      data-side={org.coverSide === 'right' ? 'right' : 'left'}
      data-logo={org.logoPlacement === 'photo' ? 'photo' : 'seam'}
      style={{ '--k': rgb.join(','), '--ms': `${intervalMs}ms` }}
      onMouseEnter={() => { setHover(true); onMouseEnter?.() }}
      onMouseLeave={() => { setHover(false); onMouseLeave?.() }}
      data-listing-id={org.id}
    >
      <div className="fpc-media" key={`media-${i}`} aria-hidden="true">
        {photo ? (
          <>
            {/* Blurred copy fills the frame so portrait / transparent product shots never leave bars. */}
            <img className="fpc-photo-bg" src={photo} alt="" loading="lazy" />
            <img className={`fpc-photo${org.coverImageUrl ? ' is-cover' : ''}`} src={photo} alt="" loading="lazy" />
          </>
        ) : (
          <>
            <span className="fpc-grid" />
            <span className="fpc-mono">{initials}</span>
          </>
        )}
      </div>
      <span className="fpc-seam" aria-hidden="true" />

      <span className="fpc-ribbon">★ {tr(org.tagline)}</span>
      <span className="fpc-ad">{usingDemoData ? tr("EXAMPLE · SPONSORED") : tr("SPONSORED")}</span>
      {n > 1 && <span className="fpc-count"><b>{String(i + 1).padStart(2, '0')}</b>/{String(n).padStart(2, '0')}</span>}

      <div className="fpc-logo" key={`logo-${i}`} data-shape={['circle', 'square'].includes(org.logoShape) ? org.logoShape : 'hexagon'}>
        <span className="fpc-hex">
          {org.logoUrl ? <img src={org.logoUrl} alt={tr("{0} logo", [org.orgName])} /> : <b>{initials}</b>}
        </span>
        <span className="fpc-verified" title={tr("Verified partner")} aria-label={tr("Verified partner")}>✓</span>
      </div>

      {n > 1 && (
        <div className="fpc-rail" role="tablist" aria-label={tr("Choose a featured partner")}>
          <button type="button" className="fpc-arrow" onClick={() => step(-1)} aria-label={tr("Previous partner")}>‹</button>
          {spotlights.map((s, k) => (
            <button
              key={s.id ?? s.orgName}
              type="button"
              role="tab"
              aria-selected={k === i}
              className={`fpc-tab${k === i ? ' on' : ''}${k === i && hover ? ' held' : ''}`}
              onClick={() => goTo(k)}
            >
              <span title={s.orgName}>{s.orgName.split(' ')[0]}</span>
              <i key={`${k === i}-${hover}`} />
            </button>
          ))}
          <button type="button" className="fpc-arrow" onClick={() => step(1)} aria-label={tr("Next partner")}>›</button>
        </div>
      )}

      <div className="fpc-body" key={`body-${i}`}>
        {org.category && <span className="fpc-cat"><i />{tr(org.category)}</span>}
        <h3>{org.orgName}</h3>
        <p className="fpc-tag">{tr(org.title)}</p>
        {org.tags.length > 0 && (
          <ul className="fpc-seals">
            {org.tags.map((t) => <li key={t}><b>{sealMark(t)}</b>{t}</li>)}
          </ul>
        )}
        {(stats.length > 0 || org.listingsCount) && (
          <div className="fpc-stats">
            {org.listingsCount ? <div><b>{org.listingsCount}</b><span>{tr("listings")}</span></div> : null}
            {stats.map((s) => <div key={s.label}><b>{s.value}</b><span>{tr(s.label)}</span></div>)}
            {org.trend?.length > 1 && <Spark data={org.trend} />}
          </div>
        )}
        <div className="fpc-cta">
          {usingDemoData
            ? <Link to="/login" className="fpc-btn fpc-btn--main">{tr("Visit organization {0}", [''])}{ARROW_ICON}</Link>
            : org.href && <a href={org.href} target="_blank" rel="noopener noreferrer" className="fpc-btn fpc-btn--main">{tr("Visit organization {0}", [''])}{ARROW_ICON}</a>}
          {onSeeListings && (
            <button type="button" className="fpc-btn fpc-btn--ghost" onClick={() => onSeeListings(org.orgName)}>{tr("See listings{0}", [org.listingsCount ? ` (${org.listingsCount})` : ''])}</button>
          )}
        </div>
      </div>
    </div>
  )
}
