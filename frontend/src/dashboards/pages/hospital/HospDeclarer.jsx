import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';

// Converted from #view-declare-incident (hospital branch) — see
// InstitutionalDeclarer.jsx for the shared wizard, and the original's
// DECLARE_WIZ_DEPT_BY_ROLE.hospital ('Hôpital') / declView.hospital
// ('hosp-declarations') for the two per-role values below.
export default function HospDeclarer({ onNavigate }) {
  return <InstitutionalDeclarer dept="Hôpital" targetNavId="hosp-declarations" onNavigate={onNavigate} />;
}
