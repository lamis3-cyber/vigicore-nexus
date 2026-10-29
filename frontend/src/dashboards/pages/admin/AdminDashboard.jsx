import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { getOrganization, ORG_TYPES } from '../../config/organizations';
import { orgApi } from '../../services/orgApi';
import { listEstablishmentQueue } from '../../../lib/declarationsApi';
import { followUpOf, investigationOf, titleOf, agoOf } from '../../components/recordPresentation';
import { tr } from '../../../i18n/translate.js';
import '../../components/record-panel.css';
import './admin-dashboard.css';

// Tableau de bord de l'administrateur d'établissement — données RÉELLES du serveur :
//  - équipe : membres actifs, demandes d'adhésion, invitations, services (GET /api/orgs/:id/overview) ;
//  - déclarations de l'établissement (lecture seule) : nouvelles, mesures prises, enquêtes des fabricants (GET /api/records/queue).
// Aucune donnée patient n'est affichée ici.
const ROLE_LABEL = {
  DOCTOR: 'Médecins', PHARMACIEN: 'Pharmaciens', LABO: 'Laboratoire', HOSPITAL: 'Personnel médical',
  VIGILANCE_REVIEWER: 'Responsables vigilance', ORG_ADMIN: 'Administrateurs', ESTABLISHMENT_ADMIN: 'Fournisseurs', PATIENT: 'Patients',
};

