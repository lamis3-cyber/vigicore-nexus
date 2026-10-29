import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { orgApi } from '../../services/orgApi';
import { tr } from '../../../i18n/translate.js';
import '../../components/record-panel.css';
import '../admin/admin-dashboard.css';
import './organisation.css';

// ═══════════════════════════════════════════════════════════════
// "Organisation" — ONE page, two views, chosen by the session role:
//
//  • administrator (backend ORG_ADMIN)  -> AdminView
//      pending join requests (approve / reject), invite someone by e-mail,
//      pending invitations (revoke), active members (remove).
//  • every professional role (doctor / pharmacist / laboratory_staff /
//    medical_staff) -> WorkerView
//      my organizations + status, invitations I received (accept / decline),
//      search an organization and ask to join.
//
// Nothing here grants access by itself: membership only becomes effective once
// the server flips it to ACTIVE (admin approval or accepted invitation).
// ═══════════════════════════════════════════════════════════════

const ORG_TYPE_LABEL = {
  HOSPITAL: 'Hôpital', CLINIQUE: 'Clinique', CENTRE_MEDICAL: 'Centre médical',
  OFFICINE: 'Pharmacie', LABORATOIRE: 'Laboratoire',
};
const STATUS = {
  ACTIVE: { label: 'Membre', tone: 'green' },
  PENDING: { label: 'En attente d’approbation', tone: 'amber' },
  REJECTED: { label: 'Refusée', tone: 'red' },
};

export default function OrganisationPage() {
  const { user } = useAuth();
  return user?.role === 'administrator' ? <AdminView user={user} /> : <WorkerView />;
}

