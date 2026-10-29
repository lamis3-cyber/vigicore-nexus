import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import PageBackdrop from '../components/layout/PageBackdrop.jsx'
import Footer from '../components/layout/Footer.jsx'
import useSectionReveal from '../hooks/useSectionReveal.js'
import usePageEffects from '../hooks/usePageEffects.js'
import { listPublishedServices } from '../lib/services.js'
import { getCatalogueAccess } from '../lib/market.js'
import { imageFrameStyle, isContainFit, fgInset } from '../lib/imageFrame.js'
import { scoreListing } from '../lib/listingScore.js'
import './services/services-polish.css'
import { DEMO_LISTINGS, DEMO_ICONS, DEMO_PROMOS, DEMO_SPOTLIGHTS, DEMO_RECOMMENDED } from './services/demoData.jsx'
import { getAccent, ARROW_ICON, getInitials, orgOf, toPromo, toSpotlight, STAT_ICONS } from './services/helpers.jsx'
import { useAutoIndex, useListingTracking } from './services/hooks.js'
import ServicesBentoSkeleton from './services/ServicesBentoSkeleton.jsx'
import ServicesPagination from './services/ServicesPagination.jsx'
import ServicesHeroPortal from './services/ServicesHeroPortal.jsx'
import SponsoredCarousel from './services/SponsoredCarousel.jsx'
import FeaturedPartnerCard from './services/FeaturedPartnerCard.jsx'
import RecommendedCarousel from './services/RecommendedCarousel.jsx'
import EyeCta from './services/EyeCta.jsx'
import CountUp from '../components/shared/CountUp.jsx'
import { sumHue } from '../lib/format.js'
import { prefersReducedMotion } from '../lib/motion.js'
import { tr } from '../i18n/translate.js';
import './services/services-empty-slots.css'

// Categories the catalog always offers, even when nothing is published in them yet.
// Names match CATEGORY_ACCENTS (services/helpers.jsx) and the "Category" field of the product studio.
const BASE_CATEGORIES = ['Medical', 'Pharmaceuticals', 'Chemical', 'Cosmetic', 'IVD products']

// Placeholder shown when a placement section has no product yet: the section stays on the page.
function EmptySlot({ text }) {
  return (
    <div className="services-empty-slot">
      <span>{text}</span>
      <a href="/dashboard/services">{tr("Place your product here")}</a>
    </div>
  )
}

// Same matching rule for the catalog grid AND the live suggestions: title, summary, category and the
// organization name, ignoring case, accents and spaces ("Numidia Pharma" must find "NumidiaPharma — ...").
const normalizeSearch = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const matchesQuery = (l, rawQuery) => {
  const q = normalizeSearch(rawQuery).trim()
  if (!q) return true
  const compact = (s) => s.replace(/\s+/g, '')
  const qc = compact(q)
  return [l.title, l.summary, l.category, orgOf(l)].some((v) => {
    const s = normalizeSearch(v)
    return s.includes(q) || compact(s).includes(qc)
  })
}

