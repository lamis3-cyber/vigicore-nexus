import { EstablishmentType, Role } from '@prisma/client';

/**
 * The public sign-up form (LoginPage.jsx) sends lowercase role strings for
 * the five individual/clinical roles it currently offers: patient, doctor,
 * pharmacist, laboratory_staff, medical_staff. Those don't line up 1:1 with
 * the schema's Role enum (e.g. there's no separate "nurse" schema role yet
 * — medical_staff is treated as a generic hospital-affiliated role pending
 * a real decision on that mapping). This table is a best-effort bridge,
 * not a re-litigation of Decision 1's closed role set.
 *
 * TWO different "organization" accounts exist and must never be mixed up.
 * Neither is offered by the public multi-role dropdown; each has its own page:
 *
 *   'org_admin'           -> ORG_ADMIN. Sent only by RegisterOrganizationPage
 *                            in "healthcare" mode (/register-healthcare).
 *                            First admin of a hospital / clinic / medical centre:
 *                            manages members, join requests, invitations.
 *   'establishment_admin' -> ESTABLISHMENT_ADMIN. Sent only by
 *                            RegisterOrganizationPage in "provider" mode
 *                            (/register-organization, "List your products").
 *                            A manufacturer / supplier that lists products on
 *                            /services. Always creates a SUPPLIER establishment.
 *
 *   'fournisseur'         -> FOURNISSEUR. Sent only by the "Vendeur > Fournisseur" sign-up path
 *                            (distributor / wholesale supplier). Always creates a SUPPLIER establishment whose
 *                            buyer category is DISTRIBUTOR, DECLARED until VigiCore staff verifies it.
 */
const FRONTEND_ROLE_TO_SCHEMA_ROLE: Record<string, Role> = {
  patient: 'PATIENT',
  doctor: 'DOCTOR',
  pharmacist: 'PHARMACIEN',
  laboratory_staff: 'LABO',
  medical_staff: 'HOSPITAL',
  establishment_admin: 'ESTABLISHMENT_ADMIN',
  org_admin: 'ORG_ADMIN',
  fournisseur: 'FOURNISSEUR',
  // Employé d'un fournisseur (commercial, magasinier) : même rôle FOURNISSEUR, mais AUCUNE société créée — il rejoint celle
  // de son employeur par invitation de son administrateur (memberRole MEMBER : traite les commandes, ne gère pas le catalogue).
  fournisseur_staff: 'FOURNISSEUR',
};

export function mapFrontendRole(value: string): Role | null {
  return FRONTEND_ROLE_TO_SCHEMA_ROLE[value] ?? null;
}

const FRONTEND_ORG_TYPE_TO_SCHEMA_TYPE: Record<string, EstablishmentType> = {
  hospital: 'HOSPITAL',
  clinic: 'CLINIQUE',
  medical_centre: 'CENTRE_MEDICAL',
  pharmacy: 'OFFICINE',
  laboratory: 'LABORATOIRE',
};

export function mapFrontendOrgType(value: string | undefined): EstablishmentType | null {
  if (!value) return null;
  return FRONTEND_ORG_TYPE_TO_SCHEMA_TYPE[value] ?? null;
}

/** Establishment types a healthcare organization admin may register (they all have an 'administrator' dashboard). */
export const HEALTHCARE_REGISTRATION_TYPES: EstablishmentType[] = ['HOSPITAL', 'CLINIQUE', 'CENTRE_MEDICAL'];

/** Types a professional can ask to join (the workplace types; never SUPPLIER / SYSTEM). */
export const JOINABLE_ESTABLISHMENT_TYPES: EstablishmentType[] = [
  'HOSPITAL',
  'CLINIQUE',
  'CENTRE_MEDICAL',
  'OFFICINE',
  'LABORATOIRE',
];
