// ═══════════════════════════════════════════════════════════════
// PHASE A — TEMPORARY mappers: legacy DR_DECLARATIONS / LAB_DECLARATIONS
// shapes → canonical Declaration (src/domain/declaration.js).
//
// This file exists ONLY to let declarationService.js build a canonical
// mock dataset out of the two legacy arrays without modifying them.
// Per the migration plan, this file is deleted in a later phase once
// every reader (dashboards, declarations lists, wizards) has moved off
// DR_DECLARATIONS/LAB_DECLARATIONS directly. It is not meant to be a
// long-lived part of the architecture.
//
// Pure functions only — no side effects, no writes back to the legacy
// arrays, no scope/auth decisions. Read src/domain/declaration.js's
// header first; the same LOCKED/TBD boundaries apply here.
//
// IMPORTANT — known, deliberate gap (see completion report §6):
// DR_DECLARATIONS is shared today by five different roles (Doctor,
// Hospital, Clinique, CentreMedical, Pharmacien), and the array itself
// never recorded WHICH role authored a given row — only a free-text
// `dept` label (e.g. "Cardiologie", "Urgences"), which for the current
// seed data does NOT match any of the five roles' own dept labels
// ('Médecine', 'Pharmacie', 'Hôpital', 'Clinique', 'Centre médical').
// So DEPT_LABEL_TO_ROLE_GUESS below will return null for every row
// currently in DR_DECLARATIONS's seed data — this is expected, not a
// bug, and is called out explicitly rather than silently guessing
// wrong. It will only successfully resolve authoredByRole for NEW
// records created going forward with one of the five known dept
// labels attached.
// ═══════════════════════════════════════════════════════════════

import { createDeclaration } from './declaration';

// Best-effort, ADMITTEDLY INCOMPLETE dept-label → role guess. Not a
// substitute for real authorship data (which doesn't exist in the
// legacy shape at all). See file header.
const DEPT_LABEL_TO_ROLE_GUESS = {
  'Médecine': 'doctor',
  'Pharmacie': 'pharmacist',
  'Hôpital': 'hospital',
  'Clinique': 'clinique',
  'Centre médical': 'centremedical',
};

// Reverse of doctorVigilance.js's DECLARE_WIZ_DOMAIN_BY_TYPE — kept in
// sync with that table's 5 entries (including 'reactif' ->
// Réactovigilance, added so Doctor/Institutional/Pharmacien/Patient
// wizards can create a Réactovigilance declaration directly, not just
// the Laboratory Staff portal).
const TYPE_BY_DOMAIN = {
  Pharmacovigilance: 'medicament',
  'Matériovigilance': 'dispositif',
  'Cosmétovigilance': 'cosmetique',
  Chemovigilance: 'chimique',
  'Réactovigilance': 'reactif',
};

/**
 * DR_DECLARATIONS' `product` field bundles the lot number as a suffix
 * ("Atorvastatine 20mg (Tahor®) · Lot ATO-20260510-B"). Splits that
 * back into separate product/lot fields for the canonical shape. If
 * the separator isn't found (shouldn't happen for current seed data,
 * but the wizard-submitted format is the same pattern via
 * addDrDeclaration), the whole string is kept as `product` and `lot`
 * is left empty rather than guessing.
 */
function splitProductLot(bundled) {
  const marker = ' · Lot ';
  const idx = bundled.indexOf(marker);
  if (idx === -1) return { product: bundled, lot: '' };
  return { product: bundled.slice(0, idx), lot: bundled.slice(idx + marker.length) };
}

/**
 * Parses the app's "dd/mm/yyyy" date strings (French locale, as
 * produced by `date.toLocaleDateString('fr-FR')`) into an ISO string.
 * Falls back to the current time if the string doesn't match, rather
 * than throwing — this is display data being carried forward, not
 * user input being validated.
 */
function parseFrDateToIso(dateStr) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr || '');
  if (!m) return new Date().toISOString();
  const [, day, month, year] = m;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
}

