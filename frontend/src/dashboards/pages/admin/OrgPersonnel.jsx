import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { orgApi } from '../../services/orgApi';
import { tr } from '../../../i18n/translate.js';
import '../../components/record-panel.css';
import './admin-dashboard.css';

// Personnel de l'établissement — membres RÉELS (comptes du site rattachés à l'établissement), avec leur rôle et leur service.
// Les ajouts, approbations et retraits se font dans « Équipe ».
const ROLE = {
  DOCTOR: 'Médecin', PHARMACIEN: 'Pharmacien', LABO: 'Laboratoire', HOSPITAL: 'Personnel médical',
  VIGILANCE_REVIEWER: 'Responsable vigilance', ORG_ADMIN: 'Administrateur', ESTABLISHMENT_ADMIN: 'Fournisseur', PATIENT: 'Patient',
};
// Seuls médecins et personnel médical sont rattachés à UN service ; pharmacie et laboratoire servent tout l'établissement.
const DEPT_ROLES = new Set(['DOCTOR', 'HOSPITAL']);
const ROLE_TONE = { DOCTOR: 'cyan', PHARMACIEN: 'green', LABO: 'purple', HOSPITAL: 'blue', VIGILANCE_REVIEWER: 'amber', ORG_ADMIN: 'gray' };
const initials = (n) => (n || '').replace(/^(Dr|Ph)\.?\s*/i, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };

export default function OrgPersonnel({ onNavigate }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true });
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [role, setRole] = useState('');
  const [newService, setNewService] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    if (!user?.orgId) return setState({ loading: false, ok: false, error: 'Aucune organisation associée à ce compte.' });
    const r = await orgApi.overview(user.orgId);
    setState(r.ok ? { loading: false, ok: true, ...r.data } : { loading: false, ok: false, error: r.error });
  }, [user?.orgId]);
  useEffect(() => { load(); }, [load]);

  const run = async (call) => {
    setBusy(true); setMsg(null);
    const r = await call();
    setBusy(false);
    if (!r.ok) setMsg({ error: true, text: r.error });
    else await load();
    return r.ok;
  };
  const assign = (m, departmentId) => run(() => orgApi.setMemberDepartment(user.orgId, m.membershipId, departmentId || null));
  const addService = async (e) => {
    e.preventDefault();
    const name = newService.trim();
    if (!name) return;
    if (await run(() => orgApi.createDepartment(user.orgId, name))) setNewService('');
  };

  const members = state.members || [];
  const roles = [...new Set(members.map((m) => m.role))];
  const rows = useMemo(() => members.filter((m) =>
    (!q || `${m.displayName} ${m.email}`.toLowerCase().includes(q.toLowerCase()))
    && (!dept || (dept === '__none' ? !m.departmentId : m.departmentId === dept))
    && (!role || m.role === role)), [members, q, dept, role]);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Personnel")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Comptes rattachés à votre établissement.")}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => onNavigate?.('my-org')}><Icon name="user-plus" />{tr("Gérer l'équipe")}</button>
        </div>
      </div>

      {state.ok && (state.requests || []).length > 0 && (
        <div className="ad-alert" role="note">
          <Icon name="user-plus" />
          <div><strong>{tr("{0} demande(s) d'adhésion en attente", [state.requests.length])}</strong><span>{tr("Approuvez ou refusez-les dans « Équipe ».")}</span></div>
          <button className="btn" onClick={() => onNavigate?.('my-org')}>{tr("Équipe")}</button>
        </div>
      )}

      {state.ok && (
        <form className="op-filter" onSubmit={addService} style={{ marginBottom: 12 }}>
          <input className="form-input" value={newService} onChange={(e) => setNewService(e.target.value)} maxLength={80}
            placeholder={tr("Nouveau service (ex. Cardiologie)")} aria-label={tr("Nom du nouveau service")} />
          <button className="btn" type="submit" disabled={busy || !newService.trim()}>{tr("Ajouter le service")}</button>
        </form>
      )}
      {msg && <div className="oq-msg" role={msg.error ? 'alert' : 'status'}>{tr(msg.text)}</div>}

      <section className="card u-p-0 oq">
        <div className="oq-toolbar">
          <div className="op-filter">
            <label className="op-search">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Rechercher un nom ou un e-mail…")} aria-label={tr("Rechercher")} />
            </label>
            <select className="form-input op-select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label={tr("Service")}>
              <option value="">{tr("Tous les services")}</option>
              {(state.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="__none">{tr("Sans service")}</option>
            </select>
            <select className="form-input op-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label={tr("Rôle")}>
              <option value="">{tr("Tous les rôles")}</option>
              {roles.map((r) => <option key={r} value={r}>{tr(ROLE[r] || r)}</option>)}
            </select>
          </div>
          <span className="op-count">{tr("{0} membre(s)", [rows.length])}</span>
        </div>
        {state.loading && <div className="oq-msg">{tr("Chargement…")}</div>}
        {!state.loading && !state.ok && <div className="oq-msg" role="alert">{tr(state.error || "Liste momentanément indisponible.")}</div>}
        {state.ok && rows.length === 0 && <div className="oq-empty"><Icon name="users" />{tr("Aucun membre ne correspond.")}</div>}
        {state.ok && rows.length > 0 && (
          <div className="u-overflow-x-auto">
            <table className="oq-table">
              <thead><tr><th>{tr("Nom")}</th><th>{tr("Rôle")}</th><th>{tr("Service")}</th><th className="oq-col-date">{tr("Membre depuis")}</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.membershipId} className="op-row">
                    <td>
                      <div className="op-person">
                        <span className={`op-avatar is-${ROLE_TONE[m.role] || 'gray'}`}>{initials(m.displayName)}</span>
                        <div className="op-person-main">
                          <div className="op-name">{m.displayName}{m.memberRole === 'ADMIN' && <span className="op-admin">{tr("Admin")}</span>}</div>
                          <div className="op-email">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`op-role is-${ROLE_TONE[m.role] || 'gray'}`}>{tr(ROLE[m.role] || m.role)}</span></td>
                    <td>
                      {DEPT_ROLES.has(m.role) ? (
                        <select className="form-input op-select" value={m.departmentId || ''} disabled={busy}
                          onChange={(e) => assign(m, e.target.value)} aria-label={tr("Service de {0}", [m.displayName])}>
                          <option value="">{tr("Sans service")}</option>
                          {(state.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      ) : (
                        <span className="u-c-tertiary">{m.role === 'PHARMACIEN' || m.role === 'LABO' ? tr("Tout l'établissement") : '—'}</span>
                      )}
                    </td>
                    <td className="oq-col-date oq-date">{fmt(m.since)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
