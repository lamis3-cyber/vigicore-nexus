/**
 * Who is tied to a service and who works for the whole establishment (lib/scope.ts + allow()).
 * Pure logic: no Prisma, no HTTP.
 */
import { describe, it, expect } from 'vitest';
import { allow } from '../src/auth';
import type { RequesterContext, ScopedRecord, Role } from '../src/auth/types';
import { canHaveDepartment, effectiveDepartmentId, hasEstablishmentWideScope } from '../src/lib/scope';

const HOSP = 'hosp-1';
const OTHER = 'hosp-2';
const record = (departmentId: string | null, establishmentId = HOSP, authorUserId = 'someone-else'): ScopedRecord => ({
  id: 'r1', domain: 'MATERIOVIGILANCE', authorUserId, establishmentId, departmentId,
});
// Same construction as requesterOf() in nativeRecords.routes.ts.
const ctx = (role: Role, storedDepartmentId: string | null, est = HOSP): RequesterContext => ({
  userId: `u-${role}`, role, activeEstablishmentId: est, affiliatedEstablishmentIds: [est],
  departmentId: effectiveDepartmentId(role, storedDepartmentId),
  hasEstablishmentWideScope: hasEstablishmentWideScope(role),
  permissionGrants: [],
});

describe('scope rules', () => {
  it('only doctors and medical staff can be attached to a service', () => {
    expect(['DOCTOR', 'HOSPITAL'].every(canHaveDepartment)).toBe(true);
    for (const r of ['PHARMACIEN', 'LABO', 'VIGILANCE_REVIEWER', 'ORG_ADMIN', 'PATIENT', 'ESTABLISHMENT_ADMIN']) {
      expect(canHaveDepartment(r)).toBe(false);
    }
  });
  it('pharmacy, laboratory, vigilance and admin are establishment-wide; doctors and medical staff are not', () => {
    for (const r of ['PHARMACIEN', 'LABO', 'VIGILANCE_REVIEWER', 'ORG_ADMIN']) expect(hasEstablishmentWideScope(r)).toBe(true);
    for (const r of ['DOCTOR', 'HOSPITAL', 'PATIENT', 'ESTABLISHMENT_ADMIN']) expect(hasEstablishmentWideScope(r)).toBe(false);
  });
  it('a service stored on a pharmacist / lab membership (legacy data) is ignored', () => {
    expect(effectiveDepartmentId('PHARMACIEN', 'dep-A')).toBeNull();
    expect(effectiveDepartmentId('LABO', 'dep-A')).toBeNull();
    expect(effectiveDepartmentId('DOCTOR', 'dep-A')).toBe('dep-A');
    expect(effectiveDepartmentId('DOCTOR', undefined)).toBeNull();
  });
});

describe('allow(): service filter per role', () => {
  it('a doctor of service A reads service A, not service B', () => {
    const doc = ctx('DOCTOR', 'dep-A');
    expect(allow(doc, 'VIEW', record('dep-A'))).toBe(true);
    expect(allow(doc, 'VIEW', record('dep-B'))).toBe(false);
  });
  it('medical staff of service A reads service A, not service B', () => {
    const nurse = ctx('HOSPITAL', 'dep-A');
    expect(allow(nurse, 'VIEW', record('dep-A'))).toBe(true);
    expect(allow(nurse, 'VIEW', record('dep-B'))).toBe(false);
  });
  it('the hospital pharmacist and lab technician reach every service of THEIR hospital, even with a stale service stored', () => {
    for (const role of ['PHARMACIEN', 'LABO'] as Role[]) {
      const c = ctx(role, 'dep-A');
      expect(c.departmentId).toBeNull();
      expect(allow(c, 'VIEW', record('dep-A'))).toBe(true);
      expect(allow(c, 'VIEW', record('dep-B'))).toBe(true);
      expect(allow(c, 'VIEW', record(null))).toBe(true);
    }
  });
  it('…but never another establishment', () => {
    for (const role of ['PHARMACIEN', 'LABO', 'VIGILANCE_REVIEWER', 'ORG_ADMIN'] as Role[]) {
      expect(allow(ctx(role, null), 'VIEW', record('dep-A', OTHER))).toBe(false);
    }
  });
  it('a doctor without a service only sees records that belong to no service', () => {
    const doc = ctx('DOCTOR', null);
    expect(allow(doc, 'VIEW', record(null))).toBe(true);
    expect(allow(doc, 'VIEW', record('dep-A'))).toBe(false);
  });
  it('the admin follows (VIEW) every service of their own establishment but cannot review or close', () => {
    const admin = ctx('ORG_ADMIN', null);
    expect(allow(admin, 'VIEW', record('dep-B'))).toBe(true);
    expect(allow(admin, 'REVIEW', record('dep-B'))).toBe(false);
    expect(allow(admin, 'CLOSE', record('dep-B'))).toBe(false);
  });
});
