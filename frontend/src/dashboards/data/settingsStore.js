// ═══════════════════════════════════════════════════════════════
// settingsStore — réglages des pages « Paramètres », enregistrés SUR LE COMPTE (base de données).
//
// Les pages lisent / écrivent de façon synchrone (loadField / saveField / loadSwitch / saveSwitch) comme avant ;
// en mode session le contenu vient du serveur (hydrateSettings au login) et chaque modification est envoyée
// à /api/account/preferences (regroupée sur 400 ms). Hors session (tests, démo) on garde localStorage.
//   saveSettingsNow()  attend l'enregistrement et dit honnêtement s'il a réussi ;
//   resetSettings()    efface les réglages du compte ;
//   saveDisplayName()  met à jour le nom du compte (PATCH /api/account/profile).
// ═══════════════════════════════════════════════════════════════
import { API_BASE } from '../../lib/api';
import { isVigilanceSyncEnabled } from './vigilanceStore';

const PREFIX = 'vigicore_';
// Interrupteurs « Grand texte / contraste élevé » des différentes pages Paramètres.
const LARGE_TEXT_IDS = new Set(['swAuto11', 'swAuto17', 'swAuto22', 'swAuto30', 'swAuto34']);

let cache = {};
let pending = {};
let timer = null;
let inflight = Promise.resolve({ ok: true });

const synced = () => isVigilanceSyncEnabled();

function localGet(id) { try { return localStorage.getItem(PREFIX + id); } catch { return null; } }
function localSet(id, v) { try { localStorage.setItem(PREFIX + id, v); } catch { /* stockage indisponible */ } }

export function loadField(id, fallback) {
  const raw = synced() ? (id in cache ? cache[id] : null) : localGet(id);
  return raw === null || raw === undefined ? fallback : raw;
}
export function loadSwitch(id, fallback) {
  const raw = synced() ? (id in cache ? cache[id] : null) : localGet(id);
  return raw === null || raw === undefined ? fallback : raw === '1';
}

export function applyLargeText(on) {
  try { document.documentElement.classList.toggle('a11y-large', !!on); } catch { /* hors navigateur */ }
}
const anyLargeText = () => [...LARGE_TEXT_IDS].some((id) => loadSwitch(id, false)) || loadSwitch('largeText', false);

async function request(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}/account${path}`, {
      method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* corps non JSON */ }
    return { ok: res.ok && json?.success === true, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null, network: true };
  }
}
const reason = (r) => (r.network ? 'Serveur injoignable.' : r.json?.message || `Erreur serveur (${r.status}).`);

function flush() {
  clearTimeout(timer); timer = null;
  const batch = pending; pending = {};
  if (!Object.keys(batch).length) return inflight;
  inflight = inflight.then(async () => {
    const r = await request('PUT', '/preferences', { values: batch });
    if (r.ok) { cache = { ...r.json.values }; return { ok: true }; }
    // échec : on remet les valeurs en attente pour qu'un prochain enregistrement réessaie
    pending = { ...batch, ...pending };
    return { ok: false, message: reason(r) };
  });
  return inflight;
}

export function saveField(id, value) {
  if (!synced()) { localSet(id, value); if (LARGE_TEXT_IDS.has(id)) applyLargeText(value === '1'); return; }
  cache[id] = value;
  pending[id] = value;
  if (LARGE_TEXT_IDS.has(id)) applyLargeText(value === '1');
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}
export function saveSwitch(id, checked) { saveField(id, checked ? '1' : '0'); }

/** Envoie tout de suite les modifications en attente. Résout { ok, message? }. */
export async function saveSettingsNow() {
  if (!synced()) return { ok: true };
  return flush();
}

export async function resetSettings() {
  if (!synced()) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    return { ok: true };
  }
  clearTimeout(timer); pending = {};
  const r = await request('DELETE', '/preferences');
  if (!r.ok) return { ok: false, message: reason(r) };
  cache = {};
  applyLargeText(false);
  return { ok: true };
}

export async function saveDisplayName(name) {
  if (!synced()) return { ok: true };
  const r = await request('PATCH', '/profile', { displayName: name });
  return r.ok ? { ok: true, displayName: r.json.displayName } : { ok: false, message: reason(r) };
}

/** Charge les réglages du compte. Résout la langue enregistrée (ou null). */
export async function hydrateSettings() {
  if (!synced()) { applyLargeText(anyLargeText()); return null; }
  const r = await request('GET', '/preferences');
  cache = r.ok && r.json.values && typeof r.json.values === 'object' ? { ...r.json.values } : {};
  applyLargeText(anyLargeText());
  return ['fr', 'ar', 'en'].includes(cache.lang) ? cache.lang : null;
}
export const getSavedLang = () => (['fr', 'ar', 'en'].includes(cache.lang) ? cache.lang : null);
