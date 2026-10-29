import { ActionType, PermissionGrant, RequesterContext, ScopedRecord } from './types';
import { rolePermits } from './rolePermissions';

/**
 * allow() — the single authorization entry point for Phase 1 and every
 * future phase. This is the ONLY place scope decisions are made; wizard
 * configuration, dashboard queries, and any future API surface must call
 * through this function rather than re-implementing scope logic locally
 * (Correction #7/#8: configuration is never the security layer).
 *
 * Implements the corrected rule:
 *
 *   role_permits AND action_permitted_for_role AND scope_established AND
 *   org_department_boundary_ok
 *
 * -- A note on how the last two clauses are actually composed --
 *
 * The correction explicitly rejected a bare OR of scope paths
 * (`owner OR assigned OR establishment OR grant`) because that would let
 * ANY one path satisfy access without an org/department boundary check
 * riding along with it. But a literal separate global check — "is scope
 * established?" then, independently, "is the org/department boundary ok?"
 * — is ambiguous for ownership: a Patient must always be able to reach
 * their OWN Declaration even when it lives in the reserved central-queue
 * Establishment they have no affiliation with (Decision 5), so a boundary
 * check that ignores *why* access is being claimed would either wrongly
 * block owners or wrongly require a boundary rule with a special-cased
 * "unless you're the owner" exception bolted on.
 *
 * This implementation resolves that by giving EACH scope path its own
 * self-contained boundary condition, then combining paths with OR at the
 * top level:
 *
 *   - ownership       -> always satisfies its own boundary (you own it)
 *   - assignment       -> additionally requires the assignee's own
 *                          establishment affiliation to include the
 *                          record's establishment (defense in depth: an
 *                          assignment should never itself originate
 *                          cross-establishment access)
 *   - establishment    -> requires department_scope_ok (Decision 3: default
 *                          filter, not hard isolation) on top of the
 *                          establishment match
 *   - explicit grant    -> requires the GRANT's own establishmentId/
 *                          departmentId (not the requester's session
 *                          establishment) to match the record, exactly
 *                          satisfying Correction #2: "an explicit
 *                          permission must not automatically allow
 *                          cross-establishment access unless the
 *                          permission itself explicitly grants that scope"
 *
 * No path grants access on role+action alone — every disjunct is itself a
 * conjunction of (applicability AND boundary). This is what keeps the rule
 * from degrading back into the rejected OR-model: nothing is a bare
 * unguarded alternative.
 */
export function allow(
  requester: RequesterContext,
  action: ActionType,
  record: ScopedRecord
): boolean {
  if (!rolePermits(requester.role, action)) return false;

  return (
    ownerPathOk(requester, record) ||
    assignedPathOk(requester, record) ||
    establishmentPathOk(requester, record) ||
    grantPathOk(requester, action, record)
  );
}

function ownerPathOk(requester: RequesterContext, record: ScopedRecord): boolean {
  return requester.userId === record.authorUserId;
}

function assignedPathOk(requester: RequesterContext, record: ScopedRecord): boolean {
  if (!record.assignedReviewerId || record.assignedReviewerId !== requester.userId) {
    return false;
  }
  // Defense in depth: an assignment should never itself be the origin of
  // cross-establishment access — the assignee must also be affiliated with
  // the record's establishment.
  return requester.affiliatedEstablishmentIds.includes(record.establishmentId);
}

function establishmentPathOk(requester: RequesterContext, record: ScopedRecord): boolean {
  if (!requester.affiliatedEstablishmentIds.includes(record.establishmentId)) {
    return false;
  }
  return departmentScopeOk(requester, record);
}

/**
 * Decision 3: department is a default scope/filter, not hard isolation.
 * Establishment-wide roles (e.g. Establishment Admin acting within their own
 * establishment — though note ESTABLISHMENT_ADMIN currently has an empty
 * action set per rolePermissions.ts, so this branch is future-facing) or
 * users explicitly flagged hasEstablishmentWideScope can cross departments
 * WITHIN their own establishment. Everyone else defaults to matching
 * department, but a record with no department (departmentId null — e.g.
 * non-hospital establishment types) is not department-restricted at all.
 */
function departmentScopeOk(requester: RequesterContext, record: ScopedRecord): boolean {
  if (requester.hasEstablishmentWideScope) return true;
  if (!record.departmentId) return true;
  return requester.departmentId === record.departmentId;
}

function grantPathOk(
  requester: RequesterContext,
  action: ActionType,
  record: ScopedRecord
): boolean {
  const now = requester.now ?? new Date();
  return requester.permissionGrants.some((grant) => grantCoversRecord(grant, action, record, now));
}

function grantCoversRecord(
  grant: PermissionGrant,
  action: ActionType,
  record: ScopedRecord,
  now: Date
): boolean {
  if (grant.action !== action) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  // The grant's OWN establishmentId is the boundary — never the requester's
  // session establishment. This is the direct fix for Correction #2.
  if (grant.establishmentId !== record.establishmentId) return false;
  if (grant.departmentId && grant.departmentId !== record.departmentId) return false;
  // If the grant is resource-scoped, it must name this exact record.
  if (grant.resourceId && grant.resourceId !== record.id) return false;
  return true;
}
