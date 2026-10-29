// « Réponse du support non lue » côté Site.
//
// Le fil vit dans Audit ; le Site ne sait pas ce que le client a déjà lu. On garde donc, par
// navigateur, l'horodatage du dernier message vu par fil. Un fil est « non lu » quand son dernier
// message vient du support ET est plus récent que ce qui a été vu. (Pas de lecture inter-appareils :
// il faudrait un marqueur côté serveur.)
const KEY = 'vc.support.seen.v1'
const EVENT = 'vc:support-seen'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}

export function markSupportSeen(threadId, at) {
  if (!threadId || !at) return
  const all = read()
  if (all[threadId] && all[threadId] >= at) return
  all[threadId] = at
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* stockage indisponible : l'indicateur reste simplement affiché */ }
  window.dispatchEvent(new Event(EVENT))
}

export function isSupportUnread(thread, seen = read()) {
  if (!thread?.lastMessageFromSupport || !thread.lastMessageAt) return false
  const s = seen[thread.threadId]
  return !s || thread.lastMessageAt > s
}

export const SUPPORT_SEEN_EVENT = EVENT
export const readSupportSeen = read
