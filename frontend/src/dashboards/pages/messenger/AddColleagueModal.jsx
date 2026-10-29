import { useCallback, useEffect, useRef, useState } from 'react'
import { chatApi } from '../../services/chatApi'
import { IconCheck, IconSearch, IconUserPlus, IconX } from './icons'
import { avatarStyle, initials, personSub } from './utils'
import { tr } from '../../../i18n/translate.js';

/**
 * "Ajouter un collègue" — Messenger-style: one search box, "people you may know" from your own
 * organization underneath, one clear action per person (Ajouter / Annuler / Accepter / Écrire).
 * Professionals are found by name; patients only by their exact e-mail address (server rule).
 */
export default function AddColleagueModal({ onClose, onChanged, onOpenChat }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)      // null = no search yet
  const [suggestions, setSuggestions] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const seq = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    chatApi.suggestions().then((r) => setSuggestions(r.people)).catch(() => {})
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounced search; stale answers are dropped.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); setLoading(false); return }
    setLoading(true)
    const mine = ++seq.current
    const t = setTimeout(() => {
      chatApi.searchPeople(q)
        .then((r) => { if (mine === seq.current) { setResults(r.people); setError('') } })
        .catch((e) => { if (mine === seq.current) setError(tr(e.message)) })
        .finally(() => { if (mine === seq.current) setLoading(false) })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const patch = useCallback((id, change) => {
    const apply = (list) => list.map((p) => (p.id === id ? { ...p, ...change } : p))
    setResults((l) => (l ? apply(l) : l))
    setSuggestions(apply)
  }, [])

  const act = async (person, fn, change) => {
    setBusyId(person.id); setError('')
    try {
      const r = await fn()
      patch(person.id, typeof change === 'function' ? change(r) : change)
      onChanged?.()
    } catch (e) {
      setError(tr(e.message))
    } finally {
      setBusyId(null)
    }
  }

  const actions = (p) => {
    const busy = busyId === p.id
    switch (p.relation) {
      case 'connected':
        return <button className="msgr-btn msgr-btn--primary msgr-btn--sm" onClick={() => onOpenChat(p.id)}>{tr("Écrire")}</button>
      case 'sent':
        return (
          <button className="msgr-btn msgr-btn--sm" disabled={busy} title={tr("Annuler la demande")}
            onClick={() => act(p, () => chatApi.removeConnection(p.connectionId), { relation: 'none', connectionId: null })}>
            {tr("Demande envoyée · Annuler")}
          </button>
        )
      case 'received':
        return (
          <button className="msgr-btn msgr-btn--primary msgr-btn--sm" disabled={busy}
            onClick={() => act(p, () => chatApi.accept(p.connectionId), { relation: 'connected' })}>
            <IconCheck size={12} /> {tr("Accepter")}
          </button>
        )
      default:
        return (
          <button className="msgr-btn msgr-btn--primary msgr-btn--sm" disabled={busy}
            onClick={() => act(p, () => chatApi.connect(p.id), (r) => ({
              relation: r.connection.status === 'ACCEPTED' ? 'connected' : 'sent',
              connectionId: r.connection.id,
            }))}>
            <IconUserPlus size={12} /> {tr("Ajouter")}
          </button>
        )
    }
  }

  const row = (p) => (
    <div className="msgr-person" key={p.id}>
      <span className="msgr-avatar" style={avatarStyle(p.displayName)}>{initials(p.displayName)}</span>
      <div className="msgr-person-main">
        <span className="msgr-person-name">{p.displayName}</span>
        <span className="msgr-sub">{personSub(p)}</span>
      </div>
      {actions(p)}
    </div>
  )

  const searching = query.trim().length >= 2

  return (
    <div className="msgr-modal" role="dialog" aria-modal="true" aria-label={tr("Ajouter un collègue")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="msgr-modal-card">
        <div className="msgr-modal-head">
          <h3>{tr("Ajouter un collègue")}</h3>
          <button className="msgr-icon-btn" onClick={onClose} aria-label={tr("Fermer")}><IconX /></button>
        </div>
        <p className="msgr-modal-lead">{tr("Recherchez une personne par son nom pour l’inviter. Elle pourra vous écrire dès qu’elle aura accepté.")}</p>
        <label className="msgr-modal-search">
          <IconSearch size={15} />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Nom d’un professionnel ou e-mail exact")} aria-label={tr("Rechercher une personne")} />
        </label>
        {error && <div className="msgr-notice">{tr(error)}</div>}
        <div className="msgr-modal-body">
          {searching ? (
            loading && results === null ? <div className="msgr-modal-empty">{tr("Recherche…")}</div>
            : results && results.length > 0 ? results.map(row)
            : <div className="msgr-modal-empty">{tr("Aucun résultat pour «")} {query.trim()} ».<br />{tr("Vérifiez l’orthographe, ou saisissez l’adresse e-mail exacte.")}</div>
          ) : suggestions.length > 0 ? (
            <>
              <div className="msgr-section-label">{tr("Personnes de votre organisation")}</div>
              {suggestions.map(row)}
            </>
          ) : (
            <div className="msgr-modal-empty">{tr("Commencez à saisir un nom pour trouver un collègue.")}</div>
          )}
        </div>
        <div className="msgr-modal-foot">{tr("Pour protéger les patients, ils ne sont retrouvables que par leur adresse e-mail exacte.")}</div>
      </div>
    </div>
  )
}
