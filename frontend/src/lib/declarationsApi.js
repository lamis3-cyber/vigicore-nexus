import { API_BASE } from './api';

// Client des routes /api/declarations et /api/catalogue (Site -> Audit).
// Contrairement à apiFetch, il CONSERVE le statut HTTP, le code d'erreur et la
// déclaration renvoyée : l'UI doit distinguer RECEIVED / PENDING / NOT_ROUTABLE
// et ne jamais annoncer un succès que la vigilance n'a pas confirmé.

async function call(method, path, body, headers = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* corps non JSON */ }
    return { httpStatus: res.status, json, network: false };
  } catch {
    return { httpStatus: 0, json: null, network: true };
  }
}

/**
 * Envoie une déclaration. Résultat normalisé :
 *   { outcome: 'RECEIVED' | 'PENDING' | 'NOT_ROUTABLE' | 'REJECTED' | 'ERROR', submission, message, reason }
 * - RECEIVED     : la vigilance de l'organisation l'a reçue (HTTP 201)
 * - PENDING      : enregistrée sur le Site, PAS encore reçue ; renvoi automatique (HTTP 202)
 * - NOT_ROUTABLE : aucune organisation ne peut la recevoir ; brouillon à conserver (HTTP 422)
 * - REJECTED     : refusée définitivement (HTTP 400)
 * - ERROR        : rien n'a été enregistré (réseau, 401...) : l'utilisateur peut réessayer
 * `clientRequestId` doit rester IDENTIQUE si l'utilisateur reclique (anti-doublon).
 */
export async function submitDeclaration({ kind, productRef, productLabel, description, lotNumber, manufacturerReference, declaredSeverity, device, malfunction, clientRequestId, notifyContext, notifyCnpm, nexusRecordId }) {
  // Liste blanche : on ne transmet que le contrat connu. `kind`, `device`, `malfunction`, `productLabel` sont optionnels
  // (un appel à l'ancienne forme { productRef, description, ... } produit exactement le même corps qu'avant).
  const r = await call('POST', '/declarations', {
    kind, productRef, productLabel, description, lotNumber, manufacturerReference, declaredSeverity, device, malfunction, clientRequestId,
    // Contexte réservé à l'e-mail de notification CNPM : le serveur ne le stocke pas et ne l'envoie JAMAIS à Audit.
    notifyContext,
    // false : le CNPM est géré à part (enregistrement Nexus) ; sans cela le serveur enverrait un 2e e-mail au CNPM.
    notifyCnpm,
    // Lien avec l'enregistrement Nexus (même déclaration) : l'établissement voit l'état de la transmission au fabricant.
    nexusRecordId,
  });
  if (r.network) return { outcome: 'ERROR', message: 'Serveur injoignable. Vos informations sont conservées, réessayez.' };
  const j = r.json || {};
  const submission = j.submission ?? null;
  if (r.httpStatus === 201) return { outcome: 'RECEIVED', submission };
  if (r.httpStatus === 202) return { outcome: 'PENDING', submission, message: j.message };
  if (r.httpStatus === 422) return { outcome: 'NOT_ROUTABLE', submission, reason: j.reason, message: j.message };
  if (r.httpStatus === 400) return { outcome: 'REJECTED', submission, message: j.message };
  if (r.httpStatus === 413) return { outcome: 'ERROR', message: 'Le contenu est trop volumineux. Raccourcissez les textes et réessayez.' };
  if (r.httpStatus === 401) return { outcome: 'ERROR', message: 'Session expirée. Reconnectez-vous : vos informations sont conservées.' };
  return { outcome: 'ERROR', message: j.message ?? `Erreur serveur (${r.httpStatus}).` };
}

export async function searchCatalogue(q) {
  const r = await call('GET', `/catalogue/products?q=${encodeURIComponent(q)}`);
  if (r.network || r.httpStatus !== 200) return { ok: false, products: [] };
  return { ok: true, products: r.json?.products ?? [] };
}

export async function listMine() {
  const r = await call('GET', '/declarations');
  return r.httpStatus === 200 ? (r.json?.submissions ?? []) : [];
}

export async function getDeclaration(id) {
  const r = await call('GET', `/declarations/${encodeURIComponent(id)}`);
  return r.httpStatus === 200 ? r.json : null;
}

