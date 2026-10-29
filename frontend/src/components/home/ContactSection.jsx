import React, { useState } from 'react'
import useSectionReveal from '../../hooks/useSectionReveal.js'
import { useI18n } from '../../i18n/index.jsx'
import { API_BASE } from '../../lib/api.js'

// Endpoint for the "Request a Demo" form.
// Quick zero-backend option: sign up free at https://formspree.io, create a form,
// and paste its endpoint here (e.g. 'https://formspree.io/f/xxxxxxx').
// Or point this at your own backend API route instead.
// Default: the VigiCore API (POST /api/contact, delivered by e-mail server-side). VITE_CONTACT_FORM_ENDPOINT
// can point to an external form provider instead; no e-mail credential ever lives in the browser.
const CONTACT_FORM_ENDPOINT = import.meta.env.VITE_CONTACT_FORM_ENDPOINT || `${API_BASE}/contact`

// The four promises, shown as stamps stuck next to the letter
const STAMPS = [
  { n: 1, rgb: '0,255,178', icon: (<><circle cx="10" cy="10" r="8" /><polyline points="6,10 9,13 14,7" /></>) },
  { n: 2, rgb: '25,227,255', icon: (<><path d="M10 2 L2 6 L2 11 C2 15 5.5 18 10 20 C14.5 18 18 15 18 11 L18 6 Z" /><polyline points="6,10 9,13 14,7" /></>) },
  { n: 3, rgb: '255,180,50', icon: (<><circle cx="10" cy="10" r="8" /><line x1="10" y1="6" x2="10" y2="10" /><line x1="10" y1="10" x2="13" y2="12" /></>) },
  { n: 4, rgb: '190,150,255', icon: (<><rect x="2" y="3" width="16" height="14" rx="2" /><line x1="2" y1="8" x2="18" y2="8" /><line x1="6" y1="12" x2="10" y2="12" /><line x1="6" y1="15" x2="8" y2="15" /></>) },
]

// The values sent with the request stay in English whatever the page language
const MODULES = ['Pharmacovigilance', 'Matériovigilance', 'Chémovigilance', 'Cosmétovigilance', 'Réactovigilance', 'Full Platform (all modules)']

const EMPTY = { name: '', email: '', org: '', phone: '', role: '', type: '', msg: '' }
const validEmail = (v) => /\S+@\S+\.\S+/.test(v.trim())

