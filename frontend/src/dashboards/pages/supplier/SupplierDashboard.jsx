import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { listLotAlerts, listMyRequests, listMySales, requestState } from '../../../lib/market';
import { tr } from '../../../i18n/translate.js';
import { ago } from './supplierUi.js';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur (role: 'supplier') — accueil.
//
// Le statut de vérification de la société vient de la session serveur (jamais de l'interface) : tant que le staff
// VigiCore n'a pas vérifié ses pièces, le fournisseur peut se connecter mais pas commander.
// Chiffres RÉELS uniquement (API) : commandes en cours, alertes de lot non lues, fabricants. Donnée absente ou en
// cours de chargement = « — », jamais un zéro trompeur.
// ═══════════════════════════════════════════════════════════════

const TERMINAL = new Set(['DELIVERED', 'CANCELLED', 'CLOSED']);
const TONE = { wait: 'amber', ok: 'cyan', done: 'green', off: 'red' };

const STATUS = {
  DECLARED: { pill: 'is-wait', label: 'En attente de vérification',
    text: "Votre société est enregistrée. L'équipe VigiCore vérifie vos informations (RC, NIF, agrément) : vous pourrez passer commande auprès des fabricants dès que la vérification sera validée." },
  VERIFIED: { pill: 'is-ok', label: 'Société vérifiée',
    text: 'Votre société est vérifiée : suivez vos commandes, recevez les alertes de lot des fabricants et déclarez un incident en quelques clics.' },
  REJECTED: { pill: 'is-off', label: 'Vérification refusée',
    text: "La vérification de votre société a été refusée. Contactez l'équipe VigiCore pour corriger votre dossier." },
};

