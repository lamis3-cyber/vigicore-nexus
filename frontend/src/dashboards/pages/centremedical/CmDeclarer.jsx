import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';

// Converted from #view-declare-incident (centremedical branch) — see
// InstitutionalDeclarer.jsx for the shared wizard.
export default function CmDeclarer({ onNavigate }) {
  return <InstitutionalDeclarer dept="Centre médical" targetNavId="cm-declarations" onNavigate={onNavigate} />;
}
