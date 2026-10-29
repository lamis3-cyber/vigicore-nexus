// Client for the call-signaling API (server/src/routes/call.routes.ts).
// Same-origin, cookie session — like chatApi.js.
export const callApi = {
  /** Opens the Server-Sent Events channel that delivers incoming call signals. */
  openStream: () => new EventSource('/api/call/stream', { withCredentials: true }),

  async config() {
    const res = await fetch('/api/call/config', { credentials: 'include' })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) throw new Error(json?.message || 'Configuration des appels indisponible.')
    return json
  },

  /** @returns {Promise<{success:boolean, delivered:boolean}>} */
  async signal(payload) {
    const res = await fetch('/api/call/signal', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
      const err = new Error(json?.message || 'Signal d’appel refusé.')
      err.status = res.status
      throw err
    }
    return json
  },

  /** Fire-and-forget hang-up when the tab is closing (fetch would be cancelled). */
  beaconEnd(payload) {
    try {
      navigator.sendBeacon('/api/call/signal', new Blob([JSON.stringify({ type: 'end', ...payload })], { type: 'application/json' }))
    } catch { /* nothing more to do */ }
  },
}
