import { useState } from 'react';
import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';
import { loadField, loadSwitch, saveField, saveSwitch, saveSettingsNow, saveDisplayName, resetSettings } from '../../data/settingsStore';
import LanguageSelect from '../../components/LanguageSelect';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-doc-parametres (doctor scope), 1:1 with the
// original's static markup (cabinet / informations professionnelles /
// langue & accessibilité / signature électronique / notifications /
// sécurité du compte cards) plus its local-persistence behavior
// (vcPersistSave / vcPersistRestore / vcResetPersistedData).
//
// Notes on fidelity:
//  - The original's per-field auto-save is a DOCUMENT-LEVEL 'change'
//    listener that persists ANY <input>/<select>/<textarea> with an id,
//    across the whole app (see vcPersistRestore/vcPersistSave in the
//    source). Only this page is migrated so far, so that behavior is
//    reproduced scoped to this page's own fields, using the exact same
//    'vigicore_' + id key scheme — so it stays compatible if/when the
//    same mechanism is generalized for other pages later.
//  - "Réinitialiser les données enregistrées sur cet appareil" clears
//    every 'vigicore_'-prefixed key and reloads, exactly like the
//    original's vcResetPersistedData().
//  - Icon substitutions (subsetted icon font, no exact glyph available):
//    ti-mail → ti-key (password-reset toast, "Modifier le mot de passe"
//    button already uses ti-key), ti-logout → ti-logout-2 (closest
//    available), ti-refresh → ti-trash (reset toast reuses the reset
//    button's own icon).
//
// Doctor portal audit fix (Step 3A §2): "Nom complet" / "E-mail
// professionnel" / "Nom du cabinet" used to default to hardcoded
// "Dr. Karim Benali" / "karim.benali@elazhar-dz.com" / "Clinique El
// Azhar" for every doctor account, same bug as DoctorProfil.jsx. Their
// FALLBACK defaults (used only the first time this device has no
// locally-saved value — see loadField() below) now come from the
// session's user.name / user.email / user.orgName instead. Once a
// person actually edits and saves a field, their locally-persisted
// value still wins on every later visit, exactly as before — this
// only changes what an untouched field starts as. Standalone doctors
// (no orgId) get a generic, non-invented "Cabinet indépendant" instead
// of a fabricated clinic name. Téléphone/N° d'ordre/Spécialité/Adresse
// have no per-doctor value anywhere in the data model, so they keep
// their original generic demo defaults.
// ═══════════════════════════════════════════════════════════════

function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} aria-label={tr(label)} />
      <span className="switch-track" />
    </label>
  );
}

