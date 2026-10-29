import { useCallback, useEffect, useRef, useState } from 'react'
import { chatApi } from '../../services/chatApi'
import VoiceMessagePlayer from './VoiceMessagePlayer'
import { useCall } from '../../context/CallContext'
import {
  IconBack, IconCheck, IconChat, IconDots, IconDownload, IconFile, IconMic,
  IconPaperclip, IconPhone, IconReply, IconSend, IconSmile, IconTrash, IconVideo, IconX,
} from './icons'
import { avatarStyle, dayKey, dayLabel, formatClock, formatDuration, formatSize, initials, personSub } from './utils'
import { tr } from '../../../i18n/translate.js';

const POLL_MS = 4000
const MAX_FILE_BYTES = 20 * 1024 * 1024 // same limit as the server
const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp)$/i
const EMOJIS = [
  '😀', '😂', '🙂', '😉', '😍', '😢', '😮', '😡',
  '👍', '👎', '🙏', '👏', '💪', '🔥', '🎉', '✅',
  '❌', '❓', '❗', '📎', '📌', '📅', '⏰', '💡',
  '🚀', '👀', '🤝', '🙌',
]

export function EmptyThread() {
  return (
    <div className="msgr-thread-panel msgr-thread-empty">
      <IconChat size={34} />
      <strong>{tr("Sélectionnez une conversation")}</strong>
    </div>
  )
}

const replyLabel = (r) => {
  if (r.deleted) return 'Message supprimé'
  if (r.body) return r.body
  return r.kind === 'VOICE' ? '🎤 Message vocal' : '📎 Pièce jointe'
}

