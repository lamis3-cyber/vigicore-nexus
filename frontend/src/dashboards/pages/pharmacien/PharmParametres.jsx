import { useState } from 'react';
import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';
import { loadField, loadSwitch, saveField, saveSwitch, saveSettingsNow, saveDisplayName, resetSettings } from '../../data/settingsStore';
import LanguageSelect from '../../components/LanguageSelect';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-pharm-parametres (pharmacien scope), 1:1 with
// the original's static markup (officine / informations
// professionnelles / langue & accessibilité / notifications /
// sécurité du compte cards) plus the same vcPersistSave /
// vcPersistRestore / vcResetPersistedData local-persistence behavior
// already ported for DoctorParametres.jsx.
//
// Notes on fidelity:
//  - Same 'vigicore_' + id persistence key scheme as DoctorParametres,
//    scoped to this page's own field ids (pharmParam*), so both pages
//    coexist in localStorage without collision — matches the
//    original's document-level listener which persisted every ided
//    field across every role at once.
//  - "Réinitialiser les données…" clears every 'vigicore_'-prefixed
//    key, same as DoctorParametres.jsx's resetPersistedData() (that
//    button is shared behavior — vcResetPersistedData() in the
//    original wasn't role-scoped either).
//  - Icon substitutions (subsetted icon font, no exact glyph
//    available): ti-mail → ti-key (password-reset toast — the
//    "Modifier le mot de passe" button already uses ti-key),
//    ti-logout → ti-logout-2, ti-refresh → ti-trash — same
//    substitutions already used in DoctorParametres.jsx for the same
//    reason.
//
// Pharmacist portal audit fix (Step 3B §2): "Nom complet" / "E-mail
// professionnel" / "Nom de l'officine" used to default to hardcoded
// "Mehdi Saadi" / fabricated email / "Pharmacie El Badr" for every
// pharmacist account, same bug as PharmProfil.jsx / DoctorParametres.jsx.
// Their FALLBACK defaults (used only the first time this device has
// no locally-saved value — see loadField() below) now come from the
// session's user.name / user.email / user.orgName. Once a person
// actually edits and saves a field, their locally-persisted value
// still wins on every later visit, exactly as before. Organization-
// employed pharmacists (Nadia Bouzid at CHU Alger, Riad Kaced at
// Clinique El Fedjr) get their real organization name instead of the
// standalone account's "Pharmacie El Badr"; the standalone account
// (Yasmine Cherif — see AuthContext.jsx) keeps that name, its own
// established identity used consistently elsewhere in this portal.
// Adresse/Horaires/N° agrément have no per-account value anywhere in
// the data model, so they keep their original generic demo defaults
// for the standalone account, and are left blank (not invented) for
// organization-employed accounts.
// ═══════════════════════════════════════════════════════════════

function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} onChange={onChange} aria-label={tr(label)} />
      <span className="switch-track" />
    </label>
  );
}

