import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';
import { useAuth } from '../../context/AuthContext';
import { getDepartmentsForOrganization } from '../../config/organizations';

// Medical Staff (role: 'medical_staff') declare-incident page.
//
// Reuses the SAME shared wizard already used by Hospital/Clinique/
// Centre Médical (see HospDeclarer.jsx etc.) rather than duplicating
// an ~350-line component for a role that needs the exact same 8-step
// flow — same "reuse existing components" rule the rest of this app
// follows. Only two per-role values differ:
//  - `dept`: stamped on the resulting declaration (dr-dec-*'s `dept`
//    field). For Medical Staff this is the user's REAL department name
//    (resolved from user.departmentId via organizations.js — the same
//    department catalog every other department-aware page reads),
//    falling back to a generic label only if the account somehow has
//    no department resolved.
//  - `targetNavId`: where the wizard navigates after a successful
//    submit — Medical Staff's own declarations list.
export default function MedicalStaffDeclarer({ onNavigate }) {
  const { user } = useAuth();
  const departmentName = user?.orgId && user?.departmentId
    ? getDepartmentsForOrganization(user.orgId).find((d) => d.id === user.departmentId)?.name
    : null;

  return (
    <InstitutionalDeclarer
      dept={departmentName || 'Personnel médical'}
      targetNavId="ms-declarations"
      onNavigate={onNavigate}
    />
  );
}