export default function DoctorParametres() {
  const toast = useToast();
  const { user } = useAuth();
  const initials = user?.initials || 'KB';

  const [nom, setNom] = useState(() => loadField('docParamNom', user?.name || ''));
  const [email, setEmail] = useState(() => loadField('docParamEmail', user?.email || ''));
  const [tel, setTel] = useState(() => loadField('docParamTel', ''));
  const [cabinet, setCabinet] = useState(() => loadField('docParamCabinet', user?.orgName || ''));
  const [adresse, setAdresse] = useState(() => loadField('docParamAdresse', ''));

  const [ordre, setOrdre] = useState(() => loadField('docParamOrdre', ''));
  const [specialite, setSpecialite] = useState(() => loadField('docParamSpecialite', ''));
  const [etablissement, setEtablissement] = useState(() => loadField('docParamEtablissement', user?.orgName || ''));
  const [grandTexte, setGrandTexte] = useState(() => loadSwitch('swAuto11', false));

  const [notifAnpp, setNotifAnpp] = useState(() => loadSwitch('swAuto13', true));
  const [notifMessages, setNotifMessages] = useState(() => loadSwitch('swAuto14', true));
  const [notifDeclarations, setNotifDeclarations] = useState(() => loadSwitch('swAuto15', true));

  function field(id, value, setter) {
    return {
      value,
      onChange: (e) => { setter(e.target.value); saveField(id, e.target.value); },
    };
  }

  function toggle(id, value, setter) {
    return {
      checked: value,
      onChange: () => { setter((v) => { saveSwitch(id, !v); return !v; }); },
    };
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
    if (nom.trim()) {
      const n = await saveDisplayName(nom.trim());
      if (!n.ok) { toast('error', tr("Enregistrement impossible"), tr(n.message), 'ti ti-alert-triangle'); return; }
    }
    toast('success', tr("Informations enregistrées"), tr("Vos informations ont été enregistrées sur votre compte."), 'ti ti-check');
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Paramètres")}</h1></div>
      </div>

      <div className="card">
        <div className="u-t5">
          <div className="u-t139">{initials}</div>
          <div className="u-flex-1">
            <div className="u-t6">{nom}</div>
            <div className="u-t9">{cabinet} · {specialite}</div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="docParamNom">{tr("Nom complet")}</label><input id="docParamNom" className="form-input" {...field('docParamNom', nom, setNom)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="docParamEmail">{tr("E-mail professionnel")}</label><input id="docParamEmail" type="email" className="form-input" {...field('docParamEmail', email, setEmail)} /></div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="docParamTel">{tr("Téléphone")}</label><input id="docParamTel" className="form-input" {...field('docParamTel', tel, setTel)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="docParamCabinet">{tr("Nom du cabinet / structure")}</label><input id="docParamCabinet" className="form-input" {...field('docParamCabinet', cabinet, setCabinet)} /></div>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="docParamAdresse">{tr("Adresse")}</label><input id="docParamAdresse" className="form-input" {...field('docParamAdresse', adresse, setAdresse)} /></div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="id-badge" className="u-c-blue" />{tr("Informations professionnelles")}</h2></div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="docParamOrdre">{tr("N° d'inscription à l'Ordre (CNOP)")}</label><input id="docParamOrdre" className="form-input u-mono" {...field('docParamOrdre', ordre, setOrdre)} /></div>
          <div className="form-group">
            <label className="form-label" htmlFor="docParamSpecialite">{tr("Spécialité")}</label>
            <select id="docParamSpecialite" className="form-input" {...field('docParamSpecialite', specialite, setSpecialite)}>
              <option>{tr("Médecine interne")}</option>
              <option>{tr("Diabétologie")}</option>
              <option>{tr("Cardiologie")}</option>
              <option>{tr("Pédiatrie")}</option>
              <option>{tr("Dermatologie")}</option>
              <option>{tr("Autre")}</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="docParamEtablissement">{tr("Établissement de rattachement")}</label><input id="docParamEtablissement" className="form-input" {...field('docParamEtablissement', etablissement, setEtablissement)} /></div>
        <button className="btn btn--full" onClick={saveAll}>
          <Icon name="device-floppy" />{tr("Enregistrer")}
        </button>
      </div>

      <div className="grid-kpi u-t20">
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="language" className="u-c-blue" />{tr("Langue & accessibilité")}</h2></div>
          <div className="form-group">
            <label className="form-label" htmlFor="docParamLangue">{tr("Langue de l'application")}</label>
            <LanguageSelect id="docParamLangue" />
          </div>
          <div className="u-t3">
            <div><div className="u-fs12-500">{tr("Grand texte / contraste élevé")}</div></div>
            <Switch id="swAuto11" label="Grand texte / contraste élevé" {...toggle('swAuto11', grandTexte, setGrandTexte)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="bell" className="u-c-amber" />{tr("Notifications")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Ces préférences sont enregistrées sur votre compte. Les notifications s\'affichent dans l\'application ; l\'envoi par e-mail n\'est pas encore activé.")}</div>
        <div className="u-col-gap10">
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Alertes ANPP en temps réel")}</div><div className="table-sub">{tr("Rappels de lots et alertes de sécurité")}</div></div>
            <Switch id="swAuto13" label="Alertes ANPP en temps réel" {...toggle('swAuto13', notifAnpp, setNotifAnpp)} />
          </div>
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Nouveaux messages patients")}</div></div>
            <Switch id="swAuto14" label="Nouveaux messages patients" {...toggle('swAuto14', notifMessages, setNotifMessages)} />
          </div>
          <div className="u-t3">
            <div><div className="u-fs12-500">{tr("Suivi de mes déclarations")}</div><div className="table-sub">{tr("Mise à jour du statut d'analyse")}</div></div>
            <Switch id="swAuto15" label="Suivi de mes déclarations" {...toggle('swAuto15', notifDeclarations, setNotifDeclarations)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Sécurité du compte")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Accès professionnel vérifié par numéro d'ordre CNOP.")}</div>
        <button className="btn btn--full" onClick={() => document.getElementById('account-security')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          <Icon name="key" />{tr("Modifier le mot de passe")}
        </button>
        <div className="drawer-section-title u-t13">{tr("Sessions actives")}</div>
        <div className="u-col-gap10 u-t21">
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Cet appareil")}</div><div className="table-sub">{tr("Session actuelle · active maintenant")}</div></div>
            <span className="badge badge--cyan">{tr("Actuelle")}</span>
          </div>
        </div>
        <button className="btn u-t143" onClick={resetPersistedData}>
          <Icon name="trash" />{tr("Réinitialiser mes réglages enregistrés")}
        </button>
      </div>

      <AccountSecurity />
    </div>
  );
}
