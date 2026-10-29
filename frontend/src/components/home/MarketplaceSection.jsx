import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/index.jsx'
import './MarketplaceSection.css'
import { prefersReducedMotion } from '../../lib/motion.js'
import { ART, loadShape } from '../shared/productShapes.jsx'

/* "New: Product Marketplace" announcement. One screen tall.
   Left: what it is + List / Boost / Track. Right: a 3D carousel of example
   listings (one per vigilance domain) with live "listing insights".
   All products and figures are illustrative. Copy is local (EN/FR/AR). */

const TXT = {
  en: {
    badge: 'PLATFORM UPDATE', new: 'NEW', h1: 'One platform.', h2: 'Now with a marketplace.',
    lead: 'Manufacturers and organizations publish their health products and get discovered, inside the same platform they already use for vigilance.',
    s: [['List', 'Polish photos in Product Studio, write with AI, check your 0 to 100 score.'],
        ['Boost', 'Pick your spot on the Services page for 1, 3 or 6 months.'],
        ['Track', 'Follow daily views, clicks and contacts for every listing.']],
    browse: 'Browse the marketplace', list: 'List your product', featured: 'FEATURED', view: 'VIEW →',
    insights: 'LISTING INSIGHTS', live: 'LIVE', views: 'Views', clicks: 'Clicks', contacts: 'Contacts', score: 'LISTING SCORE',
    fine: 'Illustrative products and figures for demonstration only.',
    p: [['Infusion Pump IP-300', 'Programmable pump for hospital wards.'], ['Amoxi-Care 500 mg', 'Antibiotic capsules, box of 16.'],
        ['Dermi Calm Cream', 'Soothing cream for sensitive skin.'], ['ReagentTrace Reagent Set', 'IVD reagents for lab analyzers, 100 mL.'], ['SafeClean Surface Gel', 'Disinfectant gel for clinical surfaces.']],
  },
  fr: {
    badge: 'MISE À JOUR', new: 'NOUVEAU', h1: 'Une plateforme.', h2: 'Désormais avec une marketplace.',
    lead: 'Fabricants et organisations publient leurs produits de santé et se font découvrir, au sein de la plateforme qu’ils utilisent déjà pour la vigilance.',
    s: [['Publier', 'Soignez vos photos avec Product Studio, rédigez avec l’IA, suivez votre score sur 100.'],
        ['Mettre en avant', 'Choisissez votre place sur la page Services pour 1, 3 ou 6 mois.'],
        ['Suivre', 'Suivez les vues, clics et contacts de chaque annonce, jour par jour.']],
    browse: 'Parcourir la marketplace', list: 'Publier un produit', featured: 'À LA UNE', view: 'VOIR →',
    insights: 'STATISTIQUES DE L’ANNONCE', live: 'EN DIRECT', views: 'Vues', clicks: 'Clics', contacts: 'Contacts', score: 'SCORE ANNONCE',
    fine: 'Produits et chiffres illustratifs, à titre de démonstration uniquement.',
    p: [['Pompe à perfusion IP-300', 'Pompe programmable pour services hospitaliers.'], ['Amoxi-Care 500 mg', 'Gélules d’antibiotique, boîte de 16.'],
        ['Crème Dermi Calm', 'Crème apaisante pour peaux sensibles.'], ['Coffret réactifs ReagentTrace', 'Réactifs DIV pour analyseurs de laboratoire, 100 mL.'], ['Gel SafeClean Surfaces', 'Gel désinfectant pour surfaces cliniques.']],
  },
  ar: {
    badge: 'تحديث المنصّة', new: 'جديد', h1: 'منصّة واحدة.', h2: 'والآن مع سوق للمنتجات.',
    lead: 'يعرض المصنّعون والمؤسسات منتجاتهم الصحية ويصل إليهم الجمهور، داخل المنصّة نفسها التي يستخدمونها لليقظة.',
    s: [['انشر', 'حسّن صورتك في Product Studio، واكتب بمساعدة الذكاء الاصطناعي، وتابع تقييمك من 100.'],
        ['أبرِز', 'اختر مكانك في صفحة الخدمات لمدة 1 أو 3 أو 6 أشهر.'],
        ['تابِع', 'تابع المشاهدات والنقرات وطلبات التواصل لكل إعلان يومياً.']],
    browse: 'تصفّح السوق', list: 'اعرض منتجك', featured: 'مميّز', view: 'عرض ←',
    insights: 'إحصاءات الإعلان', live: 'مباشر', views: 'مشاهدات', clicks: 'نقرات', contacts: 'تواصل', score: 'تقييم الإعلان',
    fine: 'منتجات وأرقام توضيحية لأغراض العرض فقط.',
    p: [['مضخّة التسريب IP-300', 'مضخّة قابلة للبرمجة لأقسام المستشفيات.'], ['أموكسي-كير 500 ملغ', 'كبسولات مضاد حيوي، علبة من 16.'],
        ['كريم ديرمي كالم', 'كريم مهدّئ للبشرة الحسّاسة.'], ['طقم كواشف ريجنت تريس', 'كواشف تشخيص مخبري، 100 مل.'], ['جل سيف كلين للأسطح', 'جل مطهّر للأسطح السريرية.']],
  },
}
const CATS = {
  en: ['Matériovigilance', 'Pharmacovigilance', 'Cosmétovigilance', 'Réactovigilance', 'Chémovigilance'],
  fr: ['Matériovigilance', 'Pharmacovigilance', 'Cosmétovigilance', 'Réactovigilance', 'Chémovigilance'],
  ar: ['يقظة المواد', 'اليقظة الدوائية', 'يقظة مستحضرات التجميل', 'يقظة الكواشف', 'اليقظة الكيميائية'],
}
const ORGS = ['Atlas Medical', 'Sahara Pharma', 'Aurora Beauty Lab', 'Biolab Dz', 'Nova Chem']
const DATA = [
  { k: '50,180,255', s: [1240, 318, 41, 92] }, { k: '60,200,160', s: [2105, 604, 87, 88] }, { k: '220,140,60', s: [1780, 455, 63, 95] },
  { k: '255,60,90', s: [960, 241, 29, 86] }, { k: '180,80,255', s: [1430, 372, 52, 90] },
]
const N = DATA.length
const PTS = typeof window !== 'undefined' && window.innerWidth < 720 ? 4200 : 9500

