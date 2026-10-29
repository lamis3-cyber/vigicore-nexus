import { useEffect, useRef, useState } from 'react'
import { useCall } from '../context/CallContext'
import { startRingback, startRingtone } from '../lib/ringtone'
import { IconMic, IconMicOff, IconPhone, IconPhoneOff, IconVideo, IconVideoOff } from '../pages/messenger/icons'
import { avatarStyle, initials, roleLabel } from '../pages/messenger/utils'
import '../styles/call.css'
import { tr } from '../../i18n/translate.js';

const pad = (n) => String(n).padStart(2, '0')
const clock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`

/**
 * Full-screen call UI: incoming-call screen (Répondre / Refuser), outgoing/in-call screen
 * (audio card or video with picture-in-picture), and a short "why it ended" screen.
 * Rendered once, globally (App.jsx), so it shows over whatever page the person is on.
 * All the logic lives in CallContext.jsx — this component only renders what it produces.
 */
export default function CallOverlay() {
  const { call, localStream, remoteStream, acceptCall, declineCall, hangUp, toggleMute, toggleCamera } = useCall()

  const audioRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const localVideoRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)

  const callId = call?.callId
  const phase = call?.phase
  const direction = call?.direction
  const connectedAt = call?.connectedAt

  // Ring while someone is calling us; ring-back while we wait for them to pick up.
  useEffect(() => {
    if (direction === 'in' && phase === 'ringing') return startRingtone()
    if (direction === 'out' && phase === 'ringing') return startRingback()
    return undefined
  }, [direction, phase, callId])

  // Remote audio (+ video) → <audio>/<video>. A MediaStream gets its tracks added as they arrive,
  // so assigning srcObject once is enough.
  useEffect(() => {
    const els = [audioRef.current, remoteVideoRef.current].filter(Boolean)
    els.forEach((el) => {
      el.srcObject = remoteStream
      el.play?.().catch(() => {})
    })
  }, [remoteStream, callId, phase])

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream, callId, phase])

  // Call timer
  useEffect(() => {
    if (phase !== 'active' || !connectedAt) { setElapsed(0); return undefined }
    const tick = () => setElapsed(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [phase, connectedAt, callId])

  if (!call) return null

  const { peer, kind } = call
  const isVideo = kind === 'video'
  const incoming = direction === 'in' && phase === 'ringing'
  const ended = phase === 'ended'
  const hasLocalVideo = (localStream?.getVideoTracks().length ?? 0) > 0
  const showRemoteVideo = isVideo && !ended && call.remoteHasVideo && call.peerCameraOn !== false
  const showLocalVideo = isVideo && !ended && !incoming && hasLocalVideo && call.cameraOn

  let status = ''
  if (ended) status = call.endedLabel || 'Appel terminé'
  else if (incoming) status = isVideo ? 'Appel vidéo entrant…' : 'Appel audio entrant…'
  else if (phase === 'calling') status = 'Appel en cours…'
  else if (phase === 'ringing') status = 'Ça sonne…'
  else if (phase === 'connecting') status = 'Connexion…'
  else if (phase === 'active') status = call.unstable ? 'Connexion instable…' : clock(elapsed)

  return (
    <div className={`call-overlay${showRemoteVideo ? ' has-remote-video' : ''}`} role="dialog" aria-modal="true" aria-label={tr("Appel avec {0}", [peer.name])}>
      {/* Remote audio always plays through <audio>; the <video> below is muted (picture only). */}
      <audio ref={audioRef} autoPlay />
      {isVideo && <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline muted style={{ display: showRemoteVideo ? 'block' : 'none' }} />}

      <div className="call-top">
        <div className="call-peer-name">{tr(peer.name)}</div>
        <div className={`call-status${ended ? ' is-ended' : ''}${call.unstable ? ' is-warn' : ''}`} aria-live="polite">{tr(status)}</div>
      </div>

      {!showRemoteVideo && (
        <div className="call-center">
          <span className={`call-avatar${incoming || (direction === 'out' && phase === 'ringing') ? ' is-ringing' : ''}`} style={avatarStyle(peer.name)}>
            {initials(peer.name)}
          </span>
          {peer.role && <div className="call-peer-role">{roleLabel(peer.role)}</div>}
          {!ended && phase === 'active' && call.peerMuted && <div className="call-hint"><IconMicOff size={14} /> {tr("Micro coupé")}</div>}
          {!ended && phase === 'active' && isVideo && call.peerCameraOn === false && <div className="call-hint"><IconVideoOff size={14} /> {tr("Caméra désactivée")}</div>}
        </div>
      )}
      {showRemoteVideo && call.peerMuted && <div className="call-hint call-hint-float"><IconMicOff size={14} /> {tr("Micro coupé")}</div>}

      {isVideo && <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted style={{ display: showLocalVideo ? 'block' : 'none' }} />}

      {!ended && (
        <div className="call-controls">
          {incoming ? (
            <>
              <button type="button" className="call-btn call-btn--decline" onClick={declineCall} aria-label={tr("Refuser l’appel")} title={tr("Refuser")}>
                <IconPhoneOff size={24} />
              </button>
              <button type="button" className="call-btn call-btn--accept" onClick={acceptCall} aria-label={tr("Répondre")} title={tr("Répondre")} autoFocus>
                {isVideo ? <IconVideo size={24} /> : <IconPhone size={24} />}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`call-btn${call.muted ? ' is-off' : ''}`} onClick={toggleMute} aria-pressed={call.muted} aria-label={call.muted ? tr("Réactiver le micro") : tr("Couper le micro")} title={call.muted ? tr("Réactiver le micro") : tr("Couper le micro")}>
                {call.muted ? <IconMicOff size={22} /> : <IconMic size={22} />}
              </button>
              {isVideo && hasLocalVideo && (
                <button type="button" className={`call-btn${!call.cameraOn ? ' is-off' : ''}`} onClick={toggleCamera} aria-pressed={!call.cameraOn} aria-label={call.cameraOn ? tr("Couper la caméra") : tr("Réactiver la caméra")} title={call.cameraOn ? tr("Couper la caméra") : tr("Réactiver la caméra")}>
                  {call.cameraOn ? <IconVideo size={22} /> : <IconVideoOff size={22} />}
                </button>
              )}
              <button type="button" className="call-btn call-btn--decline" onClick={hangUp} aria-label={tr("Raccrocher")} title={tr("Raccrocher")}>
                <IconPhoneOff size={24} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
