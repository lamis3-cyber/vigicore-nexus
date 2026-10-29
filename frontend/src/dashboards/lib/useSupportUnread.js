import { useCallback, useEffect, useState } from 'react'
import { supportApi } from '../services/supportApi'
import { SUPPORT_SEEN_EVENT, isSupportUnread, readSupportSeen } from './supportSeen'

const POLL_MS = 15000

/** Nombre de conversations de support avec une réponse non lue (0 si désactivé ou injoignable). */
export function useSupportUnread(enabled = true) {
  const [threads, setThreads] = useState([])
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    try { const r = await supportApi.threads(); setThreads(Array.isArray(r?.threads) ? r.threads : []) } catch { /* on garde le dernier état */ }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    const onSeen = () => setTick((n) => n + 1)
    window.addEventListener(SUPPORT_SEEN_EVENT, onSeen)
    return () => { clearInterval(t); window.removeEventListener(SUPPORT_SEEN_EVENT, onSeen) }
  }, [enabled, load])

  const seen = readSupportSeen() // relu à chaque rendu ; `tick` force le rendu après un marquage « vu »
  void tick
  return enabled ? (threads ?? []).filter((t) => isSupportUnread(t, seen)).length : 0
}
