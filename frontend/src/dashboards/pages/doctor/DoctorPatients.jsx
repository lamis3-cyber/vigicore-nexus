import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../context/ToastContext';
import { DR_PATIENTS, DR_DECLARATIONS } from '../../data/doctorVigilance';
import { savePatientDetailed, archivePatient, emailPatient, listArchivedPatients, restorePatient, hidePatient, unhidePatient } from '../../data/vigilanceStore';
import { chatApi } from '../../services/chatApi';
import { requestOpenChat } from '../../data/chatDeepLink';
import { getCurrentAuthUser } from '../../context/AuthContext';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr, localeTag } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-doc-patients (doctor scope), 1:1 with the
// original's renderDrPatients() / openPatientDetail() / openAddPatientDrawer()
// / submitAddPatient() functions.
//
// Notes on fidelity:
//  - The original has NO search or filter controls on this page — just
//    the patient count in the header, the table, and "Nouveau patient".
//    So none are added here.
//  - The generic #detailDrawer (openDrawer/closeDrawer) is a singleton
//    reused across the whole original app for patient records,
//    declaration files, etc. Since only this page is migrated so far,
//    it's reimplemented here as a small local, React-state-driven
//    drawer using the same CSS (chat-overlay / chat-panel--wide /
//    drawer-*) rather than introducing a new shared/global component
//    that other unmigrated pages aren't ready to plug into yet.
//  - "Contacter" in the patient drawer originally did
//    closeDrawer(); navigate('doc-messagerie'); openThreadForPatient(id).
//    doc-messagerie isn't migrated yet (falls back to ComingSoon), so
//    this closes the drawer and navigates there — same as the original
//    would end up doing visually once doc-messagerie exists.
// ═══════════════════════════════════════════════════════════════

function timelineHTMLFor(patientId) {
  // Same org-scoping rule as scopedPatients below: a patient's
  // declaration timeline must not leak declarations stamped with a
  // different organizationId (or a standalone declaration to an
  // org-employed doctor, and vice-versa).
  return DR_DECLARATIONS.filter(
    (d) => d.patientId === patientId && isOrgScopedRecordVisible(d, getCurrentAuthUser())
  );
}

