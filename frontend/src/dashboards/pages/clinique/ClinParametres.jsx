import { useState } from 'react';
import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';
import { loadField, loadSwitch, saveField, saveSwitch, saveSettingsNow, resetSettings } from '../../data/settingsStore';
import LanguageSelect from '../../components/LanguageSelect';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-clin-parametres, 1:1 with the original's
// static markup, plus the same vcPersistSave/Restore/Reset local
// persistence scheme already ported for DoctorParametres.jsx.
//
// Icon substitutions (subsetted icon font, no exact glyph
// available): ti-mail → ti-key, ti-logout → ti-logout-2 — same
// substitutions already used elsewhere for the same reason.
//
// Administrator portal audit fix: the default "Nom de la clinique"
// used to be a hardcoded, unrelated placeholder ("Clinique Les
// Oliviers") that never matched the actual organization this account
// belongs to (organizations.js's 'clinique-el-fedjr' — see
// AuthContext.jsx's clinique.admin@demo.dz seat). It now defaults to
// this administrator's own organization name (still a locally-editable
// demo field, same persistence scheme as before — this is display
// coherence, not a new authorization mechanism).
// ═══════════════════════════════════════════════════════════════

function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} aria-label={tr(label)} />
      <span className="switch-track" />
    </label>
  );
}

