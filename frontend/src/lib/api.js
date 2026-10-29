export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/**
 * The one fetch wrapper for the VigiCore API.
 * - JSON in / JSON out, session cookies included
 * - Always resolves to { ok: true, data } or { ok: false, error }
 */
export async function apiFetch(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let json;
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: 'Server returned an invalid response.' };
    }

    if (!res.ok || !json.success) {
      return { ok: false, error: json.message ?? `Server error (${res.status})` };
    }

    return { ok: true, data: json };
  } catch (err) {
    if (err.name === 'TypeError') {
      return { ok: false, error: 'Unable to reach the server. Check your connection.' };
    }
    return { ok: false, error: 'An unexpected error occurred.' };
  }
}
