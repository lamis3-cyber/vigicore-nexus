// ═══════════════════════════════════════════════════════════════
// Doctor-portal vigilance data — ported 1:1 from the original HTML's
// global DR_PATIENTS / DR_DECLARATIONS arrays (and the small set of
// label/lookup tables the "Déclarer" wizard and "Patients" page share).
//
// In the original, these were single global arrays read/written by many
// different onclick handlers across views (dashboard, patients, the
// declare wizard, etc.) In the React port that same "one shared array"
// shape is preserved as a module — DoctorPatients.jsx and
// DoctorDeclarer.jsx both import from here, exactly like the original's
// views all read/wrote the same DR_PATIENTS / DR_DECLARATIONS globals.
//
import { demoRows, demoMap } from './demoMode';
import { track, trackAudit } from './vigilanceStore';
import { getCurrentAuthUser, DEMO_ACCOUNTS } from '../context/AuthContext';
import { getBaseRole } from '../config/permissions';
import { getDepartmentsForOrganization } from '../config/organizations';
import { localeTag } from '../../i18n/translate.js';

// Consumed by the Doctor pages migrated so far (Patients, Déclarer,
// Déclarations, Alertes). Nothing outside src/pages/doctor imports it.
//
// ── organizationId (Blocker 1/2 fix) ─────────────────────────────
// Every record below is explicitly stamped `organizationId: null`.
// This is NOT a guess and NOT "unscoped by omission" — it is the
// deliberate, safe classification for legacy/seed data that predates
// real organization identity: nothing in the original data can
// reliably say which of CHU Alger / Clinique El Fedjr / Centre
// Médical Sétif (or none at all) any of these rows belongs to, so
// per the "never guess" rule they stay explicitly org-less. Per
// isOrgScopedRecordVisible (config/organizations.js), that makes them
// visible ONLY to standalone (no-org) accounts — i.e. exactly the
// pre-existing single-tenant demo behavior for docteur@/pharmacien@ —
// and correctly invisible to every org-scoped account (chu.medecin@,
// clinique.medecin@, centre.medecin@, …), closing the cross-tenant
// leak the audit demonstrated. New declarations/patients created
// through the app from here on ARE properly attributed — see
// addDrDeclaration() below and DoctorPatients.jsx.
// ═══════════════════════════════════════════════════════════════

export const DR_PATIENTS = demoRows([
  { id: 'pt-1', initials: 'AB', color: 'linear-gradient(135deg,#4f5ebd,#6d50c4)', name: 'Amira Boualem', age: 39, sex: 'F', condition: 'Diabète type 2 · HTA', allergies: ['Produits de contraste iodés'], declCount: 2, lastVisit: '18/06/2026', organizationId: null },
  { id: 'pt-2', initials: 'YM', color: 'linear-gradient(135deg,#1a6fb5,#2f8fd1)', name: 'Yacine Meziane', age: 34, sex: 'M', condition: 'Asthme persistant modéré', allergies: ['Aucune connue'], declCount: 1, lastVisit: '22/06/2026', organizationId: null },
  { id: 'pt-3', initials: 'NC', color: 'linear-gradient(135deg,#c07a00,#f97316)', name: 'Nadia Cherfaoui', age: 61, sex: 'F', condition: 'Dermatose de contact', allergies: ['Parabènes'], declCount: 1, lastVisit: '15/06/2026', organizationId: null },
  { id: 'pt-4', initials: 'SR', color: 'linear-gradient(135deg,#c8273f,#f43f5e)', name: 'Sofiane Rahmani', age: 45, sex: 'M', condition: 'Diabète type 2', allergies: ['Pénicilline'], declCount: 1, lastVisit: '27/06/2026', organizationId: null },
  { id: 'pt-5', initials: 'LA', color: 'linear-gradient(135deg,#0d9162,#0a7a6e)', name: 'Leïla Ammour', age: 29, sex: 'F', condition: 'Suivi gynécologique', allergies: ['Aucune connue'], declCount: 1, lastVisit: '10/06/2026', organizationId: null },

  // ── F6 addition (Demo Data & Functional Coverage audit) — organization
  // -scoped patients for CHU Alger / Clinique El Fedjr / Centre Médical
  // Sétif. Same record shape as the standalone patients above; these
  // exist purely so each institutional doctor account (chu.medecin@,
  // clinique.medecin@, centre.medecin@) has real, isOrgScopedVisible-
  // filtered demo data instead of an empty "Patients" page. Never
  // visible to a different organization or to the standalone account.
  { id: 'pt-chu-1', initials: 'HB', color: 'linear-gradient(135deg,#4f5ebd,#6d50c4)', name: 'Hocine Belkaïd', age: 52, sex: 'M', condition: 'Cardiopathie ischémique', allergies: ['Aucune connue'], declCount: 1, lastVisit: '26/06/2026', organizationId: 'chu-alger' },
  { id: 'pt-chu-2', initials: 'FZ', color: 'linear-gradient(135deg,#1a6fb5,#2f8fd1)', name: 'Fatima-Zohra Bendjedid', age: 33, sex: 'F', condition: 'Suivi post-opératoire — appendicectomie', allergies: ['Latex'], declCount: 1, lastVisit: '24/06/2026', organizationId: 'chu-alger' },
  { id: 'pt-chu-3', initials: 'MK', color: 'linear-gradient(135deg,#c07a00,#f97316)', name: 'Mourad Khelifi', age: 68, sex: 'M', condition: 'Diabète type 2 · Insuffisance rénale légère', allergies: ['Sulfamides'], declCount: 1, lastVisit: '20/06/2026', organizationId: 'chu-alger' },
  { id: 'pt-clin-1', initials: 'ID', color: 'linear-gradient(135deg,#0d9162,#0a7a6e)', name: 'Ines Djaballah', age: 27, sex: 'F', condition: 'Grossesse — suivi maternité', allergies: ['Aucune connue'], declCount: 1, lastVisit: '25/06/2026', organizationId: 'clinique-el-fedjr' },
  { id: 'pt-clin-2', initials: 'AT', color: 'linear-gradient(135deg,#c8273f,#f43f5e)', name: 'Abdelkader Touati', age: 46, sex: 'M', condition: 'Suivi chirurgical — hernie inguinale', allergies: ['Iode'], declCount: 1, lastVisit: '21/06/2026', organizationId: 'clinique-el-fedjr' },
  { id: 'pt-centre-1', initials: 'SB', color: 'linear-gradient(135deg,#7c3aed,#a855f7)', name: 'Samira Bouchareb', age: 8, sex: 'F', condition: 'Suivi pédiatrique — vaccination', allergies: ['Aucune connue'], declCount: 1, lastVisit: '19/06/2026', organizationId: 'centre-setif' },
  { id: 'pt-centre-2', initials: 'RH', color: 'linear-gradient(135deg,#1a6fb5,#2f8fd1)', name: 'Rachid Haouchine', age: 41, sex: 'M', condition: 'Médecine générale — suivi tensionnel', allergies: ['Aucune connue'], declCount: 1, lastVisit: '17/06/2026', organizationId: 'centre-setif' },
]);