export default function ChatThread({ thread, meId, onBack, onActivity }) {
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [menuId, setMenuId] = useState(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const scrollRef = useRef(null)
  const stickBottom = useRef(true)
  const fileInputRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const startedAtRef = useRef(0)
  const cancelledRef = useRef(false)
  const lastSeenId = useRef(null)

  const other = thread.user
  const canWrite = thread.connected !== false
  const { startCall, inCall } = useCall()
  const canCall = canWrite && !inCall && !recording

  /* ── load + poll ───────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      const r = await chatApi.messages(thread.id)
      setMessages(r.messages)
      setError('')
      const last = r.messages[r.messages.length - 1]
      if (last && last.id !== lastSeenId.current) {
        lastSeenId.current = last.id
        if (last.senderId !== meId) chatApi.markRead(thread.id).then(() => onActivity?.()).catch(() => {})
      }
    } catch (e) {
      setError(tr(e.message))
    } finally {
      setLoaded(true)
    }
  }, [thread.id, meId, onActivity])

  useEffect(() => {
    load()
    chatApi.markRead(thread.id).then(() => onActivity?.()).catch(() => {})
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    return () => clearInterval(t)
  }, [thread.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // keep the view glued to the bottom unless the person scrolled up to read
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [messages, loaded])
  const onScroll = (e) => {
    const el = e.currentTarget
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  /* ── close popovers ────────────────────────────────────────── */
  useEffect(() => {
    if (!menuId && !emojiOpen && !lightbox) return undefined
    const onDown = (e) => {
      if (!e.target.closest?.('.msgr-bubble-menu-wrap, .msgr-emoji-wrap')) { setMenuId(null); setEmojiOpen(false) }
    }
    const onKey = (e) => { if (e.key === 'Escape') { setMenuId(null); setEmojiOpen(false); setLightbox(null) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuId, emojiOpen, lightbox])

  // release the microphone if the conversation is closed mid-recording
  useEffect(() => () => {
    clearInterval(timerRef.current)
    cancelledRef.current = true
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  /* ── sending ───────────────────────────────────────────────── */
  const sendAll = async () => {
    const text = draft.trim()
    if (busy || recording || (!text && files.length === 0)) return
    setBusy(true); setError('')
    try {
      const queue = files.length ? files : [null]
      for (let i = 0; i < queue.length; i++) {
        const f = queue[i]
        let fileId
        if (f) {
          const up = await chatApi.upload(thread.id, f, { name: f.name, mime: f.type })
          fileId = up.file.id
        }
        // text and quote travel with the first message only
        await chatApi.send(thread.id, {
          body: i === 0 ? text : '',
          fileId,
          replyToId: i === 0 && replyTo ? replyTo.id : undefined,
        })
      }
      setDraft(''); setFiles([]); setReplyTo(null)
      stickBottom.current = true
      await load(); onActivity?.()
    } catch (e) {
      setError(tr(e.message))
    } finally {
      setBusy(false)
    }
  }

  const pickFiles = (e) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES)
    if (tooBig) { setError(tr("« {0} » dépasse 20 Mo.", [tooBig.name])); return }
    setError('')
    setFiles((prev) => [...prev, ...picked])
  }

  const remove = async (m) => {
    setMenuId(null)
    if (!window.confirm('Supprimer ce message ? Cette action est définitive.')) return
    try { await chatApi.deleteMessage(m.id); await load(); onActivity?.() } catch (e) { setError(tr(e.message)) }
  }

  /* ── voice notes ───────────────────────────────────────────── */
  const startRecording = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(tr("Le micro n’est pas pris en charge par ce navigateur.")); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      cancelledRef.current = false
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (cancelledRef.current || chunksRef.current.length === 0) return
        const mime = (rec.mimeType || 'audio/webm').split(';')[0]
        const blob = new Blob(chunksRef.current, { type: mime })
        const durationMs = Date.now() - startedAtRef.current
        setBusy(true)
        try {
          const up = await chatApi.upload(thread.id, blob, {
            name: `message-vocal-${Date.now()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`,
            mime, voice: true, durationMs,
          })
          await chatApi.send(thread.id, { fileId: up.file.id, replyToId: replyTo?.id })
          setReplyTo(null); stickBottom.current = true
          await load(); onActivity?.()
        } catch (e) {
          setError(tr(e.message))
        } finally {
          setBusy(false)
        }
      }
      rec.start()
      recorderRef.current = rec
      startedAtRef.current = Date.now()
      setSeconds(0); setRecording(true)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError(tr("Micro indisponible ou accès refusé. Autorisez le micro dans le navigateur."))
    }
  }

  const stopRecording = (cancel) => {
    cancelledRef.current = cancel
    clearInterval(timerRef.current)
    setRecording(false)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    recorderRef.current = null
  }

  /* ── render helpers ────────────────────────────────────────── */
  const renderFile = (m) => {
    const f = m.file
    if (!f) return null
    const url = chatApi.fileUrl(f.id)
    if (m.kind === 'VOICE') return <VoiceMessagePlayer src={url} knownDurationMs={f.durationMs} />
    if (IMAGE_MIME.test(f.mime)) {
      return (
        <button type="button" className="msgr-image-attachment" title={tr(f.name)} onClick={() => setLightbox({ url, name: f.name, id: f.id })}>
          <img src={url} alt={tr(f.name)} loading="lazy" />
        </button>
      )
    }
    const isPdf = f.mime === 'application/pdf'
    return (
      <div className="msgr-attachment-chip msgr-attachment-pdf">
        <a className="msgr-attachment-open" href={url} target="_blank" rel="noopener noreferrer" title={isPdf ? tr("Ouvrir l’aperçu") : tr("Télécharger")} download={isPdf ? undefined : f.name}>
          <IconFile className="msgr-file-icon" />
          <span className="msgr-attachment-meta">
            <span className="msgr-attachment-name">{tr(f.name)}</span>
            <span className="msgr-attachment-size">{formatSize(f.size)}{isPdf ? tr("· Aperçu") : ''}</span>
          </span>
        </a>
        <a className="msgr-attachment-download" href={chatApi.fileUrl(f.id, { download: true })} title={tr("Télécharger")} aria-label={tr("Télécharger {0}", [f.name])}>
          <IconDownload size={12} />
        </a>
      </div>
    )
  }

  let lastDay = null
  return (
    <div className="msgr-thread-panel">
      <div className="msgr-thread-header">
        <div className="msgr-thread-header-title">
          <button type="button" className="msgr-icon-btn msgr-back" onClick={onBack} aria-label={tr("Retour aux conversations")}><IconBack /></button>
          <span className="msgr-avatar" style={avatarStyle(other.displayName)}>{initials(other.displayName)}</span>
          <div>
            <div className="msgr-thread-name">{other.displayName}</div>
            <div className="msgr-header-sub">{personSub(other)}</div>
          </div>
        </div>
        <div className="msgr-thread-header-actions">
          <button type="button" className="msgr-icon-btn" disabled={!canCall} onClick={() => startCall(thread, 'audio')} title={tr("Appel audio")} aria-label={tr("Appel audio avec {0}", [other.displayName])}><IconPhone size={16} /></button>
          <button type="button" className="msgr-icon-btn" disabled={!canCall} onClick={() => startCall(thread, 'video')} title={tr("Appel vidéo")} aria-label={tr("Appel vidéo avec {0}", [other.displayName])}><IconVideo size={16} /></button>
        </div>
      </div>

      <div className="msgr-messages" ref={scrollRef} onScroll={onScroll}>
        {!loaded ? (
          <p className="msgr-empty">{tr("Chargement…")}</p>
        ) : messages.length === 0 ? (
          <p className="msgr-empty">{tr("Pas encore de message — écrivez le premier.")}</p>
        ) : messages.map((m) => {
          const mine = m.senderId === meId
          const key = dayKey(m.createdAt)
          const separator = key !== lastDay ? <div className="msgr-day" key={`d-${key}`}>{dayLabel(m.createdAt)}</div> : null
          lastDay = key
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {separator}
              <div className={`msgr-bubble-row${mine ? ' is-me' : ''}`}>
                <div className="msgr-bubble">
                  {!m.deleted && (
                    <div className={`msgr-bubble-menu-wrap${menuId === m.id ? ' is-open' : ''}`}>
                      <button type="button" className="msgr-bubble-menu-trigger" title={tr("Options du message")} aria-label={tr("Options du message")} onClick={() => setMenuId((p) => (p === m.id ? null : m.id))}>
                        <IconDots size={15} />
                      </button>
                      {menuId === m.id && (
                        <div className="msgr-bubble-menu" role="menu">
                          {canWrite && (
                            <button type="button" role="menuitem" className="msgr-bubble-menu-item" onClick={() => { setReplyTo(m); setMenuId(null) }}>
                              <IconReply size={13} /> {tr("Répondre")}
                            </button>
                          )}
                          {mine && (
                            <button type="button" role="menuitem" className="msgr-bubble-menu-item danger" onClick={() => remove(m)}>
                              <IconTrash size={13} /> {tr("Supprimer")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {m.deleted ? (
                    <p className="msgr-bubble-deleted">{tr("Message supprimé")}</p>
                  ) : (
                    <>
                      {m.replyTo && (
                        <div className="msgr-bubble-reply">
                          <span className="msgr-bubble-reply-sender">{m.replyTo.senderId === meId ? tr("Vous") : other.displayName}</span>
                          <span className="msgr-bubble-reply-content">{replyLabel(m.replyTo)}</span>
                        </div>
                      )}
                      {m.body && <p>{tr(m.body)}</p>}
                      {renderFile(m)}
                    </>
                  )}
                  <span className="msgr-bubble-time">{formatClock(m.createdAt)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {error && <div className="msgr-notice" role="alert">{tr(error)}</div>}

      {canWrite ? (
        <>
          {files.length > 0 && (
            <div className="msgr-pending-files">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="msgr-attachment-chip">
                  <IconPaperclip size={12} /> {tr(f.name)} <span className="msgr-attachment-size">{formatSize(f.size)}</span>
                  <button type="button" aria-label={tr("Retirer {0}", [f.name])} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><IconX size={10} /></button>
                </span>
              ))}
            </div>
          )}

          {replyTo && (
            <div className="msgr-reply-bar">
              <div className="msgr-reply-bar-text">
                <span className="msgr-reply-bar-sender">{replyTo.senderId === meId ? tr("Vous") : other.displayName}</span>
                <span className="msgr-reply-bar-content">{replyLabel({ ...replyTo, body: replyTo.body })}</span>
              </div>
              <button type="button" className="msgr-icon-btn" aria-label={tr("Annuler la réponse")} onClick={() => setReplyTo(null)}><IconX size={13} /></button>
            </div>
          )}

          <form className="msgr-composer" onSubmit={(e) => { e.preventDefault(); sendAll() }}>
            {recording ? (
              <div className="msgr-recording-bar">
                <span className="msgr-recording-dot" aria-hidden="true" />
                <span className="msgr-recording-label">{tr("Enregistrement… {0}", [formatDuration(seconds)])}</span>
                <button type="button" className="msgr-icon-btn" title={tr("Annuler l’enregistrement")} aria-label={tr("Annuler l’enregistrement")} onClick={() => stopRecording(true)}><IconTrash size={14} /></button>
                <button type="button" className="msgr-icon-btn msgr-recording-confirm" title={tr("Envoyer le message vocal")} aria-label={tr("Envoyer le message vocal")} onClick={() => stopRecording(false)}><IconCheck size={16} /></button>
              </div>
            ) : (
              <div className="msgr-input-bar">
                <button type="button" className="msgr-input-icon-btn" title={tr("Joindre un fichier")} aria-label={tr("Joindre un fichier")} onClick={() => fileInputRef.current?.click()}><IconPaperclip size={15} /></button>
                <input ref={fileInputRef} type="file" multiple hidden onChange={pickFiles} />
                <input type="text" placeholder={tr("Écrire un message…")} value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)} aria-label={tr("Votre message")} />
                <div className="msgr-emoji-wrap" style={{ position: 'relative' }}>
                  <button type="button" className={`msgr-input-icon-btn${emojiOpen ? ' is-active' : ''}`} title={tr("Émoji")} aria-label={tr("Émoji")} onClick={() => setEmojiOpen((v) => !v)}><IconSmile size={16} /></button>
                  {emojiOpen && (
                    <div className="msgr-emoji-picker" role="menu">
                      {EMOJIS.map((em) => (
                        <button key={em} type="button" role="menuitem" className="msgr-emoji-option" onClick={() => setDraft((d) => d + em)}>{em}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="msgr-input-icon-btn" title={tr("Message vocal")} aria-label={tr("Message vocal")} onClick={startRecording} disabled={busy}><IconMic size={16} /></button>
              </div>
            )}
            <button type="submit" className="msgr-send-btn" aria-label={tr("Envoyer")} disabled={busy || recording || (!draft.trim() && files.length === 0)}><IconSend size={17} /></button>
          </form>
        </>
      ) : (
        <div className="msgr-locked">{tr("Vous n’êtes plus en contact avec {0} : conversation en lecture seule.", [other.displayName])}</div>
      )}

      {lightbox && (
        <div className="msgr-lightbox" role="dialog" aria-modal="true" aria-label={tr(lightbox.name)} onClick={() => setLightbox(null)}>
          <div className="msgr-lightbox-toolbar">
            <a className="msgr-lightbox-btn" href={chatApi.fileUrl(lightbox.id, { download: true })} title={tr("Télécharger")} aria-label={tr("Télécharger")} onClick={(e) => e.stopPropagation()}><IconDownload size={16} /></a>
            <button type="button" className="msgr-lightbox-btn" title={tr("Fermer")} aria-label={tr("Fermer")} onClick={() => setLightbox(null)}><IconX size={16} /></button>
          </div>
          <img className="msgr-lightbox-image" src={lightbox.url} alt={tr(lightbox.name)} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
