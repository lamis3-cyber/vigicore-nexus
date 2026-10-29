import ProduitsTracabilite from '../institutional/ProduitsTracabilite';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-hosp-produits, using the shared shell
// (see ProduitsTracabilite.jsx). Hospital renders recalls non-compact
// (compact=false) with "Confirmer le retour" — matches the original's
// renderHospProduits() -> pharmRecallCardHTML(r, false).
export default function HospProduits({ onNavigate }) {
  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Produits &")} <span className="page-title-accent">{tr("traçabilité")}</span></h1></div>
      </div>
      <ProduitsTracabilite recallsCompact={false} confirmReturn onNavigateAlertes={() => onNavigate('hosp-alertes')} />
    </div>
  );
}