export default function DoctorPatients({ onNavigate }) {
  // renderDrPatients() reads DR_PATIENTS live; forceTick lets local
  // mutations (push from "Nouveau patient") trigger a re-render since
  // the array itself is a plain mutable module-level export, not state.
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);

  // Blocker 2 fix — org scoping: this page is reused unmodified by
  // every doctor account (standalone and org-employed alike — see
  // navConfig.js), so a patient added by a CHU Alger doctor must not
  // be visible to a Clinique El Fedjr doctor, and vice-versa. Uses
  // getCurrentAuthUser() (the module-level auth mirror, not the
  // useAuth() hook) so this page doesn't gain a React-context
  // dependency it didn't have before — DoctorPatients.test.jsx renders
  // it without <AuthProvider>.
  const scopedPatients = DR_PATIENTS.filter((p) => isOrgScopedRecordVisible(p, getCurrentAuthUser()));

  const [drawer, setDrawer] = useState(null); // null | { type: 'detail', patient } | { type: 'add' }

  // ── openAddPatientDrawer() / submitAddPatient() form fields ──
  const [npNom, setNpNom] = useState('');
  const [npAge, setNpAge] = useState('');
  const [npSexe, setNpSexe] = useState('F');
  const [npPathologie, setNpPathologie] = useState('');
  const [npAllergies, setNpAllergies] = useState('');
  const [npEmail, setNpEmail] = useState('');
  const [msgText, setMsgText] = useState('');
  const [busy, setBusy] = useState(false);
  // Archives : dossiers conservés en base, en lecture seule (chargés depuis le serveur à l'ouverture de l'onglet).
  const [view, setView] = useState('active'); // 'active' | 'archived'
  const [archived, setArchived] = useState([]);
  const [archState, setArchState] = useState('idle'); // idle | loading | error
  const [showHidden, setShowHidden] = useState(false);
  const [archReason, setArchReason] = useState('');

  const toast = useToast();

  async function loadArchived(hidden = showHidden) {
    setArchState('loading');
    try { setArchived(await listArchivedPatients(hidden)); setArchState('idle'); } catch { setArchState('error'); }
  }
  useEffect(() => { if (view === 'archived') loadArchived(); }, [view, showHidden]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeDrawer() {
    setDrawer(null);
  }

  function openPatientDetail(patient) {
    setDrawer({ type: 'detail', patient });
  }

  function openAddPatientDrawer() {
    setNpNom('');
    setNpAge('');
    setNpSexe('F');
    setNpPathologie('');
    setNpAllergies('');
    setNpEmail('');
    setDrawer({ type: 'add' });
  }

  function submitAddPatient() {
    const name = npNom.trim();
    const age = parseInt(npAge, 10);
    const sex = npSexe;
    const condition = npPathologie.trim() || 'Non renseignée';
    const allergiesRaw = npAllergies.trim();
    const allergies = allergiesRaw ? allergiesRaw.split(',').map((a) => a.trim()).filter(Boolean) : ['Aucune connue'];

    const email = npEmail.trim().toLowerCase();
    if (!name || !age) {
      toast('error', tr("Champs requis"), tr("Merci de renseigner au moins le nom et l'âge du patient."), 'ti ti-alert-circle');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('error', tr("Champs requis"), tr("Indiquez l'adresse e-mail du patient."), 'ti ti-alert-circle');
      return;
    }

    const organizationId = getCurrentAuthUser()?.organizationId ?? null;
    setBusy(true);
    savePatientDetailed({ name, age, sex, condition, allergies, email })
      .then(({ patient: saved, linked, emailStatus }) => {
        // Le patient affiché est celui que la base a enregistré (id réel, organisation décidée par le serveur).
        DR_PATIENTS.push({ ...saved, organizationId: saved.organizationId ?? organizationId });
        rerender();
        closeDrawer();
        const mail = emailStatus === 'sent' ? tr("Un e-mail lui a été envoyé.")
          : emailStatus === 'not_configured' ? tr("E-mail non envoyé : le serveur d'e-mail n'est pas configuré.")
          : tr("L'e-mail n'a pas pu être envoyé.");
        const link = linked ? tr("Sa demande de contact attend son acceptation dans la messagerie.") : tr("Il n'a pas encore de compte VigiCore : il pourra en créer un avec cette adresse.");
        toast(emailStatus === 'sent' ? 'success' : 'warn', tr("Patient ajouté"), `${tr("{0} a été ajouté à votre liste de suivi.", [name])} ${mail} ${link}`, 'ti ti-user-check');
      })
      .catch((err) => {
        toast('error', tr("Patient non enregistré"), tr(err?.message || "Le serveur a refusé la demande."), 'ti ti-alert-circle');
      })
      .finally(() => setBusy(false));
  }

  // "Contacter" : ouvre la fiche de contact du patient. Si son compte a accepté la messagerie, le message part
  // directement dans la conversation (qui s'ouvre) ; sinon il part par e-mail.
  function openContact(patient) {
    setMsgText('');
    setDrawer({ type: 'contact', patient });
    if (patient.patientUserId && patient.chatStatus !== 'connected') {
      chatApi.connections().then((r) => {
        if (r.friends.some((f) => f.user.id === patient.patientUserId)) { patient.chatStatus = 'connected'; rerender(); }
      }).catch(() => {});
    }
  }

  async function sendContact() {
    const patient = drawer.patient;
    const text = msgText.trim();
    if (!text) { toast('error', tr("Message vide"), tr("Écrivez un message."), 'ti ti-alert-circle'); return; }
    setBusy(true);
    try {
      if (patient.patientUserId && patient.chatStatus === 'connected') {
        const t = await chatApi.openThread(patient.patientUserId);
        await chatApi.send(t.threadId, { body: text });
        requestOpenChat(patient.patientUserId);
        closeDrawer();
        toast('success', tr("Message envoyé"), tr("Votre message a été envoyé à {0} dans la messagerie.", [patient.name]), 'ti ti-send');
        onNavigate('doc-messagerie');
      } else {
        await emailPatient(patient.id, text);
        closeDrawer();
        toast('success', tr("E-mail envoyé"), tr("Votre message a été envoyé par e-mail à {0}.", [patient.name]), 'ti ti-send');
      }
    } catch (err) {
      toast('error', tr("Message non envoyé"), tr(err?.message || "Le serveur a refusé la demande."), 'ti ti-alert-circle');
    } finally {
      setBusy(false);
    }
  }

  function askDelete(patient) { setArchReason(''); setDrawer({ type: 'delete', patient }); }

  // « Supprimer » = archiver : le dossier est conservé en base, en lecture seule, dans votre compte.
  async function confirmDelete() {
    const patient = drawer.patient;
    setBusy(true);
    try {
      await archivePatient(patient.id, archReason.trim() || undefined);
      const i = DR_PATIENTS.findIndex((p) => p.id === patient.id);
      if (i >= 0) DR_PATIENTS.splice(i, 1);
      rerender();
      closeDrawer();
      toast('success', tr("Dossier archivé"), tr("{0} a été archivé : le dossier est conservé en lecture seule dans l'onglet Archivés.", [patient.name]), 'ti ti-folder');
    } catch (err) {
      toast('error', tr("Archivage impossible"), tr(err?.message || "Le serveur a refusé la demande."), 'ti ti-alert-circle');
    } finally {
      setBusy(false);
    }
  }

  async function runArchiveAction(patient, fn, okTitle, okText) {
    setBusy(true);
    try {
      await fn(patient.id);
      closeDrawer();
      toast('success', okTitle, okText, 'ti ti-circle-check');
      await loadArchived();
    } catch (err) {
      toast('error', tr("Action impossible"), tr(err?.message || "Le serveur a refusé la demande."), 'ti ti-alert-circle');
    } finally { setBusy(false); }
  }
  async function confirmRestore() {
    const patient = drawer.patient;
    setBusy(true);
    try {
      await restorePatient(patient.id);
      DR_PATIENTS.push({ ...patient, archived: false });
      rerender();
      closeDrawer();
      setArchived((l) => l.filter((x) => x.id !== patient.id));
      toast('success', tr("Dossier restauré"), tr("{0} est de nouveau dans votre liste de suivi.", [patient.name]), 'ti ti-rotate-clockwise');
    } catch (err) {
      toast('error', tr("Action impossible"), tr(err?.message || "Le serveur a refusé la demande."), 'ti ti-alert-circle');
    } finally { setBusy(false); }
  }
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(localeTag()); } catch { return ''; } };

  const contactNote = (p) => (!p.email ? tr("Aucune adresse e-mail enregistrée pour ce patient : impossible de le contacter.")
    : p.patientUserId && p.chatStatus === 'connected' ? tr("Ce patient est dans votre messagerie : le message lui est envoyé directement et la conversation s'ouvre.")
    : p.patientUserId ? tr("Ce patient n'a pas encore accepté votre demande de messagerie : le message part par e-mail.")
    : tr("Ce patient n'a pas de compte VigiCore : le message part par e-mail."));

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Patients")} <span className="page-title-accent">{tr("suivis")}</span></h1></div>
        <div className="page-actions">
          <span className="u-fs10-tertiary">{tr("{0} patients · 4 domaines de vigilance", [scopedPatients.length])}</span>
          <button className="btn btn--primary" onClick={openAddPatientDrawer}>
            <Icon name="user-plus" />{tr("Nouveau patient")}
          </button>
        </div>
      </div>

      <div className="filter-tabs" role="tablist" aria-label={tr("Patients actifs ou archivés")} style={{ marginBottom: 8 }}>
        <button role="tab" aria-selected={view === 'active'} className={`filter-tab${view === 'active' ? ' is-active' : ''}`} onClick={() => setView('active')}>{tr("Actifs")} ({scopedPatients.length})</button>
        <button role="tab" aria-selected={view === 'archived'} className={`filter-tab${view === 'archived' ? ' is-active' : ''}`} onClick={() => setView('archived')}>{tr("Archivés")}</button>
      </div>

      {view === 'archived' && (
        <div className="card u-p-0">
          <div className="u-fs-12 u-c-tertiary" style={{ padding: '12px 16px' }}>
            {tr("Dossiers conservés en base, en lecture seule : ils ne peuvent plus être modifiés. Vous pouvez les restaurer ou les retirer de l'affichage (ils restent conservés).")}
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginInlineStart: 12 }}>
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />{tr("Afficher aussi les dossiers retirés")}
            </label>
          </div>
          {archState === 'loading' && <div className="u-fs-12" style={{ padding: 16 }}>{tr("Chargement…")}</div>}
          {archState === 'error' && <div className="u-fs-12" style={{ padding: 16, color: 'var(--color-red)' }}>{tr("Archives momentanément indisponibles.")} <button className="tbl-action-btn" onClick={() => loadArchived()}>{tr("Réessayer")}</button></div>}
          {archState === 'idle' && archived.length === 0 && <EmptyState bare icon="folder" title="Aucun dossier archivé" text="Les patients que vous archivez apparaissent ici, en lecture seule." />}
          {archived.length > 0 && (
            <div className="u-overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>{tr("PATIENT")}</th><th>{tr("PATHOLOGIE SUIVIE")}</th><th>{tr("ARCHIVÉ LE")}</th><th>{tr("MOTIF")}</th><th>{tr("ACTIONS")}</th></tr></thead>
                <tbody>
                  {archived.map((p) => (
                    <tr key={p.id} style={p.hidden ? { opacity: 0.6 } : undefined}>
                      <td><div className="patient-row-name"><div className="patient-mini-avatar" style={{ background: p.color }}>{p.initials}</div><div className="u-fs12-500">{tr(p.name)}</div></div></td>
                      <td><div className="u-fs-12">{p.condition}</div></td>
                      <td><div className="u-fs-12">{fmtDate(p.archivedAt)}{p.hidden ? ` · ${tr("retiré de l'affichage")}` : ''}</div></td>
                      <td><div className="u-fs-12">{p.archiveReason || '—'}</div></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => openPatientDetail(p)}>{tr("Consulter")}</button>
                          <button className="tbl-action-btn" onClick={() => setDrawer({ type: 'restore', patient: p })}>{tr("Restaurer")}</button>
                          {p.hidden
                            ? <button className="tbl-action-btn" disabled={busy} onClick={() => runArchiveAction(p, unhidePatient, tr("Dossier réaffiché"), tr("{0} est de nouveau visible dans les archives.", [p.name]))}>{tr("Réafficher")}</button>
                            : <button className="tbl-action-btn" style={{ color: 'var(--color-red)' }} onClick={() => setDrawer({ type: 'hide', patient: p })}>{tr("Retirer de l'affichage")}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'active' && (
      <div className="card u-p-0">
        <div className="u-overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("PATIENT")}</th><th>{tr("ÂGE / SEXE")}</th><th>{tr("PATHOLOGIE SUIVIE")}</th><th>{tr("ALLERGIES")}</th>
                <th>{tr("DÉCLARATIONS")}</th><th>{tr("DERNIÈRE VISITE")}</th><th>{tr("ACTIONS")}</th>
              </tr>
            </thead>
            <tbody>
              {scopedPatients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="patient-row-name">
                      <div className="patient-mini-avatar" style={{ background: p.color }}>{p.initials}</div>
                      <div className="u-fs12-500">{tr(p.name)}</div>
                    </div>
                  </td>
                  <td><div className="u-fs-12">{tr("{0} ans · {1}", [p.age, p.sex === 'F' ? 'Féminin' : 'Masculin'])}</div></td>
                  <td><div className="u-fs-12">{p.condition}</div></td>
                  <td><div className="u-fs-12">{p.allergies.join(', ')}</div></td>
                  <td><span className="badge badge--cyan">{tr("{0} déclaration{1}", [p.declCount, p.declCount > 1 ? 's' : ''])}</span></td>
                  <td><div className="u-fs-12">{p.lastVisit}</div></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="tbl-action-btn tbl-action-btn--primary" onClick={() => openPatientDetail(p)}>{tr("Dossier")}</button>
                      <button className="tbl-action-btn" onClick={() => openContact(p)} aria-label={tr("Contacter {0}", [p.name])}>{tr("Contacter")}</button>
                      <button className="tbl-action-btn" onClick={() => askDelete(p)} aria-label={tr("Retirer {0}", [p.name])} style={{ color: 'var(--color-red)' }}>{tr("Supprimer")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {scopedPatients.length === 0 && <EmptyState bare icon="users" title="Aucun patient suivi" text="Les patients de votre portefeuille apparaîtront ici." />}
        </div>
      </div>
      )}

      {drawer && (
        <>
          <div className="chat-overlay is-open" onClick={closeDrawer} />
          <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
            <div className="chat-header">
              <div className="chat-header-inner">
                {drawer.type !== 'add' ? (
                  <div className="drawer-icon" style={{ background: drawer.patient.color, color: '#fff' }}>
                    <Icon name="user" />
                  </div>
                ) : (
                  <div className="drawer-icon" style={{ background: 'var(--color-brand-dim)', color: '#fff' }}>
                    <Icon name="user-plus" />
                  </div>
                )}
                <div className="u-flex-1 u-t31">
                  <div id="drawerTitle" className="u-fs13-strong">
                    {drawer.type !== 'add' ? tr(drawer.patient.name) : tr("Nouveau patient")}
                  </div>
                  <div className="u-fs10-5-tertiary">
                    {drawer.type === 'detail' ? tr("Dossier patient · Vigilance") : drawer.type === 'contact' ? tr("Contacter le patient") : drawer.type === 'delete' ? tr("Archiver le dossier") : drawer.type === 'restore' ? tr("Restaurer le dossier") : drawer.type === 'hide' ? tr("Retirer de l'affichage") : tr("Ajouter un dossier de vigilance")}
                  </div>
                </div>
                <button className="chat-close" onClick={closeDrawer} aria-label={tr("Fermer le panneau de détail")}>
                  <Icon name="x" />
                </button>
              </div>
            </div>

            <div className="chat-messages" style={{ gap: '16px' }}>
              {drawer.type === 'detail' && (
                <>
                  {drawer.patient.archived && (
                    <div className="drawer-section" role="status" style={{ border: '1px solid var(--color-amber, #f59e0b)', borderRadius: 10, padding: 12 }}>
                      <div className="u-fs13-strong">{tr("Dossier archivé — lecture seule")}</div>
                      <div className="u-fs-12 u-c-tertiary">{tr("Archivé le {0}. Ce dossier est conservé et ne peut plus être modifié.", [fmtDate(drawer.patient.archivedAt)])}{drawer.patient.archiveReason ? ` ${tr("Motif")} : ${drawer.patient.archiveReason}` : ''}</div>
                    </div>
                  )}
                  <div className="drawer-section">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="patient-mini-avatar" style={{ background: drawer.patient.color, width: '44px', height: '44px', fontSize: '14px' }}>
                        {drawer.patient.initials}
                      </div>
                      <div>
                        <div className="u-fs13-strong">{tr(drawer.patient.name)}</div>
                        <div className="u-fs10-5-tertiary">{tr("{0} ans · {1}", [drawer.patient.age, drawer.patient.sex === 'F' ? 'Féminin' : 'Masculin'])}</div>
                      </div>
                    </div>
                    <div className="drawer-kv">
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Pathologie suivie")}</span><span className="drawer-kv-value">{drawer.patient.condition}</span></div>
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Allergies")}</span><span className="drawer-kv-value">{drawer.patient.allergies.join(', ')}</span></div>
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Dernière visite")}</span><span className="drawer-kv-value">{drawer.patient.lastVisit}</span></div>
                      <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Déclarations")}</span><span className="drawer-kv-value">{drawer.patient.declCount}</span></div>
                    </div>
                  </div>
                  <div className="drawer-section">
                    <div className="drawer-section-title">{tr("Historique de vigilance")}</div>
                    {(() => {
                      const decls = timelineHTMLFor(drawer.patient.id);
                      if (!decls.length) {
                        return <div className="u-fs-12 u-c-tertiary">{tr("Aucune déclaration enregistrée.")}</div>;
                      }
                      return (
                        <div className="timeline">
                          {decls.map((d) => (
                            <div className="tl-item" key={d.id}>
                              <div className={`tl-dot ${d.status === 'closed' ? 'tl-dot--green' : d.severity === 'grave' ? 'tl-dot--amber' : 'tl-dot--active'}`} />
                              <div className="tl-time">{d.date}</div>
                              <div className="tl-body">
                                <div className="tl-event">{tr(d.domain)} — {d.product.split(' · ')[0]}</div>
                                <div className="tl-sub">{d.effect} · <span className="u-mono">{d.ref}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {drawer.type === 'contact' && (
                <div className="drawer-section">
                  <div className="u-fs-12 u-c-tertiary" style={{ marginBottom: 10 }}>{contactNote(drawer.patient)}</div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ctMsg">{tr("Votre message")}</label>
                    <textarea id="ctMsg" className="form-input" rows={6} maxLength={2000} value={msgText} onChange={(e) => setMsgText(e.target.value)} disabled={!drawer.patient.email} />
                  </div>
                </div>
              )}

              {drawer.type === 'delete' && (
                <div className="drawer-section">
                  <div className="u-fs-12">{tr("Archiver {0} ? Le dossier n'est pas effacé : il est conservé en base, dans votre compte, en lecture seule (aucune modification possible). Vous pourrez le consulter, le restaurer ou le retirer de l'affichage depuis l'onglet Archivés. Ses déclarations de vigilance existantes sont conservées.", [drawer.patient.name])}</div>
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label" htmlFor="archReason">{tr("Motif (facultatif)")}</label>
                    <input id="archReason" className="form-input" maxLength={300} value={archReason} onChange={(e) => setArchReason(e.target.value)} placeholder={tr("Ex : fin de suivi")} />
                  </div>
                </div>
              )}

              {drawer.type === 'restore' && (
                <div className="drawer-section"><div className="u-fs-12">{tr("Restaurer {0} dans votre liste de patients suivis ? Le dossier redevient modifiable.", [drawer.patient.name])}</div></div>
              )}

              {drawer.type === 'hide' && (
                <div className="drawer-section"><div className="u-fs-12">{tr("Retirer {0} de l'affichage ? Le dossier reste archivé et conservé en base ; vous pourrez le réafficher avec « Afficher aussi les dossiers retirés ».", [drawer.patient.name])}</div></div>
              )}

              {drawer.type === 'add' && (
                <div className="drawer-section">
                  <div className="form-group">
                    <label className="form-label" htmlFor="npEmail">{tr("E-mail du patient")}</label>
                    <input id="npEmail" type="email" className="form-input" placeholder={tr("Ex : patient@exemple.dz")} value={npEmail} onChange={(e) => setNpEmail(e.target.value)} />
                    <div className="u-fs10-5-tertiary" style={{ marginTop: 4 }}>{tr("Le patient reçoit un e-mail ; s'il a un compte VigiCore, une demande de messagerie lui est envoyée.")}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="npNom">{tr("Nom complet")}</label>
                    <input id="npNom" className="form-input" placeholder={tr("Ex : Karim Amrani")} value={npNom} onChange={(e) => setNpNom(e.target.value)} />
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label className="form-label" htmlFor="npAge">{tr("Âge")}</label>
                      <input id="npAge" type="number" min="0" max="120" className="form-input" placeholder={tr("Ex : 42")} value={npAge} onChange={(e) => setNpAge(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="npSexe">{tr("Sexe")}</label>
                      <select id="npSexe" className="form-input" value={npSexe} onChange={(e) => setNpSexe(e.target.value)}>
                        <option value="F">{tr("Féminin")}</option>
                        <option value="M">{tr("Masculin")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="npPathologie">{tr("Pathologie suivie")}</label>
                    <input id="npPathologie" className="form-input" placeholder={tr("Ex : Hypertension artérielle")} value={npPathologie} onChange={(e) => setNpPathologie(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="npAllergies">{tr("Allergies connues")}</label>
                    <input id="npAllergies" className="form-input" placeholder={tr("Séparées par des virgules · laisser vide si aucune")} value={npAllergies} onChange={(e) => setNpAllergies(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div className="drawer-actions">
              {drawer.type === 'detail' && !drawer.patient.archived && (
                <>
                  <button className="btn btn--primary btn--full" onClick={() => openContact(drawer.patient)}>
                    <Icon name="message" />{tr("Contacter")}
                  </button>
                  <button className="btn btn--full" style={{ color: 'var(--color-red)' }} onClick={() => askDelete(drawer.patient)}>
                    <Icon name="trash" />{tr("Supprimer")}
                  </button>
                </>
              )}
              {drawer.type === 'detail' && drawer.patient.archived && (
                <button className="btn btn--primary btn--full" onClick={() => setDrawer({ type: 'restore', patient: drawer.patient })}>
                  <Icon name="rotate-clockwise" />{tr("Restaurer")}
                </button>
              )}
              {drawer.type === 'restore' && (
                <>
                  <button className="btn btn--full" onClick={closeDrawer}>{tr("Annuler")}</button>
                  <button className="btn btn--primary btn--full" onClick={confirmRestore} disabled={busy}>{tr("Restaurer le dossier")}</button>
                </>
              )}
              {drawer.type === 'hide' && (
                <>
                  <button className="btn btn--full" onClick={closeDrawer}>{tr("Annuler")}</button>
                  <button className="btn btn--primary btn--full" style={{ background: 'var(--color-red)' }} onClick={() => runArchiveAction(drawer.patient, hidePatient, tr("Dossier retiré de l'affichage"), tr("{0} reste archivé et conservé en base.", [drawer.patient.name]))} disabled={busy}>{tr("Retirer de l'affichage")}</button>
                </>
              )}
              {drawer.type === 'contact' && (
                <button className="btn btn--primary btn--full" onClick={sendContact} disabled={busy || !drawer.patient.email}>
                  <Icon name="send" />{tr("Envoyer le message")}
                </button>
              )}
              {drawer.type === 'delete' && (
                <>
                  <button className="btn btn--full" onClick={closeDrawer}>{tr("Annuler")}</button>
                  <button className="btn btn--primary btn--full" style={{ background: 'var(--color-red)' }} onClick={confirmDelete} disabled={busy}>
                    <Icon name="trash" />{tr("Archiver le dossier")}
                  </button>
                </>
              )}
              {drawer.type === 'add' && (
                <button className="btn btn--primary btn--full" onClick={submitAddPatient} disabled={busy}>
                  <Icon name="check" />{tr("Ajouter le patient")}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
