// Turns the site's real session (GET /api/auth/session) into the user shape the
// dashboards already understand (same fields AuthContext's demo seats produce).
// Role / organization come ONLY from the server session — never from the UI.
import { getPermissionsForRole, getBaseRole } from '../config/permissions';
import { registerOrganization } from '../config/organizations';

// Backend Role enum -> dashboards business role (see server/src/lib/roleMapping.ts,
// which maps the other way for sign-up).
const ROLE_BY_BACKEND_ROLE = {
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  PHARMACIEN: 'pharmacist',
  LABO: 'laboratory_staff',
  HOSPITAL: 'medical_staff',
  VIGILANCE_REVIEWER: 'vigilance_responsible',
  // ORG_ADMIN = healthcare organization administrator -> 'administrator' dashboard.
  // ESTABLISHMENT_ADMIN (product provider) is deliberately NOT mapped: it has no
  // role dashboard, its home is /dashboard/services (see AuthContext.jsx).
  ORG_ADMIN: 'administrator',
  // FOURNISSEUR = distributeur / fournisseur en gros -> tableau de bord fournisseur (sa société est de type SUPPLIER,
  // sans équivalent dans ORG_TYPE_BY_BACKEND_TYPE : orgType reste null, ce qui est voulu).
  FOURNISSEUR: 'supplier',
};

// Backend EstablishmentType -> dashboards organization type.
const ORG_TYPE_BY_BACKEND_TYPE = {
  HOSPITAL: 'hospital',
  CLINIQUE: 'clinic',
  CENTRE_MEDICAL: 'medical_centre',
  OFFICINE: 'pharmacy',
  LABORATOIRE: 'laboratory',
};

function initialsOf(name) {
  return (name || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '??';
}

export function sessionUserToDashboardUser(s) {
  const role = ROLE_BY_BACKEND_ROLE[s.role];
  if (!role) return null; // unknown backend role: caller shows an error instead of guessing

  const orgId = s.activeEstablishmentId ?? null;
  const orgType = ORG_TYPE_BY_BACKEND_TYPE[s.activeEstablishmentType] ?? null;
  if (orgId && orgType) registerOrganization({ id: orgId, name: s.activeEstablishmentName ?? orgId, type: orgType });

  return {
    id: s.id,
    email: s.email,
    isStaff: s.isPlatformAdmin === true, // VigiCore staff (server-checked list): shows the Staff link in the top bar
    name: s.displayName,
    initials: initialsOf(s.displayName),
    role,
    baseRole: getBaseRole(role),
    jobTitle: null,
    orgId,
    organizationId: orgId,
    orgType,
    orgName: s.activeEstablishmentName ?? null,
    // Service du compte (médecin / personnel médical). null = travaille pour tout l'établissement (pharmacie, laboratoire, vigilance, admin).
    departmentId: s.activeDepartmentId ?? null,
    departmentName: s.activeDepartmentName ?? null,
    permissions: getPermissionsForRole(role),
    // Vérification VigiCore de la société (fournisseur) : { category, status: DECLARED|VERIFIED|REJECTED, note } ou null.
    organizationVerification: s.organizationVerification ?? null,
    // Administrateur de sa société (false = employé). Sert seulement à masquer des entrées de menu : le serveur re-vérifie tout.
    isOrgAdmin: s.isEstablishmentAdmin !== false,
  };
}