export default function ClinParametres({ onNavigate }) {
  const toast = useToast();
  const { user } = useAuth();

  const [nom, setNom] = useState(() => loadField('clinParamNom', user?.orgName || ''));
  const [email, setEmail] = useState(() => loadField('clinParamEmail', ''));
  const [tel, setTel] = useState(() => loadField('clinParamTel', ''));
  const [adresse, setAdresse] = useState(() => loadField('clinParamAdresse', ''));
  const [numero, setNumero] = useState(() => loadField('clinParamNumero', ''));
  const [capacite, setCapacite] = useState(() => loadField('clinParamCapacite', ''));
  const [grandTexte, setGrandTexte] = useState(() => loadSwitch('swAuto30', false));
  const [notifRecalls, setNotifRecalls] = useState(() => loadSwitch('swAuto31', true));
  const [notifRapports, setNotifRapports] = useState(() => loadSwitch('swAuto32', false));

  function field(id, value, setter) {
    return { value, onChange: (e) => { setter(e.target.value); saveField(id, e.target.value); } };
  }
  function toggle(id, value, setter) {
    return { checked: value, onChange: () => setter((v) => { saveSwitch(id, !v); return !v; }) };
  }
  async function resetPersistedData() {
    const r = await resetSettings();
    if (!r.ok) { toast('error', tr("Réinitialisation impossible"), tr(r.message), 'ti ti-alert-triangle'); return; }
    toast('info', tr("Réglages réinitialisés"), tr("Les réglages enregistrés sur votre compte ont été effacés."), 'ti ti-trash');
    setTimeout(() => window.location.reload(), 900);
  }

  async function saveAll() {
    const r = await saveSettingsNow();
    if (!r.ok) { toast('error', tr("Enregistrement impossible"), tr(r.message), 'ti ti-alert-triangle'); return; }
    toast('success', tr("Informations enregistrées"), tr("Vos informations ont été enregistrées sur votre compte."), 'ti ti-check');
  }

  return (
    <div className="view is-active">
      <div className="page-header"><div><h1 className="page-title">{tr("Paramètres")}</h1></div></div>

      <div className="card">
        <div className="u-t5">
          <div className="u-t138">CO</div>
          <div className="u-flex-1">
            <div className="u-t6">{nom}</div>
            <div className="u-t9">{tr("N° établissement :")} <span className="u-mono">{numero || tr("non renseigné")}</span>{adresse ? ` · ${adresse}` : ''}</div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="clinParamNom">{tr("Nom de la clinique")}</label><input id="clinParamNom" className="form-input" {...field('clinParamNom', nom, setNom)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="clinParamEmail">{tr("E-mail de contact")}</label><input id="clinParamEmail" type="email" className="form-input" {...field('clinParamEmail', email, setEmail)} /></div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="clinParamTel">{tr("Téléphone")}</label><input id="clinParamTel" className="form-input" {...field('clinParamTel', tel, setTel)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="clinParamAdresse">{tr("Adresse")}</label><input id="clinParamAdresse" className="form-input" {...field('clinParamAdresse', adresse, setAdresse)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="id-badge" className="u-c-blue" />{tr("Informations de l'établissement")}</h2></div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="clinParamNumero">{tr("N° établissement (ANPP)")}</label><input id="clinParamNumero" className="form-input u-mono" {...field('clinParamNumero', numero, setNumero)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="clinParamCapacite">{tr("Capacité d'accueil (lits)")}</label><input id="clinParamCapacite" className="form-input" {...field('clinParamCapacite', capacite, setCapacite)} /></div>
        </div>
        <button className="btn btn--full" onClick={saveAll}><Icon name="device-floppy" />{tr("Enregistrer")}</button>
      </div>

      <div className="grid-kpi u-t20">
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="users-group" className="u-c-blue" />{tr("Gestion des utilisateurs")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("4 comptes actifs · 1 invitation en attente")}</div>
          <button className="btn btn--full" onClick={() => toast('info', tr("Personnel"), tr("Gestion des comptes et rôles du personnel de la clinique."), 'ti ti-user-plus')}><Icon name="user-plus" />{tr("Gérer le personnel")}</button>
        </div>
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="building-hospital" className="u-c-blue" />{tr("Départements")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("Aucun service enregistré.")}</div>
          <button className="btn btn--full" onClick={() => toast('info', tr("Départements"), tr("Édition de la liste des services de la clinique."), 'ti ti-building-hospital')}><Icon name="edit" />{tr("Modifier la liste")}</button>
        </div>
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Permissions")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("Accès basé sur le rôle : Médecin, Déclarant, Administrateur.")}</div>
          <button className="btn btn--full" onClick={() => toast('info', tr("Permissions"), tr("Édition des permissions par rôle."), 'ti ti-shield-lock')}><Icon name="edit" />{tr("Configurer")}</button>
        </div>
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="plug" className="u-c-purple" />{tr("API & intégrations")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("Connexion sécurisée à la plateforme CNPM pour la transmission des signalements.")}</div>
          <button className="btn btn--full" onClick={() => toast('info', tr("API"), tr("Gestion des clés API et intégrations tierces."), 'ti ti-plug')}><Icon name="key" />{tr("Gérer les clés API")}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="language" className="u-c-blue" />{tr("Langue & accessibilité")}</h2></div>
        <div className="form-group">
          <label className="form-label" htmlFor="clinParamLangue">{tr("Langue de l'application")}</label>
          <LanguageSelect id="clinParamLangue" />
        </div>
        <div className="u-t3">
          <div><div className="u-fs12-500">{tr("Grand texte / contraste élevé")}</div></div>
          <Switch id="swAuto30" label="Grand texte / contraste élevé" {...toggle('swAuto30', grandTexte, setGrandTexte)} />
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="bell" className="u-c-amber" />{tr("Notifications")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Ces préférences sont enregistrées sur votre compte. Les notifications s\'affichent dans l\'application ; l\'envoi par e-mail n\'est pas encore activé.")}</div>
        <div className="u-col-gap10">
          <div className="u-t2"><div><div className="u-fs12-500">{tr("Alertes & recalls ANPP")}</div></div><Switch id="swAuto31" label="Alertes & recalls ANPP" {...toggle('swAuto31', notifRecalls, setNotifRecalls)} /></div>
          <div className="u-t3"><div><div className="u-fs12-500">{tr("Rapports d'activité")}</div></div><Switch id="swAuto32" label="Rapports d'activité" {...toggle('swAuto32', notifRapports, setNotifRapports)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Sécurité & accès")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Accès basé sur le rôle : Médecin, Déclarant, Administrateur.")}</div>
        <button className="btn btn--full" onClick={() => document.getElementById('account-security')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Icon name="key" />{tr("Modifier le mot de passe")}</button>
        <div className="drawer-section-title u-t13">{tr("Sessions actives")}</div>
        <div className="u-col-gap10 u-t21">
          <div className="u-t2"><div><div className="u-fs12-500">{tr("Cet appareil")}</div><div className="table-sub">{tr("Session actuelle · active maintenant")}</div></div><span className="badge badge--cyan">{tr("Actuelle")}</span></div>
        </div>
        <button className="btn u-t143" onClick={resetPersistedData}><Icon name="trash" />{tr("Réinitialiser mes réglages enregistrés")}</button>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="history" className="u-c-cyan" />{tr("Journal d'audit")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Historique des connexions, modifications de données et actions administratives sur l'établissement.")}</div>
        <button className="btn btn--full" onClick={() => onNavigate('audit-log')}><Icon name="list-details" />{tr("Voir le journal")}</button>
      </div>

      <AccountSecurity />
    </div>
  );
}