/**
 * Maps one DR_DECLARATIONS record to the canonical Declaration shape.
 *
 * Fields intentionally left null/empty, and why:
 *  - problemType: DR_DECLARATIONS never had this field (only
 *    LAB_DECLARATIONS does) — there's nothing to map.
 *  - departmentId: still blocked on §0.2 (establishment- vs.
 *    department-level scope granularity), a genuinely open product
 *    question, not a missing plumbing detail.
 *  - clinicalDetail: DR_DECLARATIONS has no such data.
 *  - recipients: not present on legacy records at all (the recipient
 *    picker is a Phase-A-adjacent UI feature added after this data
 *    shape existed) — defaults to ['cnpm'], the same default the
 *    wizards themselves use today.
 *
 * authoredByUserId / authoredByRole / organizationId — Blocker 1 fix:
 * DR_DECLARATIONS records created from here on (addDrDeclaration,
 * doctorVigilance.js) carry REAL values for these, stamped from the
 * session at creation time. Pass those through when present. Only
 * fall back to the best-effort DEPT_LABEL_TO_ROLE_GUESS / null for
 * genuinely old rows that predate that fix (the original seed data —
 * see file header for why the guess resolves to null for all of
 * those).
 */
export function mapDrDeclarationToCanonical(drRecord) {
  const { product, lot } = splitProductLot(drRecord.product || '');
  const iso = parseFrDateToIso(drRecord.date);

  return createDeclaration({
    id: drRecord.id,
    ref: drRecord.ref,
    type: drRecord.domain ? (TYPE_BY_DOMAIN[drRecord.domain] ?? null) : null,
    domain: drRecord.domain ?? null,
    product,
    lot,
    manufacturer: drRecord.manufacturer ?? '',
    problemType: null,
    description: drRecord.effect ?? '',
    severity: drRecord.severity ?? null,
    status: drRecord.status ?? 'draft',
    capaStatus: drRecord.capaStatus ?? 'none',
    recipients: ['cnpm'],
    evidence: [],
    createdAt: iso,
    updatedAt: iso,
    authoredByUserId: drRecord.authoredByUserId ?? null,
    authoredByRole: drRecord.authoredByRole ?? (DEPT_LABEL_TO_ROLE_GUESS[drRecord.dept] ?? null),
    organizationId: drRecord.organizationId ?? null,
    departmentId: null,
    patientRef: {
      legacy: {
        patientId: drRecord.patientId ?? null,
        manualPatientName: drRecord.manualPatientName ?? null,
        manualPatientIdNum: drRecord.manualPatientIdNum ?? null,
      },
    },
    clinicalDetail: null,
  });
}

/**
 * Maps one LAB_DECLARATIONS record to the canonical Declaration shape.
 *
 * Fields intentionally left null/empty, and why:
 *  - departmentId: same open-question gap as the DR_ mapper (§0.2).
 *  - authoredByRole: unlike DR_DECLARATIONS, this one IS reliable
 *    even for old rows — LAB_DECLARATIONS is exclusively the Labo
 *    portal's own array, so every row is safely 'laboratory_staff'
 *    regardless of when it was created.
 *  - authoredByUserId / organizationId — Blocker 1 fix: records
 *    created from here on (addLabDeclaration, laboVigilance.js) carry
 *    real values, stamped at creation from the session. Old seed rows
 *    predate that and stay null (never guessed).
 *  - patientRef: LAB_DECLARATIONS never had patient fields at all —
 *    a lab reports on a product/lot, not a patient encounter (see the
 *    architecture discussion). Stays null, not an empty legacy bucket,
 *    to distinguish "never had this concept" from "had it but empty".
 */
export function mapLabDeclarationToCanonical(labRecord) {
  const iso = parseFrDateToIso(labRecord.date);

  return createDeclaration({
    id: labRecord.id,
    ref: labRecord.ref,
    type: labRecord.productType ?? null,
    domain: labRecord.productType ? (
      { medicament: 'Pharmacovigilance', dispositif: 'Matériovigilance', cosmetique: 'Cosmétovigilance', chimique: 'Chemovigilance', reactif: 'Réactovigilance' }[labRecord.productType] ?? null
    ) : null,
    product: labRecord.product ?? '',
    lot: labRecord.lot ?? '',
    manufacturer: labRecord.manufacturer ?? '',
    problemType: labRecord.problemType ?? null,
    description: labRecord.description ?? '',
    severity: labRecord.severity ?? null,
    status: labRecord.status ?? 'draft',
    capaStatus: labRecord.capaStatus ?? 'none',
    recipients: ['cnpm'],
    evidence: [],
    createdAt: iso,
    updatedAt: iso,
    authoredByUserId: labRecord.authoredByUserId ?? null,
    authoredByRole: 'laboratory_staff',
    organizationId: labRecord.organizationId ?? null,
    departmentId: null,
    patientRef: null,
    clinicalDetail: null,
  });
}
