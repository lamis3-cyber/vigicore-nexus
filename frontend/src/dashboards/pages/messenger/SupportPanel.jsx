import { useCallback, useEffect, useRef, useState } from 'react'
import { SUPPORT_TOPICS, SupportApiError, newKey, supportApi } from '../../services/supportApi'
import { IconBack, IconChat, IconSearch, IconSend } from './icons'
import { isSupportUnread, markSupportSeen, readSupportSeen } from '../../lib/supportSeen'
import { avatarStyle, dayKey, dayLabel, formatClock, formatListTime, initials } from './utils'

const THREADS_POLL_MS = 8000
const MESSAGES_POLL_MS = 4000
const visible = () => document.visibilityState === 'visible'

/** Rappel permanent : une discussion ne remplace JAMAIS une déclaration de vigilance. */
function VigilanceNotice({ strong = false }) {
  return (
    <div className={`msgr-notice msgr-notice--${strong ? 'warn' : 'info'} msgr-support-notice`} role="note">
      <strong>Incident de sécurité ?</strong> Si un produit a pu causer ou risque de causer un effet sur la santé,
      faites une <strong>déclaration de vigilance</strong> (menu « Déclarer ») : cette conversation ne la remplace pas.
      Pour acheter un produit, utilisez la page <strong>Services</strong>.
    </div>
  )
}