export default function PharmParametres() {
  const toast = useToast();
  const { user } = useAuth();
  const initials = user?.initials || '?';

  const [nom, setNom] = useState(() => loadField('pharmParamNomPrenom', user?.name || ''));
  const [email, setEmail] = useState(() => loadField('pharmParamEmail', user?.email || ''));
  const [tel, setTel] = useState(() => loadField('pharmParamTel', ''));
  const [officine, setOfficine] = useState(() => loadField('pharmParamNom', user?.orgName || ''));
  const [adresse, setAdresse] = useState(() => loadField('pharmParamAdresse', ''));

  const [agrement, setAgrement] = useState(() => loadField('pharmParamAgrement', ''));
  const [horaires, setHoraires] = useState(() => loadField('pharmParamHoraires', ''));
  const [grandTexte, setGrandTexte] = useState(() => loadSwitch('swAuto17', false));

  const [notifRappels, setNotifRappels] = useState(() => loadSwitch('swAuto18', true));
  const [notifStock, setNotifStock] = useState(() => loadSwitch('swAuto19', true));
  const [notifFournisseurs, setNotifFournisseurs] = useState(() => loadSwitch('swAuto20', false));

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
          <div className="u-t137">{initials}</div>
          <div className="u-flex-1">
            <div className="u-t6">{nom}</div>
            <div className="u-t9">{[officine, adresse].filter(Boolean).join(', ') || tr("Officine non renseignée")}</div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="pharmParamNomPrenom">{tr("Nom complet")}</label><input id="pharmParamNomPrenom" className="form-input" {...field('pharmParamNomPrenom', nom, setNom)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmParamEmail">{tr("E-mail professionnel")}</label><input id="pharmParamEmail" type="email" className="form-input" {...field('pharmParamEmail', email, setEmail)} /></div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="pharmParamTel">{tr("Téléphone")}</label><input id="pharmParamTel" className="form-input" {...field('pharmParamTel', tel, setTel)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmParamNom">{tr("Nom de l'officine")}</label><input id="pharmParamNom" className="form-input" {...field('pharmParamNom', officine, setOfficine)} /></div>
        </div>
        <div className="form-group"><label className="form-label" htmlFor="pharmParamAdresse">{tr("Adresse")}</label><input id="pharmParamAdresse" className="form-input" {...field('pharmParamAdresse', adresse, setAdresse)} /></div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="id-badge" className="u-c-blue" />{tr("Informations professionnelles")}</h2></div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="pharmParamAgrement">{tr("N° agrément ANPP")}</label><input id="pharmParamAgrement" className="form-input u-mono" {...field('pharmParamAgrement', agrement, setAgrement)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmParamHoraires">{tr("Horaires d'ouverture")}</label><input id="pharmParamHoraires" className="form-input" {...field('pharmParamHoraires', horaires, setHoraires)} /></div>
        </div>
        <button className="btn btn--full" onClick={saveAll}>
          <Icon name="device-floppy" />{tr("Enregistrer")}
        </button>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="language" className="u-c-blue" />{tr("Langue & accessibilité")}</h2></div>
        <div className="form-group">
          <label className="form-label" htmlFor="pharmParamLangue">{tr("Langue de l'application")}</label>
          <LanguageSelect id="pharmParamLangue" />
        </div>
        <div className="u-t3">
          <div><div className="u-fs12-500">{tr("Grand texte / contraste élevé")}</div></div>
          <Switch id="swAuto17" label="Grand texte / contraste élevé" {...toggle('swAuto17', grandTexte, setGrandTexte)} />
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="bell" className="u-c-amber" />{tr("Notifications")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Ces préférences sont enregistrées sur votre compte. Les notifications s\'affichent dans l\'application ; l\'envoi par e-mail n\'est pas encore activé.")}</div>
        <div className="u-col-gap10">
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Rappels de lots & retraits")}</div><div className="table-sub">{tr("Alerte immédiate si un lot en stock est rappelé")}</div></div>
            <Switch id="swAuto18" label="Rappels de lots & retraits" {...toggle('swAuto18', notifRappels, setNotifRappels)} />
          </div>
          <div className="u-t2">
            <div><div className="u-fs12-500">{tr("Seuils de stock bas")}</div></div>
            <Switch id="swAuto19" label="Seuils de stock bas" {...toggle('swAuto19', notifStock, setNotifStock)} />
          </div>
          <div className="u-t3">
            <div><div className="u-fs12-500">{tr("Nouveaux messages fournisseurs")}</div></div>
            <Switch id="swAuto20" label="Nouveaux messages fournisseurs" {...toggle('swAuto20', notifFournisseurs, setNotifFournisseurs)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Sécurité du compte")}</h2></div>
        <div className="u-fs-12 u-t1">{tr("Accès professionnel vérifié par numéro d'agrément ANPP.")}</div>
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
