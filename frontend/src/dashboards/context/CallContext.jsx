import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { callApi } from '../services/callApi'
import { chatApi } from '../services/chatApi'

/**
 * Audio / video calls for the Messenger (1-to-1).
 *
 *   media      → WebRTC, peer to peer (RTCPeerConnection), never through our server
 *   signaling  → /api/call/* (server/src/routes/call.routes.ts): SSE for incoming, POST for outgoing
 *
 * Call phases (`call.phase`):
 *   caller : calling (getting mic/camera, sending the offer) → ringing → connecting → active
 *   callee : ringing (Accept / Decline screen) → connecting → active
 *   both   : ended (a 2.5 s "why it ended" screen), then the overlay disappears
 *
 * The provider lives above the whole dashboard (see App.jsx) so an incoming call rings on ANY page,
 * not only on "Messages". The caller posts one summary line in the conversation when the call ends
 * ("📞 Appel audio · 02:13", "… manqué", "… refusé"); the callee never posts, so there is no duplicate.
 */
const CallContext = createContext(null)
export const useCall = () => useContext(CallContext)

const RING_TIMEOUT_MS = 45_000        // nobody answers → the caller gives up
const DISCONNECT_GRACE_MS = 10_000    // a network blip is tolerated this long before hanging up
const ENDED_VISIBLE_MS = 2_500
const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302'] }]

