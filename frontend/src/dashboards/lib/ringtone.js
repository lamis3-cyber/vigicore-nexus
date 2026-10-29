// Call sounds, synthesised with the Web Audio API (no audio file to ship or license).
//  - startRingtone(): what the person being called hears (two-tone ring, ~1.8 s on / 1.2 s off)
//  - startRingback(): what the caller hears while the other phone rings (single soft tone)
// Both return a stop() function. Browsers only let a page make sound after the person has
// interacted with it once; if the context stays suspended the call UI still shows — a silent
// ringtone must never break the call flow, so every failure here is swallowed.
const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null

function loop({ freqs, onMs, periodMs, gainValue }) {
  if (!AudioCtx) return () => {}
  let ctx
  try { ctx = new AudioCtx() } catch { return () => {} }
  let stopped = false
  let timer = 0

  const once = () => {
    if (stopped) return
    ctx.resume?.().catch(() => {})
    const now = ctx.currentTime
    const dur = onMs / 1000
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(gainValue, now + 0.05)
    gain.gain.setValueAtTime(gainValue, now + dur - 0.1)
    gain.gain.linearRampToValueAtTime(0, now + dur)
    gain.connect(ctx.destination)
    freqs.forEach((f) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f
      osc.connect(gain)
      osc.start(now)
      osc.stop(now + dur)
    })
    timer = window.setTimeout(once, periodMs)
  }
  once()

  return () => {
    stopped = true
    window.clearTimeout(timer)
    ctx.close().catch(() => {})
  }
}

export const startRingtone = () => loop({ freqs: [440, 480], onMs: 1800, periodMs: 3000, gainValue: 0.18 })
export const startRingback = () => loop({ freqs: [425], onMs: 1000, periodMs: 4000, gainValue: 0.08 })
