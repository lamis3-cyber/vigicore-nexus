/**
 * servicesAuthz.ts — authorization for ProductListing (the public
 * "services page" catalog).
 *
 * Deliberately NOT part of allow.ts / rolePermissions.ts. Those are scoped
 * to the locked Declaration/Case vigilance model (ScopedRecord requires a
 * `domain` from the closed Domain enum, and ESTABLISHMENT_ADMIN's empty
 * action set there specifically means "no clinical content access by
 * default" — it says nothing about a non-clinical resource like a product
 * listing). Bolting listings onto that table would misrepresent both: it
 * would look like clinical-content access when it isn't, and it would
 * change the meaning of a table that's supposed to be the single source of
 * truth for the vigilance workflow.
 *
 * Same framework/transport-agnostic shape as allow.ts on purpose, so a
 * future API route can wire it in the same way — just kept out of the
 * table that Decisions 1–8 locked.
 */

import { Role } from './types';

export interface ServiceListingRecord {
  id: string;
  establishmentId: string;
  createdByUserId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export interface ServiceRequesterContext {
  userId: string;
  role: Role;
  /** Establishments this user is affiliated with — see RequesterContext in
   * types.ts. A listing can be managed by any Establishment Admin affiliated
   * with its establishment, not only its original author. */
  affiliatedEstablishmentIds: string[];
  /** Establishments where this user is an ADMIN member. A FOURNISSEUR employee (MEMBER) can see its company's
   * catalogue but never manage it : for that role the manage check uses THIS list, not the affiliation list. */
  adminEstablishmentIds?: string[];
}

/** Does the requester hold the catalogue-management right on this establishment? */
function mayRunCatalogue(requester: ServiceRequesterContext, establishmentId: string): boolean {
  if (!CATALOGUE_ROLES.includes(requester.role)) return false;
  if (requester.role === 'FOURNISSEUR') return (requester.adminEstablishmentIds ?? []).includes(establishmentId);
  return requester.affiliatedEstablishmentIds.includes(establishmentId);
}

/** Anyone, logged in or not, can view a PUBLISHED listing. Nothing else is
 * public — a DRAFT or ARCHIVED listing is only visible to the paths below. */
export function canViewListingPublicly(record: ServiceListingRecord): boolean {
  return record.status === 'PUBLISHED';
}

/** Roles that run a product catalogue on /services: the manufacturer-side product provider and, since 2026-11-03,
 * the FOURNISSEUR (distributor / wholesaler) who sells its own products to verified buyers. */
const CATALOGUE_ROLES: readonly Role[] = ['ESTABLISHMENT_ADMIN', 'FOURNISSEUR'];

/** Create/edit/archive rights: only a catalogue owner (Establishment Admin or Fournisseur), only for their
 * own establishment(s). Mirrors the establishment-path boundary check in
 * allow.ts (requester must be affiliated with the record's establishment) —
 * this resource has no owner/assignment/grant paths, since it isn't part of
 * the Declaration/Case workflow those exist for. */
export function canManageListing(
  requester: ServiceRequesterContext,
  record: Pick<ServiceListingRecord, 'establishmentId'>
): boolean {
  return mayRunCatalogue(requester, record.establishmentId);
}

/** Same establishment-affiliation rule, for creating a brand-new listing
 * (there's no existing record yet, so this checks the target establishment
 * directly rather than a record's establishmentId). */
export function canCreateListingFor(
  requester: ServiceRequesterContext,
  establishmentId: string
): boolean {
  return mayRunCatalogue(requester, establishmentId);
}