/** Nouvelle conversation : chercher un laboratoire joignable, choisir le sujet, écrire. */
function NewSupportForm({ onCancel, onOpened }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = pas encore de recherche
  const [loading, setLoading] = useState(false)
  const [org, setOrg] = useState(null)
  const [topic, setTopic] = useState('DEVICE_USAGE')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)
  const pending = useRef({ sig: '', key: '' }) // même contenu = même clé (réessai sans doublon)

  useEffect(() => {
    const q = query.trim()
    if (org || q.length < 2) { setResults(null); setLoading(false); return }
    setLoading(true)
    const mine = ++seq.current
    const t = setTimeout(() => {
      supportApi.organizations(q)
        .then((r) => { if (mine === seq.current) { setResults(r.organizations); setError('') } })
        .catch((e) => { if (mine === seq.current) setError(e.message) })
        .finally(() => { if (mine === seq.current) setLoading(false) })
    }, 250)
    return () => clearTimeout(t)
  }, [query, org])

  const text = message.trim()
  const submit = async (e) => {
    e.preventDefault()
    if (!org || !text || busy) return
    const sig = `${org.organizationRef}|${topic}|${text}`
    if (pending.current.sig !== sig) pending.current = { sig, key: newKey() }
    setBusy(true); setError('')
    try {
      const r = await supportApi.open({ organizationRef: org.organizationRef, topic, message: text }, pending.current.key)
      pending.current = { sig: '', key: '' }
      onOpened(r.threadId)
    } catch (err) {
      setError(err instanceof SupportApiError && err.code === 'SUPPORT_UNAVAILABLE'
        ? 'Ce laboratoire n’a pas de support joignable pour le moment.'
        : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="msgr-thread-panel">
      <div className="msgr-thread-header">
        <div className="msgr-thread-header-title">
          <button type="button" className="msgr-icon-btn msgr-back" onClick={onCancel} aria-label="Retour"><IconBack /></button>
          <div>
            <div className="msgr-thread-name">Contacter le support d’un laboratoire</div>
            <div className="msgr-header-sub">Seuls les laboratoires vérifiés et joignables apparaissent.</div>
          </div>
        </div>
        <button type="button" className="msgr-btn msgr-btn--sm" onClick={onCancel}>Annuler</button>
      </div>

      <form className="msgr-support-form" onSubmit={submit}>
        <div className="msgr-support-field">
          <span>Laboratoire</span>
          {org ? (
            <div className="msgr-support-picked">
              <span className="msgr-avatar" style={avatarStyle(org.name)}>{initials(org.name)}</span>
              <strong>{org.name}</strong>
              <button type="button" className="msgr-btn msgr-btn--sm" onClick={() => { setOrg(null); setQuery('') }}>Changer</button>
            </div>
          ) : (
            <>
              <span className="msgr-search">
                <IconSearch size={14} />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom du laboratoire (2 lettres minimum)…" aria-label="Nom du laboratoire" />
              </span>
              <div className="msgr-support-results">
                {loading && <p className="msgr-empty">Recherche…</p>}
                {!loading && results && results.length === 0 && (
                  <p className="msgr-empty">Aucun laboratoire joignable ne correspond à « {query.trim()} ».</p>
                )}
                {!loading && results?.map((o) => (
                  <button type="button" key={o.organizationRef} className="msgr-colleague-item" onClick={() => setOrg(o)}>
                    <span className="msgr-avatar" style={avatarStyle(o.name)}>{initials(o.name)}</span>
                    <span className="msgr-person-main"><span className="msgr-person-name">{o.name}</span></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <label className="msgr-support-field">
          <span>Sujet</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {SUPPORT_TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>

        {topic === 'URGENT_FAILURE' && <VigilanceNotice strong />}

        <label className="msgr-support-field">
          <span>Votre message</span>
          <textarea rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Décrivez la situation (modèle, numéro de série…). N’indiquez aucune donnée de patient." />
        </label>

        <p className="msgr-header-sub">
          Le support du laboratoire verra votre <strong>nom</strong> et votre <strong>établissement</strong> afin de vous
          répondre. Votre e-mail et vos coordonnées ne lui sont jamais transmis.
        </p>

        {error && <div className="msgr-notice" role="alert">{error}</div>}
        <div className="msgr-support-actions">
          <button type="submit" className="msgr-btn msgr-btn--primary" disabled={!org || !text || busy}>
            <IconSend size={13} /> {busy ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Une conversation : liste des messages (relève toutes les 4 s) + zone d'écriture. */
function SupportConversation({ thread, onBack, onActivity }) {
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lastAt = useRef(null)
  const scrollRef = useRef(null)
  const pending = useRef({ text: '', key: '' })

  const merge = useCallback((incoming) => {
    if (!incoming.length) return
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id))
      const add = incoming.filter((m) => !seen.has(m.id))
      return add.length ? [...prev, ...add] : prev
    })
    lastAt.current = incoming[incoming.length - 1].sentAt
  }, [])

  useEffect(() => {
    let alive = true
    lastAt.current = null
    setMessages([]); setLoaded(false); setError('')
    const pull = async (first) => {
      try {
        const r = await supportApi.messages(thread.threadId, first ? undefined : lastAt.current)
        if (alive) merge(r.messages)
      } catch (e) {
        if (alive && first) setError(e.message)
      } finally {
        if (alive && first) setLoaded(true)
      }
    }
    pull(true)
    const t = setInterval(() => { if (visible()) pull(false) }, MESSAGES_POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [thread.threadId, merge])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loaded])

  const send = async (e) => {
    e.preventDefault()
    const content = draft.trim()
    if (!content || busy) return
    if (pending.current.text !== content) pending.current = { text: content, key: newKey() }
    setBusy(true); setError('')
    try {
      const m = await supportApi.send(thread.threadId, content, pending.current.key)
      pending.current = { text: '', key: '' }
      merge([m.message])
      setDraft('')
      onActivity?.()
    } catch (err) {
      setError(err.code === 'SUPPORT_UNAVAILABLE' ? 'Le support de ce laboratoire n’est pas joignable pour le moment.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  let lastDay = null
  return (
    <div className="msgr-thread-panel">
      <div className="msgr-thread-header">
        <div className="msgr-thread-header-title">
          <button type="button" className="msgr-icon-btn msgr-back" onClick={onBack} aria-label="Retour aux conversations"><IconBack /></button>
          <span className="msgr-avatar" style={avatarStyle(thread.organizationName)}>{initials(thread.organizationName)}</span>
          <div>
            <div className="msgr-thread-name">{thread.organizationName}</div>
            <div className="msgr-header-sub">Support du laboratoire</div>
          </div>
        </div>
      </div>

      <VigilanceNotice />

      <div className="msgr-messages" ref={scrollRef}>
        {!loaded ? <p className="msgr-empty">Chargement…</p>
          : messages.length === 0 ? <p className="msgr-empty">Aucun message.</p>
          : messages.map((m) => {
            const key = dayKey(m.sentAt)
            const separator = key !== lastDay ? <div className="msgr-day" key={`d-${key}`}>{dayLabel(m.sentAt)}</div> : null
            lastDay = key
            const mine = m.direction === 'FROM_CLIENT'
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {separator}
                <div className={`msgr-bubble-row${mine ? ' is-me' : ''}`}>
                  <div className="msgr-bubble">
                    <p>{m.content}</p>
                    <span className="msgr-bubble-time">{mine ? '' : 'Support · '}{formatClock(m.sentAt)}</span>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      {error && <div className="msgr-notice" role="alert">{error}</div>}

      <form className="msgr-composer" onSubmit={send}>
        <div className="msgr-input-bar">
          <input type="text" placeholder="Écrire au support…" value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)} aria-label="Votre message au support" />
        </div>
        <button type="submit" className="msgr-send-btn" aria-label="Envoyer" disabled={busy || !draft.trim()}><IconSend size={17} /></button>
      </form>
    </div>
  )
}

/** Onglet « Support laboratoires » de la page Messages (même coque que les conversations entre collègues). */
export default function SupportPanel() {
  const [threads, setThreads] = useState([])
  const [ready, setReady] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try { const r = await supportApi.threads(); setThreads(Array.isArray(r?.threads) ? r.threads : []); setNotice('') }
    catch (e) { setNotice(e.message) }
    finally { setReady(true) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => { if (visible()) load() }, THREADS_POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const active = threads.find((t) => t.threadId === activeId) ?? null
  // Conversation ouverte = réponses lues (y compris celles qui arrivent pendant qu'elle est ouverte).
  useEffect(() => {
    if (active && !creating) markSupportSeen(active.threadId, active.lastMessageAt)
  }, [active?.threadId, active?.lastMessageAt, creating]) // eslint-disable-line react-hooks/exhaustive-deps
  const seen = readSupportSeen()
  const opened = async (threadId) => { await load(); setActiveId(threadId); setCreating(false) }

  return (
    <div className={`msgr-shell${active || creating ? ' has-thread' : ''}`}>
      <aside className="msgr-sidebar">
        <div className="msgr-sidebar-head">
          <h2>Support laboratoires</h2>
        </div>
        <div className="msgr-support-new">
          <button type="button" className="msgr-btn msgr-btn--primary" onClick={() => { setCreating(true); setActiveId(null) }}>Contacter un laboratoire</button>
        </div>
        {notice && <div className="msgr-notice" role="alert">{notice}</div>}
        <div className="msgr-list">
          {!ready ? <p className="msgr-empty">Chargement…</p>
            : threads.length === 0 ? (
              <div className="msgr-empty"><p>Aucune conversation avec un support de laboratoire.</p></div>
            ) : threads.map((t) => {
              const unread = isSupportUnread(t, seen) && !(t.threadId === activeId && !creating)
              return (
              <button type="button" key={t.threadId} className={`msgr-thread-item${t.threadId === activeId && !creating ? ' is-active' : ''}${unread ? ' has-unread' : ''}`} onClick={() => { setActiveId(t.threadId); setCreating(false) }}>
                <span className="msgr-avatar" style={avatarStyle(t.organizationName)}>{initials(t.organizationName)}</span>
                <span className="msgr-thread-main">
                  <span className="msgr-thread-top">
                    <span className="msgr-thread-name">{t.organizationName}</span>
                    <span className="msgr-thread-time">{formatListTime(t.lastMessageAt ?? t.createdAt)}</span>
                  </span>
                  <span className="msgr-thread-preview">
                    {t.lastMessagePreview ? `${t.lastMessageFromSupport ? 'Support : ' : 'Vous : '}${t.lastMessagePreview}` : 'Support'}
                  </span>
                </span>
                {unread && <span className="msgr-unread-pill" aria-label="Nouvelle réponse du support">1</span>}
              </button>
              )
            })}
        </div>
      </aside>

      {creating ? <NewSupportForm onCancel={() => setCreating(false)} onOpened={opened} />
        : active ? <SupportConversation key={active.threadId} thread={active} onBack={() => setActiveId(null)} onActivity={load} />
        : (
          <div className="msgr-thread-panel msgr-thread-empty">
            <IconChat size={34} />
            <strong>Support des laboratoires</strong>
            <span className="msgr-sub">Posez une question sur un dispositif ou signalez un problème technique.</span>
            <VigilanceNotice />
          </div>
        )}
    </div>
  )
}