// ── Professional: join an organization ─────────────────────────
function WorkerView() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, memberships: [], invitations: [], error: '' });
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await orgApi.mine();
    setState(r.ok
      ? { loading: false, memberships: r.data.memberships, invitations: r.data.invitations, error: '' }
      : { loading: false, memberships: [], invitations: [], error: r.error });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn, okMsg) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { toast('error', tr("Action impossible"), tr(r.error), 'ti ti-alert-triangle'); return; }
    if (okMsg) toast('success', tr("Organisation"), okMsg, 'ti ti-circle-check');
    await load();
  }

  // Recherche en direct : dès la première lettre, avec un court délai pour ne pas interroger le serveur à chaque frappe.
  const searchSeq = useRef(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  useEffect(() => {
    const term = q.trim();
    const seq = ++searchSeq.current;
    if (term.length < 1) { setResults(null); setSearching(false); setSearchError(''); return undefined; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const r = await orgApi.search(term);
      if (seq !== searchSeq.current) return; // une frappe plus récente a pris le relais
      setSearching(false);
      if (!r.ok) { setSearchError(r.error); setResults(null); return; }
      setSearchError('');
      setResults(r.data.organizations);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  function search(e) { e.preventDefault(); } // Entrée : la recherche est déjà en direct

  const linked = new Set(state.memberships.filter((m) => m.status !== 'REJECTED').map((m) => m.organization.id));

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Mon organisation")}</h1>
          <p className="u-fs-12 u-t8">{tr("Votre compte est personnel. Il n’est relié à un établissement qu’après approbation de son administrateur ou acceptation d’une invitation.")}</p>
        </div>
      </div>

      {state.error && <div className="card"><p className="u-fs-12">{tr(state.error)}</p></div>}

      {state.invitations.length > 0 && (
        <div className="card">
          <h3 className="u-fs12-500">{tr("Invitations reçues")}</h3>
          {state.invitations.map((i) => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
              <div>
                <div className="u-fs12-500">{tr(i.organization.name)}</div>
                <div className="u-fs-12" style={{ color: 'var(--text-tertiary)' }}>{tr("{0} vous invite à rejoindre son équipe", [tr(ORG_TYPE_LABEL[i.organization.type] ?? i.organization.type)])}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--primary" disabled={busy} onClick={() => run(() => orgApi.acceptInvitation(i.id), 'Invitation acceptée.')}>{tr("Accepter")}</button>
                <button className="btn" disabled={busy} onClick={() => run(() => orgApi.declineInvitation(i.id))}>{tr("Refuser")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 className="u-fs12-500">{tr("Mes établissements")}</h3>
        {state.loading ? <p className="u-fs-12 u-t8">{tr("Chargement…")}</p>
          : state.memberships.length === 0 ? <p className="u-fs-12 u-t8">{tr("Vous n’êtes rattaché à aucun établissement (compte indépendant).")}</p>
          : state.memberships.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
              <div>
                <div className="u-fs12-500">{tr(m.organization.name)}</div>
                <div className="u-fs-12" style={{ color: 'var(--text-tertiary)' }}>{tr(ORG_TYPE_LABEL[m.organization.type] ?? m.organization.type)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge badge--${STATUS[m.status]?.tone ?? 'cyan'}`}>{tr(STATUS[m.status]?.label ?? m.status)}</span>
                {m.status === 'PENDING' && <button className="btn" disabled={busy} onClick={() => run(() => orgApi.cancelRequest(m.organization.id), 'Demande annulée.')}>{tr("Annuler")}</button>}
                {m.status === 'ACTIVE' && <button className="btn" disabled={busy} onClick={() => run(() => orgApi.leave(m.organization.id), 'Vous avez quitté l’établissement.')}>{tr("Quitter")}</button>}
              </div>
            </div>
          ))}
      </div>

      <div className="card">
        <h3 className="u-fs12-500">{tr("Rejoindre un établissement")}</h3>
        <form onSubmit={search} style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
          <input className="form-input" placeholder={tr("Nom de l’hôpital, clinique ou centre médical")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn--primary" type="submit" disabled={searching}><Icon name="search" />{tr("Rechercher")}</button>
        </form>
        {searchError && <p className="u-fs-12 u-t8">{tr(searchError)}</p>}
        {searching && !results && <p className="u-fs-12 u-t8">{tr("Recherche…")}</p>}
        {results && results.length === 0 && !searching && <p className="u-fs-12 u-t8">{tr("Aucun établissement trouvé.")}</p>}
        {results && results.length > 0 && <div className="org-results" role="list">
        {results.map((o) => (
          <div key={o.id} role="listitem" className="org-result">
            <div>
              <div className="u-fs12-500">{o.name}</div>
              <div className="u-fs-12" style={{ color: 'var(--text-tertiary)' }}>{tr(ORG_TYPE_LABEL[o.type] ?? o.type)}</div>
            </div>
            {linked.has(o.id)
              ? <span className="u-fs-12 u-t8">{tr("Déjà lié / demande en cours")}</span>
              : <button className="btn btn--primary" disabled={busy} onClick={() => run(() => orgApi.requestJoin(o.id), 'Demande envoyée à l’administrateur.')}><Icon name="user-plus" />{tr("Demander à rejoindre")}</button>}
          </div>
        ))}
        </div>}
        <p className="u-fs-12 u-t8" style={{ marginTop: 8 }}>{tr("Trouver un établissement par son nom ne suffit pas : l’administrateur doit confirmer que vous travaillez chez lui.")}</p>
      </div>
    </div>
  );
}

// ── Organization administrator ─────────────────────────────────
const ADMIN_ROLE_LABEL = {
  DOCTOR: 'Médecin', PHARMACIEN: 'Pharmacien', LABO: 'Laboratoire', HOSPITAL: 'Personnel médical',
  VIGILANCE_REVIEWER: 'Responsable vigilance', ORG_ADMIN: 'Administrateur',
};
const ROLE_TONE = { DOCTOR: 'cyan', PHARMACIEN: 'green', LABO: 'purple', HOSPITAL: 'blue', VIGILANCE_REVIEWER: 'amber', ORG_ADMIN: 'gray' };
const initialsOf = (n) => (n || '').replace(/^(Dr|Ph)\.?\s*/i, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };

const PROFESSION_LABEL = {
  doctor: 'Médecin', chef_de_service: 'Chef de service', pharmacist: 'Pharmacien', pharmacist_responsible: 'Pharmacien responsable',
  biologist: 'Biologiste', lab_technician: 'Technicien de laboratoire', lab_responsible: 'Responsable de laboratoire',
  nurse: 'Infirmier(ère)', aide_soignant: 'Aide-soignant(e)', sage_femme: 'Sage-femme', other: 'Autre',
};

function Person({ m, showDeclared = false }) {
  // Ce que la personne a déclaré à l'inscription (profession + service souhaité) : l'administrateur décide du vrai service.
  const declared = showDeclared ? [m.profession && tr(PROFESSION_LABEL[m.profession] ?? m.profession), m.requestedDepartment && tr("Service souhaité : {0}", [m.requestedDepartment])].filter(Boolean).join(' · ') : '';
  return (
    <div className="op-person">
      <span className={`op-avatar is-${ROLE_TONE[m.role] || 'gray'}`}>{initialsOf(m.displayName)}</span>
      <div className="op-person-main">
        <div className="op-name">{m.displayName}{m.memberRole === 'ADMIN' && <span className="op-admin">{tr("Admin")}</span>}</div>
        <div className="op-email">{m.email}</div>
        {declared && <div className="op-email">{declared}</div>}
      </div>
    </div>
  );
}

function AdminView({ user }) {
  const toast = useToast();
  const orgId = user.orgId;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [tab, setTab] = useState('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    const r = await orgApi.overview(orgId);
    if (r.ok) { setData(r.data); setError(''); } else setError(tr(r.error));
  }, [orgId]);
  useEffect(() => { load(); }, [load]);
  // Une demande en attente : l'onglet « Demandes » s'ouvre de lui-même au premier chargement.
  const opened = useRef(false);
  useEffect(() => { if (data && !opened.current) { opened.current = true; if (data.requests.length) setTab('requests'); } }, [data]);

  async function run(fn, okMsg) {
    setBusy(true);
    const r = await fn();
    setBusy(false); setConfirmRemove(null);
    if (!r.ok) { toast('error', tr("Action impossible"), tr(r.error), 'ti ti-alert-triangle'); return false; }
    if (okMsg) toast('success', tr("Équipe"), tr(okMsg), 'ti ti-circle-check');
    await load();
    return true;
  }

  async function invite(e) {
    e.preventDefault();
    if (!email.trim()) return;
    if (await run(() => orgApi.invite(orgId, email.trim()), 'Invitation envoyée.')) { setEmail(''); setInviteOpen(false); setTab('invitations'); }
  }

  if (!orgId) {
    return <div className="view is-active"><div className="card"><p className="u-fs-12 u-t8">{tr("Aucune organisation associée à ce compte.")}</p></div></div>;
  }
  const requests = data?.requests ?? [];
  const invitations = data?.invitations ?? [];
  const members = data?.members ?? [];
  const shownMembers = members.filter((m) => !q || `${m.displayName} ${m.email}`.toLowerCase().includes(q.toLowerCase()));
  const TABS = [
    { id: 'members', label: 'Membres', count: members.length },
    { id: 'requests', label: 'Demandes', count: requests.length, alert: requests.length > 0 },
    { id: 'invitations', label: 'Invitations', count: invitations.length },
  ];

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Équipe")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{data?.organization?.name ?? user.orgName}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => setInviteOpen(true)}><Icon name="user-plus" />{tr("Inviter un membre")}</button>
        </div>
      </div>

      {error && <div className="card"><p className="u-fs-12" role="alert">{tr(error)}</p></div>}

      <section className="card u-p-0 oq">
        <div className="oq-toolbar tm-toolbar">
          <div className="filter-tabs" role="tablist" aria-label={tr("Équipe")}>
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`filter-tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
                {tr(t.label)}<span className={`oq-count${t.alert ? ' tm-count-alert' : ''}`}>{t.count}</span>
              </button>
            ))}
          </div>
          {tab === 'members' && (
            <label className="op-search tm-search">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Rechercher un membre…")} aria-label={tr("Rechercher un membre")} />
            </label>
          )}
        </div>

        {!data && !error && <div className="oq-msg">{tr("Chargement…")}</div>}

        {data && tab === 'members' && (
          <div className="u-overflow-x-auto">
            <table className="oq-table">
              <thead><tr><th>{tr("Nom")}</th><th>{tr("Rôle")}</th><th>{tr("Service")}</th><th className="oq-col-date">{tr("Membre depuis")}</th><th aria-label={tr("Actions")} /></tr></thead>
              <tbody>
                {shownMembers.map((m) => (
                  <tr key={m.membershipId} className="op-row">
                    <td><Person m={m} /></td>
                    <td><span className={`op-role is-${ROLE_TONE[m.role] || 'gray'}`}>{tr(ADMIN_ROLE_LABEL[m.role] ?? m.role)}</span></td>
                    <td>{m.departmentName ? <span className="op-dept">{m.departmentName}</span> : <span className="u-c-tertiary">—</span>}</td>
                    <td className="oq-col-date oq-date">{fmtDate(m.since)}</td>
                    <td>
                      <div className="oq-actions">
                        {m.memberRole !== 'ADMIN' && (confirmRemove === m.membershipId ? (
                          <>
                            <button className="btn btn--sm" onClick={() => setConfirmRemove(null)}>{tr("Annuler")}</button>
                            <button className="btn btn--sm tm-danger" disabled={busy} onClick={() => run(() => orgApi.removeMember(orgId, m.membershipId), 'Membre retiré.')}>{tr("Confirmer le retrait")}</button>
                          </>
                        ) : (
                          <button className="btn btn--sm tm-ghost" onClick={() => setConfirmRemove(m.membershipId)}>{tr("Retirer")}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shownMembers.length === 0 && <div className="oq-empty"><Icon name="users" />{tr("Aucun membre ne correspond.")}</div>}
          </div>
        )}

        {data && tab === 'requests' && (requests.length === 0
          ? <div className="oq-empty"><Icon name="circle-check" />{tr("Aucune demande d’adhésion en attente.")}</div>
          : (
            <ul className="tm-rows">
              {requests.map((m) => (
                <li key={m.membershipId}>
                  <Person m={m} showDeclared />
                  <span className={`op-role is-${ROLE_TONE[m.role] || 'gray'}`}>{tr(ADMIN_ROLE_LABEL[m.role] ?? m.role)}</span>
                  <span className="tm-date">{tr("Demandée le {0}", [fmtDate(m.since)])}</span>
                  <div className="oq-actions">
                    <button className="btn btn--sm" disabled={busy} onClick={() => run(() => orgApi.reject(orgId, m.membershipId), 'Demande refusée.')}>{tr("Refuser")}</button>
                    <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(() => orgApi.approve(orgId, m.membershipId), 'Membre ajouté.')}><Icon name="check" />{tr("Approuver")}</button>
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {data && tab === 'invitations' && (invitations.length === 0
          ? <div className="oq-empty"><Icon name="send" />{tr("Aucune invitation en attente.")}</div>
          : (
            <ul className="tm-rows">
              {invitations.map((i) => (
                <li key={i.id}>
                  <div className="op-person">
                    <span className="op-avatar is-gray"><Icon name="send" /></span>
                    <div className="op-person-main"><div className="op-name">{i.email}</div><div className="op-email">{tr("Envoyée le {0}", [fmtDate(i.createdAt)])}</div></div>
                  </div>
                  <span className="tm-pill is-amber">{tr("En attente d’acceptation")}</span>
                  <span />
                  <div className="oq-actions">
                    <button className="btn btn--sm tm-ghost" disabled={busy} onClick={() => run(() => orgApi.revokeInvitation(orgId, i.id), 'Invitation annulée.')}>{tr("Annuler l’invitation")}</button>
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </section>

      {inviteOpen && (
        <div className="tm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setInviteOpen(false); }}>
          <form className="tm-modal" role="dialog" aria-modal="true" aria-labelledby="tm-invite-title" onSubmit={invite}>
            <div className="tm-modal-head">
              <h2 id="tm-invite-title">{tr("Inviter un membre")}</h2>
              <button type="button" className="icon-btn" aria-label={tr("Fermer")} onClick={() => setInviteOpen(false)}><Icon name="x" /></button>
            </div>
            <label className="tm-label" htmlFor="tm-invite-email">{tr("Adresse e-mail professionnelle")}</label>
            <input id="tm-invite-email" className="form-input" type="email" autoFocus required placeholder={tr("prenom.nom@etablissement.dz")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="tm-hint">{tr("La personne reçoit l’invitation dans son espace. Elle rejoint l’équipe dès qu’elle l’accepte.")}</p>
            <div className="tm-modal-foot">
              <button type="button" className="btn" onClick={() => setInviteOpen(false)}>{tr("Annuler")}</button>
              <button type="submit" className="btn btn--primary" disabled={busy || !email.trim()}><Icon name="send" />{tr("Envoyer l’invitation")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
