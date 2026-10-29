// Client de /api/support (server/src/routes/support.routes.ts) : le client du Site écrit au SUPPORT
// d'un laboratoire (compte du logiciel Audit). Même origine, session par cookie.
//
// Anti-doublon : chaque envoi porte un en-tête Idempotency-Key. L'appelant crée la clé avec newKey()
// et la GARDE tant que l'envoi n'est pas confirmé (réessai après coupure réseau = même clé).
export class SupportApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code }
}

export const SUPPORT_TOPICS = [
  { value: 'DEVICE_USAGE', label: 'Utilisation d’un dispositif' },
  { value: 'TECHNICAL_ISSUE', label: 'Problème technique' },
  { value: 'URGENT_FAILURE', label: 'Panne urgente' },
  { value: 'OTHER', label: 'Autre question' },
]

export const newKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`)

async function call(path, { method = 'GET', body, key } = {}) {
  const init = { method, credentials: 'include', headers: {} }
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json' }
  if (key) init.headers['Idempotency-Key'] = key
  let res
  try {
    res = await fetch(`/api/support${path}`, init)
  } catch {
    throw new SupportApiError('Connexion au serveur impossible. Réessayez : votre message ne sera pas envoyé deux fois.', 0, 'NETWORK')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) throw new SupportApiError(json?.message || 'Une erreur est survenue.', res.status, json?.code)
  return json
}

export const supportApi = {
  organizations: (q) => call(`/organizations?q=${encodeURIComponent(q)}`),
  threads: () => call('/threads'),
  open: ({ organizationRef, topic, message }, key) => call('/threads', { method: 'POST', body: { organizationRef, topic, message }, key }),
  messages: (threadId, since) => call(`/threads/${encodeURIComponent(threadId)}/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  send: (threadId, content, key) => call(`/threads/${encodeURIComponent(threadId)}/messages`, { method: 'POST', body: { content }, key }),
}