export default function SupplierDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState(undefined); // undefined = chargement ; null = indisponible
  const [alerts, setAlerts] = useState(undefined);
  const [sales, setSales] = useState(undefined); // commandes reçues de ses clients
  useEffect(() => {
    let off = false;
    Promise.all([listMyRequests(), listLotAlerts(), listMySales()]).then(([r, a, s]) => {
      if (off) return;
      setRequests(r.ok ? r.data.requests ?? [] : null);
      setAlerts(a.ok ? a.data : null);
      setSales(s.ok ? s.data.counts ?? null : null);
    });
    return () => { off = true; };
  }, []);

  const verification = user?.organizationVerification ?? null;
  const st = verification?.status ? STATUS[verification.status] : null;
  const verified = verification?.status === 'VERIFIED';

  const num = (v) => (v === undefined || v === null ? '—' : v);
  const reqs = Array.isArray(requests) ? requests : [];
  const openOrders = Array.isArray(requests) ? reqs.filter((r) => r.kind === 'ORDER' && !TERMINAL.has(r.status) && r.delivery !== 'REJECTED' && r.delivery !== 'FAILED').length : null;
  const manufacturers = Array.isArray(requests) ? new Set(reqs.map((r) => r.manufacturer).filter(Boolean)).size : null;
  const unreadAlerts = alerts ? alerts.unread ?? 0 : null;
  const latestAlerts = (alerts?.alerts ?? []).slice(0, 3);
  const latestOrders = reqs.slice(0, 3);
  const hasOrdered = reqs.some((r) => r.kind === 'ORDER');

  const go = (id) => () => onNavigate?.(id);
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="view is-active">
      <section className="sup-hero">
        <span className="sup-eyebrow"><Icon name="building-store" />{user?.orgName || tr("Espace fournisseur / distributeur")}</span>
        <h1>{tr("Bonjour,")} <em>{firstName || user?.name}</em></h1>
        <p>{st ? tr(st.text) : tr("Gérez vos commandes, suivez les alertes de lot et déclarez un incident.")}</p>
        <div className="sup-hero-actions">
          {st && <span className={`sup-pill ${st.pill}`}>{tr(st.label)}</span>}
          <button className="btn btn--primary" onClick={go('sup-produits')}><Icon name="building-store" />{tr("Mes produits")}</button>
          {user?.isOrgAdmin !== false && <button className="btn" onClick={go('sup-catalogue')}><Icon name="package" />{tr("Commander")}</button>}
          <button className="btn" onClick={go('sup-declarer')}><Icon name="clipboard-plus" />{tr("Déclarer un incident")}</button>
        </div>
        {verification?.status === 'REJECTED' && verification.note && (
          <p style={{ marginTop: 12 }}><strong>{tr("Motif :")}</strong> {verification.note}</p>
        )}
      </section>

      <div className="sup-stats">
        <button type="button" className="sup-stat t-amber" onClick={go('sup-ventes')}>
          <span className="sup-stat-ico"><Icon name="receipt" /></span>
          <span><div className="sup-stat-num">{num(sales ? sales.pending + sales.newInterests : sales)}</div><div className="sup-stat-lab">{tr("Commandes clients")}</div><div className="sup-stat-sub">{tr("à traiter")}</div></span>
        </button>
        <button type="button" className="sup-stat t-green" onClick={go('sup-suivi')}>
          <span className="sup-stat-ico"><Icon name="truck-delivery" /></span>
          <span><div className="sup-stat-num">{num(openOrders)}</div><div className="sup-stat-lab">{tr("Commandes en cours")}</div><div className="sup-stat-sub">{tr("vos achats en attente, confirmés ou expédiés")}</div></span>
        </button>
        <button type="button" className="sup-stat t-red" onClick={go('sup-notifications')}>
          <span className="sup-stat-ico"><Icon name="alert-triangle" /></span>
          <span><div className="sup-stat-num">{num(unreadAlerts)}</div><div className="sup-stat-lab">{tr("Alertes de lot")}</div><div className="sup-stat-sub">{tr("non lues")}</div></span>
        </button>
        <button type="button" className="sup-stat t-blue" onClick={go('sup-organisations')}>
          <span className="sup-stat-ico"><Icon name="building-factory-2" /></span>
          <span><div className="sup-stat-num">{num(manufacturers)}</div><div className="sup-stat-lab">{tr("Fabricants")}</div><div className="sup-stat-sub">{tr("contactés ou commandés")}</div></span>
        </button>
      </div>

      {!hasOrdered && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="sup-card-h"><h2><Icon name="route" className="u-c-cyan" />{tr("Pour bien démarrer")}</h2></div>
          <ol className="sup-steps">
            <li className={`sup-step ${verified ? 'is-done' : 'is-now'}`}>
              <span className="sup-step-n">{verified ? <Icon name="check" /> : 1}</span>
              <span><div className="sup-step-t">{tr("Société vérifiée")}</div><div className="sup-step-d">{tr("VigiCore contrôle vos pièces avant votre première commande.")}</div></span>
            </li>
            <li className={`sup-step ${verified ? 'is-now' : ''}`}>
              <span className="sup-step-n">2</span>
              <span><div className="sup-step-t">{tr("Choisir un produit")}</div><div className="sup-step-d">{tr("Parcourez le catalogue des fabricants.")}</div></span>
            </li>
            <li className="sup-step">
              <span className="sup-step-n">3</span>
              <span><div className="sup-step-t">{tr("Envoyer la commande")}</div><div className="sup-step-d">{tr("Le fabricant confirme et attribue les lots.")}</div></span>
            </li>
            <li className="sup-step">
              <span className="sup-step-n">4</span>
              <span><div className="sup-step-t">{tr("Suivre et être alerté")}</div><div className="sup-step-d">{tr("Livraison, lots retirés, incidents.")}</div></span>
            </li>
          </ol>
        </div>
      )}

      <div className="sup-cols">
        <div className="card">
          <div className="sup-card-h">
            <h2><Icon name="alert-triangle" className="u-c-red" />{tr("Alertes de lot récentes")}</h2>
            <button className="sup-link" onClick={go('sup-notifications')}>{tr("Tout voir")}</button>
          </div>
          {alerts === undefined && <p className="u-fs-12 u-t8">{tr("Chargement…")}</p>}
          {alerts === null && <p className="u-fs-12 u-t8">{tr("Impossible de charger les alertes pour le moment.")}</p>}
          {alerts && latestAlerts.length === 0 && (
            <div className="sup-empty">
              <span className="sup-empty-ico"><Icon name="shield-check" /></span>
              <div className="sup-empty-t">{tr("Aucune alerte")}</div>
              <div className="sup-empty-d">{tr("Vous serez prévenu ici si un fabricant retire un lot que vous avez commandé.")}</div>
            </div>
          )}
          {latestAlerts.length > 0 && (
            <ul className="sup-list">
              {latestAlerts.map((a) => (
                <li key={a.id} className="sup-row">
                  <span className="sup-row-ico" style={{ background: a.event === 'WITHDRAWN' ? 'var(--color-red-dim)' : 'var(--color-green-dim)', color: a.event === 'WITHDRAWN' ? 'var(--color-red)' : 'var(--color-green)' }}><Icon name={a.event === 'WITHDRAWN' ? 'alert-triangle' : 'circle-check'} /></span>
                  <span className="sup-row-main"><div className="sup-row-t">{a.productName} · {tr("Lot")} {a.lotNumber}</div><div className="sup-row-s">{a.manufacturer ? `${a.manufacturer} · ` : ''}{ago(a.detectedAt)}</div></span>
                  <span className={`badge badge--${a.event === 'WITHDRAWN' ? 'red' : 'green'}`}>{a.event === 'WITHDRAWN' ? tr("Lot retiré") : tr("Lot rétabli")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="sup-card-h">
            <h2><Icon name="truck-delivery" className="u-c-green" />{tr("Dernières commandes")}</h2>
            <button className="sup-link" onClick={go('sup-suivi')}>{tr("Tout voir")}</button>
          </div>
          {requests === undefined && <p className="u-fs-12 u-t8">{tr("Chargement…")}</p>}
          {requests === null && <p className="u-fs-12 u-t8">{tr("Impossible de charger les commandes pour le moment.")}</p>}
          {requests && latestOrders.length === 0 && (
            <div className="sup-empty">
              <span className="sup-empty-ico"><Icon name="package" /></span>
              <div className="sup-empty-t">{tr("Aucune commande pour le moment.")}</div>
              <div className="sup-empty-d">{tr("Vos commandes et leur état chez le fabricant apparaîtront ici.")}</div>
              <button className="btn btn--primary" onClick={go('sup-catalogue')}>{tr("Passer une commande")}</button>
            </div>
          )}
          {latestOrders.length > 0 && (
            <ul className="sup-list">
              {latestOrders.map((r) => {
                const s = requestState(r);
                return (
                  <li key={r.id} className="sup-row">
                    <span className="sup-row-ico"><Icon name={r.kind === 'ORDER' ? 'truck-delivery' : 'message'} /></span>
                    <span className="sup-row-main"><div className="sup-row-t">{r.summary || r.manufacturer || '—'}</div><div className="sup-row-s">{r.manufacturer ? `${r.manufacturer} · ` : ''}{ago(r.updatedAt)}</div></span>
                    <span className={`badge badge--${TONE[s.tone] ?? 'amber'}`}>{tr(s.label)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
