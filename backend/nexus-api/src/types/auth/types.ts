/**
 * Types for the Phase 1 authorization layer.
 *
 * Deliberately framework/transport-agnostic: this module does not know
 * about HTTP, sessions, or Express. Wiring it into an actual API (reading
 * a session, building a RequesterContext, calling allow() before a route
 * handler runs) is Phase 2/3 scope. Phase 1 delivers the decision logic
 * itself, fully testable in isolation.
 */

export type Role =
  | 'PATIENT'
  | 'DOCTOR'
  | 'PHARMACIEN'
  | 'LABO'
  | 'HOSPITAL'
  | 'VIGILANCE_REVIEWER'
  | 'ESTABLISHMENT_ADMIN'
  | 'ORG_ADMIN'
  | 'FOURNISSEUR';

export type Domain =
  | 'MATERIOVIGILANCE'
  | 'PHARMACOVIGILANCE'
  | 'CHEMOVIGILANCE'
  | 'COSMETOVIGILANCE';

export type ActionType =
  | 'VIEW'
  | 'CREATE'
  | 'EDIT'
  | 'WITHDRAW'
  | 'REVIEW'
  | 'ESCALATE'
  | 'CLOSE';

/**
 * An explicit permission grant. establishmentId is REQUIRED — Correction #2:
 * a grant must name its own scope; it never implies cross-establishment
 * access simply by existing.
 */
export interface PermissionGrant {
  id: string;
  recipientUserId: string;
  action: ActionType;
  establishmentId: string;
  departmentId?: string | null;
  /** If set, this grant applies only to this specific record, not the
   * whole establishment/department scope for that action. */
  resourceId?: string | null;
  expiresAt?: Date | null;
}

/**
 * The authenticated requester's context, as it would be resolved from a
 * session in Phase 2. Modeled here so the authorization logic can be
 * tested without any real session/auth wiring existing yet.
 */
export interface RequesterContext {
  userId: string;
  role: Role;
  /** The user's currently active establishment context (Decision 4: schema
   * supports multiple affiliations, UI/session picks one active context). */
  activeEstablishmentId: string | null;
  /** All establishments this user is affiliated with (superset of
   * activeEstablishmentId). Used for establishment-scope checks that should
   * not be limited to only the currently-active context — e.g. a Reviewer
   * who is affiliated with two hospitals should be able to act on either. */
  affiliatedEstablishmentIds: string[];
  /** Department context, when applicable (Hospital/Clinique/Centre Médical
   * only). Null for roles/establishment types with no department concept. */
  departmentId: string | null;
  /** True for roles that get establishment-wide (cross-department) reach
   * within their own establishment by default — Decision 3: department is a
   * default filter, not hard isolation, and establishment-scoped roles can
   * see across departments within their own establishment. */
  hasEstablishmentWideScope: boolean;
  /** Explicit grants held by this user. */
  permissionGrants: PermissionGrant[];
  now?: Date; // injectable for deterministic grant-expiry tests
}

/**
 * The minimal shape of any record the authorization layer evaluates
 * (Declaration or Case). Kept generic rather than importing Prisma's
 * generated types directly, so this module has no build-time dependency on
 * a generated Prisma client (keeps allow.ts testable with plain fixtures).
 */
export interface ScopedRecord {
  id: string;
  domain: Domain;
  authorUserId: string;
  assignedReviewerId?: string | null;
  establishmentId: string;
  departmentId?: string | null;
}
