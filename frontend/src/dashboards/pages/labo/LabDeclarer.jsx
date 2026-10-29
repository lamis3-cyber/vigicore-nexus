import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';
import { addLabDeclaration } from '../../data/laboVigilance';

// The laboratory uses the same "Déclarer" wizard as the other roles (incident
// or breakdown) but stores its declarations in LAB_DECLARATIONS.
export default function LabDeclarer({ onNavigate }) {
  return (
    <InstitutionalDeclarer
      dept="Laboratoire"
      targetNavId="lab-declarations"
      submitDeclaration={addLabDeclaration}
      onNavigate={onNavigate}
    />
  );
}