export async function retryDeclaration(id) {
  const r = await call('POST', `/declarations/${encodeURIComponent(id)}/retry`);
  return { httpStatus: r.httpStatus, json: r.json };
}

// Variantes « état explicite » pour « Mes envois » (listMine/getDeclaration ci-dessus gardent leur forme historique,
// utilisée par d'autres pages). « Indisponible » est DISTINCT de « vide » (jamais [] sur une erreur).
//   { ok: true, submissions } | { ok: false, unauthorized, submissions: [] }
export async function listMySubmissions() {
  const r = await call('GET', '/declarations');
  if (r.httpStatus === 200) return { ok: true, submissions: r.json?.submissions ?? [] };
  return { ok: false, unauthorized: r.httpStatus === 401, submissions: [] };
}
//   { ok: true, submission, audit, auditUnavailable } | { ok: false, notFound, unauthorized }
export async function getSubmissionDetail(id) {
  const r = await call('GET', `/declarations/${encodeURIComponent(id)}`);
  if (r.httpStatus === 200) {
    return { ok: true, submission: r.json?.submission ?? null, audit: r.json?.audit ?? null, auditUnavailable: !!r.json?.auditUnavailable };
  }
  return { ok: false, notFound: r.httpStatus === 404, unauthorized: r.httpStatus === 401 };
}

export async function getMessages(id, since) {
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  const r = await call('GET', `/declarations/${encodeURIComponent(id)}/messages${q}`);
  return r.httpStatus === 200 ? (r.json?.messages ?? []) : null;
}

export async function sendMessage(id, content, idempotencyKey) {
  const r = await call('POST', `/declarations/${encodeURIComponent(id)}/messages`, { content }, { 'Idempotency-Key': idempotencyKey });
  return { ok: r.httpStatus === 200 || r.httpStatus === 201, httpStatus: r.httpStatus, json: r.json };
}

// ── Enregistrements NATIFS Nexus (/api/records) : panne de suivi interne, déclaration patient, file
//    de l'établissement. Ce ne sont PAS des envois à Audit : `transmitted` vaut toujours false.
//    Résultat : { outcome: 'CREATED'|'REPLAYED'|'REJECTED'|'CONFLICT'|'NO_ESTABLISHMENT'|'ERROR', record, message }

export async function createRecord(payload) {
  const r = await call('POST', '/records', payload);
  if (r.network) return { outcome: 'ERROR', message: 'Serveur injoignable. Vos informations sont conservées, réessayez.' };
  const j = r.json || {};
  if (r.httpStatus === 201) return { outcome: 'CREATED', record: j.record };
  if (r.httpStatus === 200 && j.replayed) return { outcome: 'REPLAYED', record: j.record };
  if (r.httpStatus === 400) return { outcome: 'REJECTED', message: j.message };
  if (r.httpStatus === 409 && j.code === 'NO_ACTIVE_ESTABLISHMENT') return { outcome: 'NO_ESTABLISHMENT', message: j.message };
  if (r.httpStatus === 409) return { outcome: 'CONFLICT', message: j.message };
  if (r.httpStatus === 413) return { outcome: 'ERROR', message: 'Le contenu est trop volumineux. Raccourcissez les textes et réessayez.' };
  if (r.httpStatus === 401) return { outcome: 'ERROR', message: 'Session expirée. Reconnectez-vous : vos informations sont conservées.' };
  return { outcome: 'ERROR', message: j.message ?? `Erreur serveur (${r.httpStatus}).` };
}

// { ok: true, records } | { ok: false, unauthorized, records: [] }  (indisponible ≠ vide)
async function listRecordsAt(path) {
  const r = await call('GET', path);
  if (r.httpStatus === 200) return { ok: true, records: r.json?.records ?? [] };
  return { ok: false, unauthorized: r.httpStatus === 401, records: [] };
}
export const listMyRecords = () => listRecordsAt('/records');
export const listEstablishmentQueue = () => listRecordsAt('/records/queue');

