import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

/* Shared product art + particle sampling for the five vigilance domains.
   Used by the home Marketplace section and the Services hero, so the
   product shapes are defined once. Order: Medical, Pharma, Cosmetic, IVD, Chemical. */

export const SZ = 240
export const ART = [
  /* Infusion pump */
  <><defs><linearGradient id="vp1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1f66a3"/><stop offset="1" stopColor="#0a2540"/></linearGradient><linearGradient id="vp2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f4468"/><stop offset="1" stopColor="#04121f"/></linearGradient></defs>
    <rect x="52" y="4" width="46" height="9" rx="4" fill="#7fd0ff"/><rect x="66" y="12" width="18" height="10" rx="2" fill="#32b4ff"/>
    <rect x="20" y="22" width="110" height="112" rx="16" fill="url(#vp1)" stroke="#32b4ff" strokeWidth="3"/>
    <path d="M28 44 v-10 a9 9 0 0 1 9 -9 h26" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2"/>
    <rect x="30" y="32" width="90" height="48" rx="8" fill="url(#vp2)" stroke="#7fd0ff" strokeWidth="1.5"/>
    <polyline points="36,60 50,60 55,44 62,70 69,52 74,60 112,60" fill="none" stroke="#19e3d1" strokeWidth="2.5"/>
    <rect x="36" y="68" width="24" height="5" rx="2" fill="#cfefff"/><rect x="88" y="37" width="26" height="8" rx="2" fill="#f2b04a"/><circle cx="116" cy="28" r="3" fill="#19e3d1"/>
    <circle cx="46" cy="98" r="9" fill="#32b4ff" stroke="#cfefff" strokeWidth="1.5"/><circle cx="75" cy="98" r="9" fill="#19e3d1" stroke="#cfefff" strokeWidth="1.5"/><circle cx="104" cy="98" r="9" fill="#f2b04a" stroke="#cfefff" strokeWidth="1.5"/>
    <circle cx="43" cy="95" r="2.5" fill="#fff"/><circle cx="72" cy="95" r="2.5" fill="#fff"/><circle cx="101" cy="95" r="2.5" fill="#fff"/>
    <rect x="30" y="114" width="90" height="9" rx="4" fill="#06182b" stroke="#32b4ff"/><rect x="32" y="116" width="56" height="5" rx="2.5" fill="#19e3d1"/>
    <path d="M75 134 v6 q0 7 8 7 h32" fill="none" stroke="#7fd0ff" strokeWidth="4" strokeLinecap="round"/></>,
  /* Pill bottle + capsules + tablet */
  <><defs><linearGradient id="vb1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#16665a"/><stop offset="1" stopColor="#082b27"/></linearGradient></defs>
    <rect x="20" y="12" width="52" height="20" rx="5" fill="#e9fff8" stroke="#2fe6b0" strokeWidth="3"/><path d="M30 17v10M38 17v10M46 17v10M54 17v10M62 17v10" stroke="#16a07c" strokeWidth="2" strokeLinecap="round"/>
    <rect x="26" y="32" width="40" height="8" rx="2" fill="#0b3a33" stroke="#2fe6b0" strokeWidth="2"/>
    <rect x="16" y="38" width="60" height="100" rx="13" fill="url(#vb1)" stroke="#2fe6b0" strokeWidth="3.5"/>
    <rect x="23" y="60" width="46" height="56" rx="7" fill="#e9fff8"/>
    <path d="M46 70 v26 M33 83 h26" stroke="#16a07c" strokeWidth="9" strokeLinecap="round"/>
    <rect x="29" y="104" width="34" height="4" rx="2" fill="#5fcfae"/>
    <path d="M22 50 v14" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round"/>
    <g transform="translate(88 46) rotate(-35)"><path d="M11 0 H28 V22 H11 a11 11 0 0 1 0 -22 z" fill="#2fe6b0"/><path d="M28 0 H45 a11 11 0 0 1 0 22 H28 z" fill="#f4fffb"/><rect x="0" y="0" width="56" height="22" rx="11" fill="none" stroke="#bff7e8" strokeWidth="2.5"/></g>
    <g transform="translate(86 108) rotate(24)"><path d="M11 0 H28 V22 H11 a11 11 0 0 1 0 -22 z" fill="#f4fffb"/><path d="M28 0 H45 a11 11 0 0 1 0 22 H28 z" fill="#2fe6b0"/><rect x="0" y="0" width="56" height="22" rx="11" fill="none" stroke="#bff7e8" strokeWidth="2.5"/></g>
    <circle cx="126" cy="76" r="13" fill="#e9fff8" stroke="#2fe6b0" strokeWidth="3"/><path d="M116 76 h20" stroke="#16a07c" strokeWidth="3" strokeLinecap="round"/></>,
  /* Serum bottle + sheet face mask */
  <><defs><linearGradient id="vc1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5a3314"/><stop offset="1" stopColor="#1d1008"/></linearGradient>
    <linearGradient id="vc2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb866"/><stop offset="1" stopColor="#e07a20"/></linearGradient>
    <linearGradient id="vc3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#17566a"/><stop offset=".55" stopColor="#4a2a60"/><stop offset="1" stopColor="#5a3214"/></linearGradient></defs>
    <g>
    <ellipse cx="46" cy="14" rx="17" ry="10" fill="#2a1808" stroke="#f59a3c" strokeWidth="3"/>
    <rect x="37" y="23" width="18" height="14" rx="3" fill="#3a2410" stroke="#f59a3c" strokeWidth="2.5"/>
    <path d="M30 37 H62 L74 50 V128 a10 10 0 0 1 -10 10 H28 a10 10 0 0 1 -10 -10 V50 Z" fill="url(#vc1)" stroke="#f59a3c" strokeWidth="3.5" strokeLinejoin="round"/>
    <rect x="23" y="88" width="46" height="45" rx="7" fill="url(#vc2)"/>
    <path d="M25 58 v22" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round"/>
    <path d="M46 56 l3.2 7.4 7.6 3.2 -7.6 3.2 -3.2 7.4 -3.2 -7.4 -7.6 -3.2 7.6 -3.2 z" fill="#ffd9a8"/>
    <rect x="30" y="100" width="32" height="4" rx="2" fill="#7a3d08" opacity=".7"/>
    </g>
    <g transform="translate(5.7 15.6) scale(.95)"><g transform="rotate(4 114 72)">
    <path d="M81 52 C81 20 147 20 147 52 C149 80 143 99 133 111 C127 119 121 125 114 125 C107 125 101 119 95 111 C85 99 79 80 81 52 Z" fill="url(#vc3)" stroke="#9fe8f5" strokeWidth="4.5" strokeLinejoin="round"/>
    <path d="M90 56 Q100 51 109 55 M119 55 Q128 51 138 56" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round"/>
    <path d="M90 68 Q100 76 110 68 M118 68 Q128 76 138 68" fill="none" stroke="#fff" strokeWidth="4.8" strokeLinecap="round"/>
    <path d="M114 72 V88 Q110 92 106 90" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M102 104 Q114 112 126 104" fill="none" stroke="#ffd9e6" strokeWidth="4.6" strokeLinecap="round"/></g></g></>,
  /* Reagent bottle + test tubes */
  <><defs><linearGradient id="vk1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5a1424"/><stop offset="1" stopColor="#1d0610"/></linearGradient></defs>
    <rect x="55" y="3" width="14" height="10" rx="5" fill="#ff3d5a"/>
    <rect x="44" y="11" width="34" height="18" rx="5" fill="#ffb3c0" stroke="#ffdbe2" strokeWidth="1.5"/><path d="M52 15v10M59 15v10M66 15v10M73 15v10" stroke="#9a2a42" strokeWidth="1.6"/>
    <rect x="47" y="28" width="28" height="12" rx="2" fill="#7a1d30"/>
    <rect x="28" y="38" width="66" height="96" rx="15" fill="url(#vk1)" stroke="#ff3d5a" strokeWidth="3"/>
    <rect x="32" y="86" width="58" height="44" rx="11" fill="#ff3d5a" opacity=".55"/>
    <path d="M35 60 v24" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round"/>
    <rect x="35" y="55" width="52" height="44" rx="6" fill="#ffe3e8"/>
    <path d="M56 61 h10 M58 61 v9 l-7 12 a2 2 0 0 0 2 3 h16 a2 2 0 0 0 2 -3 l-7 -12 v-9" fill="none" stroke="#ff3d5a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="42" y="88" width="38" height="4" rx="2" fill="#9a2a42"/>
    <rect x="103" y="34" width="20" height="98" rx="10" fill="#2d0a14" stroke="#ff3d5a" strokeWidth="2.5"/><rect x="101" y="27" width="24" height="10" rx="3" fill="#ffb3c0"/>
    <rect x="106" y="84" width="14" height="45" rx="7" fill="#ff3d5a" opacity=".75"/>
    <rect x="128" y="64" width="16" height="68" rx="8" fill="#2d0a14" stroke="#ff7d93" strokeWidth="2.2"/><rect x="126" y="58" width="20" height="9" rx="3" fill="#ffdbe2"/>
    <rect x="131" y="96" width="10" height="33" rx="5" fill="#ff7d93" opacity=".8"/>
    <rect x="98" y="132" width="52" height="7" rx="3.5" fill="#ffb3c0" opacity=".85"/></>,
  /* Chemical drum with hazard sign + Erlenmeyer flask */
  <><defs><linearGradient id="vg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4a1f7a"/><stop offset="1" stopColor="#1a0a30"/></linearGradient></defs>
    <path d="M22 40 V28 Q22 22 28 22 H50 Q56 22 56 28 V40" fill="none" stroke="#c488ff" strokeWidth="5" strokeLinecap="round"/>
    <rect x="60" y="28" width="14" height="13" rx="3" fill="#d3a3ff" stroke="#f1e1ff" strokeWidth="1.5"/>
    <rect x="12" y="40" width="68" height="96" rx="11" fill="url(#vg1)" stroke="#b450ff" strokeWidth="3.5"/>
    <rect x="17" y="118" width="58" height="14" rx="6" fill="#b450ff" opacity=".6"/>
    <path d="M46 62 L66 84 L46 106 L26 84 Z" fill="#f1e1ff" stroke="#ff3c5a" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M46 72 V87" stroke="#2a0f4a" strokeWidth="5" strokeLinecap="round"/><circle cx="46" cy="96" r="3" fill="#2a0f4a"/>
    <path d="M18 56 v14" stroke="#fff" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round"/>
    <rect x="103" y="22" width="30" height="8" rx="4" fill="#d3a3ff"/>
    <path d="M110 30 H126 V58 L148 120 Q151 134 138 134 H98 Q85 134 88 120 L110 58 Z" fill="#1a0a30" stroke="#d3a3ff" strokeWidth="3.2" strokeLinejoin="round"/>
    <path d="M100 98 H136 L146 122 Q149 131 138 131 H98 Q87 131 90 122 Z" fill="#b450ff" opacity=".85"/>
    <circle cx="108" cy="110" r="3.2" fill="#f1e1ff"/><circle cx="121" cy="104" r="2.2" fill="#f1e1ff"/><circle cx="127" cy="118" r="3.6" fill="#f1e1ff"/><circle cx="114" cy="122" r="2" fill="#f1e1ff"/>
    <path d="M116 38 v14" stroke="#fff" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round"/></>,
]