const pad = (n) => String(n).padStart(2, '0')
const clock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(16).slice(2)}`)

function summaryLine(kind, outcome, seconds) {
  const icon = kind === 'video' ? '🎥' : '📞'
  const label = kind === 'video' ? 'Appel vidéo' : 'Appel audio'
  if (outcome === 'completed') return `${icon} ${label} · ${clock(seconds)}`
  if (outcome === 'declined') return `${icon} ${label} refusé`
  return `${icon} ${label} manqué`
}

async function getMedia(kind) {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  if (kind === 'video') {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } })
    } catch (e) {
      // No camera on this device: carry on as an audio-only call instead of failing.
      if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
        return navigator.mediaDevices.getUserMedia({ audio, video: false })
      }
      throw e
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio, video: false })
}

function mediaErrorMessage(e) {
  if (e?.name === 'NotAllowedError') return 'Autorisez l’accès au micro (et à la caméra) dans le navigateur pour passer un appel.'
  if (e?.name === 'NotFoundError') return 'Aucun micro détecté sur cet appareil.'
  if (e?.name === 'NotReadableError') return 'Le micro ou la caméra est déjà utilisé par une autre application.'
  return e?.message || 'Impossible de lancer l’appel.'
}

export function CallProvider({ children }) {
  const { user } = useAuth()
  const toast = useToast()
  const meId = user?.id

  const [call, setCall] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)

  // Handlers run outside React's render cycle, so they read the live call from a ref.
  const callRef = useRef(null)
  const pcRef = useRef(null)
  const localRef = useRef(null)
  const pendingIceRef = useRef(new Map()) // callId -> candidates that arrived before the remote description
  const connIdRef = useRef(null)
  const chainRef = useRef(Promise.resolve())
  const iceServersRef = useRef(null)
  const timersRef = useRef({ ring: 0, grace: 0, ended: 0 })
  const toastRef = useRef(toast)
  toastRef.current = toast

  const update = useCallback((patch) => {
    const next = callRef.current ? { ...callRef.current, ...patch } : null
    callRef.current = next
    setCall(next)
  }, [])

  // Signals of one call are sent strictly one after the other, so the other side always
  // receives offer → ice… / answer → ice… in order.
  const send = useCallback((payload) => {
    const run = () => callApi.signal({ connId: connIdRef.current, ...payload })
    const p = chainRef.current.then(run, run)
    chainRef.current = p.catch(() => {})
    return p
  }, [])

  const releaseMedia = useCallback(() => {
    const t = timersRef.current
    clearTimeout(t.ring); clearTimeout(t.grace)
    const pc = pcRef.current
    if (pc) {
      pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null
      pc.close()
    }
    pcRef.current = null
    localRef.current?.getTracks().forEach((tr) => tr.stop())
    localRef.current = null
    pendingIceRef.current.clear()
    setLocalStream(null)
    setRemoteStream(null)
  }, [])

  const clearNow = useCallback(() => {
    clearTimeout(timersRef.current.ended)
    callRef.current = null
    setCall(null)
  }, [])

  /** Ends the current call. `silent` skips the "why it ended" screen. */
  const finish = useCallback(({ outcome = 'missed', label = 'Appel terminé', notifyPeer = false, type = 'end', silent = false, summary = true } = {}) => {
    const c = callRef.current
    if (!c || c.phase === 'ended') return
    if (notifyPeer) send({ threadId: c.threadId, callId: c.callId, type }).catch(() => {})
    const seconds = c.connectedAt ? Math.round((Date.now() - c.connectedAt) / 1000) : 0
    if (c.direction === 'out' && summary) {
      chatApi.send(c.threadId, { body: summaryLine(c.kind, c.connectedAt ? 'completed' : outcome, seconds) }).catch(() => {})
    }
    releaseMedia()
    if (silent) { clearNow(); return }
    update({ phase: 'ended', endedLabel: label, endedSeconds: seconds })
    clearTimeout(timersRef.current.ended)
    timersRef.current.ended = setTimeout(() => {
      if (callRef.current?.callId === c.callId) clearNow()
    }, ENDED_VISIBLE_MS)
  }, [send, releaseMedia, update, clearNow])

  const queueIce = (callId, cand) => {
    const m = pendingIceRef.current
    m.set(callId, [...(m.get(callId) ?? []), cand])
  }
  const flushIce = async (callId, pc) => {
    const list = pendingIceRef.current.get(callId) ?? []
    pendingIceRef.current.delete(callId)
    for (const cand of list) { try { await pc.addIceCandidate(cand) } catch { /* stale candidate */ } }
  }

  const createPc = useCallback(async (callId, threadId) => {
    if (!iceServersRef.current) {
      try { iceServersRef.current = (await callApi.config()).iceServers } catch { iceServersRef.current = FALLBACK_ICE }
    }
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
    const remote = new MediaStream()
    setRemoteStream(remote)

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ threadId, callId, type: 'ice', data: e.candidate.toJSON() }).catch(() => {})
    }
    pc.ontrack = (e) => {
      remote.addTrack(e.track)
      if (e.track.kind === 'video') {
        // The picture only counts once frames really flow (a peer without a camera sends none).
        const live = (on) => { if (pcRef.current === pc && callRef.current?.callId === callId) update({ remoteHasVideo: on }) }
        e.track.onunmute = () => live(true)
        e.track.onmute = () => live(false)
        if (!e.track.muted) live(true)
      }
    }
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return
      const c = callRef.current
      if (!c || c.callId !== callId) return
      const state = pc.connectionState
      if (state === 'connected') {
        clearTimeout(timersRef.current.grace); clearTimeout(timersRef.current.ring)
        update({ phase: 'active', connectedAt: c.connectedAt ?? Date.now(), unstable: false })
      } else if (state === 'disconnected') {
        update({ unstable: true })
        clearTimeout(timersRef.current.grace)
        timersRef.current.grace = setTimeout(() => {
          if (callRef.current?.callId === callId && pcRef.current?.connectionState !== 'connected') {
            finish({ label: 'Connexion perdue', notifyPeer: true })
          }
        }, DISCONNECT_GRACE_MS)
      } else if (state === 'failed') {
        finish({ label: 'Connexion impossible — le réseau bloque l’appel direct (un serveur TURN est nécessaire).', notifyPeer: true })
      }
    }
    pcRef.current = pc
    return pc
  }, [send, update, finish])

  /* ── incoming signals ─────────────────────────────────────────── */
  const onSignal = useCallback(async (m) => {
    const c = callRef.current
    switch (m.type) {
      case 'offer': {
        if (c && c.phase !== 'ended') {
          send({ threadId: m.threadId, callId: m.callId, type: 'busy' }).catch(() => {})
          return
        }
        clearTimeout(timersRef.current.ended)
        const next = {
          callId: m.callId, threadId: m.threadId, kind: m.kind, direction: 'in', phase: 'ringing',
          peer: { id: m.from, name: m.fromName }, offer: m.data,
          muted: false, cameraOn: m.kind === 'video', connectedAt: null,
        }
        callRef.current = next
        setCall(next)
        clearTimeout(timersRef.current.ring)
        // The caller gives up after RING_TIMEOUT_MS and tells us; this is only a safety net.
        timersRef.current.ring = setTimeout(() => {
          if (callRef.current?.callId === m.callId && callRef.current.phase === 'ringing') finish({ silent: true, summary: false })
        }, RING_TIMEOUT_MS + 5_000)
        return
      }
      case 'answer': {
        const pc = pcRef.current
        if (!c || c.callId !== m.callId || !pc || pc.signalingState !== 'have-local-offer') return
        clearTimeout(timersRef.current.ring)
        try {
          await pc.setRemoteDescription(m.data)
          await flushIce(m.callId, pc)
          if (callRef.current?.callId === m.callId && callRef.current.phase !== 'active') update({ phase: 'connecting' })
        } catch {
          finish({ label: 'Échec de la négociation de l’appel.', notifyPeer: true })
        }
        return
      }
      case 'ice': {
        if (!c || c.callId !== m.callId || !m.data) return
        const pc = pcRef.current
        if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(m.data) } catch { /* stale */ } }
        else queueIce(m.callId, m.data)
        return
      }
      case 'media': {
        if (c?.callId === m.callId) update({ peerMuted: !!m.data?.muted, peerCameraOn: m.data?.cameraOn !== false })
        return
      }
      case 'end': {
        if (c?.callId !== m.callId) return
        // (only the caller posts the chat summary — finish() ignores `summary` on the callee side)
        if (c.direction === 'in' && c.phase === 'ringing') finish({ label: 'Appel manqué' })
        else finish({ label: 'Appel terminé' })
        return
      }
      case 'decline': {
        if (c?.callId === m.callId) finish({ outcome: 'declined', label: 'Appel refusé' })
        return
      }
      case 'busy': {
        if (c?.callId === m.callId) finish({ label: `${c.peer.name} est déjà en ligne.` })
        return
      }
      case 'handled': {
        // Answered or declined from another tab of mine: stop ringing here without a trace.
        if (c?.callId === m.callId && c.direction === 'in' && c.phase === 'ringing') { releaseMedia(); clearNow() }
        return
      }
      default:
    }
  }, [send, update, finish, releaseMedia, clearNow])

  /* ── signaling channel (SSE) ──────────────────────────────────── */
  useEffect(() => {
    if (!meId) return undefined
    let es = null
    let retry = 0
    let closed = false
    const connect = () => {
      es = callApi.openStream()
      es.addEventListener('hello', (e) => { try { connIdRef.current = JSON.parse(e.data).connId } catch { /* ignore */ } })
      es.addEventListener('signal', (e) => { try { onSignal(JSON.parse(e.data)) } catch { /* ignore malformed event */ } })
      es.onerror = () => {
        // EventSource retries by itself after a dropped connection; it only gives up (CLOSED) on a hard error.
        if (es.readyState === EventSource.CLOSED && !closed) retry = window.setTimeout(connect, 5_000)
      }
    }
    connect()
    return () => { closed = true; clearTimeout(retry); es?.close(); connIdRef.current = null }
  }, [meId, onSignal])

  // Closing the tab / signing out hangs up, so the other person is not left on a dead call.
  useEffect(() => {
    const bye = () => {
      const c = callRef.current
      if (c && c.phase !== 'ended') callApi.beaconEnd({ threadId: c.threadId, callId: c.callId, connId: connIdRef.current })
    }
    window.addEventListener('pagehide', bye)
    return () => {
      window.removeEventListener('pagehide', bye)
      bye()
      releaseMedia()
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [releaseMedia])

  /* ── actions ──────────────────────────────────────────────────── */
  const startCall = useCallback(async (thread, kind = 'audio') => {
    const toastNow = toastRef.current
    if (callRef.current && callRef.current.phase !== 'ended') {
      toastNow?.('info', 'Appel en cours', 'Terminez l’appel actuel avant d’en lancer un autre.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      toastNow?.('error', 'Appel impossible', 'Ce navigateur ne permet pas les appels (HTTPS ou localhost requis).')
      return
    }
    clearTimeout(timersRef.current.ended)
    const callId = newId()
    const peer = { id: thread.user.id, name: thread.user.displayName, role: thread.user.role }
    const first = { callId, threadId: thread.id, kind, direction: 'out', phase: 'calling', peer, muted: false, cameraOn: kind === 'video', connectedAt: null }
    callRef.current = first
    setCall(first)

    let offerSent = false
    try {
      const stream = await getMedia(kind)
      if (callRef.current?.callId !== callId) { stream.getTracks().forEach((t) => t.stop()); return } // cancelled meanwhile
      localRef.current = stream
      setLocalStream(stream)
      update({ cameraOn: stream.getVideoTracks().length > 0 })

      const pc = await createPc(callId, thread.id)
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      await pc.setLocalDescription(await pc.createOffer())
      offerSent = true
      const r = await send({ threadId: thread.id, callId, type: 'offer', kind, data: pc.localDescription })
      if (callRef.current?.callId !== callId) return
      if (!r.delivered) {
        finish({ label: `${peer.name} n’est pas connecté(e) pour le moment.` })
        return
      }
      update({ phase: 'ringing' })
      timersRef.current.ring = setTimeout(() => {
        const cur = callRef.current
        if (cur?.callId === callId && !cur.connectedAt && cur.phase === 'ringing') finish({ label: 'Pas de réponse.', notifyPeer: true })
      }, RING_TIMEOUT_MS)
    } catch (e) {
      if (callRef.current?.callId !== callId) return
      toastNow?.('error', 'Appel impossible', mediaErrorMessage(e))
      if (offerSent) send({ threadId: thread.id, callId, type: 'end' }).catch(() => {})
      releaseMedia()
      clearNow()
    }
  }, [createPc, send, update, finish, releaseMedia, clearNow])

  const acceptCall = useCallback(async () => {
    const c = callRef.current
    if (!c || c.direction !== 'in' || c.phase !== 'ringing') return
    clearTimeout(timersRef.current.ring)
    update({ phase: 'connecting' })
    try {
      const stream = await getMedia(c.kind)
      if (callRef.current?.callId !== c.callId) { stream.getTracks().forEach((t) => t.stop()); return }
      localRef.current = stream
      setLocalStream(stream)
      update({ cameraOn: stream.getVideoTracks().length > 0 })

      const pc = await createPc(c.callId, c.threadId)
      await pc.setRemoteDescription(c.offer)
      await flushIce(c.callId, pc)
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      await pc.setLocalDescription(await pc.createAnswer())
      await send({ threadId: c.threadId, callId: c.callId, type: 'answer', data: pc.localDescription })
    } catch (e) {
      if (callRef.current?.callId !== c.callId) return
      toastRef.current?.('error', 'Impossible de répondre', mediaErrorMessage(e))
      send({ threadId: c.threadId, callId: c.callId, type: 'decline' }).catch(() => {})
      releaseMedia()
      clearNow()
    }
  }, [createPc, send, update, releaseMedia, clearNow])

  const declineCall = useCallback(() => {
    const c = callRef.current
    if (!c || c.direction !== 'in') return
    finish({ outcome: 'declined', notifyPeer: true, type: 'decline', silent: true, summary: false })
  }, [finish])

  const hangUp = useCallback(() => {
    const c = callRef.current
    if (!c || c.phase === 'ended') return
    if (c.connectedAt) finish({ label: 'Appel terminé', notifyPeer: true })
    else finish({ label: 'Appel annulé', notifyPeer: true, silent: c.direction === 'in' })
  }, [finish])

  const shareMediaState = useCallback(() => {
    const c = callRef.current
    if (!c) return
    send({ threadId: c.threadId, callId: c.callId, type: 'media', data: { muted: c.muted, cameraOn: c.cameraOn } }).catch(() => {})
  }, [send])

  const toggleMute = useCallback(() => {
    const c = callRef.current
    if (!c) return
    const muted = !c.muted
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !muted })
    update({ muted })
    shareMediaState()
  }, [update, shareMediaState])

  const toggleCamera = useCallback(() => {
    const c = callRef.current
    const tracks = localRef.current?.getVideoTracks() ?? []
    if (!c || tracks.length === 0) return
    const cameraOn = !c.cameraOn
    tracks.forEach((t) => { t.enabled = cameraOn })
    update({ cameraOn })
    shareMediaState()
  }, [update, shareMediaState])

  const value = useMemo(() => ({
    call, localStream, remoteStream,
    inCall: !!call && call.phase !== 'ended',
    startCall, acceptCall, declineCall, hangUp, toggleMute, toggleCamera,
  }), [call, localStream, remoteStream, startCall, acceptCall, declineCall, hangUp, toggleMute, toggleCamera])

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}
