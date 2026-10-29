// Présentation courte et lisible d'un enregistrement de la file d'établissement (titre, type, statut, date).
import { recordField } from '../lib/myDeclarations';
import { TYPE_LABEL, NATURE_LABEL, MEASURES, PANNE_CONTEXTS, PANNE_SYMPTOMS, PANNE_ACTIONS, DEVICE_STATES, IMPACT_LABEL } from '../lib/declarationModel';
import { FIELD_LABEL, fieldValue } from './MySubmissions';

export const KIND_SHORT = { INCIDENT: 'Incident', INTERNAL_PANNE: 'Panne', PATIENT: 'Patient' };

// Suivi par l'établissement : « Nouvelle » tant qu'aucune mesure interne n'est enregistrée (l'enquête appartient au fabricant).
export const MEASURE_OPTIONS = [
  { id: 'quarantaine', label: 'Lot isolé / mis en quarantaine' },
  { id: 'hors_service', label: 'Appareil mis hors service' },
  { id: 'retrait_stock', label: 'Produit retiré du stock' },
  { id: 'equipes_informees', label: 'Équipes informées' },
  { id: 'remplace', label: 'Produit ou appareil remplacé' },
  { id: 'aucune', label: 'Aucune mesure nécessaire' },
];
export const MEASURE_LABEL = Object.fromEntries(MEASURE_OPTIONS.map((m) => [m.id, m.label]));
export function followUpOf(r) {
  if (r?.status === 'WITHDRAWN') return { id: 'withdrawn', tone: 'gray', icon: 'rotate-clockwise', label: 'Retirée' };
  if ((r?.measures || []).length) return { id: 'done', tone: 'green', icon: 'clipboard-check', label: 'Mesures prises' };
  return { id: 'new', tone: 'amber', icon: 'bell', label: 'Nouvelle' };
}
// Enquête du fabricant (lue chez VigiCore Audit) : libellé court pour les listes.
const INVESTIGATION_SHORT = {
  RECEIVED: ['blue', 'Reçue'], UNDER_REVIEW: ['blue', 'Enquête en cours'], WAITING_INFO: ['amber', 'Information demandée'],
  CLOSED: ['green', 'Enquête clôturée'], PENDING: ['amber', "En cours d'envoi"],
  NOT_ROUTABLE: ['red', 'Non reçue'], REJECTED: ['red', 'Non reçue'], FAILED: ['red', 'Non reçue'],
};
export function investigationOf(r) {
  const m = (r?.deliveries || []).find((x) => x.destination === 'MANUFACTURER');
  if (!m) return { tone: 'gray', label: recordField(r, 'informManufacturer') === true ? 'Non confirmée' : 'Non informé', at: null };
  const [tone, label] = INVESTIGATION_SHORT[m.status] || ['amber', "En cours d'envoi"];
  return { tone, label, status: m.status, at: m.updatedAt || null };
}
export const SEVERITY_LABEL = { legere: 'Légère', moderee: 'Modérée', grave: 'Grave', urgence: 'Urgence' };

export function titleOf(r) {
  return recordField(r, 'productName') || recordField(r, 'device.name') || recordField(r, 'deviceName')
    || (r?.kind === 'INTERNAL_PANNE' ? "Panne d'équipement" : 'Déclaration');
}
export const refOf = (r) => `#${String(r?.id || '').slice(-6).toUpperCase()}`;
export function dateOf(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function agoOf(iso) {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 60 * 24) return `il y a ${Math.round(min / 60)} h`;
  return dateOf(iso);
}

// ── Détail lisible : champs regroupés par section, valeurs traduites, clés techniques masquées ──

