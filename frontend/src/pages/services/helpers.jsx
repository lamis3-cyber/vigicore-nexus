import React from 'react'

// Category → accent color for the catalog grid. With icon-only tiles (no
// product photography yet), giving each vertical its own hue is what keeps
// a 7-tile wall of line-icons from reading as one repeated placeholder —
// it also doubles as a quiet category cue before you even read the tag.
export const CATEGORY_ACCENTS = {
  medical: '#00e8ff',
  'dispositif médical': '#00e8ff',
  pharmaceuticals: '#a78bfa',
  chemical: '#ffb84d',
  cosmetic: '#ff8fc2',
  'ivd products': '#34e0a1',
}

export const DEFAULT_ACCENT = '#00e8ff'

export function getAccent(category) {
  if (!category) return DEFAULT_ACCENT
  const key = category.trim().toLowerCase()
  const accent = CATEGORY_ACCENTS[key]
  if (!accent && import.meta.env?.DEV) {
    // Falls back to DEFAULT_ACCENT either way, but flag it in dev so an
    // unmapped category (new vertical, typo, stray whitespace/casing from
    // the backend) doesn't silently blend into the default cyan.
    console.warn(`[ServicesPage] No accent color mapped for category "${category}" — using default.`)
  }
  return accent ?? DEFAULT_ACCENT
}

export const CHECK_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10.5l3.8 3.8L16 6" />
  </svg>
)

export const ARROW_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10h12M11 5l5 5-5 5" />
  </svg>
)

// Short 1-2 letter mark used on the sponsor tiles/spotlight thumbnails so
// each promo reads as a distinct "brand" at a glance, the way real
// marketplace sponsor slots (App Store, Amazon Business, etc.) show a logo
// mark rather than a repeated generic icon.
export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Real listings carry a paid `placement` (STANDARD | RECOMMENDED | SPONSORED |
// FEATURED — see server/src/services/pricing.ts). The three promotional
// sections below are fed from those tiers; STANDARD and every higher tier
// also appear in the catalog grid, which the API already returns ranked by
// tier. The shapes mirror the DEMO_* ones above so one render path serves both.
export const listingHref = (l) => l.website || (l.contactEmail ? `mailto:${l.contactEmail}` : null)

export const orgOf = (l) => l.orgName ?? l.establishmentName

export const toPromo = (l) => ({ category: l.category, id: l.id, orgName: orgOf(l), title: l.title, summary: l.summary, imageUrl: l.imageUrl, imageZoom: l.imageZoom, imageFocusX: l.imageFocusX, imageFocusY: l.imageFocusY, imageFit: l.imageFit, imageAccent: l.imageAccent, href: listingHref(l) })

export const toSpotlight = (l) => ({
  id: l.id, orgName: orgOf(l), tagline: 'Featured partner', title: l.title, description: l.description || l.summary,
  category: l.category, logoUrl: l.logoUrl ?? l.orgLogoUrl, coverImageUrl: l.coverImageUrl ?? l.orgCoverImageUrl, tags: Array.isArray(l.certifications) ? l.certifications.filter(Boolean).slice(0, 3) : [], imageUrl: l.imageUrl, imageZoom: l.imageZoom, imageFocusX: l.imageFocusX, imageFocusY: l.imageFocusY, imageFit: l.imageFit, imageAccent: l.imageAccent, logoShape: l.logoShape, logoPlacement: l.logoPlacement, coverSide: l.coverSide, href: listingHref(l),
})

/**
 * Minimal auto-advancing index, used only by the spotlight tab panel now
 * (the promo strip is a pure-CSS marquee — see .services-marquee-track).
 * Deliberately not a library: this only ever needs "advance every N
 * seconds, pause on hover, jump on click".
 */

export const STAT_ICONS = {
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></svg>,
  org: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V7l8-4 8 4v14M9 21v-5h6v5M8.5 10h1M14.5 10h1M8.5 13h1M14.5 13h1" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
}
