import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { chatApi } from '../../services/chatApi'
import { consumeOpenChat } from '../../data/chatDeepLink'
import AddColleagueModal from './AddColleagueModal'
import ChatThread, { EmptyThread } from './ChatThread'
import { IconCheck, IconSearch, IconUserPlus, IconX } from './icons'
import { avatarStyle, formatListTime, initials, personSub } from './utils'
import './messenger.css'
import { tr } from '../../../i18n/translate.js';
import SupportPanel from './SupportPanel'
import { useSupportUnread } from '../../lib/useSupportUnread'

const THREADS_POLL_MS = 5000
const CONNECTIONS_POLL_MS = 10000

const previewOf = (last) => {
  if (!last) return 'Nouvelle conversation'
  const prefix = last.mine ? 'Vous : ' : ''
  if (last.deleted) return `${prefix}Message supprimé`
  if (last.kind === 'VOICE') return `${prefix}🎤 Message vocal`
  if (last.kind === 'FILE') return `${prefix}📎 ${last.body || 'Pièce jointe'}`
  return `${prefix}${last.body ?? ''}`
}

function Person({ p, children, onClick }) {
  return (
    <div
      className="msgr-colleague-item"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
    >
      <span className="msgr-avatar" style={avatarStyle(p.displayName)}>{initials(p.displayName)}</span>
      <div className="msgr-person-main">
        <span className="msgr-person-name">{p.displayName}</span>
        <span className="msgr-sub">{personSub(p)}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * Messages page shared by every dashboard (doctor, pharmacist, laboratory, hospital, patient…).
 * Layout and look come from the VigiCore Logiciel "Communication" page; people are added the
 * Messenger way (search, request, accept) through the "Ajouter un collègue" dialog.
 */
export default function Messenger() {
  const { user } = useAuth()
  const meId = user?.id

  const [threads, setThreads] = useState([])
  const [conn, setConn] = useState({ friends: [], incoming: [], outgoing: [] })
  const [activeId, setActiveId] = useState(null)
  const [tab, setTab] = useState('chats')
  const [filter, setFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(false)
  // « colleagues » = conversations entre professionnels ; « support » = support des laboratoires (Audit).
  const [view, setView] = useState('colleagues')
  const canSupport = String(user?.role ?? '').toLowerCase() !== 'patient' // le serveur refuse aussi les patients (403)
  const supportUnread = useSupportUnread(canSupport)

  const loadThreads = useCallback(async () => {
    try { const r = await chatApi.threads(); setThreads(Array.isArray(r?.threads) ? r.threads : []) } catch { /* keep the last list */ }
  }, [])
  const loadConnections = useCallback(async () => {
    try { const r = await chatApi.connections(); setConn({ friends: r?.friends ?? [], incoming: r?.incoming ?? [], outgoing: r?.outgoing ?? [] }) } catch { /* keep */ }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([loadThreads(), loadConnections()]).finally(() => { if (alive) setReady(true) })
    const visible = () => document.visibilityState === 'visible'
    const t1 = setInterval(() => { if (visible()) loadThreads() }, THREADS_POLL_MS)
    const t2 = setInterval(() => { if (visible()) loadConnections() }, CONNECTIONS_POLL_MS)
    return () => { alive = false; clearInterval(t1); clearInterval(t2) }
  }, [loadThreads, loadConnections])

  const refreshAll = useCallback(() => { loadThreads(); loadConnections() }, [loadThreads, loadConnections])

  const openChatWith = useCallback(async (userId) => {
    setNotice('')
    try {
      const r = await chatApi.openThread(userId)
      await loadThreads()
      setActiveId(r.threadId); setTab('chats'); setAddOpen(false)
    } catch (e) {
      setNotice(tr(e.message))
    }
  }, [loadThreads])

  // "Contacter" depuis une autre page : ouvre directement la conversation avec cette personne.
  useEffect(() => {
    const target = consumeOpenChat()
    if (target) openChatWith(target)
  }, [openChatWith])

  const activeThread = threads.find((t) => t.id === activeId) ?? null
  const q = filter.trim().toLowerCase()
  const match = (u) => !q || `${u.displayName} ${u.organization ?? ''}`.toLowerCase().includes(q)

  const shownThreads = useMemo(() => threads.filter((t) => match(t.user)), [threads, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownFriends = conn.friends.filter((f) => match(f.user))
  const requestCount = conn.incoming.length

  const answer = async (fn) => {
    setNotice('')
    try { await fn(); refreshAll() } catch (e) { setNotice(tr(e.message)) }
  }

  return (
    <div className="view is-active msgr-root" id="view-doc-messagerie">
      <div className="page-header msgr-page-head">
        <div>
          <h1 className="page-title">{tr("Messages")}</h1>
          <div className="msgr-page-sub">{view === 'support' && canSupport
            ? tr("Échangez avec le support des laboratoires et fabricants.")
            : tr("Échangez avec vos collègues et vos contacts professionnels.")}</div>
        </div>
        {canSupport && (
          <div className="msgr-viewswitch" role="tablist" aria-label={tr("Type de conversation")}>
            <button role="tab" aria-selected={view === 'colleagues'} className={view === 'colleagues' ? 'is-active' : ''} onClick={() => setView('colleagues')}>{tr("Collègues")}</button>
            <button role="tab" aria-selected={view === 'support'} className={view === 'support' ? 'is-active' : ''} onClick={() => setView('support')} style={{ position: 'relative' }}>
              {tr("Support laboratoires")}
              {supportUnread > 0 && view !== 'support' && <span className="msgr-badge" aria-label={`${supportUnread} réponse(s) non lue(s)`}>{supportUnread}</span>}
            </button>
          </div>
        )}
      </div>

      {canSupport && view === 'support' ? <SupportPanel /> : (
      <div className={`msgr-shell${activeThread ? ' has-thread' : ''}`}>
        <aside className="msgr-sidebar">
          <div className="msgr-sidebar-head">
            <h2>{tr("Messages")}</h2>
            <div className="msgr-sidebar-actions">
              <button className="msgr-icon-btn" title={tr("Ajouter un collègue")} aria-label={tr("Ajouter un collègue")} onClick={() => setAddOpen(true)}>
                <IconUserPlus />
                {requestCount > 0 && <span className="msgr-badge">{requestCount}</span>}
              </button>
            </div>
          </div>

          <label className="msgr-search">
            <IconSearch size={14} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr("Rechercher…")} aria-label={tr("Rechercher dans vos conversations et contacts")} />
          </label>

          <div className="msgr-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chats'} className={tab === 'chats' ? 'is-active' : ''} onClick={() => setTab('chats')}>{tr("Conversations")}</button>
            <button role="tab" aria-selected={tab === 'contacts'} className={tab === 'contacts' ? 'is-active' : ''} onClick={() => setTab('contacts')}>
              {tr("Contacts")}{requestCount > 0 && <span className="msgr-tab-count">{requestCount}</span>}
            </button>
          </div>

          {notice && <div className="msgr-notice" role="alert">{notice}</div>}

          <div className="msgr-list">
            {!ready ? (
              <p className="msgr-empty">{tr("Chargement…")}</p>
            ) : tab === 'chats' ? (
              shownThreads.length === 0 ? (
                <div className="msgr-empty">
                  {threads.length > 0 ? <p>{tr("Aucun résultat.")}</p>
                    : conn.outgoing.length > 0 ? <p>{tr("Demande envoyée : la conversation s’ouvrira dès qu’elle sera acceptée.")}</p>
                    : conn.incoming.length > 0 ? <p>{tr("Vous avez une demande de contact dans l’onglet Contacts.")}</p>
                    : (
                      <>
                        <p>{tr("Aucune conversation pour le moment.")}</p>
                        <button className="msgr-btn msgr-btn--primary" onClick={() => setAddOpen(true)}><IconUserPlus size={13} /> {tr("Ajouter un collègue")}</button>
                      </>
                    )}
                </div>
              ) : shownThreads.map((t) => (
                <button type="button" key={t.id} className={`msgr-thread-item${t.id === activeId ? ' is-active' : ''}${t.unread > 0 ? ' has-unread' : ''}`} onClick={() => setActiveId(t.id)}>
                  <span className="msgr-avatar" style={avatarStyle(t.user.displayName)}>{initials(t.user.displayName)}</span>
                  <span className="msgr-thread-main">
                    <span className="msgr-thread-top">
                      <span className="msgr-thread-name">{t.user.displayName}</span>
                      <span className="msgr-thread-time">{formatListTime(t.last?.createdAt ?? t.updatedAt)}</span>
                    </span>
                    <span className="msgr-thread-top">
                      <span className="msgr-thread-preview">{previewOf(t.last)}</span>
                      {t.unread > 0 && <span className="msgr-unread-pill">{t.unread}</span>}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <>
                {conn.incoming.length > 0 && (
                  <>
                    <div className="msgr-section-label">{tr("Demandes reçues")}</div>
                    {conn.incoming.map((r) => (
                      <Person key={r.connectionId} p={r.user}>
                        <div className="msgr-row-actions">
                          <button className="msgr-btn msgr-btn--primary msgr-btn--sm" onClick={() => answer(() => chatApi.accept(r.connectionId))}><IconCheck size={12} /> {tr("Accepter")}</button>
                          <button className="msgr-icon-btn" style={{ width: 28, height: 28 }} title={tr("Refuser")} aria-label={tr("Refuser {0}", [r.user.displayName])} onClick={() => answer(() => chatApi.decline(r.connectionId))}><IconX size={13} /></button>
                        </div>
                      </Person>
                    ))}
                  </>
                )}
                {conn.outgoing.length > 0 && (
                  <>
                    <div className="msgr-section-label">{tr("Demandes envoyées")}</div>
                    {conn.outgoing.map((r) => (
                      <Person key={r.connectionId} p={r.user}>
                        <button className="msgr-btn msgr-btn--sm" onClick={() => answer(() => chatApi.removeConnection(r.connectionId))}>{tr("Annuler")}</button>
                      </Person>
                    ))}
                  </>
                )}
                {/* « Mes collègues » : affiché seulement s'il y a des collègues ; sinon, l'invitation à en ajouter n'apparaît
                    que si aucune demande n'est en cours (le bouton « + » de l'en-tête reste toujours disponible). */}
                {conn.friends.length > 0 && <div className="msgr-section-label">{tr("Mes collègues ({0})", [conn.friends.length])}</div>}
                {conn.friends.length === 0 ? (
                  conn.incoming.length === 0 && conn.outgoing.length === 0 && (
                    <div className="msgr-empty">
                      <p>{tr("Aucun collègue pour le moment.")}</p>
                      <button className="msgr-btn msgr-btn--primary" onClick={() => setAddOpen(true)}><IconUserPlus size={13} /> {tr("Ajouter un collègue")}</button>
                    </div>
                  )
                ) : shownFriends.length === 0 ? (
                  <div className="msgr-empty"><p>{tr("Aucun résultat.")}</p></div>
                ) : shownFriends.map((f) => (
                  <Person key={f.connectionId} p={f.user} onClick={() => openChatWith(f.user.id)}>
                    <button className="msgr-btn msgr-btn--sm msgr-btn--danger" title={tr("Retirer de mes collègues")} onClick={(e) => { e.stopPropagation(); answer(() => chatApi.removeConnection(f.connectionId)) }}>{tr("Retirer")}</button>
                  </Person>
                ))}
              </>
            )}
          </div>
        </aside>

        {activeThread && meId
          ? <ChatThread key={activeThread.id} thread={activeThread} meId={meId} onBack={() => setActiveId(null)} onActivity={loadThreads} />
          : <EmptyThread />}
      </div>
      )}

      {addOpen && <AddColleagueModal onClose={() => setAddOpen(false)} onChanged={refreshAll} onOpenChat={openChatWith} />}
    </div>
  )
}
