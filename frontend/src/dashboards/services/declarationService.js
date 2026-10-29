// ═══════════════════════════════════════════════════════════════
// PHASE A — declarationService: an API-SHAPED, MOCK service.
//
// ┌──────────────────────────────────────────────────────────────┐
// │  THIS IS NOT A SECURITY BOUNDARY.                             │
// │  The scoping below is a development convenience that mimics    │
// │  what a real backend response would look like. It is           │
// │  trivially bypassable (it's client-side JS). Real authorization│
// │  must be enforced by a backend that derives scope from an      │
// │  authenticated session on every request. See the architecture  │
// │  discussion, Concern 3.                                        │
// └──────────────────────────────────────────────────────────────┘
//
// Why this file exists in Phase A at all: so every future caller
// (wizard, dashboards, declarations lists — none of which are wired
// to this yet) can be written against the SAME interface a real API
// will eventually expose: no userId/role/organizationId parameters,
// because a real client never supplies its own scope — it's derived
// server-side from the auth token on every request. Swapping this
// mock for real fetch() calls later should require changing only
// this file, not any caller.
//
// Data isolation for this file specifically:
//  - Every read (list()/get()) rebuilds the canonical view FRESH from
//    the CURRENT contents of DR_DECLARATIONS/LAB_DECLARATIONS (see
//    buildCanonicalStore below) — this is a live view, not a one-time
//    snapshot. Earlier Phase A drafts snapshotted those arrays once at
//    module load, which meant a wizard unshifting a new legacy
//    declaration was invisible to this service; that gap is closed.
//  - create() appends to a separate, service-owned list
//    (_createdRecords) rather than to the legacy arrays.
//  - updateStatus() mutates _createdRecords in place for
//    service-created records, and records a status override
//    (_statusOverrides) for legacy-derived ones, since those are
//    recomputed from the legacy arrays on every read and would
//    otherwise silently lose the change on the next call.
//  - Nothing here modifies DR_DECLARATIONS, LAB_DECLARATIONS, or any
//    existing *Declarer.jsx page. Those keep working exactly as
//    before, untouched, reading/writing the legacy arrays directly —
//    this service just now also *reads* their current state live.
// ═══════════════════════════════════════════════════════════════

import { DR_DECLARATIONS } from '../data/doctorVigilance';
import { LAB_DECLARATIONS } from '../data/laboVigilance';
import { mapDrDeclarationToCanonical, mapLabDeclarationToCanonical } from '../domain/declarationMappers';
import { createDeclaration, validateDeclaration } from '../domain/declaration';
import { getCurrentAuthUser } from '../context/AuthContext';
import { getBaseRole } from '../config/permissions';
import { isOrgScopedRecordVisible } from '../config/organizations';

// Records created directly through this service. These never exist in
// DR_DECLARATIONS/LAB_DECLARATIONS, so — unlike legacy-derived
// records — they can just be mutated in place.
let _createdRecords = [];

// id -> { status, updatedAt } for legacy-derived records whose status
// was changed via updateStatus(). Legacy records are re-derived from
// the legacy arrays on every read (see buildCanonicalStore), so this
// override map is what makes a status change durable without this
// service reaching back into DR_DECLARATIONS/LAB_DECLARATIONS to
// mutate them.
let _statusOverrides = new Map();

function buildCanonicalStore() {
  const legacy = [
    ...DR_DECLARATIONS.map(mapDrDeclarationToCanonical),
    ...LAB_DECLARATIONS.map(mapLabDeclarationToCanonical),
  ].map((d) => {
    const override = _statusOverrides.get(d.id);
    return override ? { ...d, status: override.status, updatedAt: override.updatedAt } : d;
  });
  return [..._createdRecords, ...legacy];
}

/**
 * Mock "scope" resolution — DEVELOPMENT ONLY, see file header.
 *
 * Filters the canonical store down to what the current demo user
 * "should" see, using the ONE shared org-ownership rule
 * (isOrgScopedRecordVisible, config/organizations.js) that every
 * org-scoped page in the app now also filters its own reads with —
 * see doctorVigilance.js/laboVigilance.js (creation stamping) and
 * the Declarations/Patients pages (read-side filtering). Keeping this
 * as one function used everywhere is the fix for audit §4/§5's "two
 * competing sources of truth": the mock service and the live pages
 * can no longer silently disagree about who can see what.
 *
 * NOTE — this used to ALSO filter by authoredByRole (only a doctor
 * could see doctor-authored records, etc.). That never matched actual
 * application behavior: e.g. a Hospital's "Vigilance Qualité" account
 * is expected to see every declaration authored within their
 * organization (by doctors, pharmaciens, laborantins — any role at
 * that org), not just declarations authored by other qualité
 * accounts. Tracing HospDeclarations.jsx / ClinDeclarations.jsx /
 * CmDeclarations.jsx confirmed this org-wide-visibility model is what
 * the app already relies on, so the role filter was dropped —
 * keeping it would have made this service actively wrong for the
 * very pages it now needs to stay consistent with.
 *
 * If no user is logged in (or getCurrentAuthUser() returns null,
 * e.g. in a unit test that doesn't render <AuthProvider>), returns an
 * empty list rather than everything — "no session, no data" is the
 * only side of this mock worth keeping honest, since silently
 * returning all records would misrepresent what a real API does.
 */
