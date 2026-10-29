import React, { useEffect, useRef, useState } from 'react'
import './product-studio.css'
import './studio-polish.css'
import { shrinkImage, removeWhiteBackground, smartBackdrop, applyAdjustments, getImageAspect } from '../../lib/image.js'
import { getPhotoAdvice, suggestColourFor } from '../../lib/photoAdvisor.js'
import PhotoAdvice from './PhotoAdvice.jsx'
import AiWriter from './AiWriter.jsx'
import AuditProductField from './AuditProductField.jsx'
import ListingScore from './ListingScore.jsx'
import { scoreListing, placementAdvice } from '../../lib/listingScore.js'
import { waNumber } from '../../lib/whatsapp.js'
import { removeBackgroundAI, cutoutStore, warmUpCutout } from '../../lib/aiCutoutClassic.js'
import { fmt, hue } from '../../lib/format.js'
import { Ic as makeIcon } from '../../pages/manage/icons.jsx'
import FeaturedPartnerCard from '../../pages/services/FeaturedPartnerCard.jsx'
import { toSpotlight } from '../../pages/services/helpers.jsx'
import ImageFramer from './ImageFramer.jsx'
import ImageAdjust from './ImageAdjust.jsx'
import ImageEraser from './ImageEraser.jsx'
import { imageFrameStyle, isContainFit, pickFit, fgInset } from '../../lib/imageFrame.js'
import { tr } from '../../i18n/translate.js';

// Studio icons are sized by the studio's own CSS, so they skip the manage-page `.ic` class.
const Ic = (d) => makeIcon(d, '')
const IcBack = Ic(<path d="M15 5l-7 7 7 7" />)
const IcSave = Ic(<><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>)
const IcEdit = Ic(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>)
const IcImage = Ic(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8 8" /></>)
const IcMail = Ic(<><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4 7l8 6 8-6" /></>)

// Canva-style studio: edit the product directly on a live preview of the
// public Services page, pick WHERE it appears on a page map, then publish.
const ORDER = ['FEATURED', 'SPONSORED', 'RECOMMENDED', 'STANDARD']
// Logo upload: small, square-ish PNG (keeps transparency), long side <= 320 px.
function logoDataUrl(file, max = 320) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable logo')) }
    img.src = url
  })
}

// Miniature wireframes of the four sections, mirroring the public Services page:
// FEATURED = one wide card (picture | logo, info, seals, buttons);
// SPONSORED = centred slide with its neighbours peeking + tab rail;
// RECOMMENDED = curved coverflow of cards + dots; STANDARD = grid of product cards.
// Purely decorative (aria-hidden) and styled in studio-polish.css (.pm-*).
const MINI = {
  FEATURED: (
    <>
      <b className="pm-ribbon" />
      <span className="pm-media"><em /></span>
      <span className="pm-info">
        <span className="pm-head"><s className="pm-hex" /><i className="pm-l w60" /></span>
        <i className="pm-l w85" />
        <span className="pm-seals"><u /><u /><u /></span>
        <span className="pm-btns"><u /><u /></span>
      </span>
    </>
  ),
  SPONSORED: (
    <>
      <span className="pm-s" />
      <span className="pm-s pm-s--on">
        <span className="pm-ring" />
        <span className="pm-tx"><i className="pm-l w50" /><i className="pm-l w90" /><i className="pm-l w70" /></span>
      </span>
      <span className="pm-s" />
      <span className="pm-rail"><u className="on" /><u /><u /></span>
    </>
  ),
  RECOMMENDED: (
    <>
      {[0, 1, 2, 3, 4].map((n) => (
        <span key={n} className="pm-c"><i className="pm-art" /><i className="pm-l w70" /></span>
      ))}
      <span className="pm-rail"><u /><u className="on" /><u /></span>
    </>
  ),
  STANDARD: (
    <>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="pm-g"><i className="pm-art" /><i className="pm-l w70" /></span>
      ))}
    </>
  ),
}
// Empty title → brand cyan/teal hue, so a blank card matches the site instead of a random orange.
// Never let a slow/hung step freeze a button forever: give up after `ms` so the caller can fall back.
const withTimeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout')), ms)
  p.then((v) => { clearTimeout(t); res(v) }, (e) => { clearTimeout(t); rej(e) })
})

