import React from 'react'
import { fmt, sumHue } from '../../lib/format.js'
import { tr, localeTag } from '../../i18n/translate.js';

export function Spark({ data }) {
  const max = Math.max(1, ...data)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 60},${20 - (v / max) * 18}`).join(' ')
  return <svg className="mg-spark" viewBox="0 0 60 22" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export const ZONES = ['FEATURED', 'SPONSORED', 'RECOMMENDED', 'STANDARD']

export const ZONE_ART = {
  FEATURED: <><i className="a-img" /><span className="a-lines"><i /><i /><i /></span></>,
  SPONSORED: <><i className="a-img" /><span className="a-lines"><i /><i /></span><i className="a-btn" /></>,
  RECOMMENDED: <><i /><i /><i /><i /></>,
  STANDARD: <><i /><i /><i /><i /><i /><i /></>,
}

// Decorative hero composition (Vibrant look) built from the user's real data.
export function HeroArt({ listing, series, live, views }) {
  const demo = !series || series.length < 2 || Math.max(...series) === 0
  const data = demo ? [38, 52, 44, 70, 58, 86, 76] : series
  const max = Math.max(...data, 1)
  const hue = sumHue(listing?.title || 'x')
  return (
    <div className="ha" aria-hidden="true">
      <span className="ha-orb ha-orb1" /><span className="ha-orb ha-orb2" />
      <div className="ha-card ha-product" style={{ '--r': '-5deg' }}>
        <div className="ha-img" style={{ '--h': hue, ...(listing?.imageUrl ? { backgroundImage: `url(${JSON.stringify(listing.imageUrl)})` } : {}) }} />
        <span className="ha-chip">{listing?.status === 'PUBLISHED' ? tr("LIVE") : tr("DRAFT")}</span>
        <b>{listing?.title || tr("Your next product")}</b>
        <span className="ha-lines"><i /><i /></span>
      </div>
      <div className="ha-card ha-chart" style={{ '--r': '4deg' }}>
        <small>{tr("Views · 30 days")}</small>
        <strong>{views.toLocaleString(localeTag())}</strong>
        <div className={`ha-bars${demo ? ' is-demo' : ''}`}>{data.map((v, i) => <i key={i} style={{ '--v': `${18 + (v / max) * 82}%` }} />)}</div>
      </div>
      <div className="ha-card ha-live" style={{ '--r': '-2deg' }}><i />{live ? tr("{0} live now", [live]) : tr("Ready to go live")}</div>
    </div>
  )
}

// A tilted mini "Services page": shows the 4 spots, their price, and which of YOUR products is live in each.
export function PlacementMap({ pricing, listings, featuredTaken, onPick }) {
  return (
    <div className="mh-map" role="group" aria-label={tr("Where your products appear on the Services page")}>
      <div className="mh-map-bar"><i /><i /><i /><span>{tr("SERVICES PAGE")}</span></div>
      {ZONES.map((id) => {
        const p = pricing.placements.find((x) => x.id === id)
        if (!p) return null
        // The tier a product is shown in RIGHT NOW: its paid tier while the promotion runs, else the free catalog.
        const live = listings.filter((l) => l.status === 'PUBLISHED' && (l.paidActive && l.placement ? l.placement : 'STANDARD') === id)
        const taken = id === 'FEATURED' && featuredTaken && !live.length
        return (
          <button key={id} type="button" className={`pm-zone pm-${id.toLowerCase()}${live.length ? ' is-live' : ''}${taken ? ' is-taken' : ''}`} onClick={() => onPick(id)}
            title={taken ? tr("Taken by another partner right now") : id === 'STANDARD' ? tr("Free — publish a product here") : tr("Promote a product here")}>
            <span className="pm-head">
              <span className="pm-tag"><em>{tr(p.tag)}</em>{tr(p.name)}</span>
              <span className="pm-price">{p.monthlyPrice > 0 ? <><b>{fmt(p.monthlyPrice)}</b><small>{tr("/ month")}</small></> : <b>{tr("Free")}</b>}</span>
            </span>
            <span className="pm-art" aria-hidden="true">{ZONE_ART[id]}</span>
            {live.length > 0 && <span className="pm-live"><i />{tr(live[0].title)}{live.length > 1 && ` +${live.length - 1}`}</span>}
            {taken && <span className="pm-live pm-live--taken">{tr("Taken right now")}</span>}
          </button>
        )
      })}
    </div>
  )
}
