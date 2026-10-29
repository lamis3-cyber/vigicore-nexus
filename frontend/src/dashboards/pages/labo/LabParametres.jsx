import { useState } from 'react';
import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';
import { loadField, loadSwitch, saveField, saveSwitch, saveSettingsNow, saveDisplayName, resetSettings } from '../../data/settingsStore';
import LanguageSelect from '../../components/LanguageSelect';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-lab-parametres (labo scope), 1:1 with the
// original's static markup plus the same vcPersistSave /
// vcPersistRestore / vcResetPersistedData local-persistence pattern
// already ported for DoctorParametres.jsx / PharmParametres.jsx.
//
// Notes on fidelity:
//  - This page has one section neither Doctor's nor Pharmacien's
//    Paramètres has: "API & intégrations" (anchor-lab-parametres-api)
//    — a lab-specific CNPM API-key management stub. The original's
//    button just toasts ("Gestion des clés API et intégrations
//    tierces."); reproduced as-is, no real key management invented.
//  - "Domaine d'analyse principal" select is Labo-specific
//    (Biologie médicale / Analyses toxicologiques / Contrôle qualité
//    pharmaceutique / Autre) — ported verbatim.
//  - Icon substitutions (subsetted icon font): ti-mail → ti-key,
//    ti-logout → ti-logout-2 — same substitutions already used in
//    DoctorParametres.jsx / PharmParametres.jsx for the same reason.
//
// Step 3C fix (Laboratory Staff coherence): this page used to
// default every laboratory_staff account's identity fields to
// "Dr. Rania Belaïd" / "Laboratoire Bio-Analyse" — including the
// standalone account ('usr-labo', real seat name "Laboratoire
// Central") and the organization-employed lab technician
// ('usr-chu-laborantin', Sofiane Meziane at CHU Alger). Defaults for
// "Responsable technique" / "Nom du laboratoire" now come from
// useAuth()'s session user (falling back only for a signed-out
// render), same pattern already used by PharmParametres.jsx /
// DoctorParametres.jsx. Organization name comes from the session's
// orgName when present; standalone accounts get no invented
// organization/address. The identity-card header mirrors the same
// values. Per-field localStorage persistence (vcPersistSave-style)
// is otherwise unchanged — a returning user's own prior edits still
// override these defaults, as before.
// ═══════════════════════════════════════════════════════════════

function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} aria-label={tr(label)} />
      <span className="switch-track" />
    </label>
  );
}

export default function LabParametres() {
  const toast = useToast();
  const { user } = useAuth();
  const initials = user?.initials || 'LC';

  const [responsable, setResponsable] = useState(() => loadField('labParamResponsable', user?.name || ''));
  const [email, setEmail] = useState(() => loadField('labParamEmail', user?.email || ''));
  const [tel, setTel] = useState(() => loadField('labParamTel', ''));
  const [nom, setNom] = useState(() => loadField('labParamNom', user?.orgName || user?.name || ''));
  const [adresse, setAdresse] = useState(() => loadField('labParamAdresse', ''));

  const [agrement, setAgrement] = useState(() => loadField('labParamAgrement', ''));
  const [specialite, setSpecialite] = useState(() => loadField('labParamSpecialite', ''));
  const [grandTexte, setGrandTexte] = useState(() => loadSwitch('swAuto22', false));

  const [notifReacto, setNotifReacto] = useState(() => loadSwitch('swAuto23', true));
  const [notifSurveillance, setNotifSurveillance] = useState(() => loadSwitch('swAuto24', true));
  const [notifRapports, setNotifRapports] = useState(() => loadSwitch('swAuto25', false));

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
    if (responsable.trim()) {
      const n = await saveDisplayName(responsable.trim());
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
          <div className="u-t136">{initials}</div>
          <div className="u-flex-1">
            <div className="u-t6">{responsable}</div>
            <div className="u-t9">{nom}</div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="labParamResponsable">{tr("Responsable technique")}</label><input id="labParamResponsable" className="form-input" {...field('labParamResponsable', responsable, setResponsable)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="labParamEmail">{tr("E-mail professionnel")}</label><input id="labParamEmail" type="email" className="form-input" {...field('labParamEmail', email, setEmail)} /></div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="labParamTel">{tr("Téléphone")}</label><input id="labParamTel" className="form-input" {...field('labParamTel', tel, setTel)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="labParamNom">{tr("Nom du laboratoire")}</label><input id="labParamNom" className="form-input" {...field('labParamNom', nom, setNom)} /></div>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="labParamAdresse">{tr("Adresse")}</label><input id="labParamAdresse" className="form-input" {...field('labParamAdresse', adresse, setAdresse)} /></div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="id-badge" className="u-c-blue" />{tr("Informations professionnelles")}</h2></div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="labParamAgrement">{tr("Agrément ANPP")}</label><input id="labParamAgrement" className="form-input u-mono" {...field('labParamAgrement', agrement, setAgrement)} /></div>
          <div className="form-group">
            <label className="form-label" htmlFor="labParamSpecialite">{tr("Domaine d'analyse principal")}</label>
            <select id="labParamSpecialite" className="form-input" {...field('labParamSpecialite', specialite, setSpecialite)}>
              <option>{tr("Biologie médicale")}</option>
              <option>{tr("Analyses toxicologiques")}</option>
              <option>{tr("Contrôle qualité pharmaceutique")}</option>
              <option>{tr("Autre")}</option>
            </select>
          </div>
        </div>
        <button className="btn btn--full" onClick={saveAll}>
          <Icon name="device-floppy" />{tr("Enregistrer")}
        </button>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="language" className="u-c-blue" />{tr("Langue & accessibilité")}</h2></div>
        <div className="form-group">
          <label className="form-label" htmlFor="labParamLangue">{tr("Langue de l'application")}</label>
          <LanguageSelect id="labParamLangue" />
        </div>
        <div className="u-t3">
          <div><div className="u-fs12-500">{tr("Grand texte / contraste élevé")}</div></div>
          <Switch id="swAuto22" label="Grand texte / contraste élevé" {...toggle('swAuto22', grandTexte, setGrandTexte)} />
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="bell" className="u-c-amber" />{tr("Notifications")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Ces préférences sont enregistrées sur votre compte. Les notifications s\'affichent dans l\'application ; l\'envoi par e-mail n\'est pas encore activé.")}</div>
        <div className="u-col-gap10">
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Alertes réactovigilance")}</div></div>
            <Switch id="swAuto23" label="Alertes réactovigilance" {...toggle('swAuto23', notifReacto, setNotifReacto)} />
          </div>
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Produits sous surveillance")}</div></div>
            <Switch id="swAuto24" label="Produits sous surveillance" {...toggle('swAuto24', notifSurveillance, setNotifSurveillance)} />
          </div>
          <div className="u-t3">
            <div><div className="u-fs12-500">{tr("Rapports mensuels automatiques")}</div></div>
            <Switch id="swAuto25" label="Rapports mensuels automatiques" {...toggle('swAuto25', notifRapports, setNotifRapports)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Sécurité du compte")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Accès professionnel vérifié par agrément ANPP.")}</div>
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

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="plug" className="u-c-purple" />{tr("API & intégrations")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Connexion sécurisée à la plateforme CNPM pour la transmission des signalements de réactovigilance.")}</div>
        <button className="btn btn--full" onClick={() => toast('info', tr("API"), tr("Gestion des clés API et intégrations tierces."), 'ti ti-plug')}>
          <Icon name="key" />{tr("Gérer les clés API")}
        </button>
      </div>

      <AccountSecurity />
    </div>
  );
}
