import { useRef, useState } from 'react'
import { IconPause, IconPlay } from './icons'
import { formatDuration } from './utils'
import { tr } from '../../../i18n/translate.js';

// Inline voice-note playback (play button + scrubber + time), as in the Logiciel's Communication page.
export default function VoiceMessagePlayer({ src, knownDurationMs }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(knownDurationMs ? knownDurationMs / 1000 : 0)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) a.pause()
    else a.play().catch(() => setPlaying(false))
  }

  // MediaRecorder webm files report an infinite duration until read once to the end.
  const onMeta = (e) => {
    const a = e.currentTarget
    if (Number.isFinite(a.duration)) { setDuration(a.duration); return }
    if (knownDurationMs) return
    a.currentTime = 1e101
    const fix = () => { a.removeEventListener('timeupdate', fix); setDuration(a.duration); a.currentTime = 0 }
    a.addEventListener('timeupdate', fix)
  }

  const seek = (e) => {
    const v = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = v
    setCurrent(v)
  }

  return (
    <div className="msgr-voice-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onLoadedMetadata={onMeta}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
      />
      <button type="button" className="msgr-voice-play-btn" onClick={toggle} title={playing ? tr("Pause") : tr("Lire le message vocal")} aria-label={playing ? tr("Pause") : tr("Lire le message vocal")}>
        {playing ? <IconPause size={12} /> : <IconPlay size={12} />}
      </button>
      <input type="range" className="msgr-voice-seek" min={0} max={duration || 0} step={0.1} value={Math.min(current, duration || 0)} onChange={seek} aria-label={tr("Position de lecture")} />
      <span className="msgr-voice-time">{formatDuration(current > 0 ? current : duration)}</span>
    </div>
  )
}