export default function ServicesPage() {
  const [allListings, setListings] = useState([])
  // A signed-in buyer only sees what their company can really ORDER; the SERVER decides (GET /market/catalogue-access) and
  // this page only displays. Visitors (no session) see everything. If the call fails, everything stays visible (fail-open);
  // the server still re-checks every order (POST /market/orders).
  const [hiddenIds, setHiddenIds] = useState(null)
  useEffect(() => {
    let off = false
    getCatalogueAccess().then((r) => { if (!off && r.ok) setHiddenIds(new Set(r.data?.hiddenListingIds ?? [])) })
    return () => { off = true }
  }, [])
  const listings = useMemo(() => (hiddenIds && hiddenIds.size ? allListings.filter((l) => !hiddenIds.has(l.id)) : allListings), [allListings, hiddenIds])
  const bothKinds = useMemo(() => new Set(listings.map((l) => l.sellerKind ?? 'MANUFACTURER')).size > 1, [listings])
  const [status, setStatus] = useState('loading') // loading | ready | error
  useListingTracking(status === 'ready')
  const [query, setQuery] = useState('')
  // The input itself stays fully responsive (bound to `query`); filtering
  // reacts to `debouncedQuery` instead so fast typing doesn't re-filter the
  // whole catalog on every keystroke. 250ms is short enough to still feel
  // instant, long enough to skip the in-between keystrokes.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  // ?category=Medical (from the home hero's "Explore ..." link) pre-selects a chip.
  const [activeCategory, setActiveCategory] = useState(
    () => new URLSearchParams(window.location.search).get('category') || 'all',
  )
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('featured') // featured (API order) | az | za
  const [sellerKind, setSellerKind] = useState('all') // all | MANUFACTURER | DISTRIBUTOR : visitors see both kinds, side by side
  // Catalog sidebar filters + compare mode (max 3 products side by side).
  const [needContact, setNeedContact] = useState(false)
  const [compare, setCompare] = useState([])
  const toolbarRef = useRef(null)
  const bentoRef = useRef(null)
  const [duelOpen, setDuelOpen] = useState(false)
  const searchRef = useRef(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [sIdx, setSIdx] = useState(-1)
  const [railStuck, setRailStuck] = useState(false)
  const [railEl, setRailEl] = useState(null) // callback ref: the sentinel only exists once categories have loaded
  // No live data (API down, or nobody has published yet) → labelled example content.
  const usingDemoData = status === 'error' || (status === 'ready' && allListings.length === 0)
  const allPromos = usingDemoData ? DEMO_PROMOS : listings.filter((l) => l.placement === 'SPONSORED').map(toPromo)
  // The category chips also steer the Sponsored showcase; if nobody sponsors that category it shows everyone.
  // A product stays in the section it was bought for: if nobody sponsors the selected category the strip stays empty
  // (it shows its "slot available" card) instead of borrowing other categories' products.
  const promos = activeCategory === 'all' ? allPromos : allPromos.filter((p) => p.category === activeCategory)
  const spotlights = usingDemoData ? DEMO_SPOTLIGHTS : listings.filter((l) => l.placement === 'FEATURED').map(toSpotlight)
  const recommended = usingDemoData ? DEMO_RECOMMENDED : listings.filter((l) => l.placement === 'RECOMMENDED')
  const heroRef = useSectionReveal()
  const gridRef = useSectionReveal()
  const ctaRef = useSectionReveal()
  const spotlight = useAutoIndex(spotlights.length, 6500)
  // Sponsor strip now shows one partner at a time (was a continuous
  // scrolling row of tiles) — advances every 2.6s, pauses on hover/focus,
  // same "advance every N seconds" hook already used by the spotlight panel.
  const promoRotator = useAutoIndex(promos.length, 5200)
  const reduceMotion = prefersReducedMotion()
  useEffect(() => { promoRotator.goTo(0) }, [activeCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the bento shape (1 big + 6 small) consistent on every page rather
  // than growing the grid without bound as the catalog fills up — a search
  // engine results page is the right mental model here, not an infinite
  // scroll, since visitors are actively comparing organizations.
  const PAGE_SIZE = 6

  // Subtle 3D tilt on the catalog's bento cards — a small "wow" moment kept
  // to just this grid rather than scattered across the page. Plain DOM
  // writes (no state) so it stays cheap on pointer move.
  const handlePcardTilt = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    // Rotation angle alone reads as a smaller movement on a small tile than
    // on the big one (the on-screen travel scales with the card's own
    // size), so boost the angle a bit on the smaller grid cells to keep
    // the effect equally noticeable everywhere.
    e.currentTarget.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`)
    e.currentTarget.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`)
    const boost = Math.min(1.8, 460 / r.width)
    e.currentTarget.style.transform = `perspective(700px) rotateX(${(-y * 6 * boost).toFixed(2)}deg) rotateY(${(x * 8 * boost).toFixed(2)}deg) translateY(-4px) scale(1.035)`
  }
  const handlePcardUntilt = (e) => {
    e.currentTarget.style.transform = ''
  }

  usePageEffects()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The category rail only gets its glass background once it is actually pinned under the navbar.
  useEffect(() => {
    const el = railEl
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) || 70
    const io = new IntersectionObserver(
      ([e]) => setRailStuck(!e.isIntersecting && e.boundingClientRect.top < navH),
      { rootMargin: `-${navH}px 0px 0px 0px`, threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [railEl])

  // Expose the fixed navbar's height so the category rail can stick right underneath it.
  useEffect(() => {
    const set = () => {
      const n = document.querySelector('.navbar')
      if (n) document.documentElement.style.setProperty('--nav-h', `${n.offsetHeight}px`)
    }
    set()
    window.addEventListener('resize', set)
    return () => window.removeEventListener('resize', set)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus("loading")
      const result = await listPublishedServices()
      if (cancelled) return
      if (!result.ok) {
        setStatus("error")
        return
      }
      setListings(result.data.listings ?? [])
      setStatus("ready")
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 250)
    return () => clearTimeout(id)
  }, [query])

  // Real data once the backend exists; example cards until then, so the
  // page always looks finished rather than empty.
  const sourceListings = usingDemoData ? DEMO_LISTINGS : listings

  // Public "profile score" (0-100), the same formula organizations see in Product Studio.
  const scoreMap = useMemo(
    () => new Map(sourceListings.map((l) => [l.id, scoreListing(l, { imageLong: l.imageUrl ? 800 : 0 }).score])),
    [sourceListings],
  )

  // Categories are derived from whatever is actually in the catalog (demo
  // or real), so the chip rail — and the stat strip below — stay accurate
  // automatically as organizations publish new listings.
  const categories = useMemo(() => {
    // Every base category is always listed (count 0 when empty) so the rail never reshapes itself
    // as organizations publish; categories outside the base list are appended as they appear.
    const counts = new Map(BASE_CATEGORIES.map((name) => [name, 0]))
    sourceListings.forEach((l) => {
      if (!l.category) return
      counts.set(l.category, (counts.get(l.category) ?? 0) + 1)
    })
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  }, [sourceListings])

  // If the requested category doesn't exist in the catalog, fall back to "all"
  // instead of showing an empty page.
  useEffect(() => {
    if (status === 'loading') return
    if (activeCategory !== 'all' && !categories.some((c) => c.name === activeCategory)) {
      setActiveCategory('all')
    }
  }, [status, categories, activeCategory])

  const orgNames = useMemo(
    () => Array.from(new Set(sourceListings.map((l) => l.orgName ?? l.establishmentName).filter(Boolean))),
    [sourceListings],
  )
  const orgCount = orgNames.length
  // Enough repeats that the partner marquee always fills the screen, then doubled for a seamless loop.
  const orgLoop = orgNames.length ? Array.from({ length: Math.max(1, Math.ceil(8 / orgNames.length)) }, () => orgNames).flat() : []

  // Live search suggestions (top 5 + total), shown under the hero search box.
  const suggest = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return { list: [], total: 0 }
    const all = sourceListings.filter((l) => matchesQuery(l, q))
    return { list: all.slice(0, 5), total: all.length }
  }, [query, sourceListings])

  const filtered = sourceListings.filter((l) => {
    if (activeCategory !== 'all' && l.category !== activeCategory) return false
    if (sellerKind !== 'all' && (l.sellerKind ?? 'MANUFACTURER') !== sellerKind) return false
    if (needContact && !(l.website || l.contactEmail || l.contactPhone)) return false
    if (!debouncedQuery.trim()) return true
    return matchesQuery(l, debouncedQuery)
  })

  const ordered = sort === 'featured'
    ? filtered
    : [...filtered].sort((a, b) => (sort === 'az' ? 1 : -1) * (a.title ?? '').localeCompare(b.title ?? ''))

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Search/category changes reshuffle what "page 2" even means, so land
  // back on page 1 rather than leaving the visitor on a now-empty page.
  useEffect(() => { setPage(1) }, [debouncedQuery, activeCategory, sort, needContact])
  // The results bar pins directly under the category rail (one continuous glass header).
  // We only need the rail's height, and to know when the bar is pinned so it can get its glass background.
  useEffect(() => {
    const rail = document.querySelector('.services-category-rail-section')
    const tb = toolbarRef.current
    if (!rail || !tb) return undefined
    const root = document.documentElement
    let raf = 0
    const measure = () => root.style.setProperty('--rail-h', `${rail.offsetHeight}px`)
    const stuck = () => {
      raf = 0
      const top = parseFloat(getComputedStyle(tb).top) || 0
      if (tb.getBoundingClientRect().top <= top + 1) tb.dataset.stuck = '1'; else delete tb.dataset.stuck
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(stuck) }
    measure(); stuck()
    const ro = new ResizeObserver(() => { measure(); on() })
    ro.observe(rail)
    window.addEventListener('scroll', on, { passive: true, capture: true })
    window.addEventListener('resize', on)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on)
      if (raf) cancelAnimationFrame(raf)
      root.style.removeProperty('--rail-h')
    }
  }, [status])

  // Guards against being stranded past the last page if the result set
  // shrinks (e.g. switching to a smaller category while on page 3).
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])

  const pageListings = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const filtersActive = activeCategory !== 'all' || needContact
  const clearFilters = () => { setActiveCategory('all'); setNeedContact(false) }

  // Compare mode: pick up to 3 products, then open the side-by-side view.
  const MAX_COMPARE = 3
  const toggleCompare = (id) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_COMPARE ? c : [...c, id]))
  const compared = compare.map((id) => sourceListings.find((l) => l.id === id)).filter(Boolean)
  const bestScore = compared.length ? Math.max(...compared.map((l) => scoreMap.get(l.id) ?? 0)) : 0
  useEffect(() => { setCompare((c) => c.filter((id) => sourceListings.some((l) => l.id === id))) }, [sourceListings])
  useEffect(() => { if (compare.length < 2) setDuelOpen(false) }, [compare.length])
  useEffect(() => {
    if (!duelOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setDuelOpen(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [duelOpen])
  const thumb = (l) => (l.imageUrl
    ? <span className="cat-thumb" style={{ backgroundImage: `url("${l.imageUrl}")` }} aria-hidden="true" />
    : <span className="cat-thumb cat-thumb--icon" aria-hidden="true">{DEMO_ICONS[l.icon] ?? DEMO_ICONS.shield}</span>)

  const goToPage = (n) => {
    const next = Math.min(Math.max(1, n), totalPages)
    setPage(next)
    gridRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  // Picking a category from the hero-area chip rail used to just flip the
  // filter state, leaving the visitor stranded at the top of the page while
  // the actual filtered results sat below the marquee/spotlight/recommended
  // sections. Scroll to the grid on selection — same pattern as goToPage —
  // so the result is visible right away instead of requiring a manual scroll.
  const selectCategory = (name) => {
    setActiveCategory(name)
    gridRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  const scrollToGrid = () => gridRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  const pickSuggestion = (l) => { setQuery(l.title); setDebouncedQuery(l.title); setSuggestOpen(false); setSIdx(-1); scrollToGrid() }
  const showAllResults = () => { setSuggestOpen(false); setSIdx(-1); scrollToGrid() }
  const onSearchKeyDown = (e) => {
    const n = suggest.list.length
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setSuggestOpen(true); setSIdx((i) => (i + 1) % n) }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setSIdx((i) => (i <= 0 ? n - 1 : i - 1)) }
    else if (e.key === 'Escape') { setSuggestOpen(false); setSIdx(-1) }
    else if (e.key === 'Enter') { if (suggestOpen && sIdx >= 0 && suggest.list[sIdx]) pickSuggestion(suggest.list[sIdx]); else showAllResults() }
  }

  // index can briefly outlive a shrinking list, so wrap it rather than trust it.
  const activeSpotlight = spotlights.length ? spotlights[spotlight.index % spotlights.length] : null
  const activePromo = promos.length ? promos[promoRotator.index % promos.length] : null

  return (
    <>
      <PageBackdrop />

      <Navbar />
      <main className="about-page services-page">
        <section className="scroll-section about-hero services-hero" ref={heroRef}>
          <div className="services-hero-aurora" aria-hidden="true" />
          <div className="svh-wrap">
          <div className="svh-copy">
            <div className="section-eyebrow reveal-fade">{tr("Health Marketplace")}</div>
            <h1 className="section-title about-hero-title reveal-fade">
              {tr("The marketplace for healthcare")} <span className="section-title-accent">{tr("safety products & services")}</span>
            </h1>

            <div className="services-search reveal-fade">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="9" cy="9" r="6" />
                <line x1="13.5" y1="13.5" x2="18" y2="18" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder={tr("Search by product, category, or organization…")}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true); setSIdx(-1) }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setSuggestOpen(false)}
                onKeyDown={onSearchKeyDown}
                role="combobox"
                aria-expanded={suggestOpen && suggest.list.length > 0}
                aria-autocomplete="list"
                aria-label={tr("Search services and products")}
              />
              {query
                ? <button type="button" className="services-search-clear" onClick={() => { setQuery(''); searchRef.current?.focus() }} aria-label={tr("Clear search")}>✕</button>
                : <kbd className="services-search-kbd" aria-hidden="true">/</kbd>}

              {suggestOpen && suggest.list.length > 0 && (
                <div className="services-suggest" role="listbox" onMouseDown={(e) => e.preventDefault()}>
                  {suggest.list.map((l, i) => (
                    <button
                      key={l.id}
                      type="button"
                      role="option"
                      aria-selected={i === sIdx}
                      className={`services-suggest-item${i === sIdx ? ' is-active' : ''}`}
                      style={{ '--chip-accent': getAccent(l.category) }}
                      onMouseEnter={() => setSIdx(i)}
                      onClick={() => pickSuggestion(l)}
                    >
                      <i className="services-suggest-dot" aria-hidden="true" />
                      <span className="services-suggest-main"><b>{tr(l.title)}</b><small>{orgOf(l) ?? tr("Partner organization")}</small></span>
                      {l.category && <span className="services-suggest-tag">{tr(l.category)}</span>}
                    </button>
                  ))}
                  <button type="button" className="services-suggest-all" onClick={showAllResults}>
                    {tr("See all")} {suggest.total} {suggest.total === 1 ? tr("result") : tr("results")} <kbd>↵</kbd>
                  </button>
                </div>
              )}
            </div>

            {categories.length > 0 && (
              <div className="services-popular reveal-fade">
                <span>{tr("Popular")}</span>
                {categories.slice(0, 4).map((c) => (
                  <button key={c.name} type="button" style={{ '--chip-accent': getAccent(c.name) }} onClick={() => selectCategory(c.name)}>{tr(c.name)}</button>
                ))}
              </div>
            )}

            <div className="services-stat-strip reveal-fade" aria-hidden={status === 'loading'}>
              {[
                { k: 'p', icon: 'box', value: sourceListings.length, suffix: '+', label: 'Products & services' },
                { k: 'o', icon: 'org', value: orgCount || null, label: 'Partner organizations' },
                { k: 'c', icon: 'grid', value: categories.length || null, label: 'Categories covered' },
                { k: 't', icon: 'clock', value: '24/7', label: 'Catalog updated in real time' },
              ].map((x) => (
                <div className="services-stat" key={x.k}>
                  <span className="services-stat-ico" aria-hidden="true">{STAT_ICONS[x.icon]}</span>
                  <div className="services-stat-txt">
                    <span className="services-stat-value">{x.value == null ? '—' : <CountUp value={x.value} suffix={x.suffix} />}</span>
                    <span className="services-stat-label">{tr(x.label)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ServicesHeroPortal listings={sourceListings} onBrowse={selectCategory} />
          </div>
        </section>

        {orgLoop.length > 0 && (
          <section className="services-orgs" aria-label={tr("Partner organizations")}>
            <span className="services-orgs-label">{tr("Trusted by partner organizations")}</span>
            <div className="services-orgs-mask">
              <div className="services-orgs-track">
                {[...orgLoop, ...orgLoop].map((name, i) => (
                  <span key={`${name}-${i}`} className="services-orgs-item" aria-hidden={i >= orgLoop.length} style={{ '--h': sumHue(name) }}>
                    <b>{getInitials(name)}</b>{tr(name)}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {categories.length > 0 && (
          <>
          <div ref={setRailEl} className="services-rail-sentinel" aria-hidden="true" />
          <section className={`services-category-rail-section${railStuck ? ' is-stuck' : ''}`}>
            <div className="services-category-rail" role="tablist" aria-label={tr("Filter by category")}>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'all'}
                className={`services-chip${activeCategory === 'all' ? ' services-chip--active' : ''}`}
                onClick={() => selectCategory('all')}
              >
                {tr("All categories")}
                <span className="services-chip-count">{sourceListings.length}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  style={{ '--chip-accent': getAccent(cat.name) }}
                  role="tab"
                  aria-selected={activeCategory === cat.name}
                  className={`services-chip${activeCategory === cat.name ? ' services-chip--active' : ''}`}
                  onClick={() => selectCategory(cat.name)}
                >
                  <i className="services-chip-dot" aria-hidden="true" />
                  {tr(cat.name)}
                  <span className="services-chip-count">{cat.count}</span>
                </button>
              ))}
            </div>
          </section>
          </>
        )}

        <section className="services-marquee-section">
          <div className="section-content services-marquee-head">
            <div className="section-eyebrow">{tr("Sponsored")}</div>
            <h2 className="section-title services-marquee-title">{tr("What our partners are offering")} <span className="sp3-title-accent">{tr("right now")}</span></h2>
          </div>

          {/* Sponsored: 3D cover-flow (SponsoredCarousel). The auto-advance hook stays here so pace, hover-pause and tracking are unchanged. */}
          {activePromo
            ? <SponsoredCarousel promos={promos} usingDemoData={usingDemoData} rotator={promoRotator} />
            : <div className="section-content"><EmptySlot text={tr("This sponsored slot is available.")} /></div>}
        </section>

        <section className="scroll-section services-feature-section">
          <div className="section-content services-feature-content">
            <div className="services-feature-heading">
              <div>
                <div className="section-eyebrow">{tr("Featured")}</div>
                <h2 className="section-title services-recommended-title">{tr("This month's featured partner")}</h2>
                <p className="services-section-sub">{tr("A closer look at one organization worth knowing.")}</p>
              </div>
            </div>
            {activeSpotlight
              ? (
                <FeaturedPartnerCard
                  spotlights={spotlights}
                  index={spotlight.index}
                  goTo={spotlight.goTo}
                  onMouseEnter={spotlight.onMouseEnter}
                  onMouseLeave={spotlight.onMouseLeave}
                  usingDemoData={usingDemoData}
                  onSeeListings={(name) => { setQuery(name); setDebouncedQuery(name); scrollToGrid() }}
                />
              )
              : <EmptySlot text={tr("The featured partner slot is available.")} />}
          </div>
        </section>

        {recommended.length > 0
          ? <RecommendedCarousel items={recommended} usingDemoData={usingDemoData} />
          : (
            <section className="scroll-section services-recommended-empty">
              <div className="section-content">
                <div className="section-eyebrow">{tr("Recommended")}</div>
                <EmptySlot text={tr("The recommended row is available.")} />
              </div>
            </section>
          )}

        <section className="scroll-section services-listing-section" ref={gridRef}>
          <div className="section-content">
            <div className="section-eyebrow">{tr("Catalog")}</div>
            <h2 className="section-title services-recommended-title">{tr("All products & services")}</h2>

            {status === 'loading' && (
              <>
                <span className="sr-only" role="status">{tr("Loading listings…")}</span>
                <ServicesBentoSkeleton />
              </>
            )}

            {status !== 'loading' && (
              <>
                <div className="cat-layout">
                <aside className="cat-filters services-fade-in" aria-label={tr("Filter the catalog")}>
                  <div className="cat-filters-head">
                    <span>{tr("Filters")}</span>
                    {filtersActive && <button type="button" onClick={clearFilters}>{tr("Clear")}</button>}
                  </div>
                  <div className="cat-group">
                    <h4>{tr("Category")}</h4>
                    <button type="button" className={`cat-opt${activeCategory === 'all' ? ' is-on' : ''}`} style={{ '--c': 'var(--cyan)' }} aria-pressed={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>
                      <i className="cat-box" aria-hidden="true" />{tr("All")}<em>{sourceListings.length}</em>
                    </button>
                    {categories.map((c) => (
                      <button key={c.name} type="button" className={`cat-opt${activeCategory === c.name ? ' is-on' : ''}`} style={{ '--c': getAccent(c.name) }} aria-pressed={activeCategory === c.name} onClick={() => setActiveCategory(c.name)}>
                        <i className="cat-box" aria-hidden="true" />{tr(c.name)}<em>{c.count}</em>
                      </button>
                    ))}
                  </div>
                  <label className="cat-switch">
                    <span>{tr("Can be contacted")}</span>
                    <input type="checkbox" checked={needContact} onChange={(e) => setNeedContact(e.target.checked)} />
                    <i aria-hidden="true" />
                  </label>
                </aside>
                <div className="cat-main">
                <div className="services-toolbar services-fade-in" ref={toolbarRef}>
                  <span className="services-toolbar-count">
                    {filtered.length} {filtered.length === 1 ? tr("result") : tr("results")}
                    {activeCategory !== 'all' && <> {tr("in")} <strong>{activeCategory}</strong></>}
                  </span>
                  {activeCategory !== 'all' && (
                    <button type="button" className="services-toolbar-clear" onClick={() => setActiveCategory('all')}>
                      {tr("Clear filter ✕")}
                    </button>
                  )}
                  {bothKinds && (
                  <label className="services-sort">
                    <span>{tr("Sold by")}</span>
                    <select value={sellerKind} onChange={(e) => { setSellerKind(e.target.value); setPage(1) }} aria-label={tr("Filter by seller type")}>
                      <option value="all">{tr("Manufacturers & distributors")}</option>
                      <option value="MANUFACTURER">{tr("Manufacturers")}</option>
                      <option value="DISTRIBUTOR">{tr("Distributors")}</option>
                    </select>
                  </label>
                  )}
                  <label className="services-sort">
                    <span>{tr("Sort")}</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={tr("Sort results")}>
                      <option value="featured">{tr("Featured first")}</option>
                      <option value="az">{tr("Name A–Z")}</option>
                      <option value="za">{tr("Name Z–A")}</option>
                    </select>
                  </label>
                </div>

                {filtered.length === 0 ? (
                  <div className="services-state services-fade-in">
                    <p>{tr("No listings match your search.")}</p>
                    {(query || filtersActive) && (
                      <button
                        type="button"
                        className="services-toolbar-clear services-state-clear"
                        onClick={() => { setQuery(''); clearFilters() }}
                      >
                        {tr("Clear search & filters ✕")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="services-bento" ref={bentoRef}>
                    {pageListings.map((listing, i) => {
                      const isBig = false
                      const orgLabel = orgOf(listing)
                      const accent = getAccent(listing.category)
                      const on = compare.includes(listing.id)
                      const sc = scoreMap.get(listing.id) ?? 0
                      const links = (listing.website || listing.contactEmail || listing.contactPhone) && (
                        <div className="pcard-links">
                          {listing.website && (
                            <a href={listing.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{tr("Visit website ↗")}</a>
                          )}
                          {listing.contactEmail && (
                            <a href={`mailto:${listing.contactEmail}`} onClick={(e) => e.stopPropagation()}>{tr("Contact")}</a>
                          )}
                          {listing.contactPhone && (
                            <a href={`tel:${listing.contactPhone.replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()}>{tr("Call")}</a>
                          )}
                        </div>
                      )
                      return (
                        <article
                          key={listing.id}
                          data-listing-id={listing.id}
                          className={`pcard services-fade-in${isBig ? ' pcard--big' : ''}${on ? ' is-compared' : ''}`}
                          style={{ animationDelay: `${Math.min(i, 8) * 0.06}s`, '--pcard-accent': accent }}
                          tabIndex={0}
                          onMouseMove={reduceMotion ? undefined : handlePcardTilt}
                          onMouseLeave={reduceMotion ? undefined : handlePcardUntilt}
                        >
                          {listing.imageUrl ? (
                            isContainFit(listing) ? (
                              <div className="pcard-bg pcard-bg--photo if-smart" data-accent={!listing.imageAccent || listing.imageAccent === 'transparent' ? 'transparent' : undefined} style={listing.imageAccent && listing.imageAccent !== 'transparent' ? { '--pcard-accent': listing.imageAccent } : { backgroundImage: 'none', backgroundColor: 'transparent' }} role="img" aria-label={tr(listing.title)}>
                                {listing.imageAccent && listing.imageAccent !== 'transparent' && <span className="if-smart-bg" aria-hidden="true" />}
                                {listing.imageAccent && listing.imageAccent !== 'transparent' && <span className="if-smart-frame" aria-hidden="true" />}
                                <span className="if-smart-fg" style={{ ...imageFrameStyle(listing), ...fgInset(listing) }} aria-hidden="true" />
                              </div>
                            ) : (
                              <div className="pcard-bg pcard-bg--photo" style={imageFrameStyle(listing)} role="img" aria-label={tr(listing.title)} />
                            )
                          ) : (
                            <div className="pcard-bg" aria-hidden="true">
                              {listing.icon ? DEMO_ICONS[listing.icon] : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="7" width="18" height="13" rx="2" />
                                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              )}
                            </div>
                          )}

                          {/* One corner badge per card: keep the "Example" disclosure
                              when in demo mode, drop the verified checkmark so the
                              two badges don't stack in opposite corners. */}
                          {!usingDemoData && <span className="pcard-score" style={{ '--sc': sc }} title={tr("Profile score {0}/100", [sc])}><b>{sc}</b></span>}
                          <button
                            type="button"
                            className={`pcard-compare${on ? ' is-on' : ''}`}
                            aria-pressed={on}
                            aria-label={tr("{0} compare: {1}", [on ? 'Remove from' : 'Add to', listing.title])}
                            disabled={!on && compare.length >= MAX_COMPARE}
                            onClick={(e) => { e.stopPropagation(); toggleCompare(listing.id) }}
                          >
                            {on ? '✓' : <>＋ <span>{tr("Compare")}</span></>}
                          </button>

                          <div className="pcard-body">
                            {listing.category && <span className="pcard-tag">{tr(listing.category)}</span>}
                            <h3>{tr(listing.title)}</h3>
                            {orgLabel && <span className="pcard-org">{orgLabel}{listing.sellerKind === 'DISTRIBUTOR' ? <> · <em>{tr("Distributor")}</em></> : null}</span>}

                            {isBig ? (
                              // The big tile has room to spare, and hover-only
                              // content is unreachable on touch devices anyway —
                              // so its summary/links are always on, not hidden
                              // behind :hover like the small tiles.
                              <div className="pcard-detail pcard-detail--static">
                                {listing.summary && <p>{tr(listing.summary)}</p>}
                                {links}
                              </div>
                            ) : (
                              <div className="pcard-detail pcard-hover-detail">
                                {listing.summary && <p>{tr(listing.summary)}</p>}
                                {links}
                              </div>
                            )}
                            {/* Toujours visible (pas seulement au survol : inutilisable au tactile). */}
                            <Link className="pcard-details" to={`/services/${encodeURIComponent(listing.id)}`} aria-label={tr('Voir les détails de {0}', [tr(listing.title)])}>
                              {tr('Voir détails')} <span aria-hidden="true">→</span>
                            </Link>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}

                {totalPages > 1 && (
                  <ServicesPagination page={page} totalPages={totalPages} onChange={goToPage} />
                )}
                </div>
                </div>

                {createPortal(
                  <>
                {compared.length > 0 && (
                  <div className="cat-tray" role="region" aria-label={tr("Compare products")}>
                    <span className="cat-tray-label">{tr("Compare")}</span>
                    <div className="cat-tray-items">
                      {compared.map((l) => (
                        <div className="cat-chip" key={l.id} style={{ '--pcard-accent': getAccent(l.category) }}>
                          {thumb(l)}
                          <span className="cat-chip-text"><b>{tr(l.title)}</b><small>{orgOf(l)}</small></span>
                          <button type="button" aria-label={tr("Remove {0} from compare", [l.title])} onClick={() => toggleCompare(l.id)}>{tr("×")}</button>
                        </div>
                      ))}
                      {compared.length < 2 && <div className="cat-chip cat-chip--empty">{tr("＋ pick another product")}</div>}
                    </div>
                    <button type="button" className="cat-tray-clear" onClick={() => setCompare([])}>{tr("Clear")}</button>
                    <button type="button" className="cat-tray-go" disabled={compared.length < 2} onClick={() => setDuelOpen(true)}>{tr("Compare ({0}) {1}", [compared.length, ''])}{ARROW_ICON}</button>
                  </div>
                )}

                {duelOpen && compared.length >= 2 && (
                  <div className="cat-duel" role="dialog" aria-modal="true" aria-label={tr("Compare products")} onClick={() => setDuelOpen(false)}>
                    <div className="cat-duel-panel" style={{ '--n': compared.length }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="cat-duel-close" aria-label={tr("Close comparison")} onClick={() => setDuelOpen(false)} autoFocus>{tr("×")}</button>
                      <div className="cat-duel-eyebrow">{tr("Compare · {0} products", [compared.length])}</div>
                      <div className="cat-duel-grid">
                        <div className="cat-duel-corner" />
                        {compared.map((l) => (
                          <div key={l.id} className="cat-duel-head" style={{ '--pcard-accent': getAccent(l.category) }}>
                            <div className="cat-duel-media">{thumb(l)}</div>
                            {l.category && <span className="cat-duel-tag">{tr(l.category)}</span>}
                            <h3>{tr(l.title)}</h3>
                            <span className="cat-duel-org">{orgOf(l)}</span>
                          </div>
                        ))}

                        <div className="cat-duel-label">{tr("Profile score")}</div>
                        {compared.map((l) => {
                          const v = scoreMap.get(l.id) ?? 0
                          const best = v === bestScore && compared.length > 1 && compared.some((o) => (scoreMap.get(o.id) ?? 0) !== v)
                          return (
                            <div key={l.id} className={`cat-duel-cell${best ? ' is-best' : ''}`} style={{ '--pcard-accent': getAccent(l.category) }}>
                              <b>{v}</b><span className="cat-duel-bar"><i style={{ width: `${v}%` }} /></span>
                            </div>
                          )
                        })}

                        <div className="cat-duel-label">{tr("About")}</div>
                        {compared.map((l) => <div key={l.id} className="cat-duel-cell cat-duel-cell--text">{l.summary || '—'}</div>)}

                        <div className="cat-duel-label">{tr("Website")}</div>
                        {compared.map((l) => <div key={l.id} className="cat-duel-cell">{l.website ? <a href={l.website} target="_blank" rel="noopener noreferrer">{tr("Visit ↗")}</a> : <span className="cat-duel-no">—</span>}</div>)}

                        <div className="cat-duel-label">{tr("Email")}</div>
                        {compared.map((l) => <div key={l.id} className="cat-duel-cell">{l.contactEmail ? <span className="cat-duel-yes">{tr("✓ Available")}</span> : <span className="cat-duel-no">—</span>}</div>)}

                        <div className="cat-duel-label">{tr("Phone")}</div>
                        {compared.map((l) => <div key={l.id} className="cat-duel-cell">{l.contactPhone ? <span className="cat-duel-yes">{tr("✓ Available")}</span> : <span className="cat-duel-no">—</span>}</div>)}

                        <div className="cat-duel-corner" />
                        {compared.map((l) => {
                          const href = l.contactEmail ? `mailto:${l.contactEmail}` : l.website || (l.contactPhone ? `tel:${l.contactPhone.replace(/[^\d+]/g, '')}` : null)
                          return (
                            <div key={l.id} className="cat-duel-cta">
                              {href
                                ? <a href={href} className="cat-duel-btn" {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{tr("Contact {0}", [orgOf(l)])}</a>
                                : <span className="cat-duel-btn is-off">{tr("No contact listed")}</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
                  </>,
                  document.body,
                )}
              </>
            )}
          </div>
        </section>

        <section className="scroll-section about-cta services-cta" ref={ctaRef}>
          <div className="about-cta-atmosphere" aria-hidden="true"></div>
          <div className="section-content reveal-fade">
            <EyeCta />
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

