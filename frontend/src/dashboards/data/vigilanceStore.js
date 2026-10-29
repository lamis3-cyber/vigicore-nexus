// ═══════════════════════════════════════════════════════════════
// vigilanceStore — pont entre les tableaux de bord et l'API /api/vigilance.
//
// Les pages lisent toujours les tableaux partagés DR_DECLARATIONS /
// LAB_DECLARATIONS (doctorVigilance.js / laboVigilance.js) et y écrivent comme
// avant. En mode « session » (le site réel), ces tableaux deviennent un CACHE de
// la base :
//   - hydrateVigilance()  remplace leur contenu par ce que le serveur autorise
//                         la session à voir (la portée est décidée côté serveur) ;
//   - track(record,kind)  enregistre une nouvelle déclaration (POST) puis
//                         remplace id / ref / date par ceux du serveur ;
//   - toute modification de status / capaStatus / escalated sur un enregistrement
//     suivi est envoyée au serveur (PATCH) ; si le serveur refuse, la valeur est
//     rétablie et une erreur est signalée (onVigilanceError).
// Hors mode session (tests unitaires, mode démo) rien n'est envoyé : le comportement
// historique en mémoire est inchangé.
// ═══════════════════════════════════════════════════════════════
import { API_BASE } from '../../lib/api';

let syncEnabled = false;
export function enableVigilanceSync(on = true) { syncEnabled = on; }
export function isVigilanceSyncEnabled() { return syncEnabled; }

const errorListeners = new Set();
export function onVigilanceError(fn) { errorListeners.add(fn); return () => errorListeners.delete(fn); }
function emitError(message) { errorListeners.forEach((fn) => { try { fn(message); } catch { /* listener bug must not break the store */ } }); }

const SYNCED_FIELDS = new Set(['status', 'capaStatus', 'escalated']);
const arrays = { dr: null, lab: null, patients: null, audit: null };
export function registerVigilanceArrays(dr, lab, extra = {}) {
  arrays.dr = dr; arrays.lab = lab;
  arrays.patients = extra.patients ?? null; arrays.audit = extra.audit ?? null;
}

async function request(method, path, body, base = 'vigilance') {
  try {
    const res = await fetch(`${API_BASE}/${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* corps non JSON */ }
    return { ok: res.ok && json?.success === true, status: res.status, json, network: false };
  } catch {
    return { ok: false, status: 0, json: null, network: true };
  }
}

const reason = (r) => (r.network ? 'Serveur injoignable.' : r.json?.message || `Erreur serveur (${r.status}).`);

// target -> { ready: Promise<boolean> } pour les enregistrements créés localement et pas encore confirmés
const pending = new WeakMap();

function wrap(target, kind) {
  return new Proxy(target, {
    set(obj, prop, value) {
      const previous = obj[prop];
      obj[prop] = value;
      if (syncEnabled && SYNCED_FIELDS.has(prop) && previous !== value) {
        const confirm = pending.get(obj)?.ready ?? Promise.resolve(true);
        confirm.then(async (created) => {
          if (!created) return;
          const r = await request('PATCH', `/declarations/${encodeURIComponent(obj.id)}`, { [prop]: value });
          if (r.ok) { Object.assign(obj, serverFields(r.json.declaration)); return; }
          obj[prop] = previous; // le serveur a refusé : on ne garde pas une valeur qu'il ne connaît pas
          emitError(`Modification refusée : ${reason(r)}`);
        });
      }
      return true;
    },
  });
}

/** Champs que le serveur possède : ils écrasent toujours les valeurs locales. */
function serverFields(d) {
  const { id, ref, date, status, capaStatus, escalated, organizationId, authoredByUserId, authoredByRole, updatedAt, vigilanceKind } = d;
  return { id, ref, date, status, capaStatus, escalated, organizationId, authoredByUserId, authoredByRole, updatedAt, vigilanceKind };
}

/**
 * Appelé par addDrDeclaration / addLabDeclaration juste après la construction de l'enregistrement.
 * Retourne l'objet à placer dans le tableau partagé (un proxy en mode session, l'objet lui-même sinon).
 */
export function track(record, kind, refPrefix) {
  if (!syncEnabled) return record;
  const proxy = wrap(record, kind);
  const ready = (async () => {
    const r = await request('POST', '/declarations', { kind, refPrefix, status: record.status, escalated: record.escalated === true, record });
    const list = arrays[kind];
    if (r.ok) { Object.assign(record, serverFields(r.json.declaration)); return true; }
    const i = list ? list.indexOf(proxy) : -1;
    if (i >= 0) list.splice(i, 1);
    emitError(`La déclaration ${record.ref} n'a PAS été enregistrée : ${reason(r)}`);
    return false;
  })();
  pending.set(record, { ready });
  ready.finally(() => pending.delete(record));
  return proxy;
}

const signatureOf = (rows) => rows.map((d) => `${d.id}:${d.updatedAt ?? ''}`).join('|');

