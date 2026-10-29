// ═══════════════════════════════════════════════════════════
// Organization directory — Phase: org-scoped roles.
//
// A hospital/clinic/centre médical is an ORGANIZATION, not a single
// login. Several employees can belong to the same organization while
// holding different professional roles. This file is the
// (frontend-only, demo) stand-in for what a real backend would return
// for "which roles/departments exist at this organization" — exactly
// like declarationService.js's DEMO data, this is NOT an
// authorization boundary; a backend will be the real authority later.
//
// CRITICAL RULE from the spec: role availability is configurable PER
// ORGANIZATION, not fixed per organization TYPE. Two hospitals could
// expose different role sets. `availableRoles` is therefore a property
// of each organization record below, not derived from `type`.
//
// ── Role/Organization/Department refactor ────────────────────────
// Organization TYPE and organization INSTANCE are two different
// things (see ORG_TYPES vs ORGANIZATIONS below) — never conflate
// `type: 'hospital'` (a category) with `id: 'chu-alger'` (one actual
// organization of that category). A user account references an
// organization INSTANCE only, via `organizationId` — never `type`
// directly (see AuthContext.jsx).
// ═══════════════════════════════════════════════════════════
import { ALL_ROLE_IDS } from './permissions';

// The 5 organization types this app's business model supports. This
// is the TYPE catalog only — no user, role, or permission is ever
// keyed off these strings; they exist purely to classify
// ORGANIZATIONS entries and describe "which kind of organization" an
// account belongs to. (There is no public signup flow — accounts are
// provisioned via the existing demo/test account mechanism — but the
// type catalog remains part of the account/data model regardless.)
export const ORG_TYPES = {
  hospital: { id: 'hospital', label: 'Hôpital' },
  clinic: { id: 'clinic', label: 'Clinique' },
  laboratory: { id: 'laboratory', label: 'Laboratoire' },
  medical_centre: { id: 'medical_centre', label: 'Centre médical' },
  pharmacy: { id: 'pharmacy', label: 'Pharmacie' },
};

// The full catalog of professional roles VigiCore's frontend currently
// supports inside an institutional organization. 'doctor' / 'pharmacist'
// / 'laboratory_staff' reuse the exact same portals as the standalone
// Doctor/Pharmacien/Labo accounts (see navConfig.js) — no duplicate
// pages are created for "the same role, but at an org" per requirement
// "Reuse the existing components and pages wherever possible."
export const ORG_ROLE_CATALOG = ['doctor', 'pharmacist', 'laboratory_staff', 'medical_staff', 'vigilance_responsible', 'administrator'];

// Fail loud if this list ever drifts from permissions.js's canonical
// role model (e.g. a typo, or an old-role name slipping back in) —
// same "one source of truth, checked, not just documented" rule as
// permissions.js's own ALL_ROLE_IDS/BASE_PERMISSIONS check.
for (const r of ORG_ROLE_CATALOG) {
  if (!ALL_ROLE_IDS.includes(r)) {
    throw new Error(`organizations.js: ORG_ROLE_CATALOG contains "${r}", which is not a role in permissions.js's ALL_ROLE_IDS.`);
  }
}

// Department catalog per organization. Names below are NOT invented
// for this refactor — they're the exact department lists that were
// already displayed, as static text, on each organization's own
// Paramètres page before this change (HospParametres.jsx,
// ClinParametres.jsx, CmParametres.jsx — "N services enregistrés —
// ..."). This refactor turns that previously-static, page-local text
// into the real, shared department data source those pages (and the
// new signup flow's department step) both now read from — same
// "don't invent, don't duplicate" rule as every other data fix in
// this project.
function depts(names) {
  return names.map((name) => ({ id: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), name }));
}

export const ORGANIZATIONS = {
  'chu-alger': {
    id: 'chu-alger',
    name: 'CHU Alger',
    type: 'hospital',
    // Hospital: the largest org — every role the frontend supports.
    availableRoles: ['doctor', 'pharmacist', 'laboratory_staff', 'medical_staff', 'vigilance_responsible', 'administrator'],
    departments: depts(['Urgences', 'Chirurgie', 'Cardiologie', 'Oncologie', 'Pharmacie hospitalière', 'Laboratoire', 'Bloc opératoire']),
  },
  'clinique-el-fedjr': {
    id: 'clinique-el-fedjr',
    name: 'Clinique El Fedjr',
    type: 'clinic',
    // Clinique: no in-house laboratory role.
    availableRoles: ['doctor', 'pharmacist', 'vigilance_responsible', 'administrator'],
    departments: depts(['Médecine générale', 'Chirurgie', 'Maternité', 'Radiologie']),
  },
  'centre-setif': {
    id: 'centre-setif',
    name: 'Centre Médical Sétif',
    type: 'medical_centre',
    // Small centre médical: no pharmacien, no labo — demonstrates that
    // role availability must not be forced to match the biggest org.
    availableRoles: ['doctor', 'vigilance_responsible', 'administrator'],
    departments: depts(['Médecine générale', 'Pédiatrie', 'Gynécologie', 'Dentaire', 'Imagerie', 'Analyses', 'Vaccination']),
  },
};

