// ═══════════════════════════════════════════════════════════════
// PHASE A — canonical Declaration/Case domain contract.
//
// This is groundwork only. Nothing in the app consumes this file yet —
// no *Declarer.jsx page, no dashboard, no declarations list has been
// touched. DR_DECLARATIONS and LAB_DECLARATIONS (src/data/*.js) remain
// the only data those pages read/write, unchanged, until a later phase
// explicitly migrates them.
//
// This module defines SHAPE only (enums, a factory, light validation).
// It does not fetch, store, scope, or authorize anything — see
// src/services/declarationService.js for the (mock, non-authoritative)
// service layer built on top of this shape.
//
// LOCKED vs TBD, per the architecture review:
//   - Core fields (id, ref, type, domain, product, lot, manufacturer,
//     problemType, description, severity, status, capaStatus,
//     recipients, evidence, createdAt/updatedAt) are LOCKED — derived
//     from what DR_DECLARATIONS and LAB_DECLARATIONS already agree on
//     today.
//   - Provenance fields (authoredByUserId, authoredByRole,
//     organizationId, departmentId) are LOCKED AS FIELDS but their
//     VALUES stay null/unpopulated in Phase A — no real user identity,
//     organization, or department id exists anywhere in the current
//     data. Populating these meaningfully is blocked on the open
//     decisions below.
//   - patientRef / clinicalDetail are STRUCTURE-TBD. Phase A only
//     provides a deliberately non-committal container
//     (patientRef.legacy) so old data can be carried forward without
//     asserting a final schema.
//
// OPEN DECISIONS (do not assume answers to these — see the architecture
// discussion for full context; nothing below should be read as
// resolving them):
//   §0.1 — Doctor cross-visibility / "careteam" access model
//   §0.2 — Hospital/Clinique/CentreMedical scope granularity
//          (establishment-level vs. department-level)
//   §0.3 — final patientRef / clinicalDetail structure
// ═══════════════════════════════════════════════════════════════

export const DECLARATION_TYPES = ['medicament', 'dispositif', 'cosmetique', 'chimique', 'reactif'];

export const DECLARATION_DOMAINS = [
  'Pharmacovigilance',
  'Matériovigilance',
  'Cosmétovigilance',
  'Chemovigilance',
  'Réactovigilance',
];

export const DECLARATION_SEVERITIES = ['legere', 'moderee', 'grave'];

export const DECLARATION_STATUSES = ['draft', 'review', 'analysis', 'sent', 'closed'];

export const DECLARATION_CAPA_STATUSES = ['none', 'proposed', 'validated'];

// Fields every Declaration MUST have a value for (possibly null, but the
// key must exist). Used by validateDeclaration() below. Deliberately
// does NOT include patientRef/clinicalDetail internals — their
// structure is TBD (§0.3), so Phase A only checks the container key
// exists, never its shape.
const REQUIRED_KEYS = [
  'id', 'ref', 'type', 'domain', 'product', 'lot', 'manufacturer',
  'problemType', 'description', 'severity', 'status', 'capaStatus',
  'recipients', 'evidence', 'createdAt', 'updatedAt',
  'authoredByUserId', 'authoredByRole', 'organizationId', 'departmentId',
  'patientRef', 'clinicalDetail',
];

function generateId() {
  // Prefixed so canonical-service-generated ids are visually distinct
  // from legacy dr-dec-*/lab-dec-* ids carried forward by the mappers.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'decl-' + crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older test runners, etc.)
  return 'decl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Builds a fully-shaped canonical Declaration from a partial input.
 * Fills structural defaults for every LOCKED field; leaves
 * TBD-in-value fields (authoredByUserId, organizationId, departmentId)
 * as null unless explicitly provided by the caller, and never invents
 * a value for them — those are the caller's (mapper's or service's)
 * responsibility, and ultimately the backend's in a real deployment.
 *
 * This factory does NOT stamp scope/auth fields itself and does NOT
 * decide business rules (e.g. default recipients) beyond the most
 * literal "empty means empty" default — callers own that.
 */
export function createDeclaration(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? generateId(),
    ref: partial.ref ?? null,
    type: partial.type ?? null,
    domain: partial.domain ?? null,
    product: partial.product ?? '',
    lot: partial.lot ?? '',
    manufacturer: partial.manufacturer ?? '',
    problemType: partial.problemType ?? null,
    description: partial.description ?? '',
    severity: partial.severity ?? null,
    status: partial.status ?? 'draft',
    capaStatus: partial.capaStatus ?? 'none',
    recipients: partial.recipients ?? [],
    evidence: partial.evidence ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,

    // Provenance — LOCKED as fields, values stay null unless the
    // caller explicitly supplies them. Phase A callers (the mock
    // mappers/service) only ever populate authoredByRole; the rest
    // stay null by design (see file header).
    authoredByUserId: partial.authoredByUserId ?? null,
    authoredByRole: partial.authoredByRole ?? null,
    organizationId: partial.organizationId ?? null,
    departmentId: partial.departmentId ?? null,

    // STRUCTURE-TBD containers (§0.3) — passed through verbatim,
    // never synthesized here.
    patientRef: partial.patientRef ?? null,
    clinicalDetail: partial.clinicalDetail ?? null,
  };
}

/**
 * Light structural validation: every REQUIRED_KEYS entry must be
 * present (own property) on the record, and locked enum fields (when
 * non-null) must be one of the known values. Does NOT validate the
 * internal shape of patientRef/clinicalDetail (§0.3, unresolved) and
 * does NOT enforce that provenance fields be non-null — Phase A
 * records legitimately have null authoredByUserId/organizationId/
 * departmentId, and that's expected, not an error, until those
 * decisions are made and a real backend populates them.
 *
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateDeclaration(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Declaration must be an object.'] };
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in record)) errors.push(`Missing required key: "${key}".`);
  }

  if (record.type != null && !DECLARATION_TYPES.includes(record.type)) {
    errors.push(`Invalid type: "${record.type}".`);
  }
  if (record.domain != null && !DECLARATION_DOMAINS.includes(record.domain)) {
    errors.push(`Invalid domain: "${record.domain}".`);
  }
  if (record.severity != null && !DECLARATION_SEVERITIES.includes(record.severity)) {
    errors.push(`Invalid severity: "${record.severity}".`);
  }
  if (record.status != null && !DECLARATION_STATUSES.includes(record.status)) {
    errors.push(`Invalid status: "${record.status}".`);
  }
  if (record.capaStatus != null && !DECLARATION_CAPA_STATUSES.includes(record.capaStatus)) {
    errors.push(`Invalid capaStatus: "${record.capaStatus}".`);
  }
  if (record.recipients != null && !Array.isArray(record.recipients)) {
    errors.push('recipients must be an array.');
  }
  if (record.evidence != null && !Array.isArray(record.evidence)) {
    errors.push('evidence must be an array.');
  }

  return { valid: errors.length === 0, errors };
}