export const DR_DECLARATIONS = demoRows([
  { id: 'dr-dec-1', ref: '#PV-2026-118', patientId: 'pt-1', domain: 'Pharmacovigilance', product: 'Atorvastatine 20mg (Tahor®) · Lot ATO-20260510-B', effect: 'Nausées, douleurs abdominales', date: '28/06/2026', severity: 'moderee', status: 'analysis', dept: 'Cardiologie', manufacturer: 'Pfizer Algérie', capaStatus: 'none', organizationId: null, authoredByUserId: null, authoredByRole: null },
  { id: 'dr-dec-2', ref: '#BROUILLON-DR-1', patientId: 'pt-1', domain: 'Pharmacovigilance', product: 'Vitamine D3 1000 UI (Uvédose®) · Lot VTD-20260301-A', effect: 'Céphalées légères', date: '29/06/2026', severity: 'legere', status: 'sent', dept: 'Pharmacie hospitalière', manufacturer: 'Sanofi Algérie', capaStatus: 'none', organizationId: null, authoredByUserId: null, authoredByRole: null },
  { id: 'dr-dec-3', ref: '#MV-2026-041', patientId: 'pt-2', domain: 'Matériovigilance', product: 'Inhalateur doseur AeroFlow® · Lot AER-20250811-C', effect: 'Défaut de délivrance de dose — sous-dosage suspecté', date: '22/06/2026', severity: 'moderee', status: 'review', dept: 'Urgences', manufacturer: 'Biomedical Devices Algérie', capaStatus: 'proposed', organizationId: null, authoredByUserId: null, authoredByRole: null },
  { id: 'dr-dec-4', ref: '#CV-2026-009', patientId: 'pt-3', domain: 'Cosmétovigilance', product: 'Crème apaisante DermaSoft® · Lot DSF-20260115-A', effect: 'Dermite de contact allergique, érythème facial', date: '15/06/2026', severity: 'moderee', status: 'review', dept: 'Chirurgie', manufacturer: 'Laboratoires Saidal', capaStatus: 'proposed', organizationId: null, authoredByUserId: null, authoredByRole: null },
  { id: 'dr-dec-5', ref: '#PV-2026-119', patientId: 'pt-4', domain: 'Pharmacovigilance', product: 'Metformine 850mg (Glucophage®) · Lot MET-20260502-A', effect: "Suspicion de réaction d'hypersensibilité sévère", date: '27/06/2026', severity: 'grave', status: 'review', dept: 'Urgences', manufacturer: 'Sanofi Algérie', capaStatus: 'none', organizationId: null, authoredByUserId: null, authoredByRole: null },
  { id: 'dr-dec-6', ref: '#RV-2026-003', patientId: 'pt-5', domain: 'Réactovigilance', product: 'Kit de dosage HbA1c Réactif Bio-X · Lot BIO-20260220-D', effect: 'Résultat discordant avec la clinique — kit suspecté défectueux', date: '10/06/2026', severity: 'moderee', status: 'draft', dept: 'Laboratoire', manufacturer: 'Bio-X Diagnostics', capaStatus: 'none', organizationId: null, authoredByUserId: null, authoredByRole: null },
  { id: 'dr-dec-7', ref: '#PV-2025-118', patientId: 'pt-1', domain: 'Pharmacovigilance', product: 'Amoxicilline 500mg (Clamoxyl®) · Lot AMX-20250920-D', effect: 'Éruption cutanée, urticaire généralisée', date: '12/10/2025', severity: 'moderee', status: 'closed', dept: 'Pharmacie hospitalière', manufacturer: 'GSK Algérie', capaStatus: 'validated', organizationId: null, authoredByUserId: null, authoredByRole: null },

  // ── F6 addition (Demo Data & Functional Coverage audit) — organization
  // -scoped declarations for CHU Alger / Clinique El Fedjr / Centre
  // Médical Sétif, authored by that organization's own doctor seat
  // (matches what addDrDeclaration() would stamp for a real submission
  // from that account). `dept` stays a plain business label — never
  // 'Pharmacie' (that string is reserved for the Pharmacien "Mine"
  // filter and is intentionally never seeded — see PharmDeclarations.jsx).
  // Mixed statuses/severities so each org's Déclarations/Rapports pages
  // exercise every filter tab and status badge, not just one state.
  { id: 'dr-dec-chu-1', ref: '#PV-2026-201', patientId: 'pt-chu-1', domain: 'Pharmacovigilance', product: 'Clopidogrel 75mg (Plavix®) · Lot CLP-20260410-A', effect: 'Ecchymoses spontanées, saignement gingival', date: '26/06/2026', severity: 'moderee', status: 'review', dept: 'Cardiologie', manufacturer: 'Sanofi Algérie', capaStatus: 'proposed', organizationId: 'chu-alger', authoredByUserId: 'usr-chu-medecin', authoredByRole: 'doctor' },
  { id: 'dr-dec-chu-2', ref: '#MV-2026-108', patientId: 'pt-chu-2', domain: 'Matériovigilance', product: 'Agrafeuse chirurgicale EndoStap® · Lot EST-20260305-B', effect: 'Défaut de fermeture — reprise chirurgicale nécessaire', date: '24/06/2026', severity: 'grave', status: 'analysis', dept: 'Chirurgie', manufacturer: 'Biomedical Devices Algérie', capaStatus: 'proposed', organizationId: 'chu-alger', authoredByUserId: 'usr-chu-medecin', authoredByRole: 'doctor' },
  { id: 'dr-dec-chu-3', ref: '#BROUILLON-DR-CHU-1', patientId: 'pt-chu-3', domain: 'Pharmacovigilance', product: 'Metformine 850mg (Glucophage®) · Lot MET-20260502-A', effect: 'Acidose lactique suspectée', date: '20/06/2026', severity: 'grave', status: 'draft', dept: 'Urgences', manufacturer: 'Sanofi Algérie', capaStatus: 'none', organizationId: 'chu-alger', authoredByUserId: 'usr-chu-medecin', authoredByRole: 'doctor' },
  { id: 'dr-dec-clin-1', ref: '#PV-2026-202', patientId: 'pt-clin-1', domain: 'Pharmacovigilance', product: 'Fer + Acide folique (Tardyferon®) · Lot TDF-20260212-C', effect: 'Troubles digestifs, constipation sévère', date: '25/06/2026', severity: 'legere', status: 'sent', dept: 'Maternité', manufacturer: 'Pierre Fabre Algérie', capaStatus: 'none', organizationId: 'clinique-el-fedjr', authoredByUserId: 'usr-clinique-medecin', authoredByRole: 'doctor' },
  { id: 'dr-dec-clin-2', ref: '#MV-2026-109', patientId: 'pt-clin-2', domain: 'Matériovigilance', product: 'Kit de trocart cœlioscopique EndoPort® · Lot EPT-20260118-D', effect: 'Défaut d’étanchéité peropératoire', date: '21/06/2026', severity: 'moderee', status: 'review', dept: 'Chirurgie', manufacturer: 'Biomedical Devices Algérie', capaStatus: 'proposed', organizationId: 'clinique-el-fedjr', authoredByUserId: 'usr-clinique-medecin', authoredByRole: 'doctor' },
  { id: 'dr-dec-centre-1', ref: '#PV-2026-203', patientId: 'pt-centre-1', domain: 'Pharmacovigilance', product: 'Vaccin ROR (Priorix®) · Lot ROR-20260520-E', effect: 'Fièvre élevée post-vaccinale, éruption transitoire', date: '19/06/2026', severity: 'legere', status: 'closed', dept: 'Vaccination', manufacturer: 'GSK Algérie', capaStatus: 'validated', organizationId: 'centre-setif', authoredByUserId: 'usr-centre-medecin', authoredByRole: 'doctor' },
  { id: 'dr-dec-centre-2', ref: '#PV-2026-204', patientId: 'pt-centre-2', domain: 'Pharmacovigilance', product: 'Amlodipine 5mg (Amlor®) · Lot AML-20260308-F', effect: 'Œdèmes des membres inférieurs', date: '17/06/2026', severity: 'moderee', status: 'sent', dept: 'Médecine générale', manufacturer: 'Pfizer Algérie', capaStatus: 'none', organizationId: 'centre-setif', authoredByUserId: 'usr-centre-medecin', authoredByRole: 'doctor' },
]);