// Fail loud if any organization's availableRoles lists a role outside
// the shared ORG_ROLE_CATALOG (e.g. 'patient' or 'auditor', which are
// never organization-employed roles — see catalog comment above).
for (const org of Object.values(ORGANIZATIONS)) {
  for (const r of org.availableRoles) {
    if (!ORG_ROLE_CATALOG.includes(r)) {
      throw new Error(`organizations.js: "${org.id}".availableRoles contains "${r}", which is not in ORG_ROLE_CATALOG.`);
    }
  }
}

// Real establishments (from the site's backend session) are not in the demo
// table above. AuthContext registers the user's own establishment here at
// sign-in so every page that looks an organization up by id (getOrganization,
// isRoleAllowedForOrganization, AdminDashboard...) keeps working unchanged.
export function registerOrganization({ id, name, type }) {
  if (!id || ORGANIZATIONS[id]) return ORGANIZATIONS[id] || null;
  ORGANIZATIONS[id] = { id, name, type, availableRoles: [...ORG_ROLE_CATALOG], departments: [] };
  return ORGANIZATIONS[id];
}

export function getOrganization(orgId) {
  return ORGANIZATIONS[orgId] || null;
}

// Department options must come from the SELECTED organization only —
// never a global department list — so a signup form (or any other
// picker) can never offer a department that belongs to a different
// organization (role/org/department refactor §5, Step 3).
export function getDepartmentsForOrganization(orgId) {
  return getOrganization(orgId)?.departments ?? [];
}

// ── Enforcement, not just data ──────────────────────────────────────
// `availableRoles` above only describes what's ALLOWED. Nothing
// previously checked a given (role, orgId) pair AGAINST it, so a
// misconfigured account (e.g. a 'pharmacist' at 'centre-setif', which
// has no pharmacist seat) would silently "work" in the frontend. This
// is that missing check.
//
// `role` here is always the clean business role — see permissions.js's
// getBaseRole header (role/org/department refactor: `role` never
// carries an org-type prefix any more, so there is nothing left to
// strip before this check runs).
export function isRoleAllowedForOrganization(role, orgId) {
  const org = getOrganization(orgId);
  if (!org || !role) return false;
  return org.availableRoles.includes(role);
}

// ── Generic organization-ownership visibility rule ──────────────────
// Shared by declarationService.js and every page that renders an
// organization-owned record (declarations, patients, …). ONE rule,
// used everywhere a record needs to be checked against "can the
// current user see this?", so a Blocker-1/2-style fix can never
// silently diverge between the mock service and a page's own
// filtering logic (see audit §4/§5 — "two competing sources of
// truth").
//
// Rule:
//  - No logged-in user -> same treatment as a standalone user: only
//    unscoped (organizationId == null) records are visible. This
//    matters for pages rendered before/without a session (and for
//    unit tests that mount a page directly, without <AuthProvider> —
//    e.g. DoctorPatients.test.jsx) — they fall back to exactly the
//    pre-existing single-tenant demo data, not to nothing and not to
//    everything. declarationService.js's mock list()/get() API
//    deliberately does NOT reuse this fallback for its own "no
//    session" case — it short-circuits to an empty list before ever
//    calling this function, since an async API pretending to be a
//    real backend should behave like one ("no session, no data") —
//    see that file's scopedRecords() for the explicit early return.
//  - Org-scoped user (user.organizationId set) -> only records whose
//    organizationId strictly equals the user's own. A record can
//    never be inferred to belong to an organization it wasn't
//    explicitly stamped with (no guessing from dept/type labels —
//    see doctorVigilance.js's addDrDeclaration).
//  - Standalone user (no organizationId) -> only records with NO
//    organizationId (organizationId == null) — this is exactly the
//    pre-existing, single-tenant seed/demo data, and also where any
//    legacy record that can't be reliably attributed to a specific
//    organization safely lands (never guessed into belonging to one).
//
// THIS IS NOT A SECURITY BOUNDARY — same caveat as
// declarationService.js's header: this is a frontend-only, mock
// convenience. A real backend must re-derive and enforce scope
// server-side from an authenticated session on every request.
export function isOrgScopedRecordVisible(record, user) {
  const organizationId = user?.organizationId ?? null;
  return organizationId
    ? record.organizationId === organizationId
    : record.organizationId == null;
}

