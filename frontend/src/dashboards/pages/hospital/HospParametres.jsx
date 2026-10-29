import { useState } from 'react';
import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';
import { loadField, loadSwitch, saveField, saveSwitch, saveSettingsNow, saveDisplayName, resetSettings } from '../../data/settingsStore';
import LanguageSelect from '../../components/LanguageSelect';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-hosp-parametres, 1:1 with the original's
// static markup (établissement / gestion des utilisateurs /
// départements / permissions / API / notifications / sécurité /
// journal d'audit cards). No renderHosp* JS wires this view — every
// field is static demo content in the source, only the two named
// inputs (auto-field-28/29) and three switches (swAuto27/28/29) were
// document-level persisted, same vcPersistSave/Restore/Reset scheme
// already ported for DoctorParametres.jsx / PharmParametres.jsx.
//
// Step 3E fix — organization identity hardcoding: the établissement
// card used to always show "Centre Hospitalier Ibn Sina" / "EPH-16-002"
// / initials "CH", regardless of which hospital the logged-in
// administrator actually belongs to (organizations.js's 'chu-alger' —
// see AuthContext.jsx's chu.admin@demo.dz seat).
// The name now defaults to this administrator's own organization name
// (user.orgName), and the initials badge is derived from it, the same
// "default from the real session, still a locally-editable demo field"
// pattern already used by ClinParametres.jsx / CmParametres.jsx. The
// establishment number stays a separately-editable demo field (no
// equivalent value exists on the organization/session model to derive
// it from — no invented data).
// ═══════════════════════════════════════════════════════════════

function initialsFromOrgName(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'CH';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} aria-label={tr(label)} />
      <span className="switch-track" />
    </label>
  );
}

export default function HospParametres({ onNavigate }) {
  const toast = useToast();
  const { user } = useAuth();

  const [nom, setNom] = useState(() => loadField('auto-field-28', user?.orgName || ''));
  const [wilaya, setWilaya] = useState(() => loadField('auto-field-29', ''));
  const [numero, setNumero] = useState(() => loadField('hospParamNumero', ''));

  const [notifAnpp, setNotifAnpp] = useState(() => loadSwitch('swAuto27', true));
  const [notifValidation, setNotifValidation] = useState(() => loadSwitch('swAuto28', true));
  const [notifRapports, setNotifRapports] = useState(() => loadSwitch('swAuto29', false));

  function field(id, value, setter) {
    return { value, onChange: (e) => { setter(e.target.value); saveField(id, e.target.value); } };
  }
  function toggle(id, value, setter) {
    return { checked: value, onChange: () => setter((v) => { saveSwitch(id, !v); return !v; }) };
  }

  async function saveAll() {
    const r = await saveSettingsNow();
    if (!r.ok) { toast('error', tr("Enregistrement impossible"), tr(r.message), 'ti ti-alert-triangle'); return; }
    toast('success', tr("Informations enregistrées"), tr("Vos informations ont été enregistrées sur votre compte."), 'ti ti-check');
  }
  async function resetPersistedData() {
    const r = await resetSettings();
    if (!r.ok) { toast('error', tr("Réinitialisation impossible"), tr(r.message), 'ti ti-alert-triangle'); return; }
    toast('info', tr("Réglages réinitialisés"), tr("Les réglages enregistrés sur votre compte ont été effacés."), 'ti ti-trash');
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Paramètres")}</h1></div>
      </div>

      <div className="card">
        <div className="u-t5">
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg,#1a6fb5,#2f8fd1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700, color: '#fff', boxShadow: '0 0 20px rgba(59,130,246,.3)', flexShrink: 0 }}>{initialsFromOrgName(nom)}</div>
          <div className="u-flex-1">
            <div className="u-t6">{nom}</div>
            <div className="u-t9">{tr("N° établissement :")} <span className="u-mono">{numero || tr("non renseigné")}</span>{wilaya ? ` · ${wilaya}` : ''}</div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="hospParamNom">{tr("Nom de l'établissement")}</label><input id="hospParamNom" className="form-input" {...field('auto-field-28', nom, setNom)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="hospParamWilaya">{tr("Wilaya")}</label><input id="hospParamWilaya" className="form-input" {...field('auto-field-29', wilaya, setWilaya)} /></div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="hospParamNumero">{tr("N° établissement (ANPP)")}</label><input id="hospParamNumero" className="form-input u-mono" {...field('hospParamNumero', numero, setNumero)} /></div>
        </div>
      </div>

      <div className="grid-kpi u-t20">
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="users-group" className="u-c-blue" />{tr("Gestion des utilisateurs")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("Invitez, validez et gérez les comptes de votre établissement.")}</div>
          <button className="btn btn--full" onClick={() => onNavigate('hosp-personnel')}><Icon name="user-plus" />{tr("Gérer le personnel")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="language" className="u-c-blue" />{tr("Langue")}</h2></div>
        <div className="form-group"><label className="form-label" htmlFor="hospParamLangue">{tr("Langue de l'interface")}</label><LanguageSelect id="hospParamLangue" /></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn--primary" onClick={async () => { if (nom.trim()) { const n = await saveDisplayName(nom.trim()); if (!n.ok) { toast('error', tr("Enregistrement impossible"), tr(n.message), 'ti ti-alert-triangle'); return; } } saveAll(); }}>{tr("Enregistrer")}</button>
          <button className="btn" onClick={resetPersistedData}>{tr("Réinitialiser mes réglages enregistrés")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="bell" className="u-c-amber" />{tr("Notifications")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Ces préférences sont enregistrées sur votre compte. Les notifications s'affichent dans l'application ; l'envoi par e-mail n'est pas encore activé.")}</div>
        <div className="u-col-gap10">
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Alertes ANPP en temps réel")}</div><div className="table-sub">{tr("Notification immédiate à la réception d'une alerte")}</div></div>
            <Switch id="swAuto27" label="Alertes ANPP en temps réel" {...toggle('swAuto27', notifAnpp, setNotifAnpp)} />
          </div>
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Déclarations en attente de validation")}</div><div className="table-sub">{tr("Rappel quotidien au responsable vigilance")}</div></div>
            <Switch id="swAuto28" label="Déclarations en attente de validation" {...toggle('swAuto28', notifValidation, setNotifValidation)} />
          </div>
          <div className="u-t3">
            <div><div className="u-fs12-500">{tr("Rapports mensuels automatiques")}</div><div className="table-sub">{tr("Envoi par e-mail le 1er de chaque mois")}</div></div>
            <Switch id="swAuto29" label="Rapports mensuels automatiques" {...toggle('swAuto29', notifRapports, setNotifRapports)} />
          </div>
        </div>
      </div>

      <div className="grid-kpi u-t20">
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="history" className="u-c-cyan" />{tr("Journal d'audit")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("Historique des connexions, modifications de données et actions administratives sur l'établissement.")}</div>
          <button className="btn btn--full" onClick={() => onNavigate('audit-log')}><Icon name="list-details" />{tr("Voir le journal")}</button>
        </div>
      </div>

      <AccountSecurity />
    </div>
  );
}