// ── Ported 1:1 from the original's DR_ALERTS / DR_DOMAIN_CHIP /
//    DR_STATUS_BADGE / DR_SEVERITY_CLASS lookup tables (used by both
//    the Déclarations and Alertes doctor pages). ──
export const DR_ALERTS = demoRows([
  { id: 'al-1', domain: 'Pharmacovigilance', level: 'red', ref: 'ANPP/RECALL/2026-089', title: 'Rappel — Dexamethasone 4mg/2ml injectable (Saidal)', product: 'Dexamethasone 4mg/2ml injectable', lot: 'DXP-20250612-B', text: 'Lot DXP-20250612-B — contamination particulaire confirmée. Concerne le patient Amira Boualem (historique de traitement).', date: '28/06/2026', ack: false },
  { id: 'al-2', domain: 'Matériovigilance', level: 'amber', ref: 'ANPP/DM/2026-054', title: 'Alerte dispositif — Inhalateur doseur AeroFlow®', product: 'Inhalateur doseur AeroFlow®', lot: 'AER-20250811-C', text: 'Signalements multiples de sous-dosage sur le lot AER-20250811-C. Investigation fabricant en cours (Biomedical Devices Algérie).', date: '23/06/2026', ack: false },
  { id: 'al-3', domain: 'Cosmétovigilance', level: 'amber', ref: 'ANPP/COSM/2026-027', title: 'Vigilance renforcée — Crème DermaSoft®', product: 'Crème apaisante DermaSoft®', lot: 'DSF-20260115-A', text: "Hausse des signalements de dermite de contact sur le lot DSF-20260115-A. Reformulation en cours d'examen par le fabricant.", date: '16/06/2026', ack: false },
  { id: 'al-4', domain: 'Réactovigilance', level: 'cyan', ref: 'ANPP/DIV/2026-012', title: 'Notification qualité — Kit HbA1c Réactif Bio-X', product: 'Kit de dosage HbA1c Réactif Bio-X', lot: 'BIO-20260220-D', text: 'Variabilité de résultats rapportée sur le lot BIO-20260220-D. Recommandation : double contrôle en cas de discordance clinique.', date: '11/06/2026', ack: true },
]);

