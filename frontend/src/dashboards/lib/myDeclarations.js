// Logique PURE (sans React ni DOM) de la vue « Mes envois à la vigilance ».
// Spécification : server/test/myDeclarations.logic.test.ts.
// Règle d'or : aucun état inventé. Un envoi PENDING n'est JAMAIS présenté comme reçu ;
// le statut public d'Audit n'est lu que lorsque la soumission est RECEIVED.

const STATUS = {
  PENDING: { label: 'Enregistrée sur le Site — en attente de confirmation', tone: 'amber' },
  AWAITING_PRODUCT: { label: 'Enregistrée — produit en cours de rattachement par VigiCore', tone: 'amber' },
  RECEIVED: { label: 'Reçue par la vigilance', tone: 'green' },
  UNDER_REVIEW: { label: 'En cours de traitement', tone: 'blue' },
  AWAITING_INFO: { label: "La vigilance attend votre réponse", tone: 'amber' },
  CLOSED: { label: 'Clôturée', tone: 'gray' },
  NOT_ROUTABLE: { label: 'Non transmise — aucune vigilance ne peut la recevoir pour le moment', tone: 'red' },
  REJECTED: { label: 'Refusée', tone: 'red' },
  // Envoi automatique épuisé (statut propre à ce Site) : jamais présenté comme reçu ; le renvoi manuel reste possible.
  FAILED: { label: "Non reçue — l'envoi automatique a échoué, renvoyez-la", tone: 'red' },
  UNKNOWN: { label: 'Statut inconnu', tone: 'gray' },
};
const present = (key) => ({ key, ...STATUS[key] });

export function presentStatus(submission, auditDetail) {
  const st = submission && submission.status;
  if (st === 'PENDING') return present('PENDING');
  if (st === 'AWAITING_PRODUCT') return present('AWAITING_PRODUCT');
  if (st === 'NOT_ROUTABLE') return present('NOT_ROUTABLE');
  if (st === 'REJECTED') return present('REJECTED');
  if (st === 'FAILED') return present('FAILED');
  if (st === 'RECEIVED') {
    if (auditDetail && auditDetail.status === 'CLOSED') return present('CLOSED');
    if (auditDetail && auditDetail.status === 'UNDER_REVIEW') {
      return present(auditDetail.awaitingReporterInformation ? 'AWAITING_INFO' : 'UNDER_REVIEW');
    }
    return present('RECEIVED');
  }
  return present('UNKNOWN');
}

export const canRetry = (s) => !!s && (s.status === 'PENDING' || s.status === 'FAILED');
export const canMessage = (s) => !!s && s.status === 'RECEIVED' && !!s.auditDeclarationId;

export function mergeMessages(a, b) {
  const byId = new Map();
  for (const m of [...(a || []), ...(b || [])]) if (m && m.id) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => (x.sentAt < y.sentAt ? -1 : x.sentAt > y.sentAt ? 1 : 0));
}
export function latestSentAt(messages) {
  let best = null;
  for (const m of messages || []) if (m && m.sentAt && (best === null || m.sentAt > best)) best = m.sentAt;
  return best;
}
export function unreadCount(messages, lastSeen) {
  return (messages || []).filter((m) => m.direction === 'FROM_VIGILANCE' && (!lastSeen || m.sentAt > lastSeen)).length;
}

export const MAX_MESSAGE = 4000;
export function validateMessage(raw) {
  const content = typeof raw === 'string' ? raw.trim() : '';
  if (!content) return { ok: false, reason: 'EMPTY' };
  if (content.length > MAX_MESSAGE) return { ok: false, reason: 'TOO_LONG' };
  return { ok: true, content };
}
export function newIdempotencyKey() {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `msg-${rnd}`.slice(0, 128);
}

// « Dernier message lu » : confort local, jamais bloquant (stockage absent ou qui lève).
const seenKey = (userId, subId) => `vigicore.seen.${userId}.${subId}`;
export function readSeen(storage, userId, subId) {
  try { return (storage && storage.getItem(seenKey(userId, subId))) || null; } catch { return null; }
}
export function writeSeen(storage, userId, subId, value) {
  try { if (storage) storage.setItem(seenKey(userId, subId), value); } catch { /* quota / mode privé */ }
}

export function describeRetry(r) {
  const s = r && r.httpStatus;
  if (s === 201) return { tone: 'success', text: 'La vigilance a confirmé la réception de cette déclaration.' };
  if (s === 202) return { tone: 'warn', text: "Toujours pas confirmée par la vigilance. L'envoi sera retenté automatiquement." };
  if (s === 409) return { tone: 'info', text: "Cette déclaration n'a plus besoin d'être renvoyée." };
  if (s === 422) return { tone: 'error', text: "Aucune vigilance ne peut recevoir cette déclaration pour le moment." };
  return { tone: 'error', text: "Le serveur n'a pas pu être joint. Réessayez dans un instant." };
}
export function shorten(text, max = 120) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

// ── Enregistrements natifs Nexus (/api/records) : déclaration patient, panne de suivi interne ──
// `transmitted` est toujours false : un enregistrement natif n'est jamais présenté comme envoyé ailleurs.
export function presentRecordStatus(record) {
  const kind = record && record.kind;
  const st = record && record.status;
  if (st === 'SUBMITTED') {
    if (kind === 'PATIENT') return { key: 'SUBMITTED', tone: 'amber', label: 'Enregistrée dans votre espace — non transmise à une vigilance' };
    const del = (record && record.deliveries) || [];
    if (del.length) {
      const cnpm = del.find((d) => d.destination === 'CNPM');
      const org = del.some((d) => d.destination === 'ORG');
      const cnpmTxt = !cnpm ? '' : cnpm.status === 'SENT' ? 'e-mail CNPM envoyé (réception non confirmée)' : cnpm.status === 'PENDING' ? 'e-mail CNPM en cours' : 'e-mail CNPM NON envoyé';
      const orgTxt = org ? "disponible dans l'espace de l'établissement" : '';
      return { key: 'SUBMITTED', tone: cnpm && (cnpm.status === 'FAILED' || cnpm.status === 'NOT_CONFIGURED') ? 'red' : 'amber', label: `Enregistrée dans Nexus — ${[orgTxt, cnpmTxt].filter(Boolean).join(' · ')}` };
    }
    return { key: 'SUBMITTED', tone: 'amber', label: "Enregistrée pour le suivi interne — en attente de prise en charge" };
  }
  if (st === 'UNDER_REVIEW') return { key: 'UNDER_REVIEW', tone: 'blue', label: "En cours d'examen par la vigilance de l'établissement" };
  if (st === 'CLOSED') return { key: 'CLOSED', tone: 'gray', label: 'Clôturée' };
  if (st === 'WITHDRAWN') return { key: 'WITHDRAWN', tone: 'gray', label: 'Retirée par son auteur' };
  return { key: 'UNKNOWN', tone: 'gray', label: 'Statut inconnu' };
}
export const RECORD_KIND_LABEL = { PATIENT: 'Déclaration patient', INTERNAL_PANNE: 'Panne — suivi interne', INCIDENT: 'Incident — Nexus' };
export const canWithdrawRecord = (r) => !!r && !!r.permissions && r.permissions.withdraw === true;
export function recordField(record, key) {
  const f = ((record && record.fields) || []).find((x) => x.key === key);
  return f ? f.value : undefined;
}
// Libellé de produit pour une liste : produit (patient) ou dispositif (panne), jamais une donnée absente.
export function recordTitle(record) {
  return recordField(record, 'productName') || recordField(record, 'device.name') || 'Déclaration';
}