// `audit` : réponse de GET /services/audit-products (null = en chargement ; undefined = champ masqué, ex. fournisseur ou démo).
export default function ProductStudio({ initial, listing, pricing, orgName, featuredBlocked, stat, onApplyAll, onClose, onSave, onPublish, onPublishFree, selling = false, audit }) {
  const [f, setF] = useState({ imageZoom: 100, imageFocusX: 50, imageFocusY: 50, imageFit: 'cover', ...initial })
  const [base, setBase] = useState(initial)
  const [savedId, setSavedId] = useState(listing?.id)
  const [tab, setTab] = useState('content')
  const [zone, setZone] = useState(listing?.paidActive && listing?.placement ? listing.placement : 'STANDARD') // free catalog unless a paid promotion is running
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [saved, setSaved] = useState(false)
  const [bgBusy, setBgBusy] = useState(false)
  const [bgOriginal, setBgOriginal] = useState(null) // previous imageUrl, so 'Remove background' can be undone once
  const [adjustPreview, setAdjustPreview] = useState('none') // live CSS filter from ImageAdjust's sliders, before Apply bakes it in
  const [proBusy, setProBusy] = useState(false)
  const [eraserOpen, setEraserOpen] = useState(false)
  const [writerOpen, setWriterOpen] = useState(false)
  const device = 'desktop' // the Desktop/Mobile preview switch was removed
  const [imageLong, setImageLong] = useState(0) // longest side of the current photo, for the quality score
  const [draftBanner, setDraftBanner] = useState(null) // an unsaved draft found in this browser
  const [advice, setAdvice] = useState(null) // photo advisor result: { choice, options, background, reason, source, issues }
  // "Remove background" and "Make it look professional" must give the same
  // result whether pressed once or five times in a row — so both always
  // start from this untouched copy of whatever photo was last uploaded or
  // pasted, never from f.imageUrl (which may already carry earlier edits).
  // Re-running an edit ON TOP OF ITS OWN output — background removal on an
  // already-transparent photo, sharpening on an already-sharpened one — is
  // what produced the mangled results in the first place.
  const [originalUrl, setOriginalUrl] = useState(initial.imageUrl || null)
  const fileRef = useRef()
  const logoRef = useRef()
  // Pre-load the AI model while the user is still filling the form, so the first cutout is fast.
  useEffect(() => {
    const t = setTimeout(() => { warmUpCutout() }, 800)
    return () => clearTimeout(t)
  }, [])

  // The studio is full-screen: freeze the page behind it so there is only one scrollbar.
  useEffect(() => {
    const el = document.documentElement, prev = el.style.overflow
    el.style.overflow = 'hidden'
    return () => { el.style.overflow = prev }
  }, [])

  const dirty = JSON.stringify(f) !== JSON.stringify(base)
  const v = (k) => f[k] ?? ''
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSaved(false); setMsg(null) }
  const planOf = (id) => pricing.placements.find((p) => p.id === id)
  const plan = planOf(zone) ?? pricing.placements[0]
  const checks = [
    ['Name', !!v('title').trim(), true], ['Summary', !!v('summary').trim(), true], ['Description', !!v('description').trim(), true],
    ['Cover image', !!v('imageUrl'), false], ['Contact', !!(v('contactEmail') || v('website') || v('contactPhone')), false],
  ]
  const ready = checks.filter((c) => c[2]).every((c) => c[1])
  const isOrg = zone === 'FEATURED' // Featured partner = the ORGANIZATION's own showcase, not a single product
  const scoreRes = scoreListing(f, { imageLong, org: isOrg })
  const requiredMissing = checks.filter((c) => c[2] && !c[1]).map((c) => c[0].toLowerCase())
  // status = the server's effective state: DRAFT | PENDING_REVIEW | REJECTED | PUBLISHED (public) | ARCHIVED
  const live = listing?.status === 'PUBLISHED'
  const inReview = listing?.status === 'PENDING_REVIEW'
  const rejected = listing?.status === 'REJECTED'
  const wantsPaid = zone !== 'STANDARD'
  const promoCleared = listing?.promoAllowed !== false
  const stateLabel = live ? 'Live' : inReview ? 'Awaiting validation' : rejected ? 'Not approved' : 'Draft'
  const placeAdvice = placementAdvice({ score: scoreRes.score, stat, zone })

  // Photo size, for the quality score.
  useEffect(() => {
    if (!f.imageUrl) { setImageLong(0); return }
    let off = false
    const i = new Image()
    i.onload = () => { if (!off) setImageLong(Math.max(i.naturalWidth, i.naturalHeight)) }
    i.onerror = () => { if (!off) setImageLong(0) }
    i.src = f.imageUrl
    return () => { off = true }
  }, [f.imageUrl])

  // Autosave: an unsaved draft survives a refresh, a crash or a closed tab (this browser only). Huge photos are
  // not kept (localStorage is small): the text and settings always are.
  const draftKey = `nexus.studio.draft.${listing?.id ?? 'new'}`
  const clearDraft = () => { try { localStorage.removeItem(draftKey) } catch { /* private mode */ } }
  // A draft is only worth keeping (and mentioning) if it holds real work: a name, a summary, a description or a photo.
  const DRAFT_TTL = 30 * 864e5      // drafts older than 30 days are deleted
  const PROMPT_EVERY = 14 * 864e5   // the "restore?" notice shows at most once every 2 weeks
  const promptKey = 'nexus.studio.draftPrompt'
  const hasWork = (x = {}) => !!(String(x.title ?? '').trim() || String(x.summary ?? '').trim() || String(x.description ?? '').trim() || x.imageUrl)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw)
      if (!d?.f || !hasWork(d.f) || Date.now() - (d.t ?? 0) > DRAFT_TTL) { clearDraft(); return } // empty/expired: silently drop
      if (JSON.stringify(d.f) === JSON.stringify({ ...f })) return
      const last = Number(localStorage.getItem(promptKey) || 0)
      if (Date.now() - last < PROMPT_EVERY) return // asked recently: do not nag
      localStorage.setItem(promptKey, String(Date.now()))
      setDraftBanner(d)
    } catch { /* corrupt draft: ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty || draftBanner || !hasWork(f)) return
    const t = setTimeout(() => {
      try {
        const big = f.imageUrl && f.imageUrl.length > 350000
        localStorage.setItem(draftKey, JSON.stringify({ t: Date.now(), imageDropped: !!big, f: big ? { ...f, imageUrl: base.imageUrl ?? '' } : f }))
      } catch { /* quota or private mode: the draft is a bonus */ }
    }, 900)
    return () => clearTimeout(t)
  }, [f, dirty, draftBanner]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  function restoreDraft() {
    setF({ ...f, ...draftBanner.f }); setSaved(false)
    if (draftBanner.imageDropped) setMsg(tr("Applied the saved draft. The photo was too large to keep in it: add it again."))
    setDraftBanner(null)
  }
  function discardDraft() { clearDraft(); setDraftBanner(null) }

  async function save() {
    if (!ready) { setMsg(tr("Add a name, summary and description first.")); return null }
    if (!dirty && savedId) return { id: savedId }
    setBusy(true); const r = await onSave(f, savedId); setBusy(false)
    if (r.error) { setMsg(tr(r.error)); return null }
    setSavedId(r.id); setBase(f); setSaved(true); clearDraft(); return r
  }
  // Free publication: saves, then asks VigiCore for validation (the product is public once approved).
  async function publishFree() { const r = await save(); if (r) await onPublishFree(r.id) }
  // Paid promotion: only offered for a product that is already public and cleared for promotion.
  async function promote() { const r = await save(); if (r) onPublish(r.id, zone) }
  function close() { if (dirty) { if (!window.confirm('Discard your unsaved changes?')) return; clearDraft() } onClose() }
  async function pick(file) {
    if (!file?.type.startsWith('image/')) return
    try {
      const url = await shrinkImage(file)
      let fit = 'contain'
      try { fit = pickFit(await getImageAspect(url), zone) } catch { /* keep the safe default */ }
      setOriginalUrl(url); setAdvice(null)
      setF({ ...f, imageUrl: url, imageFit: fit }); setBgOriginal(null); setAdjustPreview('none'); setSaved(false)
    } catch { setMsg(tr("That image could not be read.")) }
  }

  async function pickLogo(file) {
    if (!file?.type.startsWith('image/')) return
    try { setF({ ...f, logoUrl: await logoDataUrl(file) }); setSaved(false); setMsg(null) } catch { setMsg(tr("That logo could not be read.")) }
  }

  // AI cutout first: cloud RMBG 2.0 through our backend, then the on-device IMG.LY small model
  // (both handled inside removeBackgroundAI, invisibly); if neither can run (offline AND model
  // files missing) fall back to the colour-based cutout.
  async function cutout(url) {
    setMsg(tr("Removing background with AI…"))
    try {
      return { url: await removeBackgroundAI(url, (p) => setMsg(p < 1 ? tr("Loading the AI model… {0}% (first use only)", [Math.round(p * 100)]) : tr("Removing background with AI…"))), ai: true }
    } catch (err) {
      console.warn('AI cutout unavailable, using the colour-based cutout:', err)
      return { url: await removeWhiteBackground(url), ai: false }
    } finally { setMsg(null) }
  }

  async function stripBackground() {
    if (!originalUrl || bgBusy) return
    setBgBusy(true); setMsg(null); setAdvice(null)
    try {
      const { url: out, ai } = await cutout(originalUrl)
      setBgOriginal(f.imageUrl); setF({ ...f, imageUrl: out }); setAdjustPreview('none'); setSaved(false)
      // Small non-blocking hint only when the cloud was expected to work but the local model stepped in.
      if (ai && cutoutStore.last?.url === out && cutoutStore.last.notice) setMsg(cutoutStore.last.notice)
      // The colour-based fallback can't tell a white product from a white backdrop: say so instead of failing silently.
      if (!ai) setMsg(tr("The AI cutout model could not be loaded (run \"npm install\" so /imgly/ exists), so the colour-based cutout was used. White products can come out ragged this way."))
    } catch {
      setMsg(tr("Couldn't remove the background from this image — if it's a pasted URL, try uploading the file instead."))
    } finally {
      setBgBusy(false)
    }
  }
  function undoBackground() {
    if (!bgOriginal) return
    setF({ ...f, imageUrl: bgOriginal }); setBgOriginal(null); setSaved(false)
  }

  // One tap = the moves that turn a raw phone photo into something that
  // reads as curated rather than pasted in: clear the background, apply the
  // same gentle brightness/contrast/sharpen preset a studio shot would get,
  // and pick whichever framing suits THIS photo's own shape for the
  // currently selected placement — crop it in if that loses little of the
  // product, or show it whole if cropping would cut off too much. Each step
  // is best-effort: if background removal fails (e.g. a cross-origin URL),
  // framing and the light preset still apply. Always starts from
  // originalUrl (see above) so pressing it again re-does the same work
  // instead of compounding on its own previous result.
  async function makeProfessional() {
    if (proBusy) return
    const src = originalUrl || f.imageUrl // fall back to the current photo if the untouched original was never recorded
    if (!src) { setMsg(tr("Add a photo first.")); return }
    if (!originalUrl) setOriginalUrl(src)
    const before = f.imageUrl
    setProBusy(true); setMsg(null); setAdvice(null)
    try {
      // 1. Candidate cutout (AI first, colour-based fallback). The AI step is time-boxed so it can never hang the button.
      let cutUrl = null, keptWhite = false
      try {
        setMsg(tr("Removing background with AI…"))
        cutUrl = await withTimeout(removeBackgroundAI(src, (p) => setMsg(p < 1 ? tr("Loading the AI model… {0}% (first use only)", [Math.round(p * 100)]) : tr("Removing background with AI…"))), 90000)
      } catch (err) {
        console.warn('[studio] AI cutout failed, using the colour-based cutout:', err)
        try { const r = await smartBackdrop(src); cutUrl = r.url; keptWhite = r.mode === 'kept-white' } catch (err2) { console.warn('[studio] colour cutout failed too, keeping the original photo:', err2) }
      }
      const hasCut = !!cutUrl && !keptWhite // a real transparent cutout (kept-white is just the cleaned original)

      // 2. Which look is best for THIS photo? AI vision when the server has it, on-device analysis otherwise.
      setMsg(tr("Choosing the best look for this photo…"))
      let adv = null
      try { adv = await getPhotoAdvice({ originalUrl: src, cutUrl: hasCut ? cutUrl : null, title: v('title'), category: v('category') }) } catch (err) { console.warn('[studio] photo advice failed:', err) }
      setMsg(null)
      const choice = !hasCut ? 'keep' : (adv?.decision ?? 'remove')

      // 3. Build every look once (same gentle studio preset each), so switching between them is instant.
      const presetCut = { brightness: 10, contrast: 14, saturation: 6, sharpenAmount: 20 }
      const presetKeep = { brightness: 0, contrast: 8, saturation: 4, sharpenAmount: 18 }
      const kept = hasCut && cutoutStore.last && cutoutStore.last.url === cutUrl ? cutoutStore.last : null
      let cutFinal = null
      if (hasCut) {
        cutFinal = cutUrl
        try { cutFinal = await applyAdjustments(cutUrl, presetCut) } catch { /* preset is a bonus, not required */ }
        if (kept && cutFinal !== kept.url) {
          try { cutoutStore.last = { ...kept, url: cutFinal, full: await applyAdjustments(kept.full, presetCut) } } catch { cutoutStore.last = null }
        }
      }
      let keepFinal = keptWhite && cutUrl ? cutUrl : src
      try { keepFinal = await applyAdjustments(keepFinal, presetKeep) } catch { /* keep as is */ }

      const fitOf = async (u, fallback) => { try { return pickFit(await getImageAspect(u), zone) } catch { return fallback } }
      const options = {}
      if (cutFinal) { const fit = 'contain'; options.remove = { url: cutFinal, fit, accent: '' }; options.color = { url: cutFinal, fit, accent: adv?.background || '#dde6f0' } }
      options.keep = { url: keepFinal, fit: await fitOf(keepFinal, 'contain'), accent: '' }
      const bgColor = adv?.background || '#dde6f0'
      const chosen = options[choice] ?? options.keep
      const accent = choice === 'color' ? bgColor : ''

      setBgOriginal(before)
      // Functional update: the processing above takes seconds, and anything typed meanwhile (name, summary...) must not be overwritten by a stale copy of the form.
      setF((cur) => ({ ...cur, imageUrl: chosen.url, imageFit: chosen.fit, imageAccent: accent }))
      setAdjustPreview('none'); setSaved(false)
      setAdvice({
        choice, options, background: bgColor, source: adv?.source ?? 'auto', issues: adv?.issues ?? [],
        reason: adv?.reason || (keptWhite ? 'The product is white, so a clean white background looks better than a cutout.' : ''),
      })
      if (!hasCut && !keptWhite) setMsg(tr("Background removal needs a direct upload — the photo was still framed and lightly enhanced. Try uploading the file instead of a URL for the full effect."))
    } catch (err) {
      console.error('[studio] Make it look professional failed:', err)
      setMsg(tr("Couldn't finish improving this photo. Try uploading the file again, or use the Image tools below."))
    } finally {
      setProBusy(false) // always release the button, whatever happened above
    }
  }

  // One-tap switch between the looks the advisor prepared (Cutout / Colour / Original).
  function pickLook(k) {
    if (!advice?.options[k]) return
    const o = advice.options[k]
    setAdvice({ ...advice, choice: k })
    setF({ ...f, imageUrl: o.url, imageFit: o.fit, imageAccent: k === 'color' ? advice.background : '' })
    setSaved(false)
  }
  function setLookColor(hex) {
    setAdvice({ ...advice, background: hex })
    setF({ ...f, imageAccent: hex }); setSaved(false)
  }

