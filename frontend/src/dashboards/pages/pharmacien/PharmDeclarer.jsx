import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';

// The pharmacist uses the same "Déclarer" wizard as the other roles (incident
// or breakdown). As before, no "Réactif / test diagnostique" type: that stays
// with the laboratory, doctor and institutional roles.
export default function PharmDeclarer({ onNavigate }) {
  return (
    <InstitutionalDeclarer
      dept="Pharmacie"
      targetNavId="pharm-declarations"
      productTypes={['medicament', 'dispositif', 'cosmetique', 'chimique']}
      onNavigate={onNavigate}
    />
  );
}
