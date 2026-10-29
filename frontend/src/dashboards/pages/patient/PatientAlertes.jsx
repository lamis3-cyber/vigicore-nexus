import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { usePersonalList } from '../../lib/usePersonal';
import { productsNeedingAction, productSafety } from '../../lib/patientProducts';
import { tr } from '../../../i18n/translate.js';

// Patient alerts & recalls — computed from the patient's OWN products (/api/personal/product):
// every product whose lot is recalled or flagged as suspicious in the ANPP lot base.
// Products without a lot number cannot be checked; the page says how many.
export default function PatientAlertes({ onNavigate }) {
  const { items, loading, error } = usePersonalList('product');
  const products = items || [];
  const alerts = productsNeedingAction(products);
  const unchecked = products.filter((p) => ['nolot', 'unknown'].includes(productSafety(p).status)).length;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Alertes &")} <span className="page-title-accent">{tr("Rappels")}</span></h1></div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate('produits')}><Icon name="package" />{tr("Mes produits")}</button>
        </div>
      </div>

      {error && <div className="alert-banner alert-banner--amber"><Icon name="alert-triangle" /><div className="alert-banner-text">{error}</div></div>}

      <div className="u-col-gap12" id="anchor-alertes-recall">
        {loading && <div className="card"><div className="u-fs-12 u-t102">{tr("Chargement…")}</div></div>}

        {!loading && alerts.map(({ product, safety }) => {
          const recall = safety.status === 'recall';
          return (
            <div key={product.id} className={`alert-banner ${recall ? 'alert-banner--red' : 'alert-banner--amber'}`}>
              <Icon name="alert-triangle" />
              <div className="u-flex-1">
                <div className="alert-banner-title">
                  {recall ? tr("Rappel ANPP — {0}", [product.name]) : tr("Lot suspect — {0}", [product.name])}
                </div>
                <div className="alert-banner-text">
                  {tr("Lot")} <span className="u-mono">{safety.lot}</span>
                  {safety.info?.manufacturer ? ` · ${safety.info.manufacturer}` : ''}
                  {safety.info?.note ? ` — ${safety.info.note}` : ''}
                </div>
                <div className="alert-banner-text" style={{ marginTop: '6px' }}>
                  {recall
                    ? tr("N'utilisez plus ce produit. Rapportez-le à votre pharmacie, sans le jeter vous-même, et demandez un produit de remplacement.")
                    : tr("N'utilisez pas ce produit avant d'en avoir parlé à votre pharmacien.")}
                </div>
                <div className="u-row-gap6" style={{ marginTop: '10px' }}>
                  <button className="btn btn--primary" onClick={() => onNavigate('declarer')}><Icon name="clipboard" />{tr("Déclarer un effet")}</button>
                  <button className="btn" onClick={() => onNavigate('produits')}><Icon name="package" />{tr("Voir le produit")}</button>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && alerts.length === 0 && (
          <EmptyState
            icon="shield-check"
            tone="ok"
            title={products.length ? 'Aucune alerte' : 'Aucun produit enregistré'}
            text={products.length
              ? 'Aucun rappel ni lot suspect ne concerne vos produits enregistrés.'
              : 'Ajoutez vos produits (avec leur numéro de lot) pour être alerté des rappels qui vous concernent.'}
            action={products.length
              ? { label: 'Déclarer un effet', icon: 'clipboard', onClick: () => onNavigate('declarer') }
              : { label: 'Ajouter un produit', icon: 'plus', onClick: () => onNavigate('produits') }}
          />
        )}

        {!loading && unchecked > 0 && (
          <div className="alert-banner alert-banner--cyan">
            <Icon name="info-circle" />
            <div className="alert-banner-text">
              {tr("{0} produit(s) n'ont pas pu être vérifiés (numéro de lot absent ou non référencé dans la base ANPP).", [unchecked])}
            </div>
          </div>
        )}
      </div>
      <div id="anchor-alertes-securite" />
    </div>
  );
}
