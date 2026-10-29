// ═══════════════════════════════════════════════════════════
// Permissions — derived from role, never chosen by the user.
//
// The frontend treats `permissions` as data that comes WITH the
// session (user → organization → role → permissions), the same way a
// real backend response would look. There is intentionally no setter
// anywhere in this codebase that lets a logged-in user change their
// own `role` or `permissions` — see AuthContext.jsx: `login()` is the
// only thing that ever assigns them, and it does so from the fixed
// DEMO_ACCOUNTS record, never from anything the UI lets the user edit.
//
// ── Role/Organization/Department refactor ────────────────────────
// `role` is now ALWAYS one of the 8 clean, normalized business roles
// below — it NEVER carries an organization type inside it (no more
// "hospital-qualite", "clinique-admin", etc.). Organization is a
// completely separate fact about the account (`organizationId` +
// `orgType`, see organizations.js), and so is department
// (`departmentId`). The same role means the same permission set
// everywhere, regardless of which organization (or no organization)
// the account belongs to — e.g. a 'vigilance_responsible' at CHU
// Alger and one at Clinique El Fedjr now share the exact same role
// string and this exact same permission set (see AuthContext.jsx's
// SEATS).
//
// A handful of existing pages (App.jsx, navConfig.js, Topbar.jsx)
// still need to pick between CHU/Clinique/Centre Médical's separately
// -coded dashboard implementations for 'vigilance_responsible' and
// 'administrator' — that is a pure UI-ROUTING concern, solved by
// navConfig.js's getPortalKey(user) (a derived, non-business key built
// from role + orgType), never by reintroducing an org suffix into
// `role` or into anything in this file. Nothing in this file, and no
// permission check anywhere in the app, should ever compare against a
// portal key — only against `role` and `permissions`.
// ═══════════════════════════════════════════════════════════

const BASE_PERMISSIONS = {
  patient: ['declaration:create', 'declaration:view_own'],
  doctor: ['declaration:create', 'declaration:view', 'patient:manage'],
  // F3 fix (Step 4 audit) — declaration:review added: PharmDeclarations.jsx
  // already ships the full decideDeclaration() workflow (identical shared
  // engine as DoctorDeclarations.jsx/HospDeclarations.jsx), and its own
  // header comment confirms the original app reuses that decide flow
  // verbatim across every professional role, Pharmacist included, with
  // no role check in its body. The permission was simply missing here —
  // this brings the declared permission set in line with the capability
  // the codebase already establishes as intended for this role.
  pharmacist: ['declaration:create', 'declaration:view', 'declaration:review', 'stock:manage', 'recall:manage'],
  // Used for both the standalone laboratory-organization account AND
  // an org-employed lab account (e.g. chu.laborantin@demo.dz) — both
  // carry role: 'laboratory_staff'.
  laboratory_staff: ['declaration:create', 'declaration:view', 'lab:manage', 'surveillance:manage'],
  // New role (role/org/department refactor) — internal healthcare
  // personnel (nurse, nursing assistant, medical assistant, etc.).
  // Per the refactor brief: a job title difference is NOT a
  // permission/authorization difference, so every job title under
  // this role shares this one permission set; distinguish job titles
  // via the separate `jobTitle` field on the account (AuthContext.jsx)
  // instead of inventing a role per title.
  medical_staff: ['declaration:create', 'declaration:view'],
  // Responsable Qualité / Vigilance — declaration review, vigilance,
  // CAPA, audit, scoped to their own organization (via
  // organizationId, never via the role string).
  vigilance_responsible: ['declaration:review', 'vigilance:manage', 'capa:manage', 'audit:view', 'alert:manage'],
  // New role (role/org/department refactor) — read-only oversight,
  // distinct from vigilance_responsible (which can act on records,
  // not just view them). No organization-specific auditor variant.
  auditor: ['declaration:view', 'audit:view'],
  // Organization Administrator — org management only, never clinical/
  // vigilance actions. Internal/system role — never self-service
  // (there is no public signup flow; accounts are provisioned via the
  // existing demo/test account mechanism — see AuthContext.jsx).
  //
  // 'org:manage_personnel' is intentionally RESERVED for the future
  // backend Personnel entity, not wired to anything in this frontend
  // today: no component reads or checks it (grep the repo — nothing
  // calls hasPermission() with this name), and HospPersonnel.jsx —
  // the only page an "org:manage_personnel"-sounding permission could
  // plausibly gate — is a read-only staff directory table with no
  // add/edit/remove controls, gated purely by portal key (App.jsx),
  // not by this permission. Recorded here explicitly rather than
  // building speculative add/edit/remove UI this pass has no real
  // backend to support.
  administrator: ['org:manage_personnel', 'org:manage_settings'],
  // Fournisseur / distributeur en gros (backend: FOURNISSEUR). Il ACHÈTE aux fabricants et peut déclarer un incident ;
  // il ne publie pas de fiches produits. Reflète la table du serveur (CREATE + VIEW de ses propres déclarations) : ce
  // fichier ne sert qu'à l'affichage, c'est l'API qui décide vraiment.
  supplier: ['declaration:create', 'declaration:view_own'],
};

