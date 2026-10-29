import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { listMyRequests } from '../../../lib/market';
import { initials, avatarStyle } from '../messenger/utils';
import { tr } from '../../../i18n/translate.js';
import { ago } from './supplierUi.js';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Fabricants » (organisations chez qui il achète).
// Liste RÉELLE : les fabricants auprès desquels il a envoyé au moins une commande ou une demande (GET /api/market/requests).
// Un fabricant avec qui il n'a encore rien échangé n'apparaît pas : le catalogue complet est dans « Services ».
// ═══════════════════════════════════════════════════════════════

const NONE = '__none__';
const VERIF = {
  VERIFIED: { pill: 'is-ok', label: 'Société vérifiée' },
  DECLARED: { pill: 'is-wait', label: 'En attente de vérification' },
  REJECTED: { pill: 'is-off', label: 'Vérification refusée' },
};

export default function SupplierOrganisations({ onNavigate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState(undefined); // undefined = chargement ; null = indisponible
  useEffect(() => {
    let off = false;
    listMyRequests().then((r) => { if (!off) setRequests(r.ok ? r.data.requests ?? [] : null); });
    return () => { off = true; };
  }, []);

  const rows = useMemo(() => {
    const by = new Map();
    for (const r of requests ?? []) {
      const key = r.manufacturer || NONE;
      const e = by.get(key) ?? { key, name: r.manufacturer || null, orders: 0, interests: 0, last: r.createdAt };
      if (r.kind === 'ORDER') e.orders += 1; else e.interests += 1;
      if (new Date(r.updatedAt) > new Date(e.last)) e.last = r.updatedAt;
      by.set(key, e);
    }
    return [...by.values()].sort((a, b) => new Date(b.last) - new Date(a.last));
  }, [requests]);

  const v = user?.organizationVerification?.status ? VERIF[user.organizationVerification.status] : null;

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Fabricants")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Les organisations auprès desquelles vous achetez.")}</div>
        </div>
        <div className="page-actions">
          <a className="btn btn--primary" href="/services"><Icon name="search" />{tr("Parcourir les produits")}</a>
        </div>
      </div>

      <div className="sup-company">
        <span className="sup-company-ico"><Icon name="building-store" /></span>
        <div className="sup-company-main">
          <div className="sup-company-name">{user?.orgName ?? '—'}</div>
          <div className="sup-company-sub">{tr("Distributeur / fournisseur en gros")}</div>
        </div>
        {v && <span className={`sup-pill ${v.pill}`}>{tr(v.label)}</span>}
      </div>

      <div className="sup-card-h" style={{ marginTop: 6 }}>
        <h2><Icon name="building-factory-2" className="u-c-blue" />{tr("Fabricants contactés")}{rows.length ? ` (${rows.length})` : ''}</h2>
      </div>
      {requests === undefined && <p className="u-fs-12 u-t8">{tr("Chargement…")}</p>}
      {requests === null && <p className="u-fs-12 u-t8">{tr("Impossible de charger vos fabricants pour le moment.")}</p>}
      {requests && rows.length === 0 && (
        <div className="card">
          <div className="sup-empty">
            <span className="sup-empty-ico"><Icon name="building-factory-2" /></span>
            <div className="sup-empty-t">{tr("Aucun fabricant pour le moment")}</div>
            <div className="sup-empty-d">{tr("Ils apparaissent ici dès votre première commande ou demande.")}</div>
            <button className="btn btn--primary" onClick={() => onNavigate?.('sup-catalogue')}>{tr("Passer une commande")}</button>
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div className="sup-mfr-grid">
          {rows.map((e) => {
            const name = e.name ?? tr("Fabricant non précisé");
            return (
              <div key={e.key} className="sup-mfr">
                <div className="sup-mfr-top">
                  <span className="sup-avatar" style={avatarStyle(name)}>{initials(name)}</span>
                  <div>
                    <div className="sup-mfr-name">{name}</div>
                    <div className="sup-mfr-last">{tr("Dernière activité")} · {ago(e.last)}</div>
                  </div>
                </div>
                <div className="sup-mfr-nums">
                  <div className="sup-mfr-num"><b>{e.orders}</b><span>{tr("Commandes")}</span></div>
                  <div className="sup-mfr-num"><b>{e.interests}</b><span>{tr("Demandes")}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
