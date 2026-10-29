import type { EstablishmentType } from '@prisma/client';

/**
 * Rules for "a professional works for / asks to join an organization".
 * Mirrors frontend/src/pages/login/constants.js (ORG_TYPES_BY_ROLE, PROFESSION_OPTIONS_BY_ROLE,
 * getDepartmentRule) but is ENFORCED HERE: the form is only a convenience, anybody can call the API directly.
 *
 * Pure functions (no Prisma / Express) so they are unit-tested in isolation.
 */

/** Roles that work inside organizations (schema Role names). */
export const WORKER_ROLES: ReadonlySet<string> = new Set(['DOCTOR', 'PHARMACIEN', 'LABO', 'HOSPITAL']);

/** Which kinds of establishment each worker role can belong to. */
export const ORG_TYPES_BY_ROLE: Readonly<Record<string, readonly EstablishmentType[]>> = {
  DOCTOR: ['HOSPITAL', 'CLINIQUE', 'CENTRE_MEDICAL'],
  PHARMACIEN: ['OFFICINE', 'HOSPITAL', 'CLINIQUE', 'CENTRE_MEDICAL'],
  LABO: ['LABORATOIRE', 'HOSPITAL', 'CLINIQUE', 'CENTRE_MEDICAL'],
  HOSPITAL: ['HOSPITAL', 'CLINIQUE', 'CENTRE_MEDICAL'],
};

export const isOrgTypeAllowedForRole = (role: string, type: EstablishmentType): boolean =>
  (ORG_TYPES_BY_ROLE[role] ?? []).includes(type);

/** Profession / position per role. 'other' is always allowed. */
export const PROFESSIONS_BY_ROLE: Readonly<Record<string, readonly string[]>> = {
  DOCTOR: ['doctor', 'chef_de_service', 'other'],
  PHARMACIEN: ['pharmacist', 'pharmacist_responsible', 'other'],
  LABO: ['biologist', 'lab_technician', 'lab_responsible', 'other'],
  HOSPITAL: ['nurse', 'aide_soignant', 'sage_femme', 'chef_de_service', 'other'],
};

export type DepartmentRule = 'hidden' | 'optional' | 'required';

/**
 * Is a department / service asked for?
 *  - pharmacy (officine) and laboratory establishments have no "service" -> hidden (never stored);
 *  - a pharmacist never has a service, even in a hospital / clinic / centre (the pharmacy serves the whole
 *    establishment, see lib/scope.ts) -> hidden;
 *  - doctor, medical staff, laboratory staff inside a hospital / clinic / centre -> required.
 */
export function departmentRule(role: string, type: EstablishmentType | null | undefined): DepartmentRule {
  if (!type || type === 'OFFICINE' || type === 'LABORATOIRE') return 'hidden';
  if (role === 'PHARMACIEN') return 'hidden';
  return 'required';
}

export type ParsedProfessional =
  | { ok: true; profession: string | null; requestedDepartment: string | null }
  | { ok: false; message: string };

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

/**
 * Validate and normalise the professional details sent at sign-up or in a join request.
 * `orgType` is the type of the organization the person wants to join (null = independent professional).
 * Nothing the client sends is trusted: unknown professions, a department where none exists, or a
 * missing required department are all decided here.
 */
export function parseProfessionalDetails(
  role: string,
  orgType: EstablishmentType | null,
  input: { profession?: unknown; department?: unknown },
  opts: { requireDepartment?: boolean } = {}
): ParsedProfessional {
  let profession: string | null = null;
  if (input.profession !== undefined && input.profession !== null && input.profession !== '') {
    const p = typeof input.profession === 'string' ? input.profession.trim() : '';
    if (!(PROFESSIONS_BY_ROLE[role] ?? []).includes(p)) {
      return { ok: false, message: 'This profession does not match the selected role.' };
    }
    // « Chef de service » only exists inside an establishment.
    if (p === 'chef_de_service' && !orgType) {
      return { ok: false, message: 'This profession is only available inside an organization.' };
    }
    profession = p;
  }

  const rule = departmentRule(role, orgType);
  const dept = clean(input.department, 80);
  if (rule === 'required' && !dept && opts.requireDepartment !== false) {
    return { ok: false, message: 'department is required for this role in this kind of organization.' };
  }
  // 'hidden' -> a value sent anyway is dropped, never stored.
  return { ok: true, profession, requestedDepartment: rule === 'hidden' ? null : dept };
}
