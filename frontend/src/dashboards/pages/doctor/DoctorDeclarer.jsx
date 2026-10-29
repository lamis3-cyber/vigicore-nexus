import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';

// The doctor uses the same "Déclarer un incident" wizard as the institutions
// (same 5 steps, same design); only the department stamped on the declaration
// and the page opened after sending differ.
export default function DoctorDeclarer({ onNavigate }) {
  return <InstitutionalDeclarer dept="Médecine" targetNavId="doc-declarations" onNavigate={onNavigate} />;
}
