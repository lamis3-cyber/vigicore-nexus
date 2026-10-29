// Client for the Messenger API (server/src/routes/chat.routes.ts). Same-origin, cookie session.
export class ChatApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

async function call(path, { method = 'GET', body, raw } = {}) {
  const init = { method, credentials: 'include' }
  if (raw !== undefined) {
    init.body = raw
    init.headers = { 'Content-Type': 'application/octet-stream' }
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  let res
  try {
    res = await fetch(`/api/chat${path}`, init)
  } catch {
    throw new ChatApiError('Connexion au serveur impossible.', 0)
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) throw new ChatApiError(json?.message || 'Une erreur est survenue.', res.status)
  return json
}

export const chatApi = {
  searchPeople: (q) => call(`/people?q=${encodeURIComponent(q)}`),
  suggestions: () => call('/suggestions'),
  connections: () => call('/connections'),
  connect: (userId) => call('/connections', { method: 'POST', body: { userId } }),
  accept: (id) => call(`/connections/${id}/accept`, { method: 'POST' }),
  decline: (id) => call(`/connections/${id}/decline`, { method: 'POST' }),
  removeConnection: (id) => call(`/connections/${id}`, { method: 'DELETE' }),
  threads: () => call('/threads'),
  openThread: (userId) => call('/threads', { method: 'POST', body: { userId } }),
  messages: (threadId) => call(`/threads/${threadId}/messages`),
  send: (threadId, payload) => call(`/threads/${threadId}/messages`, { method: 'POST', body: payload }),
  markRead: (threadId) => call(`/threads/${threadId}/read`, { method: 'POST' }),
  deleteMessage: (id) => call(`/messages/${id}`, { method: 'DELETE' }),
  unread: () => call('/unread'),
  upload: (threadId, blob, { name, mime, voice = false, durationMs } = {}) => {
    const qs = new URLSearchParams({ threadId, name: name || 'fichier', mime: mime || blob.type || 'application/octet-stream' })
    if (voice) qs.set('voice', '1')
    if (durationMs) qs.set('durationMs', String(Math.round(durationMs)))
    return call(`/files?${qs.toString()}`, { method: 'POST', raw: blob })
  },
  fileUrl: (id, { download = false } = {}) => `/api/chat/files/${id}${download ? '?download=1' : ''}`,
}
