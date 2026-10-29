import ProduitsTracabilite from '../institutional/ProduitsTracabilite';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-cm-produits, using the shared shell. Compact
// recalls (compact=true) — matches renderCmProduits().
export default function CmProduits({ onNavigate }) {
  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Produits &")} <span className="page-title-accent">{tr("traçabilité")}</span></h1></div>
      </div>
      <ProduitsTracabilite recallsCompact onNavigateAlertes={() => onNavigate('cm-alertes')} />
    </div>
  );
}