// One line of the letter: label, the line you write on, and an ink tick once it is filled.
// Defined outside ContactSection on purpose: a component created inside the
// parent would be rebuilt on every keystroke and the inputs would lose focus.
function Field({ id, label, filled, children, wide }) {
  return (
    <div className={`lt-field${wide ? ' lt-field--wide' : ''}${filled ? ' is-filled' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="lt-control">
        {children}
        <svg className="lt-tick" viewBox="0 0 16 16" aria-hidden="true"><polyline points="3.5,8.5 6.8,11.5 12.5,4.5" /></svg>
      </div>
    </div>
  )
}

// The envelope the letter slides into (drawn twice: behind the letter, and the front pocket on top)
function Envelope({ front }) {
  return (
    <svg className={`lt-env ${front ? 'lt-env--front' : 'lt-env--back'}`} viewBox="0 0 1300 300" preserveAspectRatio="none" aria-hidden="true">
      {front
        ? <><path d="M0,40 L650,250 L1300,40 L1300,300 L0,300 Z" className="lt-env-front" /><path d="M0,300 L560,118 M1300,300 L740,118" className="lt-env-fold" /></>
        : <><path d="M0,40 L650,250 L1300,40 L1300,300 L0,300 Z" className="lt-env-back" /><path d="M0,300 L560,118 M1300,300 L740,118" className="lt-env-fold" /></>}
    </svg>
  )
}

export default function ContactSection() {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState('idle') // idle | sending | success | error
  const [vals, setVals] = useState(EMPTY)
  const [sentAt, setSentAt] = useState(null)
  const [copied, setCopied] = useState('')
  const sectionRef = useSectionReveal()

  // The form stays uncontrolled (the submit handler reads the fields by id);
  // this only mirrors what is typed, to tell when the letter is ready.
  const sync = () => {
    const g = (id) => document.getElementById(id)?.value ?? ''
    setVals({ name: g('cf-name'), email: g('cf-email'), org: g('cf-org'), phone: g('cf-phone'), role: g('cf-role'), type: g('cf-type'), msg: g('cf-msg') })
  }
  const required = [vals.name.trim() !== '', validEmail(vals.email), vals.org.trim() !== '', vals.role !== '']
  const ready = required.every(Boolean)
  const sent = status === 'success'

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard unavailable: the address stays selectable */ }
    setCopied(text)
    setTimeout(() => setCopied(''), 1600)
  }

  const succeed = () => { setSentAt(Date.now()); setStatus('success') }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const payload = {
      name: document.getElementById('cf-name')?.value ?? '',
      email: document.getElementById('cf-email')?.value ?? '',
      organization: document.getElementById('cf-org')?.value ?? '',
      phone: document.getElementById('cf-phone')?.value ?? '',
      role: document.getElementById('cf-role')?.value ?? '',
      interestedIn: document.getElementById('cf-type')?.value ?? '',
      message: document.getElementById('cf-msg')?.value ?? '',
      website: document.getElementById('cf-website')?.value ?? '', // honeypot, must stay empty
    }

    setStatus('sending')
    try {
      const res = await fetch(CONTACT_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      succeed()
    } catch (err) {
      console.error('[ContactSection] Submit failed:', err)
      setStatus('error')
    }
  }

  const postDate = sentAt ? new Date(sentAt).toLocaleDateString(lang, { day: '2-digit', month: 'short', year: 'numeric' }) : ''

  return (
    <section ref={sectionRef} className="scroll-section contact-section lt-section" id="contact-form">
    <div className="section-content">
      <div className="section-eyebrow reveal-fade" style={{'color':'var(--cyan)'}}>{t('cf.eyebrow')}</div>
      <h2 className="section-title reveal-fade">{t('demo.title')}</h2>
      <p className="section-desc reveal-fade">{t('demo.desc')}</p>

      {/* static className: the reveal hook adds `in-view` to this node, so React must never rewrite it (state goes in data-*) */}
      <div className="lt-desk reveal-fade" data-ready={ready ? 'true' : undefined} data-sent={sent ? 'true' : undefined}>

        {/* return address: the two emails */}
        <aside className="lt-return">
          <i className="lt-tape" aria-hidden="true"></i>
          <span className="lt-return-k">{t('cf.letter.from')}</span>
          <strong>VIGICORE NEXUS</strong>
          {['contact@vigicore.health', 'support@vigicore.health'].map((mail, k) => (
            <div key={mail} className="lt-mail">
              <a href={`mailto:${mail}`}>
                {k === 0
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2,6 12,13 22,6" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="0.8" fill="currentColor" /></svg>}
                <span>{mail}</span>
              </a>
              <button type="button" onClick={() => copy(mail)} aria-label={copied === mail ? t('cf.copied') : `${t('cf.copy')} ${mail}`} title={copied === mail ? t('cf.copied') : t('cf.copy')}>
                {copied === mail
                  ? <svg viewBox="0 0 16 16"><polyline points="3.5,8.5 6.8,11.5 12.5,4.5" /></svg>
                  : <svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8" /><path d="M10.5 5.5 V4.2 A1.7 1.7 0 0 0 8.8 2.5 H4.2 A1.7 1.7 0 0 0 2.5 4.2 V8.8 A1.7 1.7 0 0 0 4.2 10.5 H5.5" /></svg>}
              </button>
            </div>
          ))}
        </aside>

        {/* the letter, and the envelope it slides into once sent */}
        <div className="lt-center">
          <Envelope />
          <div className="lt-paper" aria-hidden={sent ? 'true' : undefined}>
            <i className="lt-tape lt-tape--top" aria-hidden="true"></i>
            <div className="lt-letterhead"><b>VIGICORE NEXUS</b><span>{t('cf.secure')}</span></div>
            <p className="lt-dear">{t('cf.letter.dear')}</p>

            <form id="contact-form-el" noValidate onSubmit={handleSubmit} onChange={sync}>
              <div className="lt-grid">
                <Field id="cf-name" label={t('cf.label.name')} filled={required[0]}>
                  <input type="text" id="cf-name" placeholder={t('cf.ph.name')} required autoComplete="name" />
                </Field>
                <Field id="cf-email" label={t('cf.label.email')} filled={required[1]}>
                  <input type="email" id="cf-email" placeholder={t('cf.ph.email')} required autoComplete="email" />
                </Field>
                <Field id="cf-org" label={t('cf.label.org')} filled={required[2]}>
                  <input type="text" id="cf-org" placeholder={t('cf.ph.org')} required />
                </Field>
                <Field id="cf-phone" label={t('cf.label.phone')} filled={vals.phone.trim() !== ''}>
                  <input type="tel" id="cf-phone" placeholder={t('cf.ph.phone')} autoComplete="tel" />
                </Field>
                <Field id="cf-role" label={t('cf.label.role')} filled={required[3]}>
                  <select id="cf-role" required defaultValue="" className={vals.role === '' ? 'is-empty' : ''}>
                    <option value="" disabled>{t('cf.role.placeholder')}</option>
                    <optgroup label={t('cf.role.groupPortal')}>
                      <option value="physician">{t('cf.role.physician')}</option>
                      <option value="patient">{t('cf.role.patient')}</option>
                      <option value="pharmacist">{t('cf.role.pharmacist')}</option>
                      <option value="clinic">{t('cf.role.clinic')}</option>
                      <option value="laboratory">{t('cf.role.laboratory')}</option>
                    </optgroup>
                    <optgroup label={t('cf.role.groupEnterprise')}>
                      <option value="manufacturer">{t('cf.role.manufacturer')}</option>
                    </optgroup>
                    <option value="regulatory">{t('cf.role.regulatory')}</option>
                    <option value="investor">{t('cf.role.investor')}</option>
                    <option value="other">{t('cf.role.other')}</option>
                  </select>
                  <svg className="lt-chev" viewBox="0 0 16 16" aria-hidden="true"><polyline points="4,6 8,10 12,6" /></svg>
                </Field>
                <Field id="cf-type" label={t('cf.label.type')} filled={vals.type !== ''}>
                  <select id="cf-type" defaultValue="" className={vals.type === '' ? 'is-empty' : ''}>
                    <option value="" disabled>{t('cf.module.placeholder')}</option>
                    {MODULES.map((m, i) => <option key={m} value={m}>{t(`cf.mod.${i + 1}`)}</option>)}
                  </select>
                  <svg className="lt-chev" viewBox="0 0 16 16" aria-hidden="true"><polyline points="4,6 8,10 12,6" /></svg>
                </Field>
                <Field id="cf-msg" label={t('cf.label.message')} filled={vals.msg.trim() !== ''} wide>
                  <textarea id="cf-msg" rows="3" placeholder={t('cf.ph.msg')}></textarea>
                </Field>
              </div>

              <div className="lt-ps"><p><b>{t('cf.letter.ps')}</b> {t('cf.quoteShort')}</p><span>{t('cf.quoteAuthor')}</span></div>

              <div className="lt-send">
                <input id="cf-website" name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
                <button type="submit" className="lt-submit" disabled={status === 'sending'}>
                  {status === 'sending'
                    ? <span className="lt-spin" aria-hidden="true"></span>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22,2 15,22 11,13 2,9" /></svg>}
                  {status === 'sending' ? t('cf.sending') : t('cf.submit')}
                </button>
                <p className="lt-note">{t('cf.privacy')} <a href="/privacy">{t('cf.privacy.link')}</a>.</p>
              </div>
              {status === 'error' && (
                <p className="lt-note lt-note--error" role="alert">
                  {t('cf.error')}{' '}
                  <a href="mailto:contact@vigicore.health">contact@vigicore.health</a>.
                </p>
              )}
            </form>
          </div>
          <Envelope front />

          {sent && (
            <div className="lt-success" id="form-success" role="status">
              <svg className="lt-postmark" viewBox="0 0 200 200" aria-hidden="true">
                <defs><path id="lt-pm-ring" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" /></defs>
                <circle cx="100" cy="100" r="94" className="lt-pm-line" />
                <circle cx="100" cy="100" r="52" className="lt-pm-line" />
                <text className="lt-pm-ring"><textPath href="#lt-pm-ring" textLength="440" lengthAdjust="spacing">{`VIGICORE NEXUS · ${postDate} · `}</textPath></text>
                <text x="100" y="108" textAnchor="middle" className="lt-pm-center">{t('cf.stamp')}</text>
              </svg>
              <p>{t('cf.thanks')}</p>
            </div>
          )}
        </div>

        {/* the four promises, as stamps; they settle straight once the letter is ready */}
        <div className="lt-stamps">
          {STAMPS.map((s) => (
            <div key={s.n} className="lt-stamp" style={{ '--c': s.rgb, '--n': s.n }}>
              <div className="lt-stamp-in">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                <b>{t(`cf.prop${s.n}.title`)}</b>
                <span>{t(`cf.prop${s.n}.desc`)}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  </section>
  )
}
