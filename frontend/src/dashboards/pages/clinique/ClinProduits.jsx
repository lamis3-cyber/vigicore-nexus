import ProduitsTracabilite from '../institutional/ProduitsTracabilite';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-clin-produits, using the shared shell. Clinique
// renders recalls compact (compact=true, no "Confirmer le retour")
// — matches renderClinProduits() -> pharmRecallCardHTML(r, true).
export default function ClinProduits({ onNavigate }) {
  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Produits &")} <span className="page-title-accent">{tr("traçabilité")}</span></h1></div>
      </div>
      <ProduitsTracabilite recallsCompact onNavigateAlertes={() => onNavigate('clin-alertes')} />
    </div>
  );
}
