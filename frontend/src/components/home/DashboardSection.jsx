import React, { useEffect, useRef, useState } from 'react'
import './DashboardSection.css'
import useSectionReveal from '../../hooks/useSectionReveal.js'
import { useI18n } from '../../i18n/index.jsx'
import CountUp from '../shared/CountUp.jsx'
import { prefersReducedMotion } from '../../lib/motion.js'

// Copy below is limited to what the demo board actually shows. The board itself is example data.
const D = {
  en: {
    feats: [['Role dashboards', 'Each role gets the interface it needs.', '#2fd0a0'], ['One connected record', 'Everyone works on the same connected platform.', '#ffb84d'], ['AI summary', 'Urgent alerts and next steps, summarized from the record.', '#a78bfa'], ['Recall alerts', 'ANPP recalls reach the patient with the action to take.', '#29b6ff']],
    real: 'Real interface', exp: 'Exploded view', tags: ['01 · Navigation', '02 · AI summary', '03 · Key indicators', '04 · Recall alert'], note: 'Example data · demo version', pk: 'ANPP · Recall',
  },
  fr: {
    feats: [['Tableaux de bord par rôle', 'Chaque rôle a l’interface qu’il lui faut.', '#2fd0a0'], ['Un dossier connecté', 'Tous travaillent sur la même plateforme connectée.', '#ffb84d'], ['Résumé IA', 'Alertes urgentes et prochaines étapes, résumées à partir du dossier.', '#a78bfa'], ['Alertes de rappel', 'Les rappels ANPP atteignent le patient avec l’action à mener.', '#29b6ff']],
    real: 'Interface réelle', exp: 'Vue éclatée', tags: ['01 · Navigation', '02 · Résumé IA', '03 · Indicateurs clés', '04 · Alerte de rappel'], note: 'Données d’exemple · version démo', pk: 'ANPP · Rappel',
  },
  ar: {
    feats: [['لوحات حسب الدور', 'لكل دور الواجهة التي يحتاجها.', '#2fd0a0'], ['سجلّ متصل', 'الجميع يعمل على المنصة المتصلة نفسها.', '#ffb84d'], ['ملخّص ذكي', 'تنبيهات عاجلة والخطوات التالية، ملخّصة من السجل.', '#a78bfa'], ['تنبيهات السحب', 'تصل سحوبات ANPP إلى المريض مع الإجراء المطلوب.', '#29b6ff']],
    real: 'الواجهة', exp: 'العرض المفكّك', tags: ['01 · التنقّل', '02 · الملخّص الذكي', '03 · المؤشرات الرئيسية', '04 · تنبيه السحب'], note: 'بيانات تجريبية · نسخة تجريبية', pk: 'ANPP · سحب',
  },
}
const URGENT = 'ANPP/RECALL/2026-089: Dexamethasone lot DXP-20250612-B. Stop using it and return it to Pharmacie El Badr.'

function Typed({ text }) {
  const [n, setN] = useState(prefersReducedMotion() ? text.length : 0)
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const id = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(id); return x } return x + 2 }), 22)
    return () => clearInterval(id)
  }, [text])
  return <>{text.slice(0, n)}</>
}

