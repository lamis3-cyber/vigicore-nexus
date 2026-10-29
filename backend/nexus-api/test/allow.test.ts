import { describe, it, expect } from 'vitest';
import { allow } from '../src/auth/allow';
import { RequesterContext, ScopedRecord, PermissionGrant } from '../src/auth/types';

const ESTABLISHMENT_A = 'est_hospital_a';
const ESTABLISHMENT_B = 'est_hospital_b';
const DEPT_CARDIO = 'dept_cardio';
const DEPT_PHARMACY = 'dept_pharmacy';

function baseRequester(overrides: Partial<RequesterContext> = {}): RequesterContext {
  return {
    userId: 'user_requester',
    role: 'DOCTOR',
    activeEstablishmentId: ESTABLISHMENT_A,
    affiliatedEstablishmentIds: [ESTABLISHMENT_A],
    departmentId: DEPT_CARDIO,
    hasEstablishmentWideScope: false,
    permissionGrants: [],
    now: new Date('2026-08-10T00:00:00Z'),
    ...overrides,
  };
}

function baseRecord(overrides: Partial<ScopedRecord> = {}): ScopedRecord {
  return {
    id: 'decl_1',
    domain: 'PHARMACOVIGILANCE',
    authorUserId: 'user_author',
    assignedReviewerId: null,
    establishmentId: ESTABLISHMENT_A,
    departmentId: DEPT_CARDIO,
    ...overrides,
  };
}

describe('rolePermits gate (action_permitted_for_role)', () => {
  it('denies an action the role is never permitted regardless of scope', () => {
    const requester = baseRequester({ role: 'PATIENT', userId: 'user_author' });
    const record = baseRecord({ authorUserId: 'user_author' });
    // PATIENT is not permitted REVIEW under any circumstance, even as owner.
    expect(allow(requester, 'REVIEW', record)).toBe(false);
  });

  it('ESTABLISHMENT_ADMIN has no clinical content access by default (Decision 1)', () => {
    const requester = baseRequester({
      role: 'ESTABLISHMENT_ADMIN',
      userId: 'user_author',
    });
    const record = baseRecord({ authorUserId: 'user_author' });
    expect(allow(requester, 'VIEW', record)).toBe(false);
  });
});

describe('ownership path', () => {
  it('allows the author to VIEW their own declaration regardless of establishment affiliation', () => {
    // Patient owns a declaration filed in the reserved central-queue
    // establishment (Decision 5) — they are NOT affiliated with it, but
    // must still be able to see their own submission.
    const requester = baseRequester({
      role: 'PATIENT',
      userId: 'user_patient',
      affiliatedEstablishmentIds: [], // no affiliation at all
      departmentId: null,
    });
    const record = baseRecord({
      authorUserId: 'user_patient',
      establishmentId: 'est_reserved_central_queue',
      departmentId: null,
    });
    expect(allow(requester, 'VIEW', record)).toBe(true);
  });

  it('allows the author to WITHDRAW their own declaration', () => {
    const requester = baseRequester({ role: 'DOCTOR', userId: 'user_author' });
    const record = baseRecord({ authorUserId: 'user_author' });
    expect(allow(requester, 'WITHDRAW', record)).toBe(true);
  });
});

describe('assignment path', () => {
  it('allows an assigned reviewer to REVIEW a record in their own establishment', () => {
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [ESTABLISHMENT_A],
    });
    const record = baseRecord({ assignedReviewerId: 'user_reviewer' });
    expect(allow(requester, 'REVIEW', record)).toBe(true);
  });

  it('denies an assigned reviewer if not affiliated with the record establishment (defense in depth)', () => {
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [ESTABLISHMENT_B], // different establishment
    });
    const record = baseRecord({ assignedReviewerId: 'user_reviewer', establishmentId: ESTABLISHMENT_A });
    expect(allow(requester, 'REVIEW', record)).toBe(false);
  });
});