// ── Blocker 2 fix: scoped acknowledgment / recall-return state ──────
// DR_ALERTS/PHARM_RECALLS themselves stay exactly what they always
// were — global reference/broadcast records, read (never filtered) by
// every role, per the audit's explicit instruction not to change that.
// What used to be wrong is that `.ack` / `.returned` were single
// shared booleans on those global records: one organization's click
// silently flipped the status for every other organization too.
//
// Fix: the two fields already on each record (`ack`/`ackBy`/`ackAt`,
// `returned`/`returnedBy`/`returnedAt`) are kept, but frozen as the
// record's ORIGINAL seed state (e.g. al-4 ships pre-acknowledged in
// the demo data) — nothing here ever mutates them again, so that
// pre-existing "already acknowledged for everyone" seed behavior is
// preserved exactly as-is (no visible regression for al-4). Any NEW
// acknowledgment/return produced by a user action is instead recorded
// per-scope, in a small action-log object on the record
// (`ackScopes`/`returnScopes`, keyed by organization — or by user id
// for a standalone/no-org account, since two different standalone
// accounts are just as distinct as two different organizations).
//
// One shared helper pair per concern (asked-for "prefer a shared
// helper" in the brief) — every Alertes/Rappels/Verification/
// Traçabilité page below calls these instead of touching `.ack`/
// `.returned` directly, so there is exactly one place this logic
// lives instead of ten near-identical copies.
function nowStamp() {
  return new Date().toLocaleString(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function scopeKeyForUser(user) {
  if (!user) return null;
  return user.organizationId ? `org:${user.organizationId}` : `user:${user.id}`;
}
export function isAlertAckedForUser(alert, user) {
  if (alert.ack) return true; // original seed state — global, not one org's action
  const key = scopeKeyForUser(user);
  return key != null && !!alert.ackScopes?.[key];
}
export function alertAckMetaForUser(alert, user) {
  if (alert.ack) return { by: alert.ackBy, at: alert.ackAt };
  const key = scopeKeyForUser(user);
  return (key && alert.ackScopes?.[key]) || {};
}
export function ackAlertForUser(alert, user) {
  const key = scopeKeyForUser(user);
  const stamp = { by: user?.name, at: nowStamp() };
  if (key == null) {
    // No session (e.g. a test mounting a page without <AuthProvider>) —
    // fall back to the original global mutation rather than silently
    // no-op-ing, since there is no scope to attribute the action to.
    alert.ack = true;
    alert.ackBy = stamp.by;
    alert.ackAt = stamp.at;
  } else {
    if (!alert.ackScopes) alert.ackScopes = {};
    alert.ackScopes[key] = stamp;
  }
  return stamp;
}
export function isRecallReturnedForUser(recall, user) {
  if (recall.returned) return true; // original seed state
  const key = scopeKeyForUser(user);
  return key != null && !!recall.returnScopes?.[key];
}
export function recallReturnMetaForUser(recall, user) {
  if (recall.returned) return { by: recall.returnedBy, at: recall.returnedAt };
  const key = scopeKeyForUser(user);
  return (key && recall.returnScopes?.[key]) || {};
}
export function returnRecallForUser(recall, user) {
  const key = scopeKeyForUser(user);
  const stamp = { by: user?.name || 'Établissement', at: nowStamp() };
  if (key == null) {
    recall.returned = true;
    recall.returnedBy = stamp.by;
    recall.returnedAt = stamp.at;
  } else {
    if (!recall.returnScopes) recall.returnScopes = {};
    recall.returnScopes[key] = stamp;
  }
  return stamp;
}

export const DR_DOMAIN_CHIP = { Pharmacovigilance: 'cyan', Matériovigilance: 'purple', Cosmétovigilance: 'amber', Réactovigilance: 'green', Chemovigilance: 'red' };
export const DR_STATUS_BADGE = { draft: ['purple', 'Brouillon'], review: ['amber', 'À valider'], sent: ['blue', 'Transmise · CNPM'], analysis: ['amber', 'Analyse CNPM'], closed: ['green', 'Clôturée'] };
export const DR_SEVERITY_CLASS = { legere: ['minor', 'Légère'], moderee: ['major', 'Modérée'], grave: ['critical', 'Grave'] };

// ── AUDIT TRAIL (shared, append-only) — ported 1:1 from the original's
//    AUDIT_LOG / logAudit(). Seed entries match the source exactly;
//    logAudit() takes an explicit actor name (the original read
//    ROLE_CONFIG[currentRole].name — this port uses the logged-in
//    user's name from AuthContext instead, since that's this app's
//    equivalent "who is currently acting" source of truth).
//
// F5 addition: entries now also carry `organizationId`, same field
// and same convention (`null` = unattributed/legacy, matching
// isOrgScopedRecordVisible()'s existing null-handling) already used
// by DR_DECLARATIONS/PHARM_RECALLS/etc. This is the minimum change
// needed to make the audit trail filterable per organization — no
// new field name invented, no new store created. Both original seed
// entries predate per-organization attribution, so they're stamped
// `organizationId: null` (legacy/unattributed), same as any other
// pre-existing record with no owning organization. ──
export const AUDIT_LOG = demoRows([
  { id: 'aud-0', ts: '27/06/2026 · 08:02', actor: 'Dr. Karim Benali', action: 'Déclaration #PV-2026-119 créée (gravité : Grave)', refType: 'declaration', refId: 'dr-dec-5', organizationId: null },
  { id: 'aud-1', ts: '28/06/2026 · 10:05', actor: 'CNPM — ANPP', action: 'Déclaration #PV-2026-118 réceptionnée, mise en analyse', refType: 'declaration', refId: 'dr-dec-1', organizationId: null },
]);

export function logAudit(refType, refId, action, actor, organizationId = null) {
  AUDIT_LOG.unshift(trackAudit({ id: 'aud-' + (AUDIT_LOG.length + 1), ts: 'Maintenant', actor, action, refType, refId, organizationId }));
}

// ── "Déclarer un incident" wizard lookups (originally shared by every
//    professional role's wizard instance — only the doctor-relevant
//    entries are needed here since only the Doctor portal is migrated). ──
export const DECLARE_WIZ_DOMAIN_BY_TYPE = { medicament: 'Pharmacovigilance', dispositif: 'Matériovigilance', cosmetique: 'Cosmétovigilance', chimique: 'Chemovigilance', reactif: 'Réactovigilance' };
export const DECLARE_WIZ_REF_PREFIX_BY_TYPE = { medicament: 'PV', dispositif: 'MV', cosmetique: 'CV', chimique: 'CH', reactif: 'RV' };
export const LAB_PRODUCT_TYPE_LABEL = { medicament: 'Médicament', dispositif: 'Dispositif médical', cosmetique: 'Cosmétique', chimique: 'Produit chimique', reactif: 'Réactif / test diagnostique' };
export const LAB_PROBLEM_TYPE_LABEL = { anomalie: 'Anomalie observée', resultat: 'Résultat inhabituel', qualite: 'Défaut qualité', emballage: 'Emballage endommagé', contamination: 'Contamination suspectée', appareil: 'Appareil défectueux' };
export const LAB_SEVERITY_LABEL = { legere: ['minor', 'Légère'], moderee: ['major', 'Modérée'], grave: ['critical', 'Grave'] };

// ── LABORATOIRES (CAPA / investigations) — ported 1:1 from the
//    original's CAPA_STAGES / DR_LABS / capaSlaStatus() / capaColor().
//    Consumed by DoctorLabos.jsx. ──
export const CAPA_STAGES = ['Investigation ouverte', 'Cause identifiée', 'CAPA proposée', 'CAPA validée', 'Clôturée'];

export const DR_LABS = demoRows([
  { id: 'lab-1', name: 'Laboratoires Saidal', type: 'Fabricant pharmaceutique', domain: 'Pharmacovigilance', lot: 'DXP-20250612-B', capaStage: 1, opened: '2026-06-28', slaDays: 15, contact: 'Mme. Salima Ferhat — Responsable Qualité', attachments: 2, note: 'Contamination particulaire confirmée sur le lot DXP-20250612-B. Cause identifiée au niveau du site de production ; proposition de CAPA attendue.',
    catalog: [
      { ref: 'SAI-DXP-500', name: 'Dexamethasone 4mg/2ml injectable', form: 'Ampoule injectable', pack: 'Boîte de 10', stock: 'en rupture' },
      { ref: 'SAI-PAR-500', name: 'Paracétamol 500mg', form: 'Comprimé', pack: 'Boîte de 20', stock: 'disponible' },
      { ref: 'SAI-AMX-500', name: 'Amoxicilline 500mg', form: 'Gélule', pack: 'Boîte de 12', stock: 'disponible' },
      { ref: 'SAI-IBU-400', name: 'Ibuprofène 400mg', form: 'Comprimé pelliculé', pack: 'Boîte de 30', stock: 'stock limité' },
      { ref: 'SAI-OMZ-20', name: 'Oméprazole 20mg', form: 'Gélule gastro-résistante', pack: 'Boîte de 14', stock: 'disponible' },
    ] },
  { id: 'lab-2', name: 'Sanofi Algérie', type: 'Fabricant pharmaceutique', domain: 'Pharmacovigilance', lot: 'AMX-20250920-D', capaStage: 4, opened: '2025-10-14', slaDays: 30, contact: 'M. Rachid Belkacem — Affaires Réglementaires', attachments: 4, note: "Lien causal probable confirmé pour l'allergie à l'Amoxicilline — CAPA validée et dossier clôturé avec le CNPM.",
    catalog: [
      { ref: 'SNF-AMX-500', name: 'Amoxicilline 500mg', form: 'Gélule', pack: 'Boîte de 12', stock: 'stock limité' },
      { ref: 'SNF-INS-100', name: 'Insuline Lantus® 100UI/ml', form: 'Stylo prérempli', pack: 'Boîte de 5', stock: 'disponible' },
      { ref: 'SNF-CLX-500', name: 'Amoxicilline/Acide clavulanique 500/125mg', form: 'Comprimé pelliculé', pack: 'Boîte de 12', stock: 'disponible' },
      { ref: 'SNF-ATO-20', name: 'Atorvastatine 20mg (Tahor®)', form: 'Comprimé pelliculé', pack: 'Boîte de 30', stock: 'disponible' },
    ] },
  { id: 'lab-3', name: 'Biomedical Devices Algérie', type: 'Fabricant de dispositifs médicaux', domain: 'Matériovigilance', lot: 'AER-20250811-C', capaStage: 0, opened: '2026-06-23', slaDays: 10, contact: 'M. Yacine Cherif — Ingénieur Qualité', attachments: 1, note: 'Analyse technique du lot AER-20250811-C en cours (inhalateur AeroFlow®). Rapport de cause racine attendu sous 10 jours.',
    catalog: [
      { ref: 'BMD-AER-100', name: 'Inhalateur doseur AeroFlow®', form: 'Dispositif inhalation', pack: 'Unité', stock: 'en rupture' },
      { ref: 'BMD-GLU-200', name: 'Lecteur de glycémie GlucoTrack®', form: 'Dispositif électronique', pack: 'Unité + 10 bandelettes', stock: 'disponible' },
      { ref: 'BMD-TEN-050', name: 'Tensiomètre électronique bras', form: 'Dispositif électronique', pack: 'Unité', stock: 'disponible' },
      { ref: 'BMD-NEB-010', name: 'Nébuliseur portable', form: 'Dispositif médical', pack: 'Unité', stock: 'stock limité' },
    ] },
  { id: 'lab-4', name: 'Institut Pasteur Algérie', type: 'Fournisseur réactifs de laboratoire', domain: 'Réactovigilance', lot: 'BIO-20260220-D', capaStage: 2, opened: '2026-06-11', slaDays: 20, contact: 'Dr. Amel Zerrouki — Contrôle Qualité', attachments: 3, note: 'Variabilité confirmée sur le lot BIO-20260220-D. CAPA proposée : renforcement du contrôle qualité avant expédition.',
    catalog: [
      { ref: 'IPA-BIO-220', name: 'Kit de dosage HbA1c Réactif Bio-X', form: 'Kit réactif laboratoire', pack: 'Coffret 50 tests', stock: 'stock limité' },
      { ref: 'IPA-GLY-110', name: 'Réactif glycémie enzymatique', form: 'Flacon réactif', pack: 'Flacon 100ml', stock: 'disponible' },
      { ref: 'IPA-CRP-090', name: 'Kit dosage CRP quantitatif', form: 'Kit réactif laboratoire', pack: 'Coffret 25 tests', stock: 'disponible' },
    ] },
]);

// Fixed demo "today" — matches the original's hardcoded reference date
// used by capaSlaStatus() so SLA countdowns stay consistent with the
// rest of the seeded dataset instead of drifting with the real clock.
const CAPA_DEMO_TODAY = new Date('2026-06-29');

export function capaSlaStatus(l) {
  if (l.capaStage >= CAPA_STAGES.length - 1) return { label: 'Clôturée dans les délais', tone: 'green', daysLeft: null };
  const opened = new Date(l.opened);
  const elapsed = Math.round((CAPA_DEMO_TODAY - opened) / 86400000);
  const daysLeft = l.slaDays - elapsed;
  if (daysLeft < 0) return { label: `En retard de ${Math.abs(daysLeft)} j`, tone: 'red', daysLeft };
  if (daysLeft <= 3) return { label: `${daysLeft} j restants — à risque`, tone: 'amber', daysLeft };
  return { label: `${daysLeft} j restants`, tone: 'cyan', daysLeft };
}

export function capaColor(l) {
  return l.capaStage >= 4 ? 'var(--color-green)' : l.capaStage >= 2 ? 'var(--color-amber)' : 'var(--color-red)';
}

// Priority rank used to sort the labs list: overdue/at-risk cases surface
// first regardless of array order, closed cases sink to the bottom —
// ported 1:1 from the original's labPriorityRank().
export function labPriorityRank(l) {
  const isClosed = l.capaStage >= CAPA_STAGES.length - 1;
  const sla = capaSlaStatus(l);
  if (isClosed) return 3;
  if (sla.tone === 'red') return 0;
  if (sla.tone === 'amber') return 1;
  return 2;
}

// ── PHARMACIEN-style supplier catalog / ordering, reused here only for
//    the Doctor's "Catalogue produits" and "Commandes en cours" actions
//    on the Labos page — ported 1:1 from the original's STOCK_TONE /
//    ORDER_STATUS / ORDERS_LOG. ──
export const STOCK_TONE = { disponible: 'green', 'stock limité': 'amber', 'en rupture': 'red' };
export const ORDER_STATUS = { pending: ['amber', 'En attente'], confirmed: ['cyan', 'Confirmée'], delivered: ['green', 'Livrée'] };

// organizationId: null (explicit legacy/unscoped) on the seed order —
// same "never guessed" treatment as every other legacy record in this
// file. DR_LABS (the supplier catalog these orders reference) stays
// intentionally global/unscoped per the task's explicit instruction —
// only the ORDER itself (a specific org's purchase from that catalog)
// is organization-owned.
export const ORDERS_LOG = demoRows([
  { id: 'ord-1', labId: 'lab-2', labName: 'Sanofi Algérie', items: [{ name: 'Insuline Lantus® 100UI/ml', qty: 3 }, { name: 'Atorvastatine 20mg (Tahor®)', qty: 5 }], date: '25/06/2026', status: 'confirmed', organizationId: null, authoredByUserId: null },
  // F6 addition (Demo Data & Functional Coverage audit) — organization
  // -scoped orders for CHU Alger / Clinique El Fedjr's pharmacist seats
  // (Centre Médical Sétif has no pharmacist role — see organizations.js
  // — so it intentionally gets none here).
  { id: 'ord-chu-1', labId: 'lab-1', labName: 'Laboratoires Saidal', items: [{ name: 'Paracétamol 500mg', qty: 40 }, { name: 'Amoxicilline 500mg', qty: 20 }], date: '26/06/2026', status: 'pending', organizationId: 'chu-alger', authoredByUserId: 'usr-chu-pharmacien' },
  { id: 'ord-chu-2', labId: 'lab-3', labName: 'Biomedical Devices Algérie', items: [{ name: 'Nébuliseur portable', qty: 4 }], date: '20/06/2026', status: 'delivered', organizationId: 'chu-alger', authoredByUserId: 'usr-chu-pharmacien' },
  { id: 'ord-clin-1', labId: 'lab-2', labName: 'Sanofi Algérie', items: [{ name: 'Amoxicilline/Acide clavulanique 500/125mg', qty: 15 }], date: '22/06/2026', status: 'confirmed', organizationId: 'clinique-el-fedjr', authoredByUserId: 'usr-clinique-pharmacien' },
]);

// Shared canonical order-creation path — both DoctorLabos.jsx and
// PharmCommandes.jsx used to inline an identical `ORDERS_LOG.unshift`
// with no organization attribution (confirmed leak, audit round 2 §3
// High). Now the single place that stamps organizationId/
// authoredByUserId from the real session, exactly like
// addDrDeclaration/addLabDeclaration — one canonical write path for
// both callers instead of two independently-drifting copies.
export function addOrder({ labId, labName, items }) {
  const user = getCurrentAuthUser();
  const order = {
    id: 'ord-' + Date.now(),
    labId,
    labName,
    items,
    date: new Date().toLocaleDateString(localeTag()),
    status: 'pending',
    organizationId: user?.organizationId ?? null,
    authoredByUserId: user?.id ?? null,
  };
  ORDERS_LOG.unshift(order);
  return order;
}

export const INCIDENT_THREADS = demoRows([
  { id: 'inc-1', ref: '#PV-2026-119', domain: 'Pharmacovigilance', title: "Suspicion d'hypersensibilité sévère — Metformine 850mg", severity: 'critique', status: 'open', time: '27/06/2026', organizationId: null,
    messages: [ { from: 'them', text: "Docteur, j'ai eu des rougeurs et des difficultés à respirer après ma prise de Metformine ce matin.", time: '27/06/2026 · 07:55' },
                { from: 'me', text: 'Contactez le 15 immédiatement si les symptômes persistent. Je transmets une déclaration grave dès maintenant.', time: '27/06/2026 · 08:02' } ] },
  { id: 'inc-2', ref: '#MV-2026-041', domain: 'Matériovigilance', title: 'Défaut de délivrance de dose — Inhalateur AeroFlow®', severity: 'majeur', status: 'open', time: '22/06/2026', organizationId: null,
    messages: [ { from: 'me', text: "Pouvez-vous confirmer la disponibilité d'un lot de remplacement pour l'inhalateur AeroFlow® ?", time: '22/06/2026 · 11:15' },
                { from: 'them', text: 'Un nouveau lot (AER-20260701-A) sera disponible sous 5 jours ouvrés. Nous vous tiendrons informé.', time: '22/06/2026 · 15:40' } ] },
  { id: 'inc-3', ref: '#CV-2026-009', domain: 'Cosmétovigilance', title: 'Dermite de contact allergique — Crème DermaSoft®', severity: 'majeur', status: 'open', time: '15/06/2026', organizationId: null,
    messages: [ { from: 'them', text: 'Érythème facial confirmé, compatible avec une dermite de contact allergique au lot DSF-20260115-A.', time: '15/06/2026 · 10:20' },
                { from: 'me', text: 'Merci. Je classe le dossier en révision et transmets au fabricant pour analyse de formulation.', time: '15/06/2026 · 10:32' } ] },
  { id: 'inc-4', ref: '#PV-2025-118', domain: 'Pharmacovigilance', title: 'Éruption cutanée, urticaire généralisée — Amoxicilline 500mg', severity: 'majeur', status: 'resolved', time: '12/10/2025', organizationId: null,
    messages: [ { from: 'them', text: "2 déclarations d'urticaire reçues suite à l'Amoxicilline. Symptômes résolus en 48h après arrêt.", time: '12/10/2025 · 09:00' },
                { from: 'me', text: 'Noté. Lien de causalité probable confirmé. Dossier clôturé avec le CNPM.', time: '14/10/2025 · 11:00' } ] },

  // ── F6 addition (Demo Data & Functional Coverage audit) — organization
  // -scoped incidents mirroring dr-dec-chu-*/dr-dec-clin-*/dr-dec-centre-*
  // above, same shape/rendering path as inc-1..inc-4.
  { id: 'inc-chu-1', ref: '#MV-2026-108', domain: 'Matériovigilance', title: 'Défaut de fermeture — Agrafeuse chirurgicale EndoStap®', severity: 'critique', status: 'open', time: '24/06/2026', organizationId: 'chu-alger',
    messages: [ { from: 'them', text: "Nous avons bien reçu votre signalement sur l'agrafeuse EndoStap®, lot EST-20260305-B. Investigation ouverte.", time: '24/06/2026 · 14:05' } ] },
  // F6 follow-up (parity audit round 3) — CHU/Clinique/Centre each
  // shipped with exactly ONE incident, so an org-linked doctor's
  // "Incidents" tab rendered a single lonely card next to the
  // standalone account's 4-card list, and the Ouverts/Urgents/Résolus
  // filter chips had nothing to show for most statuses/severities at
  // any organization (e.g. no org had a single 'resolved' incident).
  // These additions give each organization the same 3-incident spread
  // across severity/status the standalone account already has, reusing
  // real declaration refs/patients from this file instead of inventing
  // unrelated ones (inc-chu-2 mirrors dr-dec-chu-1's Clopidogrel case
  // for the same patient as th-chu-1's thread; inc-chu-3 is a closed
  // legacy case, same pattern as the standalone account's inc-4).
  { id: 'inc-chu-2', ref: '#PV-2026-201', domain: 'Pharmacovigilance', title: 'Ecchymoses spontanées, saignement gingival — Clopidogrel 75mg (Plavix®)', severity: 'majeur', status: 'open', time: '26/06/2026', organizationId: 'chu-alger',
    messages: [ { from: 'them', text: "Docteur, j'ai des bleus qui apparaissent sans raison depuis le Plavix.", time: '26/06/2026 · 08:10' },
                { from: 'me', text: 'Ecchymoses spontanées confirmées, possible lien avec le Clopidogrel — surveillance biologique programmée.', time: '26/06/2026 · 08:35' } ] },
  { id: 'inc-chu-3', ref: '#PV-2025-201', domain: 'Pharmacovigilance', title: 'Éruption cutanée résolue — Vaccin antigrippal', severity: 'mineur', status: 'resolved', time: '18/11/2025', organizationId: 'chu-alger',
    messages: [ { from: 'them', text: 'Éruption cutanée bénigne signalée après vaccination antigrippale, résolue spontanément en 3 jours.', time: '18/11/2025 · 09:15' },
                { from: 'me', text: 'Noté, aucun lien de causalité retenu. Dossier clôturé.', time: '21/11/2025 · 10:00' } ] },
  // F6 follow-up (parity round 4) — every org still landed one incident
  // short of the standalone account's 4-card list. inc-chu-4 surfaces
  // dr-dec-chu-3 (Mourad Khelifi's draft Metformine/acidose case),
  // which already existed in DR_DECLARATIONS but had never been given
  // an incident thread — no new patient/declaration invented.
  { id: 'inc-chu-4', ref: '#BROUILLON-DR-CHU-1', domain: 'Pharmacovigilance', title: 'Acidose lactique suspectée — Metformine 850mg (Glucophage®)', severity: 'critique', status: 'open', time: '20/06/2026', organizationId: 'chu-alger',
    messages: [ { from: 'them', text: 'Bilan biologique confirmant une acidose lactique chez M. Khelifi, sous Metformine pour insuffisance rénale légère.', time: '20/06/2026 · 08:30' },
                { from: 'me', text: 'Metformine suspendue immédiatement, hospitalisation en urgence pour correction métabolique. Déclaration grave en préparation.', time: '20/06/2026 · 09:10' } ] },
  { id: 'inc-clin-1', ref: '#MV-2026-109', domain: 'Matériovigilance', title: 'Défaut d’étanchéité — Kit de trocart EndoPort®', severity: 'majeur', status: 'open', time: '21/06/2026', organizationId: 'clinique-el-fedjr',
    messages: [ { from: 'me', text: 'Pouvez-vous confirmer si ce défaut a été observé sur d’autres lots du kit EndoPort® ?', time: '21/06/2026 · 09:30' },
                { from: 'them', text: 'Aucun autre signalement à ce jour, nous ouvrons une investigation ciblée sur ce lot.', time: '21/06/2026 · 11:00' } ] },
  { id: 'inc-clin-2', ref: '#PV-2026-202', domain: 'Pharmacovigilance', title: 'Troubles digestifs résolus — Fer + Acide folique (Tardyferon®)', severity: 'mineur', status: 'resolved', time: '25/06/2026', organizationId: 'clinique-el-fedjr',
    messages: [ { from: 'them', text: 'Bonjour Dr. Haddad, le Tardyferon me donne toujours mal au ventre.', time: '25/06/2026 · 10:15' },
                { from: 'me', text: "Formule mieux tolérée prescrite — patiente soulagée, dossier clôturé après contrôle à J+7.", time: '02/07/2026 · 09:00' } ] },
  { id: 'inc-clin-3', ref: '#MV-2026-110', domain: 'Matériovigilance', title: 'Alerte critique — Défaillance moniteur post-opératoire', severity: 'critique', status: 'open', time: '27/06/2026', organizationId: 'clinique-el-fedjr',
    messages: [ { from: 'them', text: 'Arrêt intempestif du moniteur de surveillance post-opératoire en salle de réveil — panne matérielle suspectée.', time: '27/06/2026 · 06:40' },
                { from: 'me', text: 'Appareil mis hors service immédiatement, patients basculés sur moniteur de secours. Investigation urgente demandée au fabricant.', time: '27/06/2026 · 07:00' } ] },
  // F6 follow-up (parity round 4) — Clinique El Fedjr's own 4th
  // incident, same "closed legacy case" pattern as inc-chu-3/inc-4
  // (standalone), rounding out its severity/status spread (majeur +
  // resolved, a combination Clinique didn't have yet).
  { id: 'inc-clin-4', ref: '#PV-2025-202', domain: 'Pharmacovigilance', title: 'Réaction cutanée résolue — Amoxicilline/Acide clavulanique (Augmentin®)', severity: 'majeur', status: 'resolved', time: '03/12/2025', organizationId: 'clinique-el-fedjr',
    messages: [ { from: 'them', text: "Éruption cutanée diffuse suite à l'Augmentin, sans signe de gravité respiratoire ou hémodynamique.", time: '03/12/2025 · 10:00' },
                { from: 'me', text: 'Arrêt du traitement, antihistaminique prescrit. Résolution complète en 4 jours, dossier clôturé.', time: '07/12/2025 · 09:30' } ] },
  { id: 'inc-centre-1', ref: '#PV-2026-203', domain: 'Pharmacovigilance', title: 'Fièvre élevée post-vaccinale — Vaccin ROR', severity: 'mineur', status: 'resolved', time: '19/06/2026', organizationId: 'centre-setif',
    messages: [ { from: 'them', text: 'Fièvre résolue en 48h, aucune séquelle observée.', time: '20/06/2026 · 09:00' },
                { from: 'me', text: 'Bien noté, dossier clôturé.', time: '20/06/2026 · 09:10' } ] },
  { id: 'inc-centre-2', ref: '#PV-2026-204', domain: 'Pharmacovigilance', title: 'Œdèmes des membres inférieurs — Amlodipine 5mg (Amlor®)', severity: 'majeur', status: 'open', time: '17/06/2026', organizationId: 'centre-setif',
    messages: [ { from: 'them', text: "Docteur, mes chevilles restent gonflées malgré l'Amlodipine.", time: '17/06/2026 · 09:00' },
                { from: 'me', text: 'On ajuste le traitement à votre prochain rendez-vous, surveillez votre tension en attendant.', time: '17/06/2026 · 09:20' } ] },
  { id: 'inc-centre-3', ref: '#MV-2026-111', domain: 'Matériovigilance', title: 'Alerte critique — Dysfonctionnement tensiomètre électronique', severity: 'critique', status: 'open', time: '23/06/2026', organizationId: 'centre-setif',
    messages: [ { from: 'them', text: 'Plusieurs mesures aberrantes relevées avec le tensiomètre électronique du cabinet — suspicion de dérive de calibrage.', time: '23/06/2026 · 08:20' },
                { from: 'me', text: 'Appareil retiré du service, vérification par le fabricant demandée avant remise en circulation.', time: '23/06/2026 · 08:45' } ] },
  // F6 follow-up (parity round 4) — Centre Médical Sétif's own 4th
  // incident, same "closed legacy case" pattern, rounding out its
  // severity/status spread (mineur + open, the one combination Centre
  // didn't have yet — its existing mineur record was already resolved).
  { id: 'inc-centre-4', ref: '#PV-2026-205', domain: 'Pharmacovigilance', title: 'Céphalées légères — Paracétamol 1g (Doliprane®)', severity: 'mineur', status: 'open', time: '28/06/2026', organizationId: 'centre-setif',
    messages: [ { from: 'them', text: 'Docteur, je ressens des maux de tête depuis que je prends le Doliprane prescrit.', time: '28/06/2026 · 07:40' },
                { from: 'me', text: 'Effet peu fréquent mais connu — on surveille, prévenez-moi si ça persiste au-delà de 48h.', time: '28/06/2026 · 08:00' } ] },
]);

// ── DOCUMENTATION (scientific/regulatory library) — ported 1:1 from
//    the original's DR_DOCS / renderDrDocs() / filterDrDocs().
//    Consumed by DoctorDocumentation.jsx. ──
export const DR_DOCS = [
  { id: 'doc-1', domain: 'Pharmacovigilance', title: 'Guide de déclaration des effets indésirables', meta: 'ANPP/CNPM · Protocole officiel · Mis à jour 06/2026', icon: 'file-text', color: 'cyan' },
  { id: 'doc-2', domain: 'Pharmacovigilance', title: "Échelle d'imputabilité de Naranjo — Guide d'application", meta: 'OMS-UMC · Référence causalité · 2025', icon: 'list-check', color: 'brand' },
  { id: 'doc-3', domain: 'Matériovigilance', title: 'Protocole de signalement des incidents liés aux dispositifs médicaux', meta: 'ANPP/DM · Réglementaire · Mis à jour 05/2026', icon: 'stethoscope', color: 'purple' },
  { id: 'doc-4', domain: 'Cosmétovigilance', title: 'Recommandations de surveillance post-commercialisation cosmétique', meta: 'ANPP/COSM · Note technique · 2026', icon: 'flask', color: 'amber' },
  { id: 'doc-5', domain: 'Réactovigilance', title: 'Contrôle qualité des dispositifs de diagnostic in vitro', meta: 'INSP · Recommandation · 2025', icon: 'test-pipe', color: 'green' },
  { id: 'doc-6', domain: 'Pharmacovigilance', title: 'Publication récente : interactions IEC et toux sèche persistante', meta: 'Revue Algérienne de Médecine Interne · Juin 2026', icon: 'file-report', color: 'cyan' },
];

// ── Anti-counterfeiting / traceability lot verification — shared by
//    Pharmacien/Labo/Hôpital's "Vérifier un lot" (verifyPharmLot() /
//    openPharmLotVerdict()) in the original. Ported here so the
//    Doctor's own "Vérifier un lot" can reuse the same richer verdict
//    UI (verdict banner, risk score, factors, distribution) instead of
//    the doctor-only page's plainer 3-line result banner. ──
export const QR_LOT_DB = demoMap({
  'DXP-20250612-B': { verdict: 'recalled', product: 'Dexamethasone 4mg/2ml injectable', manufacturer: 'Saidal DZ', expiry: '08/2027', note: "Rappel ANPP/RECALL/2026-089 · Contamination particulaire confirmée. Retour obligatoire au fournisseur.", risk: 92,
    factors: [
      { label: 'Rappel ANPP actif sur ce lot', status: 'fail' },
      { label: 'Format DataMatrix conforme GS1', status: 'pass' },
      { label: 'Cohérence chaîne de distribution', status: 'pass' },
      { label: 'Lisibilité péremption', status: 'pass' },
    ],
    distribution: [
      { site: 'Pharmacie El Badr, Kouba', qty: 6, status: 'À retourner' },
      { site: 'Pharmacie Ennour, Bab Ezzouar', qty: 11, status: 'À retourner' },
      { site: 'Pharmacie Ibn Sina, Hussein Dey', qty: 4, status: 'Retour confirmé' },
    ] },
  'MET-20260502-A': { verdict: 'authentic', product: 'Metformine 850mg (Glucophage®)', manufacturer: 'Merck DZ', expiry: '04/2028', note: 'Lot conforme. Chaîne de distribution vérifiée : Merck DZ → Dépôt central Alger → Pharmacie El Badr.', risk: 4,
    factors: [
      { label: 'Aucun rappel actif sur ce lot', status: 'pass' },
      { label: 'Format DataMatrix conforme GS1', status: 'pass' },
      { label: 'Cohérence chaîne de distribution', status: 'pass' },
      { label: 'Lisibilité péremption', status: 'pass' },
    ],
    distribution: [
      { site: 'Pharmacie El Badr, Kouba', qty: 120, status: 'En stock' },
    ] },
  'ATO-20260510-X': { verdict: 'suspicious', product: 'Atorvastatine 20mg (Tahor®)', manufacturer: 'Non confirmé', expiry: 'Illisible', note: "Code-barres non reconnu dans la base ANPP et incohérence de format DataMatrix. Isoler le produit et ne pas dispenser en attendant l'investigation.", risk: 68,
    factors: [
      { label: 'Aucun rappel actif sur ce lot', status: 'pass' },
      { label: 'Format DataMatrix conforme GS1', status: 'fail' },
      { label: 'Cohérence chaîne de distribution', status: 'warn' },
      { label: 'Lisibilité péremption', status: 'fail' },
    ],
    distribution: [
      { site: 'Pharmacie El Badr, Kouba', qty: 1, status: 'Isolé — en investigation' },
    ] },
});

export const QR_VERDICT_META = {
  authentic: { icon: 'circle-check', label: 'Produit authentique', cls: 'authentic' },
  suspicious: { icon: 'alert-triangle', label: 'Suspicion — à investiguer', cls: 'suspicious' },
  recalled: { icon: 'ban', label: 'Produit rappelé — RETRAIT', cls: 'recalled' },
  unknown: { icon: 'help-circle', label: 'Lot non référencé — authenticité non confirmée', cls: 'unknown' },
};

// Recalled-product register (Pharmacien's PHARM_RECALLS in the
// original) — ported here so the Doctor's full-page lot-verification
// view can show "Produits rappelés" underneath, same layout as the
// Pharmacien/Labo/Hôpital pages. Doctors don't hold officine stock, so
// this is shown read-only for them (no "Confirmer le retour" action —
// same compact=true mode the original itself used for non-pharmacy
// dashboard widgets).
// ── Ported 1:1 from the original's HOSP_DEPARTMENTS / HOSP_STAFF /
//    HOSP_STAFF_ROLE_TONE / HOSP_WORKFLOW_STEPS (used only by the
//    Hospital dashboard/personnel pages). hospDeptCount() is
//    reproduced as a plain helper rather than a module export since
//    it's only ever called with DR_DECLARATIONS in scope. ──
export const HOSP_DEPARTMENTS = [
  { id: 'dep-1', name: 'Urgences', icon: 'ambulance' },
  { id: 'dep-2', name: 'Chirurgie', icon: 'scissors' },
  { id: 'dep-3', name: 'Cardiologie', icon: 'heart-rate-monitor' },
  { id: 'dep-4', name: 'Oncologie', icon: 'radioactive' },
  { id: 'dep-5', name: 'Pharmacie hospitalière', icon: 'building-store' },
  { id: 'dep-6', name: 'Laboratoire', icon: 'microscope' },
  { id: 'dep-7', name: 'Bloc opératoire', icon: 'first-aid-kit' },
];
// ── Step 3E fix — Hospital personnel data mismatch ────────────────
// HOSP_STAFF used to be five hand-typed rows with invented names that
// didn't correspond to any real CHU Alger seat in AuthContext.jsx —
// "Dr. Karim Benali" is actually the standalone docteur@demo.dz
// account (no organization at all), and "Dr. Yasmine Touati", "Mehdi
// Saadi", "Sara Boudiaf" don't exist as seats anywhere. HOSP_STAFF is
// now DERIVED from the real CHU Alger seats in DEMO_ACCOUNTS, so this
// roster — and AdminDashboard.jsx's personnel count, which reads
// HOSP_STAFF.length — always reflect the actual organization/session
// model instead of disconnected demo names. 'chu-alger' is the one
// hospital organization this file's data already models (see
// HOSP_DEPARTMENTS above, ported from organizations.js's chu-alger
// departments).
const HOSP_ROLE_LABEL_FR = {
  doctor: 'Médecin',
  pharmacist: 'Pharmacien',
  laboratory_staff: 'Laborantin',
  medical_staff: 'Infirmier',
  vigilance_responsible: 'Responsable vigilance',
  administrator: 'Administrateur',
};
const HOSP_CHU_DEPARTMENTS = getDepartmentsForOrganization('chu-alger');
function hospDeptNameForStaff(departmentId) {
  // No invented department: a seat with no departmentId (most
  // org-level roles) shows '—' rather than a guessed service name —
  // same "never guess" rule as isOrgScopedRecordVisible above.
  return HOSP_CHU_DEPARTMENTS.find((d) => d.id === departmentId)?.name ?? '—';
}
// Declaration count / last-activity are cosmetic table filler — same
// role this data always played — not derived from DR_DECLARATIONS,
// since none of that seed data carries a real organizationId /
// authoredByUserId (see this file's header). Keyed by the real seat
// id so the numbers stay attached to a genuine CHU Alger account.
const HOSP_STAFF_DISPLAY_META = {
  'usr-chu-medecin': { declCount: 6, lastActivity: "Aujourd'hui · 09:02" },
  'usr-chu-pharmacien': { declCount: 3, lastActivity: 'Hier · 16:40' },
  'usr-chu-laborantin': { declCount: 2, lastActivity: 'Hier · 11:15' },
  'usr-chu-infirmier': { declCount: 2, lastActivity: '23/06/2026' },
  'usr-chu-admin': { declCount: 0, lastActivity: '20/06/2026' },
};
const _seenHospStaffIds = new Set();
export const HOSP_STAFF = demoRows(DEMO_ACCOUNTS
  .filter((a) => a.orgId === 'chu-alger')
  // A seat can accept more than one login email (see AuthContext.jsx's
  // SEATS/DEMO_ACCOUNTS header), which would otherwise duplicate one
  // person into two rows here. No current CHU Alger seat has more
  // than one email, but this de-dup stays in place for any seat that
  // does in the future.
  .filter((a) => {
    if (_seenHospStaffIds.has(a.id)) return false;
    _seenHospStaffIds.add(a.id);
    return true;
  })
  .map((a) => ({
    id: a.id,
    name: a.name,
    role: HOSP_ROLE_LABEL_FR[getBaseRole(a.role)] || a.role,
    dept: hospDeptNameForStaff(a.departmentId),
    declCount: HOSP_STAFF_DISPLAY_META[a.id]?.declCount ?? 0,
    lastActivity: HOSP_STAFF_DISPLAY_META[a.id]?.lastActivity ?? '—',
  })));
export const HOSP_STAFF_ROLE_TONE = { Médecin: 'purple', Pharmacien: 'green', Laborantin: 'amber', Infirmier: 'cyan', 'Responsable vigilance': 'blue', Administrateur: 'red' };
export const HOSP_WORKFLOW_STEPS = [
  { icon: 'user', label: 'Patient' },
  { icon: 'stethoscope', label: 'Médecin / Pharmacien' },
  { icon: 'building-hospital', label: 'Hôpital / Clinique' },
  { icon: 'flask', label: 'Laboratoire (VigiCore)' },
  { icon: 'shield-check', label: 'ANPP' },
];
// Blocker 1 fix: takes the declarations list to count over instead of
// always reading the full unscoped DR_DECLARATIONS — HospDashboard.jsx
// now passes it its own org-scoped list (see that file) so the
// department KPI table can't leak another hospital's counts into CHU
// Alger's dashboard. Defaults to DR_DECLARATIONS for backward
// compatibility with any other caller.
export function hospDeptCount(deptName, declarations = DR_DECLARATIONS) {
  return declarations.filter((d) => d.dept === deptName).length;
}

export const PHARM_RECALLS = demoRows([
  { id: 'pr-1', alertId: 'al-1', ref: 'ANPP/RECALL/2026-089', product: 'Dexamethasone 4mg/2ml injectable', lab: 'Saidal', lot: 'DXP-20250612-B', reason: 'Contamination particulaire confirmée — présence de particules solides dans la solution injectable.', date: '28/06/2026', patients: ['Amira Boualem'], stockOnHand: 0, returned: false, returnedBy: '', returnedAt: '' },
  { id: 'pr-2', alertId: 'al-2', ref: 'ANPP/DM/2026-054', product: 'Inhalateur doseur AeroFlow®', lab: 'Biomedical Devices Algérie', lot: 'AER-20250811-C', reason: 'Signalements multiples de sous-dosage — investigation fabricant en cours.', date: '23/06/2026', patients: ['Yacine Meziane'], stockOnHand: 4, returned: false, returnedBy: '', returnedAt: '' },
  { id: 'pr-3', alertId: 'al-3', ref: 'ANPP/COSM/2026-027', product: 'Crème apaisante DermaSoft®', lab: 'Laboratoire non précisé', lot: 'DSF-20260115-A', reason: "Hausse des signalements de dermite de contact — reformulation en cours d'examen.", date: '16/06/2026', patients: ['Nadia Cherfaoui'], stockOnHand: 2, returned: false, returnedBy: '', returnedAt: '' },
]);

// drDeclCounter in the original — module-private so every caller shares
// the same running counter instead of each page re-deriving its own.
let drDeclCounter = DR_DECLARATIONS.length;

/**
 * Mirrors the doctor branch of the original's submitDeclareWizard():
 * builds the same shape of record, with the same ref-numbering scheme,
 * and unshifts it onto the shared DR_DECLARATIONS array.
 *
 * Blocker 1 fix — organization/author attribution: `organizationId`,
 * `authoredByUserId`, `authoredByRole` are stamped here, ONCE, for
 * every caller (Doctor's own wizard, and Hospital/Clinique/Centre
 * médical via the shared InstitutionalDeclarer — see
 * DoctorDeclarer.jsx / InstitutionalDeclarer.jsx, neither of which
 * needed to change). They come from the actual logged-in session
 * (getCurrentAuthUser() — the same module-level auth mirror
 * declarationService.js already reads scope from), NEVER inferred
 * from `dept`: `dept` stays exactly what it was — a free-text
 * business label ('Médecine', 'Hôpital', 'Pharmacie', …) — and is
 * never repurposed as an organization identifier (a second hospital
 * would still produce dept:'Hôpital', indistinguishable from the
 * first — see audit §3). `organizationId` is the only field that
 * identifies WHICH organization, and it comes from the session, not
 * this label.
 *
 * If no user is logged in (e.g. a unit test rendering this component
 * without <AuthProvider>), all three stay null — same "explicit
 * legacy/unscoped, never guessed" treatment as the seed data above.
 */
export function addDrDeclaration({ type, patientId, manualPatientName, manualPatientIdNum, product, lot, manufacturer, problemType, description, severity, dept, patientAge, patientSex, service, onsetDate, outcome, productStopped, attachmentNames, kind, refPrefix, lotLabel, device, panne, impact, escalated }) {
  drDeclCounter += 1;
  const prefix = refPrefix || DECLARE_WIZ_REF_PREFIX_BY_TYPE[type] || 'PV';
  const user = getCurrentAuthUser();
  const decl = {
    id: 'dr-dec-' + Date.now(),
    ref: `#${prefix}-2026-${String(100 + drDeclCounter).padStart(3, '0')}`,
    patientId,
    manualPatientName,
    manualPatientIdNum,
    domain: DECLARE_WIZ_DOMAIN_BY_TYPE[type] || 'Pharmacovigilance',
    product: `${product} · ${lotLabel || 'Lot'} ${lot}`,
    effect: description || LAB_PROBLEM_TYPE_LABEL[problemType] || 'Incident signalé',
    date: new Date().toLocaleDateString(localeTag()),
    severity: severity || 'legere',
    status: 'sent',
    dept: dept || 'Vigilance',
    manufacturer,
    // Optional context captured by the 5-step declaration wizard.
    patientAge: patientAge ?? null,
    patientSex: patientSex ?? null,
    service: service ?? null,
    onsetDate: onsetDate ?? null,
    outcome: outcome ?? null,
    productStopped: productStopped ?? null,
    attachmentNames: attachmentNames ?? [],
    // Breakdown ('panne') reports: device identity, circumstances, impact.
    kind: kind ?? 'incident',
    device: device ?? null,
    panne: panne ?? null,
    impact: impact ?? null,
    escalated: escalated ?? false,
    capaStatus: 'none',
    organizationId: user?.organizationId ?? null,
    authoredByUserId: user?.id ?? null,
    authoredByRole: user ? getBaseRole(user.role) : null,
  };
  const tracked = track(decl, 'dr', prefix);
  DR_DECLARATIONS.unshift(tracked);
  logAudit('declaration', decl.id, `Déclaration ${decl.ref} créée (gravité : ${DR_SEVERITY_CLASS[decl.severity]?.[1] || decl.severity})`, user?.name ?? null, user?.organizationId ?? null);
  return tracked;
}