/* Optional real photos: drop transparent PNGs in public/marketplace/ with these names (any subset). */
export const IMG = ['pump', 'capsule', 'cream', 'testkit', 'gel'].map((n) => `/marketplace/${n}.png`)
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]] } return a }

export function sample(src, px = SZ) {
  const img = new Image()
  const f = px / SZ, e3 = Math.max(1, Math.round(3 * f)), e2 = Math.max(1, Math.round(2 * f))
  return new Promise((res) => {
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = px
      const g = cv.getContext('2d', { willReadFrequently: true })
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
      const iw = img.naturalWidth || px, ih = img.naturalHeight || px, k = Math.min(px / iw, px / ih)
      g.drawImage(img, (px - iw * k) / 2, (px - ih * k) / 2, iw * k, ih * k)
      const d = g.getImageData(0, 0, px, px).data, out = [], edges = []
      const al = (x, y) => (x < 0 || y < 0 || x >= px || y >= px ? 0 : d[(y * px + x) * 4 + 3])
      const lm = (x, y) => { if (x < 0 || y < 0 || x >= px || y >= px) return 0; const i = (y * px + x) * 4; return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255 }
      const isEdge = (x, y) => al(x - e3, y) < 100 || al(x + e3, y) < 100 || al(x, y - e3) < 100 || al(x, y + e3) < 100
      const isDetail = (x, y) => Math.abs(lm(x + e2, y) - lm(x - e2, y)) + Math.abs(lm(x, y + e2) - lm(x, y - e2)) > 0.22
      const mk = (x, y, edge) => {
        const l = lm(x, y), i4 = (y * px + x) * 4
        return { x: (x + Math.random()) / px, y: (y + Math.random()) / px, l, t: l > 0.72 ? 2 : l > 0.35 || edge ? 1 : 0, ck: ((d[i4] >> 5) << 6) | ((d[i4 + 1] >> 5) << 3) | (d[i4 + 2] >> 5) }
      }
      if (px > SZ) {
        // High-res (hero) shapes: evenly spread points (jittered grid, no clumps or holes) + a tighter, separate
        // set along the outline, interleaved so ANY subset still has a crisp contour.
        const T = 15000
        let A = 0; const ed = []
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
          if (al(x, y) < 140) continue
          A++
          if (isEdge(x, y) || isDetail(x, y)) ed.push(y * px + x)
        }
        const s1 = Math.max(1, Math.sqrt(A / (T * 0.5))), s2 = Math.max(1, s1 * 0.55)
        for (let gy = 0; gy < px; gy += s1) for (let gx = 0; gx < px; gx += s1) {
          const x = Math.min(px - 1, Math.floor(gx + Math.random() * s1)), y = Math.min(px - 1, Math.floor(gy + Math.random() * s1))
          if (al(x, y) >= 140) out.push(mk(x, y, false))
        }
        shuffle(ed)
        const taken = new Set()
        for (const v of ed) {
          const x = v % px, y = (v / px) | 0, key = Math.floor(x / s2) * 100003 + Math.floor(y / s2)
          if (taken.has(key)) continue
          taken.add(key); edges.push(mk(x, y, true))
        }
        shuffle(edges); shuffle(out)
        const mix = []
        for (let i = 0, j = 0; i < edges.length || j < out.length;) {
          if (i < edges.length) mix.push(edges[i++])
          if (j < out.length) mix.push(out[j++])
        }
        return res(mix)
      }
      const dens = 1
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
        if (al(x, y) < 140) continue
        const l = lm(x, y), edge = isEdge(x, y), detail = isDetail(x, y)
        if (((edge || detail) && Math.random() < 1.15) || Math.random() < (0.18 + 0.3 * l) * dens) {
          ;(edge || detail ? edges : out).push(mk(x, y, edge))
        }
      }
      res(shuffle(edges.concat(out)))
    }
    img.onerror = () => res([])
    img.src = src
  })
}
export const svgSrc = (svg, px = SZ) => {
  const c = svg.cloneNode(true)
  c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', px); c.setAttribute('height', px)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c))
}

/* Sample one domain shape: real PNG from /marketplace/ if present, else the SVG art. */
export const loadShape = (i, svgEl, px = SZ) => sample(IMG[i], px).then((r) => (r.length > 200 ? r : sample(svgSrc(svgEl, px), px)))

/* Cached sampled points for a domain shape, usable anywhere (no hidden <svg> needed in the page). */
let _host = null
const _pts = {}
export function shapePoints(i) {
  if (!_pts[i]) {
    _pts[i] = (async () => {
      await new Promise((r) => setTimeout(r, 0)) // never flushSync from inside an effect
      if (!_host) {
        _host = document.createElement('div'); _host.hidden = true; document.body.appendChild(_host)
        flushSync(() => createRoot(_host).render(<>{ART.map((a, k) => <svg key={k} viewBox="0 0 150 150" data-shape={k}>{a}</svg>)}</>))
      }
      return loadShape(i, _host.querySelector(`[data-shape="${i}"]`))
    })()
  }
  return _pts[i]
}
