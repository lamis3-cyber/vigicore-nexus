import { describe, it, expect } from 'vitest';
import {
  canViewListingPublicly,
  canManageListing,
  canCreateListingFor,
  ServiceListingRecord,
  ServiceRequesterContext,
} from '../src/auth/servicesAuthz';

const ESTABLISHMENT_A = 'est_hospital_a';
const ESTABLISHMENT_B = 'est_hospital_b';

function baseRecord(overrides: Partial<ServiceListingRecord> = {}): ServiceListingRecord {
  return {
    id: 'listing_1',
    establishmentId: ESTABLISHMENT_A,
    createdByUserId: 'user_admin',
    status: 'DRAFT',
    ...overrides,
  };
}

function baseRequester(overrides: Partial<ServiceRequesterContext> = {}): ServiceRequesterContext {
  return {
    userId: 'user_admin',
    role: 'ESTABLISHMENT_ADMIN',
    affiliatedEstablishmentIds: [ESTABLISHMENT_A],
    ...overrides,
  };
}

describe('canViewListingPublicly', () => {
  it('allows anyone to view a PUBLISHED listing', () => {
    expect(canViewListingPublicly(baseRecord({ status: 'PUBLISHED' }))).toBe(true);
  });

  it('hides DRAFT and ARCHIVED listings from public view', () => {
    expect(canViewListingPublicly(baseRecord({ status: 'DRAFT' }))).toBe(false);
    expect(canViewListingPublicly(baseRecord({ status: 'ARCHIVED' }))).toBe(false);
  });
});

describe('canManageListing', () => {
  it('allows an Establishment Admin affiliated with the listing\'s establishment', () => {
    expect(canManageListing(baseRequester(), baseRecord())).toBe(true);
  });

  it('denies an Establishment Admin from a different establishment', () => {
    const requester = baseRequester({ affiliatedEstablishmentIds: [ESTABLISHMENT_B] });
    expect(canManageListing(requester, baseRecord())).toBe(false);
  });

  it('denies every non-admin role, even the listing\'s own creator', () => {
    const requester = baseRequester({ role: 'DOCTOR', userId: 'user_admin' });
    expect(canManageListing(requester, baseRecord({ createdByUserId: 'user_admin' }))).toBe(false);
  });
});

describe('canCreateListingFor', () => {
  it('allows an Establishment Admin to create a listing for their own establishment', () => {
    expect(canCreateListingFor(baseRequester(), ESTABLISHMENT_A)).toBe(true);
  });

  it('denies creating a listing for an establishment the admin is not affiliated with', () => {
    expect(canCreateListingFor(baseRequester(), ESTABLISHMENT_B)).toBe(false);
  });

  it('denies non-admin roles regardless of affiliation', () => {
    const requester = baseRequester({ role: 'HOSPITAL' });
    expect(canCreateListingFor(requester, ESTABLISHMENT_A)).toBe(false);
  });
});
