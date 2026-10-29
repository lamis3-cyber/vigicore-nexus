import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { listMyServices } from '../../../lib/services';
import { money } from '../market/MarketOrders';
import { tr } from '../../../i18n/translate.js';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Mes produits » : les produits qu'il VEND sur la page Services (comme un fabricant le fait
// pour les siens). Cette page donne l'état de chaque fiche (brouillon, en validation, refusée, en ligne) ; la création et la
// modification se font dans l'atelier produit (/dashboard/services), le même que celui des fabricants, avec en plus les
// conditions de vente (prix, unité, minimum, stock). Une fiche n'est visible du public qu'une fois APPROUVÉE par VigiCore ;
// elle n'est COMMANDABLE que si un prix est renseigné, qu'elle est en stock et que la société est vérifiée.
// ═══════════════════════════════════════════════════════════════

const STATE = {
  PUBLISHED: { label: 'En ligne', badge: 'green' },
  PENDING_REVIEW: { label: 'En validation', badge: 'amber' },
  REJECTED: { label: 'Refusée', badge: 'red' },
  DRAFT: { label: 'Brouillon', badge: 'cyan' },
  ARCHIVED: { label: 'Archivée', badge: 'cyan' },
};
const OPEN_STUDIO = () => { window.location.href = '/dashboard/services'; };

export default function SupplierProducts({ onNavigate }) {
  const { user } = useAuth();
  const canManage = user?.isOrgAdmin !== false; // an employee sees the catalogue but does not manage it
  const [listings, setListings] = useState(undefined); // undefined = chargement ; null = indisponible
  useEffect(() => {
    let off = false;
    listMyServices().then((r) => { if (!off) setListings(r.ok ? r.data.listings ?? [] : null); });
    return () => { off = true; };
  }, []);

  const verified = user?.organizationVerification?.status === 'VERIFIED';
  const rows = useMemo(() => (Array.isArray(listings) ? listings.filter((l) => l.status !== 'ARCHIVED') : []), [listings]);
  const count = (s) => rows.filter((l) => l.status === s).length;
  // stockQty : null = quantité non suivie ; sinon il faut au moins le minimum de commande (comme le serveur).
  const enough = (l) => l.stockQty == null || l.stockQty >= (l.minOrderQty ?? 1)
  const orderable = (l) => l.status === 'PUBLISHED' && l.unitPrice != null && l.inStock !== false && enough(l) && verified;
  const num = (v) => (Array.isArray(listings) ? v : '—');

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr('Mes produits')}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr('Les produits que vous vendez sur la page Services. Les clients vérifiés peuvent vous les commander.')}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate?.('sup-ventes')}><Icon name="receipt" />{tr('Commandes clients')}</button>
          {canManage && <button className="btn btn--primary" onClick={OPEN_STUDIO}><Icon name="plus" />{tr('Ajouter / modifier un produit')}</button>}
        </div>
      </div>

      {!verified && (
        <div className="card" style={{ marginBottom: 14 }}>
          <span className="badge badge--amber">{tr('Société non vérifiée')}</span>{' '}
          <span className="u-fs-12">{tr("Vous pouvez préparer vos fiches, mais vos clients ne pourront les commander qu'une fois votre société vérifiée par VigiCore.")}</span>
        </div>
      )}

      <div className="sup-stats">
        <div className="sup-stat t-green" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="world" /></span><span><div className="sup-stat-num">{num(count('PUBLISHED'))}</div><div className="sup-stat-lab">{tr('En ligne')}</div><div className="sup-stat-sub">{tr('visibles sur la page Services')}</div></span></div>
        <div className="sup-stat t-blue" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="clock" /></span><span><div className="sup-stat-num">{num(count('PENDING_REVIEW'))}</div><div className="sup-stat-lab">{tr('En validation')}</div><div className="sup-stat-sub">{tr('par VigiCore')}</div></span></div>
        <div className="sup-stat t-red" style={{ cursor: 'default' }}><span className="sup-stat-ico"><Icon name="file-pencil" /></span><span><div className="sup-stat-num">{num(count('DRAFT') + count('REJECTED'))}</div><div className="sup-stat-lab">{tr('À terminer')}</div><div className="sup-stat-sub">{tr('brouillons et refusées')}</div></span></div>
      </div>

      <div className="card">
        <div className="sup-card-h">
          <h2><Icon name="package" className="u-c-green" />{tr('Catalogue')}</h2>
          <button className="sup-link" onClick={() => window.open('/services', '_blank', 'noopener')}>{tr('Voir la page publique')} ↗</button>
        </div>
        {listings === undefined && <p className="u-fs-12 u-t8">{tr('Chargement…')}</p>}
        {listings === null && <p className="u-fs-12 u-t8">{tr('Impossible de charger vos produits pour le moment.')}</p>}
        {Array.isArray(listings) && rows.length === 0 && (
          <div className="sup-empty">
            <span className="sup-empty-ico"><Icon name="package" /></span>
            <div className="sup-empty-t">{tr("Vous n'avez pas encore de produit")}</div>
            <div className="sup-empty-d">{tr('Créez une fiche avec son prix de gros : après validation par VigiCore, elle apparaît sur la page Services pour les visiteurs et devient commandable par les clients vérifiés.')}</div>
            {canManage && <button className="btn btn--primary" onClick={OPEN_STUDIO}>{tr('Créer mon premier produit')}</button>}
          </div>
        )}
        {rows.length > 0 && (
          <ul className="sup-list">
            {rows.map((l) => {
              const st = STATE[l.status] ?? STATE.DRAFT;
              return (
                <li key={l.id} className="sup-row">
                  <span className="sup-row-ico">{l.imageUrl ? <img src={l.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} /> : <Icon name="package" />}</span>
                  <span className="sup-row-main">
                    <div className="sup-row-t">{l.title}</div>
                    <div className="sup-row-s">
                      {l.unitPrice != null ? `${money(l.unitPrice)}${l.priceUnit ? ` / ${l.priceUnit}` : ''}${l.minOrderQty > 1 ? ` · ${tr('min.')} ${l.minOrderQty}` : ''}` : tr('Prix non renseigné : non commandable')}
                      {l.inStock === false || l.stockQty === 0 ? ` · ${tr('rupture de stock')}` : l.stockQty != null ? ` · ${l.stockQty} ${tr('en stock')}${enough(l) ? '' : ` (${tr('sous le minimum de commande')})`}` : ''}
                    </div>
                    {l.status === 'REJECTED' && <div className="sup-row-s" style={{ color: 'var(--color-red)' }}>{l.reviewNote || tr('Contenu à revoir.')}</div>}
                  </span>
                  {orderable(l) && <span className="badge badge--cyan">{tr('Commandable')}</span>}
                  <span className={`badge badge--${st.badge}`}>{tr(st.label)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
