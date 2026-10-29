import React, { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../../lib/api.js'
import { tr } from '../../i18n/translate.js';

const LANGS = [['fr', 'Français'], ['ar', 'العربية'], ['en', 'English']]
const UI = {
  fr: { facts: 'Points clés du produit', ph: 'Ex : boîte de 20 comprimés, 500 mg, usage adulte…', gen: 'Générer', regen: 'Régénérer' },
  ar: { facts: 'أهم مميزات المنتج', ph: 'مثال: علبة 20 قرصًا، 500 ملغ، للبالغين…', gen: 'إنشاء', regen: 'إعادة الإنشاء' },
  en: { facts: 'Key facts about the product', ph: 'e.g. box of 20 tablets, 500 mg, adult use…', gen: 'Generate', regen: 'Regenerate' },
}
const UI_ORG = {
  fr: { facts: "Points clés de l'organisation", ph: 'Ex : laboratoire d\'analyses médicales, fondé en 2010, équipe de 25 personnes, Sétif…' },
  ar: { facts: 'أهم معلومات المؤسسة', ph: 'مثال: مخبر تحاليل طبية، تأسس سنة 2010، فريق من 25 شخصًا، سطيف…' },
  en: { facts: 'Key facts about the organization', ph: 'e.g. medical analysis lab, founded in 2010, team of 25, Sétif…' },
}

// Offline fallback: only uses what the seller actually typed. It never invents claims.
const CTA = {
  fr: 'Contactez-nous pour le prix, la disponibilité et la livraison.',
  ar: 'تواصلوا معنا لمعرفة السعر والتوفر والتوصيل.',
  en: 'Contact us for pricing, availability and delivery.',
}
function localDraft(lang, title, category, facts) {
  const lines = facts.split(/\n|;|•/).map((s) => s.trim()).filter(Boolean)
  const first = lines[0] ? `${title} — ${lines[0]}` : category ? `${title} — ${category}` : title
  const list = lines.map((l) => `• ${l}`).join('\n')
  return { summary: first.slice(0, 140), description: [list, CTA[lang]].filter(Boolean).join('\n\n') }
}

export default function AiWriter({ f, onClose, onUse, org = false }) {
  const [lang, setLang] = useState('fr')
  const [facts, setFacts] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState(null) // { summary, description, ai }
  const [note, setNote] = useState('')
  const seq = useRef(0)
  const title = String(f.title ?? '').trim()
  const category = String(f.category ?? '').trim()
  const rtl = lang === 'ar'

  // A draft in another language would be misleading: clear it when the language changes.
  useEffect(() => { seq.current++; setOut(null); setNote(''); setBusy(false) }, [lang])

  async function generate() {
    if (!title || busy) return
    const my = ++seq.current
    setBusy(true); setNote('')
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 30000)
      let res
      try {
        res = await fetch(`${API_BASE}/ai/listing-text`, {
          method: 'POST', credentials: 'include', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, category, facts, lang, kind: org ? 'organization' : 'product' }),
        })
      } finally { clearTimeout(t) }
      const j = await res.json().catch(() => null)
      if (my !== seq.current) return
      if (res.ok && j?.success) { setOut({ summary: j.summary, description: j.description, ai: true }); return }
      const e = new Error(j?.code || String(res.status)); e.status = res.status; throw e
    } catch (err) {
      if (my !== seq.current) return
      const why = err?.status === 503 ? 'ANTHROPIC_API_KEY is missing in server/.env (then restart the server).'
        : err?.status === 404 ? 'The server has no /api/ai route yet: copy ai.routes.ts + app.ts and restart the server.'
        : err?.status === 401 ? 'You are not logged in.'
        : err?.status === 429 ? 'Too many requests, wait a minute.'
        : 'The AI service did not answer (check the server console for [writer]).'
      if (facts.trim()) {
        setOut({ ...localDraft(lang, title, category, facts), ai: false })
        setNote(`AI unavailable — basic draft from your key points only. ${why}`)
      } else {
        setOut(null)
        setNote(`AI unavailable. ${why}`)
      }
    } finally { if (my === seq.current) setBusy(false) }
  }

  return (
    <div className="aiw">
      <div className="aiw-head">
        <span className="aiw-title"><b>✨</b> {tr("Write for me")}</span>
        <div className="aiw-tabs" role="tablist">
          {LANGS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={lang === k} onClick={() => setLang(k)} className={lang === k ? 'on' : ''}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="aiw-x" aria-label={tr("Close")}>✕</button>
      </div>

      {!title ? <p className="aiw-empty">{org ? tr("Enter the organization name first, then I can draft the text.") : tr("Enter a product name first, then I can draft the text.")}</p> : (
        <>
          <label className="aiw-field">
            <span className="aiw-lbl"><b>{(org ? UI_ORG : UI)[lang].facts}</b><small>{tr("Optional. The more you write, the better the text.")}</small></span>
            <textarea rows={3} maxLength={600} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder={(org ? UI_ORG : UI)[lang].ph} dir={rtl ? 'rtl' : 'ltr'} />
          </label>

          {!out && (
            <button type="button" className="msp-btn msp-btn--primary msp-btn--sm aiw-go" disabled={busy} onClick={generate}>
              {busy ? tr("Writing…") : UI[lang].gen}
            </button>
          )}
          {!out && note && <p className="aiw-note">{tr(note)}</p>}

          {out && (
            <div className="aiw-result">
              <label className="aiw-field">
                <span>{tr("Summary")} <small>{out.summary.length}/140</small></span>
                <textarea rows={2} maxLength={140} dir={rtl ? 'rtl' : 'ltr'} value={out.summary} onChange={(e) => setOut({ ...out, summary: e.target.value })} />
              </label>
              <label className="aiw-field">
                <span>{tr("Description")}</span>
                <textarea rows={6} dir={rtl ? 'rtl' : 'ltr'} value={out.description} onChange={(e) => setOut({ ...out, description: e.target.value })} />
              </label>
              {note && <p className="aiw-note">{tr(note)}</p>}
              <p className="aiw-hint">{tr("Check the details before publishing.")}</p>
              <div className="aiw-actions">
                <button type="button" className="msp-btn msp-btn--primary msp-btn--sm" onClick={() => { onUse({ summary: out.summary.slice(0, 140), description: out.description }); onClose() }}>{tr("Use this text")}</button>
                <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" disabled={busy} onClick={generate}>{busy ? tr("Writing…") : UI[lang].regen}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