function useTween(target) {
  const [v, setV] = useState(prefersReducedMotion() ? target : 0)
  const from = useRef(0)
  useEffect(() => {
    if (prefersReducedMotion()) { setV(target); return undefined }
    const a = from.current, s = performance.now()
    let id
    const f = (n) => {
      // rAF timestamps can precede performance.now(): clamp t so the counters never go below 0
      const t = Math.min(1, Math.max(0, (n - s) / 900)), e = 1 - Math.pow(1 - t, 3), x = Math.round(a + (target - a) * e)
      setV(x); from.current = x
      if (t < 1) id = requestAnimationFrame(f)
    }
    id = requestAnimationFrame(f)
    return () => cancelAnimationFrame(id)
  }, [target])
  return v
}

const load = (i) => loadShape(i, srcsRef[i])
let srcsRef = []

export default function MarketplaceSection() {
  const { lang } = useI18n()
  const L = TXT[lang] || TXT.en
  const cats = CATS[lang] || CATS.en
  const [cur, setCur] = useState(0)
  const [ready, setReady] = useState(false)
  const cv = useRef(null), srcs = useRef([]), api = useRef({ go: null, i: 0 }), ptr = useRef({ x: -999, y: -999 }), col = useRef(DATA[0].k)
  const d = DATA[cur]
  const sc = useTween(ready ? d.s[3] : 0)
  const v1 = useTween(ready ? d.s[0] : 0), v2 = useTween(ready ? d.s[1] : 0), v3 = useTween(ready ? d.s[2] : 0)

  useEffect(() => {
    const canvas = cv.current, ctx = canvas.getContext('2d')
    let tiltX = 0, tiltY = 0, dead = false, vis = false, raf = 0, W = 0, H = 0, shapes = null, groups = [], t0 = 0, ci = 0, ring = 0
    const P = Array.from({ length: PTS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, s: 1 + Math.random() * 0.9, t: 1, ph: Math.random() * 6.28, dl: 0, m: 0, u: 1, z: 0, rx: 0, ry: 0 }))
    const still = prefersReducedMotion()
    const assign = (i, instant) => {
      const sh = shapes[i]; if (!sh || !sh.length) return
      const size = Math.min(W * 0.66, H * 0.6), ox = W / 2 - size / 2, oy = H * 0.45 - size / 2, now = performance.now()
      P.forEach((p, k) => {
        const q = sh[k % sh.length]
                p.tx = ox + q.x * size + (Math.random() - 0.5) * 0.8; p.ty = oy + q.y * size + (Math.random() - 0.5) * 0.8; p.u = 0.85 + q.l * 0.45; p.t = q.t; p.ck = q.ck; p.z = (q.l - 0.45) * 38
        if (instant) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; p.dl = 0 } else {
          const a = Math.atan2(p.y - H / 2, p.x - W / 2), sp = 6 + Math.random() * 16
          p.vx += Math.cos(a) * sp - Math.sin(a) * sp * 0.6; p.vy += Math.sin(a) * sp + Math.cos(a) * sp * 0.6
          p.dl = now + 120 + Math.random() * 420
        }
      })
      // group dots by colour once, so drawing stays one fillStyle per colour (not per dot)
      const gm = new Map()
      P.forEach((p) => { let a = gm.get(p.ck); if (!a) gm.set(p.ck, (a = [])); a.push(p) })
      const lift = (c) => Math.min(255, Math.round((c * 32 + 16) * 1.12 + 26))
      groups = [...gm].map(([ck, pts]) => ({ fill: `rgba(${lift(ck >> 6)},${lift((ck >> 3) & 7)},${lift(ck & 7)},.96)`, pts }))
    }
    const resize = () => {
      const r = canvas.parentNode.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
      W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (shapes) assign(ci, true)
    }
    api.current.go = (i) => { ci = i; col.current = DATA[i].k; t0 = still ? -1e9 : performance.now(); ring = t0; if (shapes) assign(i, still) }
    const frame = (now) => {
      if (dead || !vis) { raf = 0; return } // section off screen: stop drawing (this is what was exhausting memory)
      ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter'
      const sx = ((now - t0 - 700) / 1100) * W * 1.05 - W * 0.025, c = col.current, mx = ptr.current.x, my = ptr.current.y
      ctx.globalAlpha = 1
      const inside = mx > -100, wx = inside ? (mx / W - 0.5) * 2 : still ? 0 : Math.sin(now / 2600) * 0.7, wy = inside ? (my / H - 0.5) * 2 : still ? 0 : Math.cos(now / 3100) * 0.35
      tiltX += (wx - tiltX) * 0.06; tiltY += (wy - tiltY) * 0.06
      for (let k = 0; k < PTS; k++) {
        const p = P[k]
        if (now >= p.dl) { p.vx += (p.tx - p.x) * 0.05 + Math.sin(now / 650 + p.ph) * 0.02; p.vy += (p.ty - p.y) * 0.05 + Math.cos(now / 720 + p.ph) * 0.02; p.vx *= 0.84; p.vy *= 0.84 } else { p.vx *= 0.97; p.vy *= 0.97 }
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy
        if (d2 < 11000) { const dd = Math.sqrt(d2) + 0.01, f = (1 - dd / 105) * 3.4; p.vx += (dx / dd) * f; p.vy += (dy / dd) * f }
        p.x += p.vx; p.y += p.vy; p.rx = p.x + tiltX * p.z; p.ry = p.y + tiltY * p.z * 0.6
        p.m += ((p.tx < sx ? 1 : 0) - p.m) * 0.18
      }
      const pass = (style, test) => { ctx.fillStyle = style; for (let k = 0; k < PTS; k++) { const p = P[k]; if (test(p)) { const s = p.s * p.u; ctx.fillRect(p.rx - s / 2, p.ry - s / 2, s, s) } } }
      const hot = (p) => Math.abs(p.tx - sx) < 16
      ;['rgba(90,110,128,.5)', 'rgba(125,150,170,.62)', 'rgba(190,208,222,.8)'].forEach((g, t) => pass(g, (p) => p.m < 0.5 && p.t === t))
      for (let g = 0; g < groups.length; g++) {
        ctx.fillStyle = groups[g].fill
        const pts = groups[g].pts
        for (let k = 0; k < pts.length; k++) { const p = pts[k]; if (p.m >= 0.5 && !hot(p)) { const s = p.s * p.u; ctx.fillRect(p.rx - s / 2, p.ry - s / 2, s, s) } }
      }
      pass('rgba(255,255,255,.98)', (p) => p.m >= 0.5 && hot(p))
      ctx.globalAlpha = 1
      if (sx > 0 && sx < W) { const g = ctx.createLinearGradient(sx - 30, 0, sx + 2, 0); g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(1, `rgba(${c},.35)`); ctx.fillStyle = g; ctx.fillRect(sx - 30, H * 0.06, 32, H * 0.74) }
      const rk = (now - ring) / 1000
      if (rk > 0 && rk < 1) { ctx.strokeStyle = `rgba(${c},${0.7 * (1 - rk)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, H * 0.45, rk * W * 0.7, 0, 6.283); ctx.stroke() }
      raf = requestAnimationFrame(frame)
    }
    resize(); window.addEventListener('resize', resize)
    srcsRef = srcs.current
    Promise.all(srcs.current.map((_, i) => load(i))).then((s) => { if (dead) return; shapes = s; assign(ci, true); api.current.go(ci); if (vis && !raf) raf = requestAnimationFrame(frame) })
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && !raf && shapes && !dead) raf = requestAnimationFrame(frame) }, { rootMargin: '80px 0px' })
    io.observe(canvas)
    return () => { dead = true; io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', resize); canvas.width = canvas.height = 0 }
  }, [])

  useEffect(() => {
    setReady(false); api.current.go && api.current.go(cur)
    const id = setTimeout(() => setReady(true), prefersReducedMotion() ? 0 : 1900)
    return () => clearTimeout(id)
  }, [cur])
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const id = setTimeout(() => setCur((c) => (c + 1) % N), 6200)
    return () => clearTimeout(id)
  }, [cur])
  const move = (e) => { const r = cv.current.getBoundingClientRect(); ptr.current.x = e.clientX - r.left; ptr.current.y = e.clientY - r.top }

  return (
    <section className="mkt" id="marketplace" style={{ '--c': d.k }}>
      <div className="mkt-wrap">
        <div className="mkt-copy">
          <span className="mkt-new"><b>{L.new}</b>{L.badge}</span>
          <h2 className="mkt-h">{L.h1}<em>{L.h2}</em></h2>
          <p className="mkt-lead">{L.lead}</p>
          <ul className="mkt-trio">{L.s.map(([h, p]) => (<li key={h}><h4>{h}</h4><p>{p}</p></li>))}</ul>
          <div className="mkt-cta">
            <Link to="/services" className="mkt-btn mkt-btn--p">{L.browse} <span aria-hidden="true">→</span></Link>
            <Link to="/register-organization" className="mkt-btn mkt-btn--g">{L.list}</Link>
          </div>
        </div>

        <div className="mkt-stage" onPointerMove={move} onPointerLeave={() => { ptr.current.x = ptr.current.y = -999 }}>
          <canvas ref={cv} aria-hidden="true" />
          <div className="mkt-chips" role="tablist">
            {DATA.map((x, i) => (
              <button key={i} type="button" role="tab" aria-selected={cur === i} className={`mkt-chip${cur === i ? ' on' : ''}`} style={{ '--k': `rgb(${x.k})` }} onClick={() => setCur(i)}>{cats[i]}</button>
            ))}
          </div>
          <div className={`mkt-pop mkt-score${ready ? ' on' : ''}`} style={{ '--v': sc }}><div><b>{sc}</b><small>{L.score}</small></div></div>
          <div className={`mkt-pop mkt-ins${ready ? ' on' : ''}`}>
            <header>{L.insights}<span>{L.live}</span></header>
            <div className="mkt-r">
              <div><b>{v1.toLocaleString('en-US')}</b><small>{L.views}</small></div>
              <div><b>{v2.toLocaleString('en-US')}</b><small>{L.clicks}</small></div>
              <div><b>{v3}</b><small>{L.contacts}</small></div>
            </div>
          </div>
          <div className={`mkt-pop mkt-name${ready ? ' on' : ''}`}>
            <span>{cats[cur]}</span><h5>{L.p[cur][0]}</h5><small>{ORGS[cur]}</small>
          </div>
          <div className="mkt-fine">{L.fine}</div>
        </div>
      </div>
      <div hidden aria-hidden="true">{ART.map((a, i) => <svg key={i} viewBox="0 0 150 150" ref={(el) => { if (el) srcs.current[i] = el }}>{a}</svg>)}</div>
    </section>
  )
}
