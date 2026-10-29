import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';

// Converted from #view-declare-incident (clinique branch) — see
// InstitutionalDeclarer.jsx for the shared wizard.
export default function ClinDeclarer({ onNavigate }) {
  return <InstitutionalDeclarer dept="Clinique" targetNavId="clin-declarations" onNavigate={onNavigate} />;
}