/** Recharge les tableaux depuis le serveur. Résout à true si leur contenu a changé. */
export async function hydrateVigilance() {
  if (!syncEnabled || !arrays.dr || !arrays.lab) return false;
  const r = await request('GET', '/declarations');
  if (!r.ok) return false;
  const rows = Array.isArray(r.json.declarations) ? r.json.declarations : [];
  const before = signatureOf([...arrays.dr, ...arrays.lab]);
  for (const kind of ['dr', 'lab']) {
    const list = arrays[kind];
    const unsaved = list.filter((d) => pending.has(d)); // créées ici, pas encore confirmées : on les garde
    const fresh = rows.filter((d) => d.vigilanceKind === kind).map((d) => wrap(d, kind));
    list.splice(0, list.length, ...unsaved, ...fresh);
  }
  return signatureOf([...arrays.dr, ...arrays.lab]) !== before;
}

// ── Journal d'audit et patients suivis (/api/records) ───────────────────────
// Même principe : les tableaux AUDIT_LOG / DR_PATIENTS restent la source de lecture des pages ;
// en mode session ils sont un cache de la base.

/** Ajoute une ligne au journal côté serveur (acteur, établissement et date sont écrits par le serveur). */
export function trackAudit(entry) {
  if (!syncEnabled) return entry;
  entry.pending = true;
  (async () => {
    const r = await request('POST', '/audit', { refType: entry.refType, refId: String(entry.refId), action: entry.action }, 'records');
    if (r.ok) { Object.assign(entry, r.json.entry); delete entry.pending; return; }
    delete entry.pending;
    emitError(`Le journal d'audit n'a pas pu enregistrer cette action : ${reason(r)}`);
  })();
  return entry;
}

/**
 * Enregistre un patient suivi. Résout au patient du serveur (id réel) ou rejette avec un message lisible :
 * on n'affiche JAMAIS un patient que la base n'a pas enregistré.
 */
export async function savePatientDetailed(data) {
  if (!syncEnabled) throw new Error('Session requise pour enregistrer un patient.');
  const r = await request('POST', '/patients', data, 'records');
  if (!r.ok) throw new Error(reason(r));
  return { patient: r.json.patient, linked: Boolean(r.json.linked), emailStatus: r.json.emailStatus ?? null };
}
export async function savePatient(data) {
  return (await savePatientDetailed(data)).patient;
}

/** « Supprimer » un patient = l'ARCHIVER côté serveur : le dossier reste en base, en lecture seule (propriétaire uniquement). */
export async function archivePatient(id, reasonText) {
  if (!syncEnabled) throw new Error('Session requise pour archiver un patient.');
  const r = await request('DELETE', `/patients/${encodeURIComponent(id)}`, reasonText ? { reason: reasonText } : undefined, 'records');
  if (!r.ok) throw new Error(reason(r));
}
/** Ancien nom conservé : même comportement (archivage). */
export const deletePatient = (id) => archivePatient(id);

/** Dossiers archivés du médecin (`showHidden` : inclut ceux qu'il a retirés de l'affichage). */
export async function listArchivedPatients(showHidden = false) {
  if (!syncEnabled) throw new Error('Session requise.');
  const r = await request('GET', `/patients?view=archived${showHidden ? '&hidden=1' : ''}`, undefined, 'records');
  if (!r.ok) throw new Error(reason(r));
  return Array.isArray(r.json.patients) ? r.json.patients : [];
}
async function patientAction(id, action) {
  if (!syncEnabled) throw new Error('Session requise.');
  const r = await request('POST', `/patients/${encodeURIComponent(id)}/${action}`, undefined, 'records');
  if (!r.ok) throw new Error(reason(r));
}
export const restorePatient = (id) => patientAction(id, 'restore');
export const hidePatient = (id) => patientAction(id, 'hide');
export const unhidePatient = (id) => patientAction(id, 'unhide');

/** Envoie un e-mail au patient (repli quand la messagerie n'est pas acceptée). */
export async function emailPatient(id, message) {
  if (!syncEnabled) throw new Error('Session requise pour envoyer un message.');
  const r = await request('POST', `/patients/${encodeURIComponent(id)}/contact`, { message }, 'records');
  if (!r.ok) throw new Error(reason(r));
}

/** Recharge patients + journal depuis le serveur. En cas d'échec, on vide (données de santé : jamais celles d'un autre compte). */
export async function hydrateRecords() {
  if (!syncEnabled) return false;
  const changed = [];
  if (arrays.patients) {
    const before = arrays.patients.map((p) => p.id).join('|');
    const r = await request('GET', '/patients', undefined, 'records');
    arrays.patients.splice(0, arrays.patients.length, ...(r.ok && Array.isArray(r.json.patients) ? r.json.patients : []));
    changed.push(before !== arrays.patients.map((p) => p.id).join('|'));
  }
  if (arrays.audit) {
    const before = arrays.audit.map((e) => e.id).join('|');
    const r = await request('GET', '/audit', undefined, 'records');
    const unsaved = arrays.audit.filter((e) => e.pending);
    arrays.audit.splice(0, arrays.audit.length, ...unsaved, ...(r.ok && Array.isArray(r.json.entries) ? r.json.entries : []));
    changed.push(before !== arrays.audit.map((e) => e.id).join('|'));
  }
  return changed.some(Boolean);
}