export default function DashboardSection() {
  const { t, lang } = useI18n()
  const Z = D[lang] || D.en
  const sectionRef = useSectionReveal()
  const stageRef = useRef(null), boardRef = useRef(null), packetRef = useRef(null)
  const busy = useRef(false), fireRef = useRef(null), tilt = useRef({ x: 0, y: 0 })
  const [ex, setEx] = useState(() => !(prefersReducedMotion() || (typeof window !== 'undefined' && window.innerWidth < 700)))
  const [fired, setFired] = useState(false)
  const exRef = useRef(ex)
  exRef.current = ex

  const applyTilt = () => {
    const b = boardRef.current
    if (!b) return
    const e = exRef.current, { x, y } = tilt.current
    b.style.transform = `rotateX(${(e ? 8 : 3) - y * 6}deg) rotateY(${(e ? -12 : 0) + x * 8}deg) scale(${e ? 0.97 : 1})`
  }
  useEffect(() => { applyTilt() }, [ex])
  const onMove = (ev) => {
    if (prefersReducedMotion()) return
    const r = stageRef.current.getBoundingClientRect()
    tilt.current = { x: (ev.clientX - r.left) / r.width - 0.5, y: (ev.clientY - r.top) / r.height - 0.5 }
    applyTilt()
  }
  const onLeave = () => { tilt.current = { x: 0, y: 0 }; applyTilt() }

  // The recall packet flies in from outside the board to the patient's bell, then the dashboard reacts.
  const fire = () => {
    if (busy.current) return
    const stage = stageRef.current, pk = packetRef.current
    const bell = stage && stage.querySelector('.dp-bell')
    if (!bell || !pk) { setFired(true); return }
    busy.current = true
    const h = stage.getBoundingClientRect(), b = bell.getBoundingClientRect()
    const P2 = { x: b.left + b.width / 2 - h.left, y: b.top + b.height / 2 - h.top }
    const P0 = { x: P2.x + 210, y: P2.y - 200 }, P1 = { x: P2.x + 120, y: P0.y + 10 }
    const kids = Array.from(pk.children), hist = [], t0 = performance.now(), DUR = 1100
    pk.hidden = false
    const step = (n) => {
      const k0 = Math.min(1, (n - t0) / DUR), k = k0 < 0.5 ? 4 * k0 * k0 * k0 : 1 - Math.pow(-2 * k0 + 2, 3) / 2, u = 1 - k
      const x = u * u * P0.x + 2 * u * k * P1.x + k * k * P2.x, y = u * u * P0.y + 2 * u * k * P1.y + k * k * P2.y
      hist.push([x, y])
      kids.forEach((el, i) => { const q = hist[Math.max(0, hist.length - 1 - i * 3)]; el.style.transform = `translate(${q[0]}px, ${q[1]}px)` })
      if (k0 < 1) requestAnimationFrame(step)
      else { pk.hidden = true; busy.current = false; setFired(true) }
    }
    requestAnimationFrame(step)
  }
  fireRef.current = fire

  // Plays on its own while the board is on screen: calm -> recall arrives -> hold -> reset -> repeat.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    if (prefersReducedMotion()) { setFired(true); return undefined }
    let timers = [], alive = false
    const later = (fn, ms) => timers.push(setTimeout(fn, ms))
    const cycle = () => {
      setFired(false)
      later(() => fireRef.current && fireRef.current(), 1900)
      later(cycle, 1900 + 1100 + 8000)
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !alive) { alive = true; cycle() }
      else if (!e.isIntersecting && alive) { alive = false; timers.forEach(clearTimeout); timers = [] }
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); timers.forEach(clearTimeout) }
  }, [])

  return (
    <section ref={sectionRef} className="scroll-section dashboard-section" id="platform-section" aria-label="Platform dashboard preview">
      <div className="dp-wrap">
        <div className="dp-copy">
          <div className="dp-eyebrow reveal-fade">Platform Preview</div>
          <h2 className="dp-h reveal-fade" dangerouslySetInnerHTML={{ __html: t('dash.title') }}></h2>
          <p className="dp-lead reveal-fade">{t('dash.desc')}</p>
          <ul className="dp-feats reveal-fade">
            {Z.feats.map(([h, p, c]) => (<li key={h} style={{ '--c': c }}><b>{h}</b><span>{p}</span></li>))}
          </ul>
          <div className="dp-ctl reveal-fade" role="group">
            <button type="button" className={ex ? '' : 'on'} aria-pressed={!ex} onClick={() => setEx(false)}>{Z.real}</button>
            <button type="button" className={ex ? 'on' : ''} aria-pressed={ex} onClick={() => setEx(true)}>{Z.exp}</button>
          </div>
        </div>

        <div className="dp-stage reveal-fade" ref={stageRef} onPointerMove={onMove} onPointerLeave={onLeave}>
          <div className="dp-board" ref={boardRef} data-alert={fired ? '1' : undefined} style={{ '--e': ex ? 1 : 0 }} aria-label="VigiCore patient dashboard demo">
            <div className="dp-l dp-base" style={{ '--z': 0 }}>
              <div className="dp-top">
                <div className="dp-lg">VN</div><b>VigiCore <small>NEXUS</small></b>
                <div className="dp-srch">Search Metformin, lot ATO-B…</div>
                <div className="dp-bell" data-ring={fired ? '1' : undefined}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg><i />
                </div>
                <div className="dp-av">AB</div>
              </div>
            </div>
            <div className="dp-l dp-card dp-side" style={{ '--z': 50 }}><span className="dp-tg">{Z.tags[0]}</span>
              <div className="on">Health summary</div><div>Treatments</div><div>My products <u>3</u></div>
              <div>Alerts <u className="red" key={String(fired)} data-pop={fired ? '1' : undefined}>{fired ? 3 : 2}</u></div><div>Appointments</div><div>Reports <u>1</u></div>
            </div>
            <div className="dp-l dp-hi" style={{ '--z': 90 }}>Hello,&nbsp;<b>Amira Boualem</b><span className="dp-btn">Report a Side Effect</span></div>
            <div className="dp-l dp-card dp-ai" style={{ '--z': 130 }}><span className="dp-tg">{Z.tags[1]}</span>
              <h5>VigiHealth AI Summary · Monday, June 29 2026</h5>
              {fired && <p className="u"><b>URGENT</b> <Typed text={URGENT} /></p>}
              <p><b className="a">Action</b> 2 draft reports not yet submitted to ANPP.</p>
              <p><b className="a">Follow-up</b> Next dose: Metformin 850mg at 1:00 PM.</p>
            </div>
            <div className="dp-l dp-kp" style={{ '--z': 175 }}><span className="dp-tg dp-tg-k">{Z.tags[2]}</span>
              <div className="dp-card dp-k" style={{ '--c': '#2fd0a0' }}>ADHERENCE<b><CountUp value={87} suffix="%" onView /></b><small>vs June · 174/200 doses</small></div>
              <div className="dp-card dp-k" style={{ '--c': '#29b6ff' }}>HBA1C<b>6.8%</b><small>Target &lt;7% met</small></div>
              <div className="dp-card dp-k" style={{ '--c': '#ffb84d' }}>ANPP DRAFTS<b><CountUp value={2} onView /></b><small>Not submitted</small></div>
              <div className="dp-card dp-k" style={{ '--c': '#ff6b6b' }}>ACTIVE RECALL<b key={String(fired)} data-flip={fired ? '1' : undefined}>{fired ? 1 : 0}</b><small>{fired ? 'Dexamethasone' : 'Nothing to act on'}</small></div>
            </div>
            <div className="dp-l dp-card dp-rc" data-on={fired ? '1' : undefined} style={{ '--z': 230 }}><span className="dp-tg">{Z.tags[3]}</span>
              <div><b>Product Recall ANPP/RECALL/2026-089 · Immediate Action Required</b>Lot DXP-20250612-B · Dexamethasone 4mg/2ml · particulate contamination.</div>
              <span className="dp-bt">View recall</span>
            </div>
          </div>
          <div className="dp-packet" ref={packetRef} hidden aria-hidden="true"><i><em>{Z.pk}</em></i><b /><b /><b /><b /><b /><b /></div>
          <p className="dp-note">{Z.note}</p>
        </div>
      </div>
    </section>
  )
}