function Kpi({ tone, icon, label, value, sub, onClick }) {
  return (
    <div className={`kpi-card ad-kpi is-${tone}${onClick ? ' is-link' : ''}`} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick} onKeyDown={(e) => { if (onClick && e.key === 'Enter') onClick(); }}>
      <div className="kpi-header"><div className="kpi-label">{tr(label)}</div><div className="kpi-icon ad-kpi-icon"><Icon name={icon} /></div></div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export default function AdminDashboard({ onNavigate }) {
  const { user } = useAuth();
  const org = user?.orgId ? getOrganization(user.orgId) : null;
  const [team, setTeam] = useState({ loading: true });
  const [decl, setDecl] = useState({ loading: true, records: [] });

  const load = useCallback(async () => {
    if (!user?.orgId) return;
    const [t, q] = await Promise.all([orgApi.overview(user.orgId), listEstablishmentQueue()]);
    setTeam(t.ok ? { loading: false, ok: true, ...t.data } : { loading: false, ok: false, error: t.error });
    setDecl({ loading: false, ...q });
  }, [user?.orgId]);
  useEffect(() => { load(); }, [load]);

  const records = decl.records || [];
  const stats = useMemo(() => ({
    fresh: records.filter((r) => followUpOf(r).id === 'new').length,
    done: records.filter((r) => followUpOf(r).id === 'done').length,
    investigating: records.filter((r) => ['RECEIVED', 'UNDER_REVIEW', 'WAITING_INFO'].includes(investigationOf(r).status)).length,
    closed: records.filter((r) => investigationOf(r).status === 'CLOSED').length,
    signals: records.filter((r) => (r.signal?.sameLot ?? 0) > 1).length,
  }), [records]);
  const members = team.members || [];
  const byRole = useMemo(() => {
    const m = new Map();
    for (const x of members) m.set(x.role, (m.get(x.role) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);

  if (!org) {
    return (
      <div className="view is-active">
        <div className="page-header"><div><h1 className="page-title">{tr("Administration")}</h1></div></div>
        <div className="card"><p className="u-fs-12 u-t8">{tr("Aucune organisation associée à ce compte administrateur.")}</p></div>
      </div>
    );
  }
  const orgTypeLabel = tr(ORG_TYPES[org.type]?.label ?? org.type);
  const requests = team.requests || [];
  const departments = team.departments || [];

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Bonjour,")} <span className="page-title-accent">{user?.name}</span></h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr(org.name)} · {orgTypeLabel}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate('org-personnel')}><Icon name="users-group" />{tr("Personnel")}</button>
          <button className="btn btn--primary" onClick={() => onNavigate('my-org')}><Icon name="user-plus" />{tr("Gérer l'équipe")}</button>
        </div>
      </div>

      <div className="grid-kpi">
        <Kpi tone="cyan" icon="users-group" label="Membres actifs" value={team.loading ? '…' : members.length}
          sub={requests.length ? tr("{0} demande(s) en attente", [requests.length]) : tr("aucune demande en attente")} onClick={() => onNavigate('org-personnel')} />
        <Kpi tone="purple" icon="building-hospital" label="Services" value={team.loading ? '…' : departments.length}
          sub={departments.length ? tr("services enregistrés") : tr("aucun service enregistré")} />
        <Kpi tone="amber" icon="bell" label="Nouvelles déclarations" value={decl.loading ? '…' : stats.fresh}
          sub={tr("{0} avec mesures prises", [stats.done])} onClick={() => onNavigate('org-declarations')} />
        <Kpi tone="green" icon="clipboard-check" label="Enquêtes fabricants" value={decl.loading ? '…' : stats.investigating}
          sub={tr("en cours · {0} clôturée(s)", [stats.closed])} onClick={() => onNavigate('org-declarations')} />
      </div>

      <div className="ad-grid">
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="users" className="u-c-blue" />{tr("Équipe")}</h2>
            {requests.length > 0 && <button className="btn" onClick={() => onNavigate('my-org')}>{tr("{0} demande(s) à traiter", [requests.length])}</button>}
          </div>
          {team.loading && <div className="u-fs-12 u-c-tertiary">{tr("Chargement…")}</div>}
          {!team.loading && !team.ok && <div className="u-fs-12" role="alert">{tr(team.error || "Équipe momentanément indisponible.")}</div>}
          {team.ok && (
            <ul className="ad-rows">
              {byRole.map(([role, n]) => (
                <li key={role}><span>{tr(ROLE_LABEL[role] || role)}</span><strong>{n}</strong></li>
              ))}
              {byRole.length === 0 && <li className="ad-empty">{tr("Aucun membre actif.")}</li>}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="building-hospital" className="u-c-purple" />{tr("Services")}</h2></div>
          {team.ok && (
            <ul className="ad-rows">
              {departments.map((d) => <li key={d.id}><span>{d.name}</span><strong>{tr("{0} membre(s)", [d.members])}</strong></li>)}
              {departments.length === 0 && <li className="ad-empty">{tr("Aucun service enregistré.")}</li>}
            </ul>
          )}
        </div>

        <div className="card ad-wide">
          <div className="section-header"><h2 className="section-title"><Icon name="clipboard-list" className="u-c-cyan" />{tr("Dernières déclarations")}</h2>
            <button className="btn" onClick={() => onNavigate('org-declarations')}>{tr("Tout voir")}</button>
          </div>
          {decl.loading && <div className="u-fs-12 u-c-tertiary">{tr("Chargement…")}</div>}
          {!decl.loading && records.length === 0 && <div className="ad-empty">{tr("Aucune déclaration reçue pour le moment.")}</div>}
          {records.length > 0 && (
            <ul className="ad-decls">
              {records.slice(0, 5).map((r) => {
                const fu = followUpOf(r); const inv = investigationOf(r);
                return (
                  <li key={r.id} onClick={() => onNavigate('org-declarations')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('org-declarations'); }}>
                    <div className="ad-decl-main">
                      <div className="ad-decl-title">{titleOf(r)}</div>
                      <div className="ad-decl-meta">{[r.authorName, r.departmentName, tr(agoOf(r.createdAt))].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className={`rp-badge is-${fu.tone}`}>{tr(fu.label)}</span>
                    <span className={`oq-inv is-${inv.tone}`}>{tr(inv.label)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {stats.signals > 0 && <div className="ad-signal"><Icon name="alert-triangle" />{tr("{0} déclaration(s) concernent un lot déjà déclaré dans l'établissement.", [stats.signals])}</div>}
        </div>
      </div>
    </div>
  );
}