// If this image is the AI cutout, the eraser gets the untrimmed cutout + the original photo so 'Restore' can bring back parts the AI dropped.
  const eraserBase = cutoutStore.last && cutoutStore.last.url === f.imageUrl ? cutoutStore.last : {}
  const containCover = f.imageUrl && isContainFit(f)
  const noBackdrop = !f.imageAccent || f.imageAccent === 'transparent'  // no colour chosen = no mat, not a grey default
  const accentVar = f.imageAccent && !noBackdrop ? { '--pcard-accent': f.imageAccent } : undefined
  const frame = f.imageUrl ? (containCover ? (noBackdrop ? { backgroundImage: 'none', backgroundColor: 'transparent' } : accentVar) : imageFrameStyle(f)) : { '--h': hue(v('title'), 190) }
  const media = (cls) => (
    <button type="button" className={`ps-media ${cls}${containCover ? ' if-smart' : ''}`} data-accent={noBackdrop ? 'transparent' : undefined} aria-label={tr("Change cover image")} onClick={() => fileRef.current.click()} style={{ ...frame, filter: adjustPreview }}>
      {containCover && (<>
        {!noBackdrop && <span className="if-smart-bg" aria-hidden="true" />}
        {!noBackdrop && <span className="if-smart-frame" aria-hidden="true" />}
        <span className="if-smart-fg" style={{ ...imageFrameStyle(f), ...fgInset(f), filter: adjustPreview }} aria-hidden="true" />
      </>)}
      {!f.imageUrl && <span><b>{(v('title')[0] || '+').toUpperCase()}</b><small>{isOrg ? tr("Add organization photo") : tr("Add cover image")}</small></span>}
    </button>
  )
  const title = <input className="ps-t" value={v('title')} maxLength={80} placeholder={isOrg ? tr("Organization name") : tr("Product name")} onChange={set('title')} aria-label={isOrg ? tr("Organization name") : tr("Product name")} />
  const summary = <textarea className="ps-s" rows={2} value={v('summary')} maxLength={140} placeholder={isOrg ? tr("One line that says what your organization does") : tr("One line that makes people click")} onChange={set('summary')} aria-label={isOrg ? tr("Tagline") : tr("Summary")} />
  const chip = <span className="ps-chip">{v('category') || isOrg ? tr("Field of activity") : tr("Category")}</span>
  const cta = <span className="ps-cta">{isOrg ? tr("View profile →") : tr("View details →")}</span>
  const card = (badge) => (
    <article className="ps-card">
      {badge && <em className="ps-badge">{tr(badge)}</em>}
      {media('ps-card-img')}
      <div className="ps-card-b">{chip}{tr(title)}{tr(summary)}<div className="ps-card-f"><small>{orgName}</small>{tr(cta)}</div></div>
    </article>
  )
  const ghost = <div className="ps-ghost" aria-hidden="true"><i /><i /><i /></div>

  const stage = {
    STANDARD: <div className="ps-row ps-row--grid">{ghost}{card()}{ghost}</div>,
    RECOMMENDED: <div className="ps-row">{ghost}{card('★ Recommended')}{ghost}</div>,
    SPONSORED: (
      <article className="ps-strip"><em className="ps-badge">{tr("Sponsored")}</em>{media('ps-strip-img')}
        <div>{chip}{tr(title)}{tr(summary)}</div>{tr(cta)}</article>
    ),
    // The REAL Featured partner card of the Services page, fed with the draft: what you see is what visitors get.
    FEATURED: (
      <div className="ps-feat-live">
        <FeaturedPartnerCard
          spotlights={[toSpotlight({ ...f, id: 'preview', orgName, title: v('title'), summary: v('summary'), description: v('description') })]}
          index={0} goTo={() => {}} usingDemoData={false}
        />
      </div>
    ),
  }[zone]

  // Segmented choice (logo shape, logo position, picture side) saved on the draft.
  const seg = (key, def, label, opts) => (
    <>
      <span className="ps-brand-l">{tr(label)}</span>
      <div className="if-fit" role="radiogroup" aria-label={tr(label)}>
        {opts.map(([id, text]) => {
          const on = (f[key] || def) === id
          return <button key={id} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => { setF({ ...f, [key]: id }); setSaved(false) }}>{tr(text)}</button>
        })}
      </div>
    </>
  )

  return (
    <div className="ps" role="dialog" aria-modal="true" aria-label={tr("Product studio")}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
      <header className="ps-top">
        <button className="ps-back" onClick={close}><IcBack />{tr("Products")}</button>
        <span className="ps-sep" aria-hidden="true">/</span>
        <span className="ps-name">{v('title') || tr("Untitled product")}</span>
        <span className={`ps-state${live ? ' on' : ''}${dirty ? ' is-dirty' : saved ? ' is-saved' : ''}`}>
          <i className="ps-dot" aria-hidden="true" />{tr(stateLabel)}{dirty ? tr("· unsaved") : saved ? tr("· saved") : ''}
        </span>
        <span className="ps-sp" />
        <button className="msp-btn msp-btn--ghost msp-btn--sm" onClick={save} disabled={busy || (!dirty && !!savedId)}><IcSave />{busy ? tr("Saving…") : tr("Save draft")}</button>
        {wantsPaid && live && promoCleared && <button className="msp-btn msp-btn--primary msp-btn--sm" onClick={promote} disabled={busy}>{listing?.paidActive ? tr("Change plan") : tr("Promote")} →</button>}
        {wantsPaid && live && !promoCleared && <button className="msp-btn msp-btn--ghost msp-btn--sm" disabled title={tr("Not cleared for paid promotion")}>{tr("Promotion not available")}</button>}
        {wantsPaid && !live && !inReview && <button className="msp-btn msp-btn--primary msp-btn--sm" onClick={publishFree} disabled={busy}>{rejected ? tr("Edit & resubmit") : tr("Publish for free first")} →</button>}
        {!wantsPaid && !live && !inReview && <button className="msp-btn msp-btn--primary msp-btn--sm" onClick={publishFree} disabled={busy}>{rejected ? tr("Resubmit for validation") : tr("Publish for free")} →</button>}
        {inReview && <button className="msp-btn msp-btn--ghost msp-btn--sm" disabled>{tr("Awaiting validation")}</button>}
        {!wantsPaid && live && <button className="msp-btn msp-btn--ghost msp-btn--sm" disabled>{tr("Live in the free catalog")}</button>}
      </header>

      <aside className="ps-left">
        <nav className="ps-tabs" role="tablist">
          {[['content', <IcEdit />, 'Content'], ['image', <IcImage />, 'Image'], ['contact', <IcMail />, 'Contact']].map(([id, ic, lb]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><i>{ic}</i>{lb}</button>
          ))}
        </nav>
        <div className="ps-panel">
          {draftBanner && (
            <div className="ps-draft" role="status" style={{ margin: '0 0 14px', padding: 12, borderRadius: 12, border: '1px solid rgba(34,211,238,.35)', background: 'rgba(34,211,238,.07)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1.3 }}>🕘</span>
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                  <strong style={{ display: 'block', fontSize: 14 }}>{tr("Continue where you left off?")}</strong>
                  <small style={{ opacity: 0.7 }}>{tr("Unsaved changes from {0}", [new Date(draftBanner.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })])}</small>
                </div>
                <button type="button" aria-label={tr("Dismiss")} title={tr("Dismiss")} onClick={() => setDraftBanner(null)} style={{ all: 'unset', cursor: 'pointer', opacity: 0.6, padding: '0 2px', fontSize: 14 }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="msp-btn msp-btn--primary msp-btn--sm" style={{ flex: 1 }} onClick={restoreDraft}>{tr("Restore")}</button>
                <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" style={{ flex: 1 }} onClick={discardDraft}>{tr("Discard")}</button>
              </div>
            </div>
          )}
          {tab === 'content' && (<>
            <label>{isOrg ? tr("Organization name") : tr("Product name")}<input value={v('title')} maxLength={80} onChange={set('title')} placeholder={isOrg ? tr("e.g. VN Labo") : tr("e.g. Remote Monitoring Kit")} /></label>
            <label><span className="ps-lbl">{isOrg ? tr("Tagline") : tr("Summary")}<small>{v('summary').length}/140</small></span><textarea rows={2} maxLength={140} value={v('summary')} onChange={set('summary')} /></label>
            <label>{isOrg ? tr("About the organization") : tr("Description")}<textarea rows={6} value={v('description')} onChange={set('description')} placeholder={isOrg ? tr("Shown on your organization profile: who you are, what you do, your expertise") : tr("Shown on the product's detail view")} /></label>
            <label>{isOrg ? tr("Field of activity") : tr("Category")}<input value={v('category')} onChange={set('category')} placeholder={tr("Medical, Lab, Cosmetics…")} /></label>
            {!selling && !isOrg && audit !== undefined && (
              <AuditProductField
                info={audit} value={f.auditProductRef ?? null} initialValue={base.auditProductRef ?? null} listingId={savedId}
                inReviewFlow={live || inReview}
                title={v('title')} confirmMismatch={!!f.confirmProductMismatch}
                onConfirmMismatch={(on) => { setF({ ...f, confirmProductMismatch: on }); setSaved(false); setMsg(null) }}
                onChange={(ref) => { setF({ ...f, auditProductRef: ref, confirmProductMismatch: false }); setSaved(false); setMsg(null) }}
              />
            )}
            {isOrg && (
              <div className="ps-seals-edit">
                <span className="ps-brand-l">{tr("Seals")} <small>{tr("up to 3 · certifications, labels")}</small></span>
                <div className="ps-seals-row">
                  {[0, 1, 2].map((i) => (
                    <input key={i} maxLength={24} value={(f.certifications || [])[i] || ''} placeholder={['ISO 13485', 'ISO 17025', 'CE marking'][i]} aria-label={tr("Seal {0}", [i + 1])}
                      onChange={(e) => { const next = [...(f.certifications || []), '', '', ''].slice(0, 3); next[i] = e.target.value; setF({ ...f, certifications: next }); setSaved(false) }} />
                  ))}
                </div>
              </div>
            )}
            {!writerOpen
              ? <button type="button" className="if-pro" onClick={() => setWriterOpen(true)}><b>✨</b><span>{tr("Write for me")}<small>{isOrg ? tr("The AI drafts your tagline and presentation in French, Arabic and English from your name and details.") : tr("The AI drafts the summary and description in French, Arabic and English from your photo and name.")}</small></span></button>
              : <AiWriter f={f} org={isOrg} onClose={() => setWriterOpen(false)} onUse={(patch) => { setF({ ...f, ...patch }); setSaved(false) }} />}
          </>)}
          {tab === 'image' && (<>
            {isOrg && (
              <div className="ps-brand">
                <h4>{tr("Showcase card")}</h4>
                <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { pickLogo(e.target.files[0]); e.target.value = '' }} />
                <div className="ps-brand-logo">
                  <span className={`ps-logo-prev ps-logo-prev--${f.logoShape || 'hexagon'}`} aria-hidden="true">
                    {f.logoUrl ? <img src={f.logoUrl} alt="" /> : <b>{(orgName || '?')[0].toUpperCase()}</b>}
                  </span>
                  <span className="ps-brand-act">
                    <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => logoRef.current.click()}>{f.logoUrl ? tr("Change logo") : tr("Upload logo")}</button>
                    {f.logoUrl && <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm msp-danger" onClick={() => { setF({ ...f, logoUrl: '' }); setSaved(false) }}>{tr("Remove")}</button>}
                    <small className="if-hint">{tr("A PNG with a transparent background looks best.")}</small>
                  </span>
                </div>
                {seg('logoShape', 'hexagon', 'Logo shape', [['hexagon', 'Hexagon'], ['circle', 'Circle'], ['square', 'Square']])}
                {seg('logoPlacement', 'seam', 'Logo position', [['seam', 'Between'], ['photo', 'On the picture']])}
                {seg('coverSide', 'left', 'Picture side', [['left', 'Left'], ['right', 'Right']])}
              </div>
            )}
            <div className="ps-drop" onClick={() => fileRef.current.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}>
              <b>⤴</b><strong>{isOrg ? tr("Drop a photo of your organization") : tr("Drop an image here")}</strong><small>{tr("or click to browse · resized automatically")}</small>
            </div>
            <label>{tr("…or paste an image URL")}<input type="url" value={f.imageUrl?.startsWith('data:') ? '' : v('imageUrl')} onChange={(e) => { setOriginalUrl(e.target.value); setAdvice(null); setF({ ...f, imageUrl: e.target.value, imageFit: 'contain' }); setBgOriginal(null); setAdjustPreview('none'); setSaved(false) }} placeholder={tr("https://…")} /></label>
            {f.imageUrl && (
              <button type="button" className="if-pro" disabled={proBusy} onClick={makeProfessional}>
                <b>✨</b>
                <span>{proBusy ? tr("Working on it…") : tr("Make it look professional")}<small>{tr("Background, framing and lighting in one tap.")}</small></span>
              </button>
            )}
            <PhotoAdvice advice={advice} onPick={pickLook} onColor={setLookColor} onEdit={() => setEraserOpen(true)} />
            {f.imageUrl && (
              <div className="if-bgrow">
                <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" disabled={bgBusy} onClick={stripBackground}>
                  {bgBusy ? tr("Removing background…") : tr("✨ Remove white background")}
                </button>
                <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" onClick={() => setEraserOpen(true)}>{tr("🧽 Edit cutout")}</button>
                {bgOriginal && <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" onClick={undoBackground}>{tr("Undo")}</button>}
              </div>
            )}
            {f.imageUrl && (
              <ImageFramer
                imageUrl={f.imageUrl} fit={f.imageFit ?? 'cover'} zoom={f.imageZoom ?? 100} focusX={f.imageFocusX ?? 50} focusY={f.imageFocusY ?? 50}
                filter={adjustPreview} zone={zone}
                onChange={(patch) => { setF({ ...f, ...patch }); setSaved(false) }}
              />
            )}
            {f.imageUrl && (
              <ImageAdjust
                imageUrl={f.imageUrl}
                onPreview={setAdjustPreview}
                onApplied={(url) => { setF({ ...f, imageUrl: url }); setSaved(false) }}
              />
            )}
            {containCover && (
              <label className="if-accent">
                {tr("Backdrop colour")}
                <span className="if-accent-row">
                  <input
                    type="color" value={/^#/.test(f.imageAccent) ? f.imageAccent : '#00e8ff'} aria-label={tr("Backdrop colour")}
                    onChange={(e) => { setF({ ...f, imageAccent: e.target.value }); setSaved(false) }}
                  />
                  <button
                    type="button" className="if-accent-none"
                    title={tr("Picks the colour that makes this product stand out")}
                    onClick={async () => {
                      const hex = await suggestColourFor(f.imageUrl, v('category'))
                      if (hex) { setF((cur) => ({ ...cur, imageAccent: hex })); setSaved(false) }
                    }}
                  >{tr("✨ Best colour")}</button>
                  <button
                    type="button" className={`if-accent-none${(f.imageAccent || '').toLowerCase() === '#ffffff' ? ' on' : ''}`}
                    aria-pressed={(f.imageAccent || '').toLowerCase() === '#ffffff'}
                    title={tr("Pure white across the whole image area — ideal for photos shot on a white background")}
                    onClick={() => { setF({ ...f, imageAccent: '#ffffff' }); setSaved(false) }}
                  >{tr("⬜ White")}</button>
                  <button
                    type="button" className={`if-accent-none${f.imageAccent === 'transparent' ? ' on' : ''}`}
                    aria-pressed={f.imageAccent === 'transparent'}
                    onClick={() => { setF({ ...f, imageAccent: f.imageAccent === 'transparent' ? '' : 'transparent' }); setSaved(false) }}
                  >{tr("No background")}</button>
                  {f.imageAccent && (
                    <button type="button" className="if-accent-reset" onClick={() => { setF({ ...f, imageAccent: '' }); setSaved(false) }}>{tr("Reset to default")}</button>
                  )}
                </span>
                <small className="if-hint">
                  {f.imageAccent === 'transparent' ? tr("No glow, no frame — the photo sits directly on the card with just a soft shadow.") : tr("Tints the soft glow and frame behind the photo — match your organization's brand colour instead of the site default.")}
                </small>
              </label>
            )}
            {onApplyAll && /^#/.test(f.imageAccent || '') && (
              <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" onClick={async () => {
                if (!window.confirm('Use this backdrop colour for ALL your other products? Their photos are not changed, only the colour behind them.')) return
                const n = await onApplyAll(f.imageAccent, savedId)
                setMsg(typeof n === 'number' ? tr("Applied to {0} other product{1}.", [n, n === 1 ? '' : 's']) : tr("Could not apply it to your other products."))
              }}>{tr("Use this colour for all my products")}</button>
            )}
            {f.imageUrl && <button className="msp-btn msp-btn--ghost msp-btn--sm msp-danger" onClick={() => { setOriginalUrl(null); setF({ ...f, imageUrl: '', imageZoom: 100, imageFocusX: 50, imageFocusY: 50, imageFit: 'cover', imageAccent: '' }); setBgOriginal(null); setAdjustPreview('none'); setSaved(false) }}>{tr("Remove image")}</button>}
          </>)}
          {tab === 'contact' && (<>
            {selling && (
              <fieldset className="ps-selling" style={{ border: '1px solid var(--line, rgba(128,128,128,.3))', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px' }}>
                <legend style={{ padding: '0 6px', fontWeight: 600 }}>{tr("Selling terms (wholesale)")}</legend>
                <label>{tr("Unit price (DA)")}<input type="number" min="0" step="0.01" inputMode="decimal" value={v('unitPrice')} onChange={set('unitPrice')} placeholder="1250" /></label>
                <label>{tr("Sold per")}<input type="text" maxLength={30} value={v('priceUnit')} onChange={set('priceUnit')} placeholder={tr("box, carton, unit…")} /></label>
                <label>{tr("Minimum order quantity")}<input type="number" min="1" step="1" inputMode="numeric" value={v('minOrderQty')} onChange={set('minOrderQty')} placeholder="1" /></label>
                <label>{tr("Quantity available (optional)")}<input type="number" min="0" step="1" inputMode="numeric" value={v('stockQty')} onChange={set('stockQty')} placeholder={tr("leave empty = not tracked")} /></label>
                <small className="if-hint">{tr("If you enter a quantity, it is reserved when a customer orders, and given back if the order is refused or cancelled. When it falls below the minimum order quantity, the product is no longer offered. Leave it empty to manage availability with the checkbox only.")}</small>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={f.inStock !== false} onChange={(e) => { setF({ ...f, inStock: e.target.checked }); setSaved(false); setMsg(null) }} />{tr("In stock (buyers can order)")}</label>
                <small className="if-hint">{tr("Prices are shown only to logged-in professionals. Buyers can order only once your company is verified by VigiCore and this product is approved.")}</small>
              </fieldset>
            )}
            <label>{tr("Contact email")}<input type="email" value={v('contactEmail')} onChange={set('contactEmail')} placeholder={tr("sales@company.dz")} /></label>
            <label>{tr("Phone")}<input type="tel" value={v('contactPhone')} onChange={set('contactPhone')} placeholder="0555 12 34 56" /></label>
            {v('contactPhone') && (waNumber(v('contactPhone'))
              ? <small className="if-hint ps-wa-ok">{tr("✓ A green WhatsApp button will appear on your card. Visitors write to you in one tap.")}</small>
              : <small className="if-hint">{tr("Tip: a mobile number (05, 06 or 07…) adds a WhatsApp button to your card. Landlines can't use WhatsApp.")}</small>)}
            <label>{tr("Website")}<input type="url" value={v('website')} onChange={set('website')} placeholder={tr("https://…")} /></label>
          </>)}
          {msg && <p className={`msp-msg${/^(Removing background with AI|Loading the AI model|Choosing the best look|Cloud AI is unavailable|Applied)/.test(msg) ? '' : ' msp-msg--err'}`}>{tr(msg)}</p>}
        </div>
      </aside>

      <main className="ps-canvas">
        <div className="ps-cap">
          <span>{tr("Live preview · {0}", [plan.name])}</span>
          <small>{zone === 'FEATURED' ? tr("Exactly as visitors will see it") : tr("Click any text on the card to edit it")}</small>
        </div>
        <div className="ps-stage">{device === 'mobile' ? <div className="ps-phone">{stage}</div> : stage}</div>
      </main>

      <aside className="ps-right">
        <h3>{tr("Where should it appear?")}</h3>
        <div className="ps-map" role="radiogroup" aria-label={tr("Placement on the Services page")}>
          {ORDER.filter((id) => planOf(id)).map((id) => {
            const blocked = id === 'FEATURED' && featuredBlocked(savedId)
            return (
              <button key={id} role="radio" aria-checked={zone === id} disabled={blocked} title={blocked ? tr("Taken by another partner") : undefined}
                className={`ps-z ps-z--${id}${zone === id ? ' on' : ''}`} onClick={() => setZone(id)}>
                <span className={`pm pm--${id}`} aria-hidden="true">{MINI[id]}</span>
                <span className="ps-zl">{tr(planOf(id).name)}</span>
              </button>
            )
          })}
        </div>
        <p className="ps-zd"><em>{tr(plan.tag)}</em><strong>{plan.section}</strong><span>{plan.monthlyPrice > 0 ? <>{fmt(plan.monthlyPrice)}<small> {tr("/ month")}</small></> : tr("Free")}</span></p>
        {wantsPaid && !live && <p className="ls-adv ls-adv--info">{tr(inReview ? "Paid placements unlock once VigiCore has approved your product." : "Publish for free first — paid placements unlock once VigiCore has approved your product.")}</p>}
        {rejected && listing?.reviewNote && <p className="ls-adv ls-adv--warn">{tr("Not approved: {0}", [listing.reviewNote])}</p>}
        {listing?.promoAllowed === false && live && wantsPaid && <p className="ls-adv ls-adv--warn">{tr("This product has not been cleared for paid promotion. Contact VigiCore if you think it should be.")}</p>}

        {placeAdvice && <p className={`ls-adv ls-adv--${placeAdvice.tone}`}>{tr(placeAdvice.text)}</p>}

        <h3>{tr("Listing quality")}</h3>
        <ListingScore result={scoreRes} requiredMissing={requiredMissing} advice={null} onGo={(t) => setTab(t)} />
      </aside>
      {eraserOpen && f.imageUrl && (
        <ImageEraser
          src={eraserBase.full || f.imageUrl}
          restoreSrc={eraserBase.orig}
          onCancel={() => setEraserOpen(false)}
          onApply={(url) => { setBgOriginal(f.imageUrl); setF({ ...f, imageUrl: url }); setAdjustPreview('none'); setSaved(false); setEraserOpen(false) }}
        />
      )}
    </div>
  )
}