// Notification « file de l'établissement » : { ok, pending, latest: { id, label, createdAt } | null }
export async function getQueueSummary() {
  const r = await call('GET', '/records/queue/summary');
  if (r.httpStatus === 200) return { ok: true, pending: Number(r.json?.pending) || 0, unread: Number(r.json?.unread) || 0, latest: r.json?.latest ?? null, closed: r.json?.closed ?? null };
  return { ok: false, pending: 0, unread: 0, latest: null, closed: null };
}

// Lu / non lu (par utilisateur) : sans id = toute la liste vue ; avec id = cette déclaration ouverte.
export const QUEUE_SEEN_EVENT = 'vigicore:queue-seen';
export async function markQueueSeen(id) {
  const r = await call('POST', '/records/queue/seen', id ? { id } : {});
  if (r.httpStatus === 200 && typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_SEEN_EVENT));
  return r.httpStatus === 200;
}

// Mesures internes de l'établissement : { ok, record, httpStatus, message }
export async function saveMeasures(id, measures, note) {
  const r = await call('POST', `/records/${encodeURIComponent(id)}/measures`, { measures, note: note || undefined });
  return { ok: r.httpStatus === 200, httpStatus: r.httpStatus, record: r.json?.record ?? null, message: r.json?.message };
}

export async function getRecord(id) {
  const r = await call('GET', `/records/${encodeURIComponent(id)}`);
  if (r.httpStatus === 200) return { ok: true, record: r.json?.record ?? null };
  return { ok: false, notFound: r.httpStatus === 404, unauthorized: r.httpStatus === 401 };
}

// action : 'withdraw' | 'review' | 'close'  -> { ok, httpStatus, record, message }
export async function actOnRecord(id, action) {
  const r = await call('POST', `/records/${encodeURIComponent(id)}/${action}`);
  return { ok: r.httpStatus === 200, httpStatus: r.httpStatus, record: r.json?.record ?? null, message: r.json?.message };
}


/**
 * Envoie les pièces jointes d'une déclaration déjà enregistrée (une requête par fichier, octets bruts).
 * Résultat : { sent: [noms], failed: [{ name, message }] } — l'appelant n'annonce « transmis » que pour `sent`.
 */
export async function uploadAttachments(submissionId, files, base = 'declarations', notes = {}) {
  let sent = []; let failed = []; const results = [];
  for (const f of files) {
    try {
      const res = await fetch(`${API_BASE}/${base}/${encodeURIComponent(submissionId)}/attachments`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name), ...(notes[`${f.name}|${f.size}`] ? { 'X-File-Note': encodeURIComponent(String(notes[`${f.name}|${f.size}`]).slice(0, 200)) } : {}) },
        body: f,
      });
      let j = null; try { j = await res.json(); } catch { /* ignore */ }
      results.push({ name: f.name, ok: !!(res.ok && j?.success), stored: j?.stored === true, mail: j?.mail ?? j?.status ?? null, message: j?.message });
      if (res.ok && j?.success) sent.push(f.name);
      else if (j?.batch) {
        // L'échec concerne l'e-mail groupé : aucun des fichiers déjà « acceptés » n'est réellement parti.
        failed = [...failed, ...sent.map((name) => ({ name, message: j.message || 'E-mail non envoyé.' })), { name: f.name, message: j.message || `Erreur ${res.status}` }];
        sent = [];
      } else failed.push({ name: f.name, message: j?.message || `Erreur ${res.status}` });
    } catch { failed.push({ name: f.name, message: 'Serveur injoignable.' }); }
  }
  return { sent, failed, results };
}

/** Destinations RÉELLEMENT disponibles pour ce compte (vérité du serveur) : { ok, cnpm, org, manufacturer, storage }. */
export async function getDestinations() {
  const r = await call('GET', '/declarations/destinations');
  if (r.httpStatus !== 200 || !r.json?.success) return { ok: false };
  const d = r.json.destinations || {};
  return { ok: true, cnpm: !!d.cnpm, org: d.org || null, manufacturer: !!d.manufacturer, storage: !!d.storage };
}

/** Renvoi de la notification CNPM d'un enregistrement (auteur seul) : { ok, status, message }. */
export async function resendCnpm(recordId) {
  const r = await call('POST', `/records/${encodeURIComponent(recordId)}/resend-cnpm`);
  return { ok: r.httpStatus === 200 && r.json?.success === true, status: r.json?.status ?? null, message: r.json?.message };
}

