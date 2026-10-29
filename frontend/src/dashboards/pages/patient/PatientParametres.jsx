import { useState } from 'react';
import Icon from '../../components/Icon';
import AccountSecurity from '../../components/AccountSecurity';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';
import { loadSwitch, saveSwitch } from '../../data/settingsStore';
import LanguageSelect from '../../components/LanguageSelect';

// ═══════════════════════════════════════════════════════════════
// New page for the patient-scope 'parametres' nav item ("Réglages"),
// which had no route in App.jsx — same gap as every other patient
// page fixed so far — and was silently falling back to <ComingSoon/>.
//
// The appearance toggle is wired to the real ThemeContext (same
// toggleTheme used by the topbar's sun/moon button), so switching it
// here actually changes the app theme instead of being a fake control.
// Notification/privacy toggles use the .switch CSS already defined in
// theme.css (checked-state colouring etc.) but never used by any page.
// ═══════════════════════════════════════════════════════════════

const INITIAL_TOGGLES = {
  recallAlerts: true,
  doseReminders: true,
  appointmentReminders: true,
  messages: true,
  newsletter: false,
  researchSharing: false,
};

const TOGGLE_LABELS = {
  recallAlerts: { label: 'Alertes de rappel produit', sub: 'Notifications immédiates en cas de rappel ANPP sur vos produits' },
  doseReminders: { label: 'Rappels de prise', sub: 'Notification à l\'heure prévue de chaque traitement' },
  appointmentReminders: { label: 'Rappels de rendez-vous', sub: 'Notification 24h avant un RDV' },
  messages: { label: 'Nouveaux messages', sub: 'Notification quand un professionnel de santé vous écrit' },
  newsletter: { label: 'Actualités VigiCore', sub: 'Newsletter mensuelle sur la pharmacovigilance' },
  researchSharing: { label: 'Partage à des fins de recherche', sub: 'Autoriser l\'usage anonymisé de vos données pour la recherche en santé publique' },
};

function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={tr(label)} />
      <span className="switch-track" />
    </label>
  );
}

export default function PatientParametres() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [toggles, setToggles] = useState(() => Object.fromEntries(Object.entries(INITIAL_TOGGLES).map(([k, v]) => [k, loadSwitch('pat_' + k, v)])));

  function flip(key) {
    setToggles((t) => { const next = !t[key]; saveSwitch('pat_' + key, next); return { ...t, [key]: next }; });
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mes")} <span className="page-title-accent">{tr("réglages")}</span></h1></div>
      </div>

      <div className="grid-2col">
        {/* Appearance */}
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name={theme === 'dark' ? 'moon' : 'sun'} className="u-c-amber" />{tr("Apparence")}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div className="u-fs13-strong">{tr("Thème sombre")}</div>
              <div className="u-fs10-5-tertiary">{tr("Actuellement : {0}", [theme === 'dark' ? 'Sombre' : 'Clair'])}</div>
            </div>
            <Switch checked={theme === 'dark'} onChange={toggleTheme} label="Basculer le thème sombre" />
          </div>
        </div>

        {/* Language */}
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name="language" className="u-c-blue" />{tr("Langue")}</h2>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="settingsLang">{tr("Langue de l'interface")}</label>
            <LanguageSelect id="settingsLang" />
          </div>
        </div>

        {/* Notifications */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="section-header">
            <h2 className="section-title"><Icon name="bell" className="u-c-red" />{tr("Notifications")}</h2>
          </div>
          <div className="u-fs10-5-tertiary" style={{ marginBottom: 8 }}>{tr("Ces préférences sont enregistrées sur votre compte. Les notifications s'affichent dans l'application ; l'envoi par e-mail n'est pas encore activé.")}</div>
          <div className="u-col-gap10">
            {Object.keys(TOGGLE_LABELS).filter((k) => k !== 'researchSharing').map((key) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '4px 0' }}>
                <div>
                  <div className="u-fs13-strong">{tr(TOGGLE_LABELS[key].label)}</div>
                  <div className="u-fs10-5-tertiary">{tr(TOGGLE_LABELS[key].sub)}</div>
                </div>
                <Switch checked={toggles[key]} onChange={() => flip(key)} label={TOGGLE_LABELS[key].label} />
              </div>
            ))}
          </div>
        </div>

        {/* Privacy */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="section-header">
            <h2 className="section-title"><Icon name="shield-lock" className="u-c-purple" />{tr("Confidentialité")}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div className="u-fs13-strong">{tr(TOGGLE_LABELS.researchSharing.label)}</div>
              <div className="u-fs10-5-tertiary">{tr(TOGGLE_LABELS.researchSharing.sub)}</div>
            </div>
            <Switch checked={toggles.researchSharing} onChange={() => flip('researchSharing')} label={TOGGLE_LABELS.researchSharing.label} />
          </div>
        </div>

        {/* Account */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="section-header">
            <h2 className="section-title"><Icon name="user" className="u-c-cyan" />{tr("Compte")}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div className="u-fs10-5-tertiary">{tr("Connectée en tant que")} <strong style={{ color: 'var(--text-primary)' }}>{user?.email || ''}</strong></div>
            <button className="btn btn--danger" onClick={logout}><Icon name="logout-2" />{tr("Se déconnecter")}</button>
          </div>
        </div>
      </div>

      <AccountSecurity />
    </div>
  );
}
