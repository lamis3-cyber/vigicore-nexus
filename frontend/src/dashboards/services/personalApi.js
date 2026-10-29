// Client for the personal-data API (backend/nexus-api/src/routes/personal.routes.ts).
// Cookie session, same origin. Every call resolves to { ok: true, ... } or { ok: false, error, status } — never throws.
import { API_BASE } from '../../lib/api';

async function call(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}/personal${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, status: res.status, error: json?.message || `Erreur serveur (${res.status})` };
    }
    return { ok: true, ...json };
  } catch {
    return { ok: false, status: 0, error: 'Impossible de joindre le serveur.' };
  }
}

const enc = encodeURIComponent;

export const personalApi = {
  list: (kind) => call('GET', `/${enc(kind)}`),
  create: (kind, data) => call('POST', `/${enc(kind)}`, { data }),
  update: (kind, id, data) => call('PATCH', `/${enc(kind)}/${enc(id)}`, { data }),
  remove: (kind, id) => call('DELETE', `/${enc(kind)}/${enc(id)}`),
  getOne: (kind) => call('GET', `/singleton/${enc(kind)}`),
  saveOne: (kind, data) => call('PUT', `/singleton/${enc(kind)}`, { data }),
};
