import { Role, ActionType } from './types';

/**
 * role_permits(role, action) — domain-agnostic by design (Decision 2:
 * permissive across all four domains; domain-narrowing happens in wizard
 * CONFIGURATION, which is a UI concern, not an authorization concern — see
 * Correction #7/#8: config defines shape, never security).
 *
 * This table is the single source of truth for "can this role ever perform
 * this action, on any record" — the second AND-clause in the corrected rule
 * (`action_permitted_for_role`) is answered directly by this table; the
 * first clause (`role_permits`, i.e. is this role a recognized participant
 * in the Declaration/Case workflow at all) is trivially true for every role
 * in this Phase 1 model, so both clauses collapse to one lookup here. If a
 * future phase needs role_permits and action_permitted_for_role to diverge
 * (e.g. a role recognized for some domains but not others), this table is
 * the place to split them.
 *
 * ESTABLISHMENT_ADMIN intentionally has NO actions on Declarations/Cases —
 * Decision 1: "no clinical content access by default." Establishment Admin
 * exists to manage users/departments, not to read or act on clinical
 * content. If that changes, it must be an explicit PermissionGrant, not a
 * change to this default table.
 */
const REPORTER_ACTIONS: ActionType[] = ['CREATE', 'VIEW', 'EDIT', 'WITHDRAW'];
const REVIEWER_ACTIONS: ActionType[] = ['VIEW', 'REVIEW', 'ESCALATE', 'CLOSE'];

const ROLE_PERMISSION_TABLE: Record<Role, ActionType[]> = {
  PATIENT: REPORTER_ACTIONS,
  DOCTOR: REPORTER_ACTIONS,
  PHARMACIEN: REPORTER_ACTIONS,
  LABO: REPORTER_ACTIONS,
  HOSPITAL: REPORTER_ACTIONS,
  VIGILANCE_REVIEWER: REVIEWER_ACTIONS,
  ESTABLISHMENT_ADMIN: [], // deliberate — see docstring above (product-provider account)
  // L'administrateur d'un établissement de santé SUIT les déclarations « Mon organisation » de ses équipes (lecture seule,
  // champs identifiant le patient masqués). Le traitement (prise en charge, clôture) relève du responsable vigilance.
  ORG_ADMIN: ['VIEW'],
  // Distributeur / fournisseur en gros : peut DÉCLARER un incident (CREATE) et consulter ses propres déclarations (VIEW,
  // via le chemin « auteur » de allow.ts). Pas d'EDIT/WITHDRAW/REVIEW : il signale, il ne traite pas. Voir les
  // déclarations des AUTRES qui touchent ses produits n'est PAS accordé ici : ce sera un chemin d'accès dédié (phase 3),
  // jamais un élargissement de cette table.
  FOURNISSEUR: ['CREATE', 'VIEW'],
};

export function rolePermits(role: Role, action: ActionType): boolean {
  return ROLE_PERMISSION_TABLE[role]?.includes(action) ?? false;
}
