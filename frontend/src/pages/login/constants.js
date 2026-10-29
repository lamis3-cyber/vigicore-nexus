// ── Sign-Up account model — Role / Organization / Profession are distinct ──
// (see task spec: Role ≠ Organization ≠ Profession/Position ≠ Department)
export const PROFESSIONAL_ROLES = ['doctor', 'pharmacist', 'laboratory_staff', 'medical_staff']

// Fallback labels for the Role dropdown (translated ones live in the locales
// as login.role.<value>; roles without a translation show this label).
export const ROLE_OPTIONS = [
  { value: 'patient', label: 'Patient' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'laboratory_staff', label: 'Laboratory Staff' },
  { value: 'medical_staff', label: 'Medical Staff' },
]

export const LANG_NAMES = { en: 'English', fr: 'Français', ar: 'العربية' }

export const ORG_TYPE_LABELS = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  medical_centre: 'Medical Centre',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
}

// Which Organization Types are valid for each professional Role.
export const ORG_TYPES_BY_ROLE = {
  doctor: ['hospital', 'clinic', 'medical_centre'],
  pharmacist: ['pharmacy', 'hospital', 'clinic', 'medical_centre'],
  laboratory_staff: ['laboratory', 'hospital', 'clinic', 'medical_centre'],
  medical_staff: ['hospital', 'clinic', 'medical_centre'],
}

// Profession / Position options per Role (distinct from Role itself).
export const PROFESSION_OPTIONS_BY_ROLE = {
  doctor: [
    { value: 'doctor', label: 'Doctor' },
    { value: 'chef_de_service', label: 'Chef de service' },
    { value: 'other', label: 'Other' },
  ],
  pharmacist: [
    { value: 'pharmacist', label: 'Pharmacist' },
    { value: 'pharmacist_responsible', label: 'Pharmacist Responsible' },
    { value: 'other', label: 'Other' },
  ],
  laboratory_staff: [
    { value: 'biologist', label: 'Biologist' },
    { value: 'lab_technician', label: 'Laboratory Technician' },
    { value: 'lab_responsible', label: 'Laboratory Responsible' },
    { value: 'other', label: 'Other' },
  ],
  medical_staff: [
    { value: 'nurse', label: 'Nurse / Infirmier' },
    { value: 'aide_soignant', label: 'Aide-soignant' },
    { value: 'sage_femme', label: 'Sage-femme' },
    { value: 'chef_de_service', label: 'Chef de service' },
    { value: 'other', label: 'Other' },
  ],
}
// ────────────────────────────────────────────────────────────────────────

// ── Département / Service : obligatoire seulement là où il existe ──────────
//  - officine (pharmacy) et laboratoire (laboratory) : pas de « service » -> champ masqué, jamais envoyé ;
//  - pharmacien (officine OU pharmacie d'un hôpital / clinique / centre) : jamais de service, il dessert tout l'établissement ;
//  - médecin, personnel médical, personnel de laboratoire en établissement de soins : obligatoire.
export function getDepartmentRule(role, organizationType) {
  if (!organizationType || organizationType === 'pharmacy' || organizationType === 'laboratory') return 'hidden'
  if (role === 'pharmacist') return 'hidden'
  return 'required'
}
// Exemples affichés dans le champ, selon le rôle (texte indicatif, pas une valeur).
export const DEPARTMENT_EXAMPLE_BY_ROLE = {
  laboratory_staff: 'ex. Biochimie, Hématologie',
}

// Profession proposées : « Chef de service » n'existe qu'au sein d'un établissement (un indépendant n'a pas de service).
export function professionOptionsFor(role, professionalStatus) {
  const list = PROFESSION_OPTIONS_BY_ROLE[role] || []
  return professionalStatus === 'independent' ? list.filter((o) => o.value !== 'chef_de_service') : list
}
