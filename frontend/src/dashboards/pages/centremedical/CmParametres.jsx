import { useState } from 'react';
import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';
import { loadField, loadSwitch, saveField, saveSwitch, saveSettingsNow, resetSettings } from '../../data/settingsStore';
import LanguageSelect from '../../components/LanguageSelect';

// Converted from #view-cm-parametres, 1:1 with the original's static
// markup, plus the same vcPersistSave/Restore/Reset local persistence
// scheme already ported for DoctorParametres.jsx.
//
// Administrator portal audit fix: the default "Nom du centre médical"
// used to be a hardcoded, unrelated placeholder ("Centre Médical El
// Amel") that never matched the actual organization this account
// belongs to (organizations.js's 'centre-setif' — see
// AuthContext.jsx's centre.admin@demo.dz seat). It now defaults to
// this administrator's own organization name (still a locally-editable
// demo field, same persistence scheme as before).
function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} aria-label={tr(label)} />
      <span className="switch-track" />
    </label>
  );
}

export default function CmParametres({ onNavigate }) {
  const toast = useToast();
  const { user } = useAuth();

  const [nom, setNom] = useState(() => loadField('cmParamNom', user?.orgName || ''));
  const [email, setEmail] = useState(() => loadField('cmParamEmail', ''));
  const [tel, setTel] = useState(() => loadField('cmParamTel', ''));
  const [adresse, setAdresse] = useState(() => loadField('cmParamAdresse', ''));
  const [numero, setNumero] = useState(() => loadField('cmParamNumero', ''));
  const [services, setServices] = useState(() => loadField('cmParamServices', ''));
  const [grandTexte, setGrandTexte] = useState(() => loadSwitch('swAuto34', false));
  const [notifRecalls, setNotifRecalls] = useState(() => loadSwitch('swAuto35', true));
  const [notifRapports, setNotifRapports] = useState(() => loadSwitch('swAuto36', false));

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
          <div className="u-t140">CM</div>
          <div className="u-flex-1">
            <div className="u-t6">{nom}</div>
            <div className="u-t9">{tr("N° établissement :")} <span className="u-mono">{numero || tr("non renseigné")}</span>{adresse ? ` · ${adresse}` : ''}</div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="cmParamNom">{tr("Nom du centre médical")}</label><input id="cmParamNom" className="form-input" {...field('cmParamNom', nom, setNom)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="cmParamEmail">{tr("E-mail de contact")}</label><input id="cmParamEmail" type="email" className="form-input" {...field('cmParamEmail', email, setEmail)} /></div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="cmParamTel">{tr("Téléphone")}</label><input id="cmParamTel" className="form-input" {...field('cmParamTel', tel, setTel)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="cmParamAdresse">{tr("Adresse")}</label><input id="cmParamAdresse" className="form-input" {...field('cmParamAdresse', adresse, setAdresse)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="id-badge" className="u-c-blue" />{tr("Informations de l'établissement")}</h2></div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="cmParamNumero">{tr("N° établissement (ANPP)")}</label><input id="cmParamNumero" className="form-input u-mono" {...field('cmParamNumero', numero, setNumero)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="cmParamServices">{tr("Nombre de services")}</label><input id="cmParamServices" className="form-input" {...field('cmParamServices', services, setServices)} /></div>
        </div>
        <button className="btn btn--full" onClick={saveAll}><Icon name="device-floppy" />{tr("Enregistrer")}</button>
      </div>

      <div className="grid-kpi u-t20">
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="users-group" className="u-c-blue" />{tr("Gestion des utilisateurs")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("6 comptes actifs · 1 invitation en attente")}</div>
          <button className="btn btn--full" onClick={() => toast('info', tr("Personnel"), tr("Gestion des comptes et rôles du personnel du centre médical."), 'ti ti-user-plus')}><Icon name="user-plus" />{tr("Gérer le personnel")}</button>
        </div>
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="building-hospital" className="u-c-blue" />{tr("Départements")}</h2></div>
          <div className="u-fs-12 u-t1">{tr("Aucun service enregistré.")}</div>
          <button className="btn btn--full" onClick={() => toast('info', tr("Départements"), tr("Édition de la liste des services du centre médical."), 'ti ti-building-hospital')}><Icon name="edit" />{tr("Modifier la liste")}</button>
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
          <label className="form-label" htmlFor="cmParamLangue">{tr("Langue de l'application")}</label>
          <LanguageSelect id="cmParamLangue" />
        </div>
        <div className="u-t3">
          <div><div className="u-fs12-500">{tr("Grand texte / contraste élevé")}</div></div>
          <Switch id="swAuto34" label="Grand texte / contraste élevé" {...toggle('swAuto34', grandTexte, setGrandTexte)} />
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="bell" className="u-c-amber" />{tr("Notifications")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Ces préférences sont enregistrées sur votre compte. Les notifications s\'affichent dans l\'application ; l\'envoi par e-mail n\'est pas encore activé.")}</div>
        <div className="u-col-gap10">
          <div className="u-t2"><div><div className="u-fs12-500">{tr("Alertes & recalls ANPP")}</div></div><Switch id="swAuto35" label="Alertes & recalls ANPP" {...toggle('swAuto35', notifRecalls, setNotifRecalls)} /></div>
          <div className="u-t3"><div><div className="u-fs12-500">{tr("Rapports d'activité")}</div></div><Switch id="swAuto36" label="Rapports d'activité" {...toggle('swAuto36', notifRapports, setNotifRapports)} /></div>
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
