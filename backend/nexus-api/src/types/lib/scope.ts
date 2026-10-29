/**
 * Scope rules: WHO is tied to a service (department) and WHO works for the whole establishment.
 *
 *  - DOCTOR, HOSPITAL (medical staff / nurses)  -> belong to ONE service of their hospital, clinic or
 *    medical centre. Department is a default filter for them (Decision 3).
 *  - PHARMACIEN, LABO                            -> the pharmacy and the laboratory of a hospital serve the
 *    WHOLE hospital. They are never attached to a service, and they reach every service of
 *    THEIR OWN establishment (never another one).
 *  - VIGILANCE_REVIEWER, ORG_ADMIN               -> establishment-wide as well, never tied to a service.
 *  - PATIENT, ESTABLISHMENT_ADMIN, FOURNISSEUR   -> no service at all.
 *
 * Pure functions, no Prisma / Express dependency, so they can be unit-tested in isolation.
 */

/** Roles that can be attached to a service. */
export const DEPARTMENT_ROLES: ReadonlySet<string> = new Set(['DOCTOR', 'HOSPITAL']);

/** Roles that reach every service of their own establishment. */
export const ESTABLISHMENT_WIDE_ROLES: ReadonlySet<string> = new Set([
  'VIGILANCE_REVIEWER',
  'ORG_ADMIN',
  'PHARMACIEN',
  'LABO',
]);

export const canHaveDepartment = (role: string): boolean => DEPARTMENT_ROLES.has(role);

export const hasEstablishmentWideScope = (role: string): boolean => ESTABLISHMENT_WIDE_ROLES.has(role);

/**
 * The service this account really acts for. A department stored on the membership of a role that cannot
 * have one (legacy / seeded data) is ignored: pharmacy and laboratory staff never carry a service.
 */
export const effectiveDepartmentId = (role: string, departmentId: string | null | undefined): string | null =>
  canHaveDepartment(role) ? departmentId ?? null : null;