// ── Canonical role model — the ONE source of truth for which role
// strings exist and how they're grouped (role/org/department refactor,
// step: "correct roles & login logic only") ──────────────────────────
// PUBLIC_ROLE_IDS — the 5 professional/patient roles. There is no
// public signup flow (login is the sole entry point — accounts are
// provisioned via the existing demo/test account mechanism), so this
// grouping is now purely a data-model classification rather than a
// UI role-picker source — but it stays authoritative: no other file
// should hardcode its own copy of "the 5 roles" — import from here
// instead.
//
// SYSTEM_ROLE_IDS — vigilance_responsible, auditor, administrator.
// These are real, functioning roles (they have permissions, seats,
// dashboards — see AuthContext.jsx / navConfig.js) but they are
// INTERNAL/SYSTEM roles: granted by an organization (or, later, by a
// real backend/admin flow), never chosen by a person signing up on
// their own. They intentionally stay OUT of PUBLIC_ROLE_IDS.
export const PUBLIC_ROLE_IDS = Object.freeze([
  'patient',
  'doctor',
  'pharmacist',
  'laboratory_staff',
  'medical_staff',
]);

export const SYSTEM_ROLE_IDS = Object.freeze([
  'vigilance_responsible',
  'auditor',
  'administrator',
]);

// BUSINESS_ROLE_IDS — compte d'entreprise commerciale (self-service, mais ni patient/professionnel de santé ni rôle
// interne) : le fournisseur / distributeur. Inscrit via « Vendeur > Fournisseur ».
export const BUSINESS_ROLE_IDS = Object.freeze([
  'supplier',
]);

export const ALL_ROLE_IDS = Object.freeze([...PUBLIC_ROLE_IDS, ...SYSTEM_ROLE_IDS, ...BUSINESS_ROLE_IDS]);

// Fail loud, not silent: BASE_PERMISSIONS above and ALL_ROLE_IDS must
// describe the exact same set of roles. If a role is ever added to one
// without the other, that's exactly the "contradictory role
// definition" this refactor is meant to eliminate — catch it at module
// load instead of letting it drift unnoticed.
{
  const permissionRoles = new Set(Object.keys(BASE_PERMISSIONS));
  const canonicalRoles = new Set(ALL_ROLE_IDS);
  for (const r of permissionRoles) {
    if (!canonicalRoles.has(r)) {
      throw new Error(`permissions.js: role "${r}" has permissions defined but is not listed in PUBLIC_ROLE_IDS/SYSTEM_ROLE_IDS.`);
    }
  }
  for (const r of canonicalRoles) {
    if (!permissionRoles.has(r)) {
      throw new Error(`permissions.js: role "${r}" is listed in PUBLIC_ROLE_IDS/SYSTEM_ROLE_IDS but has no BASE_PERMISSIONS entry.`);
    }
  }
}

export function getPermissionsForRole(role) {
  return BASE_PERMISSIONS[role] || [];
}

// Kept for backward compatibility: some call sites (declarationService.js,
// doctorVigilance.js's addDrDeclaration) still call getBaseRole(user.role)
// to stamp a declaration's authoredByRole with "the clean business
// role, never a UI-routing string". Since `role` is now ALREADY always
// the clean business role (no org suffix ever gets added to it — see
// header above), this is now an identity function; it is kept, rather
// than replacing every call site with a plain `user.role` read, so
// none of those call sites needed to change as part of this refactor.
export function getBaseRole(role) {
  return role || null;
}