const map = (list) => Object.fromEntries(list.map((x) => [x.id, x.label]));
const VALUES = {
  productType: TYPE_LABEL, nature: NATURE_LABEL, severity: SEVERITY_LABEL,
  personConcerned: { oui: 'Oui', non: 'Non', inconnu: 'Inconnu' },
  measures: map(MEASURES), 'malfunction.context': map(PANNE_CONTEXTS), 'malfunction.symptoms': map(PANNE_SYMPTOMS),
  'malfunction.actionTaken': map(PANNE_ACTIONS), 'malfunction.deviceState': map(DEVICE_STATES), 'malfunction.impact': IMPACT_LABEL,
};
const LABELS = {
  ...FIELD_LABEL, productType: 'Catégorie', manufacturerName: 'Fabricant', manufacturerReference: 'Référence fabricant', lot: 'Lot',
  serial: 'N° de série', udi: 'UDI', nature: 'Nature', circumstances: 'Circonstances', consequences: 'Conséquences',
  measures: 'Mesures prises', personConcerned: 'Patient concerné', attachmentNames: 'Pièces jointes',
};
const HIDDEN = new Set(['recordKind', 'manual', 'productRef', 'catalogueRef', 'clientRequestId', 'informManufacturer', 'sharedWithDoctors']);
const SECTIONS = [
  { title: 'Produit', keys: ['productName', 'productType', 'manufacturerName', 'manufacturerReference', 'lot', 'lotNumber', 'serial', 'udi', 'expiryDate', 'device.'] },
  { title: 'Incident', keys: ['nature', 'onsetDate', 'malfunction.', 'circumstances', 'description', 'symptoms', 'symptomDesc'] },
  { title: 'Gravité et suites', keys: ['severity', 'personConcerned', 'consequences', 'measures'] },
  { title: 'Autres informations', keys: null },
];
const fmtDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v).split('-').reverse().join('/') : v);
function readable(key, v) {
  const m = VALUES[key];
  if (Array.isArray(v)) return v.map((x) => (m && m[x]) || x).join(', ');
  if (m && m[v]) return m[v];
  if (/date|occurredOn|expiry/i.test(key)) return fmtDate(v);
  return fieldValue(key, v);
}
export function detailSections(record) {
  const fields = (record?.fields || []).filter((f) => !HIDDEN.has(f.key) && f.value !== '' && f.value !== null && f.value !== undefined
    && !(Array.isArray(f.value) && f.value.length === 0));
  const used = new Set();
  const out = [];
  for (const s of SECTIONS) {
    const rows = fields.filter((f) => !used.has(f.key) && (s.keys === null || s.keys.some((k) => (k.endsWith('.') ? f.key.startsWith(k) : f.key === k))));
    rows.forEach((f) => used.add(f.key));
    if (rows.length) out.push({ title: s.title, rows: rows.map((f) => ({ key: f.key, label: LABELS[f.key] || f.key, value: readable(f.key, f.value), long: f.key === 'description' })) });
  }
  return out;
}

// ── Transmission : à qui la déclaration a été adressée, avec l'état RÉEL de chaque envoi ──
const CNPM_STATE = { SENT: ['green', 'Notification envoyée (réception non confirmée)'], PENDING: ['amber', 'Envoi en cours'],
  FAILED: ['red', "Échec de l'envoi"], NOT_CONFIGURED: ['red', 'Non envoyée (e-mail non configuré)'] };
const MFR_STATE = {
  RECEIVED: ['blue', "Reçue par la vigilance du fabricant — enquête pas encore commencée"],
  UNDER_REVIEW: ['blue', 'Enquête en cours chez le fabricant'],
  WAITING_INFO: ['amber', 'Le fabricant attend une information du déclarant'],
  CLOSED: ['green', 'Enquête clôturée par le fabricant'],
  PENDING: ['amber', 'Transmission en cours'],
  NOT_ROUTABLE: ['red', 'Non reçue : aucune vigilance destinataire'], REJECTED: ['red', 'Refusée par VigiCore Audit'], FAILED: ['red', 'Échec de la transmission'],
};
export function transmissionRows(r) {
  const del = r?.deliveries || [];
  if (!del.length && r?.kind === 'PATIENT') return [];
  const find = (d) => del.find((x) => x.destination === d);
  const cnpm = find('CNPM'); const org = find('ORG'); const mfr = find('MANUFACTURER');
  const intent = recordField(r, 'informManufacturer');
  const mfrName = recordField(r, 'manufacturerName');
  return [
    { id: 'org', label: 'Établissement', ...(org ? { tone: 'green', text: 'Destinataire' } : { tone: 'gray', text: 'Non destinataire' }) },
    { id: 'cnpm', label: 'CNPM', ...(cnpm ? { tone: (CNPM_STATE[cnpm.status] || ['amber'])[0], text: (CNPM_STATE[cnpm.status] || [null, cnpm.status])[1] } : { tone: 'gray', text: 'Non informé' }) },
    { id: 'mfr', label: mfrName ? `Fabricant (${mfrName})` : 'Fabricant',
      ...(mfr ? { tone: (MFR_STATE[mfr.status] || ['amber'])[0], text: (MFR_STATE[mfr.status] || [null, 'Transmission en cours'])[1] }
        : intent === true ? { tone: 'amber', text: 'Transmission non confirmée' }
        : { tone: 'gray', text: 'Non informé' }) },
  ];
}