describe('establishment-affiliation path + department scope (Decision 3)', () => {
  it('allows a same-department reviewer to VIEW an unassigned record in their establishment', () => {
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [ESTABLISHMENT_A],
      departmentId: DEPT_CARDIO,
    });
    const record = baseRecord({ departmentId: DEPT_CARDIO });
    expect(allow(requester, 'VIEW', record)).toBe(true);
  });

  it('denies a different-department reviewer by default (soft filter still applies without wide scope)', () => {
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [ESTABLISHMENT_A],
      departmentId: DEPT_PHARMACY,
      hasEstablishmentWideScope: false,
    });
    const record = baseRecord({ departmentId: DEPT_CARDIO });
    expect(allow(requester, 'VIEW', record)).toBe(false);
  });

  it('allows an establishment-wide-scoped user to cross departments within the SAME establishment', () => {
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [ESTABLISHMENT_A],
      departmentId: DEPT_PHARMACY,
      hasEstablishmentWideScope: true,
    });
    const record = baseRecord({ departmentId: DEPT_CARDIO, establishmentId: ESTABLISHMENT_A });
    expect(allow(requester, 'VIEW', record)).toBe(true);
  });

  it('denies establishment-affiliation access across DIFFERENT establishments even with wide scope', () => {
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [ESTABLISHMENT_A],
      hasEstablishmentWideScope: true,
    });
    const record = baseRecord({ establishmentId: ESTABLISHMENT_B });
    expect(allow(requester, 'VIEW', record)).toBe(false);
  });

  it('does not restrict by department when the record has no department (non-hospital establishment types)', () => {
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [ESTABLISHMENT_A],
      departmentId: null,
    });
    const record = baseRecord({ departmentId: null });
    expect(allow(requester, 'VIEW', record)).toBe(true);
  });
});

describe('explicit permission grant path — Correction #2 regression tests', () => {
  it('allows access when a grant explicitly names the matching establishment', () => {
    const grant: PermissionGrant = {
      id: 'grant_1',
      recipientUserId: 'user_reviewer',
      action: 'VIEW',
      establishmentId: ESTABLISHMENT_A,
    };
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [], // deliberately NOT affiliated — grant alone must carry it
      permissionGrants: [grant],
    });
    const record = baseRecord({ establishmentId: ESTABLISHMENT_A, authorUserId: 'someone_else' });
    expect(allow(requester, 'VIEW', record)).toBe(true);
  });

  it('THE CRITICAL FIX: a grant for establishment A must NOT allow access to establishment B', () => {
    const grant: PermissionGrant = {
      id: 'grant_1',
      recipientUserId: 'user_reviewer',
      action: 'VIEW',
      establishmentId: ESTABLISHMENT_A, // grant only names A
    };
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [],
      permissionGrants: [grant],
    });
    const record = baseRecord({ establishmentId: ESTABLISHMENT_B, authorUserId: 'someone_else' }); // record is in B
    expect(allow(requester, 'VIEW', record)).toBe(false);
  });

  it('a grant scoped to a specific resourceId does not cover a different record', () => {
    const grant: PermissionGrant = {
      id: 'grant_1',
      recipientUserId: 'user_reviewer',
      action: 'VIEW',
      establishmentId: ESTABLISHMENT_A,
      resourceId: 'decl_specific',
    };
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [],
      permissionGrants: [grant],
    });
    const otherRecord = baseRecord({ id: 'decl_other', establishmentId: ESTABLISHMENT_A, authorUserId: 'x' });
    expect(allow(requester, 'VIEW', otherRecord)).toBe(false);
  });

  it('an expired grant no longer authorizes access', () => {
    const grant: PermissionGrant = {
      id: 'grant_1',
      recipientUserId: 'user_reviewer',
      action: 'VIEW',
      establishmentId: ESTABLISHMENT_A,
      expiresAt: new Date('2026-01-01T00:00:00Z'), // before the fixed `now` in baseRequester
    };
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [],
      permissionGrants: [grant],
    });
    const record = baseRecord({ establishmentId: ESTABLISHMENT_A, authorUserId: 'x' });
    expect(allow(requester, 'VIEW', record)).toBe(false);
  });

  it('a department-scoped grant does not cover a different department in the same establishment', () => {
    const grant: PermissionGrant = {
      id: 'grant_1',
      recipientUserId: 'user_reviewer',
      action: 'VIEW',
      establishmentId: ESTABLISHMENT_A,
      departmentId: DEPT_PHARMACY,
    };
    const requester = baseRequester({
      role: 'VIGILANCE_REVIEWER',
      userId: 'user_reviewer',
      affiliatedEstablishmentIds: [],
      permissionGrants: [grant],
    });
    const record = baseRecord({ establishmentId: ESTABLISHMENT_A, departmentId: DEPT_CARDIO, authorUserId: 'x' });
    expect(allow(requester, 'VIEW', record)).toBe(false);
  });
});

describe('no scope path at all', () => {
  it('denies a user with no ownership, assignment, establishment affiliation, or grant', () => {
    const requester = baseRequester({
      role: 'DOCTOR',
      userId: 'user_stranger',
      affiliatedEstablishmentIds: [ESTABLISHMENT_B],
      permissionGrants: [],
    });
    const record = baseRecord({ authorUserId: 'someone_else', establishmentId: ESTABLISHMENT_A });
    expect(allow(requester, 'VIEW', record)).toBe(false);
  });
});
