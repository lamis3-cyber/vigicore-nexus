import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { orgApi } from '../../services/orgApi';
import { tr, localeTag } from '../../../i18n/translate.js';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Équipe ».
//  • ADMINISTRATEUR de la société : voit l'équipe, invite un employé par e-mail, révoque une invitation, retire un employé.
//  • EMPLOYÉ (commercial, magasinier) : voit les invitations reçues à son adresse (accepter / refuser) puis, une fois dans
//    la société, ses collègues et le bouton « Quitter ».
// L'employé traite les commandes des clients et voit les produits ; il n'achète pas et ne gère pas le catalogue.
// Tous les droits sont re-vérifiés par le serveur : cette page n'affiche que ce que l'API accepte.
// ═══════════════════════════════════════════════════════════════

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const day = (iso) => new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });

export default function SupplierTeam() {
  const { user } = useAuth();
  return user?.isOrgAdmin !== false && user?.orgId ? <AdminView orgId={user.orgId} meId={user.id} /> : <StaffView />;
}

function AdminView({ orgId, meId }) {
  const toast = useToast();
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await orgApi.overview(orgId);
    if (r.ok) { setData(r.data); setError(null); } else { setData(null); setError(r.error); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  async function invite(e) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value) || busy) return;
    setBusy(true);
    const r = await orgApi.invite(orgId, value);
    setBusy(false);
    if (!r.ok) { toast('error', tr('Invitation impossible'), tr(r.error), 'ti ti-alert-circle'); return; }
    toast('success', tr('Invitation envoyée'), value, 'ti ti-circle-check');
    setEmail('');
    load();
  }
  async function run(fn, okTitle) {
    const r = await fn();
    if (!r.ok) toast('error', tr('Action impossible'), tr(r.error), 'ti ti-alert-circle');
    else toast('success', tr(okTitle), '', 'ti ti-circle-check');
    load();
  }
  const members = data?.members ?? [];
  const invitations = data?.invitations ?? [];

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr('Équipe')}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Vos employés traitent les commandes de vos clients. Ils n'achètent pas et ne modifient pas votre catalogue.")}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="sup-card-h"><h2><Icon name="user-plus" className="u-c-green" />{tr('Inviter un employé')}</h2></div>
        <form onSubmit={invite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="topbar-search" style={{ flex: '1 1 260px' }}>
            <Icon name="mail" />
            <input type="email" placeholder={tr('adresse e-mail de votre employé')} aria-label={tr('E-mail')} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </div>
          <button className="btn btn--primary" disabled={busy || !EMAIL_RE.test(email.trim())}><Icon name="send" />{tr('Inviter')}</button>
        </form>
        <div className="u-fs10-5-tertiary" style={{ marginTop: 6 }}>{tr("Votre employé crée un compte « Employé d'un distributeur » avec cette adresse, puis accepte l'invitation dans cette page.")}</div>
      </div>

      {error && <div className="card"><p className="u-fs-12" role="alert">{tr(error)}</p></div>}
      {data === undefined && <p className="u-fs-12 u-t8">{tr('Chargement…')}</p>}

      {data && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="sup-card-h"><h2><Icon name="users-group" className="u-c-cyan" />{tr('Membres')} ({members.length})</h2></div>
          <div className="u-overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>{tr('NOM')}</th><th>{tr('E-MAIL')}</th><th>{tr('RÔLE')}</th><th>{tr('DEPUIS')}</th><th /></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId}>
                    <td><div className="u-fs12-500">{m.displayName}{m.userId === meId ? ` (${tr('vous')})` : ''}</div></td>
                    <td>{m.email}</td>
                    <td><span className={`badge badge--${m.memberRole === 'ADMIN' ? 'green' : 'cyan'}`}>{m.memberRole === 'ADMIN' ? tr('Administrateur') : tr('Employé')}</span></td>
                    <td>{m.since ? day(m.since) : '—'}</td>
                    <td>{m.memberRole !== 'ADMIN' && <button className="tbl-action-btn" onClick={() => { if (window.confirm(tr('Retirer cet employé de la société ?'))) run(() => orgApi.removeMember(orgId, m.membershipId), 'Employé retiré'); }}>{tr('Retirer')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && invitations.length > 0 && (
        <div className="card">
          <div className="sup-card-h"><h2><Icon name="mail" className="u-c-amber" />{tr('Invitations en attente')} ({invitations.length})</h2></div>
          <ul className="sup-list">
            {invitations.map((i) => (
              <li key={i.id} className="sup-row">
                <span className="sup-row-main"><div className="sup-row-t">{i.email}</div><div className="sup-row-s">{tr('Envoyée le')} {day(i.createdAt)}</div></span>
                <button className="tbl-action-btn" onClick={() => run(() => orgApi.revokeInvitation(orgId, i.id), 'Invitation révoquée')}>{tr('Révoquer')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StaffView() {
  const toast = useToast();
  const [data, setData] = useState(undefined);
  const load = useCallback(async () => {
    const r = await orgApi.mine();
    setData(r.ok ? r.data : null);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Le compte change de société : on recharge la session pour que le menu et les droits suivent.
  async function answer(fn, reload) {
    const r = await fn();
    if (!r.ok) { toast('error', tr('Action impossible'), tr(r.error), 'ti ti-alert-circle'); load(); return; }
    if (reload) { window.location.reload(); return; }
    load();
  }
  const active = (data?.memberships ?? []).filter((m) => m.status === 'ACTIVE');
  const invitations = (data?.invitations ?? []).filter((i) => i.organization?.type === 'SUPPLIER');

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr('Équipe')}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Rejoignez l'équipe de votre entreprise pour traiter les commandes de ses clients.")}</div>
        </div>
      </div>
      {data === undefined && <p className="u-fs-12 u-t8">{tr('Chargement…')}</p>}
      {data === null && <div className="card"><p className="u-fs-12" role="alert">{tr('Impossible de charger votre équipe pour le moment.')}</p></div>}

      {data && invitations.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="sup-card-h"><h2><Icon name="mail" className="u-c-amber" />{tr('Invitations reçues')}</h2></div>
          <ul className="sup-list">
            {invitations.map((i) => (
              <li key={i.id} className="sup-row">
                <span className="sup-row-main"><div className="sup-row-t">{i.organization.name}</div><div className="sup-row-s">{tr('Reçue le')} {day(i.createdAt)}</div></span>
                <button className="btn" onClick={() => answer(() => orgApi.declineInvitation(i.id), false)}>{tr('Refuser')}</button>
                <button className="btn btn--primary" onClick={() => answer(() => orgApi.acceptInvitation(i.id), true)}>{tr('Accepter')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && active.length === 0 && invitations.length === 0 && (
        <div className="card sup-empty">
          <span className="sup-empty-ico"><Icon name="user-plus" /></span>
          <div className="sup-empty-t">{tr("Aucune invitation pour l'instant")}</div>
          <div className="sup-empty-d">{tr("Demandez à l'administrateur de votre entreprise de vous inviter avec l'adresse e-mail de votre compte. L'invitation apparaîtra ici.")}</div>
        </div>
      )}

      {data && active.map((m) => (
        <div key={m.id} className="card" style={{ marginBottom: 14 }}>
          <div className="sup-card-h"><h2><Icon name="building-store" className="u-c-green" />{m.organization.name}</h2><span className="badge badge--cyan">{tr('Employé')}</span></div>
          <div className="u-fs-12">{tr("Vous traitez les commandes de ses clients (Commandes clients) et consultez ses produits.")}</div>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => { if (window.confirm(tr('Quitter cette entreprise ?'))) answer(() => orgApi.leave(m.organization.id), true); }}>{tr("Quitter l'entreprise")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