function scopedRecords() {
  const user = getCurrentAuthUser();
  if (!user) return [];
  return buildCanonicalStore().filter((d) => isOrgScopedRecordVisible(d, user));
}

/**
 * List declarations visible to the current (mock) session.
 * @param {{status?: string, severity?: string}} [filters] - domain-level
 *   filters only. Never accepts userId/role/organizationId/permissions —
 *   those are implicit, exactly as they would be for a real API call.
 */
export async function list(filters = {}) {
  let records = scopedRecords();
  if (filters.status) records = records.filter((d) => d.status === filters.status);
  if (filters.severity) records = records.filter((d) => d.severity === filters.severity);
  return records;
}

/**
 * Get a single declaration by id, scoped to the current session.
 * Returns null if the id doesn't exist OR exists but is out of scope
 * — deliberately not distinguishing the two (mirrors the "404, not
 * 403" guidance from the API boundary design, so an out-of-scope id
 * can't be used to confirm a record's existence).
 */
export async function get(id) {
  return scopedRecords().find((d) => d.id === id) ?? null;
}

/**
 * Global, UNSCOPED read of the canonical declaration store — for the
 * Auditor role ('auditor') ONLY.
 *
 * Auditor is a platform/system-level, cross-organization role (see
 * permissions.js: 'declaration:view' + 'audit:view', and
 * AuthContext.jsx: an auditor seat is never given an orgId). Unlike
 * every other reader of this file, which goes through scopedRecords()
 * and is therefore filtered to one organization (or to unscoped
 * legacy data) via isOrgScopedRecordVisible(), Auditor must be able
 * to inspect declarations across every organization at once — that
 * is the entire point of the role.
 *
 * This deliberately does NOT call scopedRecords() / does NOT apply
 * isOrgScopedRecordVisible() — doing so would incorrectly collapse
 * Auditor down to "no organization" (i.e. only unscoped legacy
 * records), the same trap this function exists to avoid. It reuses
 * the exact same canonical store every other export in this file
 * reads from (buildCanonicalStore) — no second/duplicate declaration
 * store is created for Auditor.
 *
 * Read-only, like list()/get() above: callers get data back, never a
 * way to mutate the store. NOT a security boundary — same caveat as
 * the rest of this file: a real backend must derive and enforce
 * "which role may see which scope" server-side, from an authenticated
 * session, not from which frontend function happens to get called.
 */
export async function listAllForAudit() {
  return buildCanonicalStore();
}

/**
 * Create a new declaration.
 * @param {object} payload - domain fields only (product, lot, severity,
 *   recipients, patientRef, clinicalDetail, etc.). authoredByUserId,
 *   organizationId, departmentId, and authoredByRole are NEVER read
 *   from payload, even if present — they're stamped from the current
 *   session (mock version: from getCurrentAuthUser()), matching the
 *   real API contract's rule that the client is never trusted to
 *   supply its own scope.
 *
 *   authoredByUserId and organizationId are now populated for real
 *   (from user.id / user.organizationId — see AuthContext.jsx), now
 *   that both exist on the session. departmentId stays null: that's
 *   still blocked on §0.2 (establishment- vs. department-level scope
 *   granularity hasn't been decided), which is a genuinely open
 *   product question, not a missing plumbing detail like the other
 *   two were.
 */
export async function create(payload) {
  const user = getCurrentAuthUser();
  const {
    authoredByUserId: _ignoredUserId,
    authoredByRole: _ignoredRole,
    organizationId: _ignoredOrgId,
    departmentId: _ignoredDeptId,
    ...domainFields
  } = payload || {};

  const record = createDeclaration({
    ...domainFields,
    authoredByUserId: user?.id ?? null,
    authoredByRole: user ? getBaseRole(user.role) : null,
    organizationId: user?.organizationId ?? null,
    departmentId: null, // TBD — still blocked on §0.2, see above
  });

  const { valid, errors } = validateDeclaration(record);
  if (!valid) {
    throw new Error('declarationService.create: invalid record — ' + errors.join(' '));
  }

  _createdRecords = [record, ..._createdRecords];
  return record;
}

