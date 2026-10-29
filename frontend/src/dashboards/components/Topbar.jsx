import { useEffect, useState } from 'react';
import Icon from './Icon';
import GlobalSearch from './GlobalSearch';
import TopbarLanguage from './TopbarLanguage';
// Same logo (shield + wordmark) and same sizes as the public site's navbar: one
// shared component, so the dashboard topbar can never drift from the home page.
import Logo from '../../components/layout/Logo.jsx';
import './topbar-brand.css';
import { tr } from '../../i18n/translate.js';

// The original topbar had 6 near-identical
// <button class="icon-btn icon-btn--alert" data-scope="X">...</button>
// blocks — one per role, only the label/target changed. Collapsed into a
// single config-driven button here.
//
// Keyed by PORTAL KEY (navConfig.js's getPortalKey — role/org/
// department refactor): identical to the role for most entries, but
// for the org-scoped Vigilance seats it also encodes which
// organization type, same as NAV_CONFIG/DASHBOARD_ID_BY_ROLE/
// PROFILE_ID_BY_ROLE.
const ALERT_TARGET_BY_ROLE = {
  patient: { view: 'alertes', title: 'Notifications et alertes' },
  doctor: { view: 'doc-alertes', title: 'Alertes vigilance actives' },
  pharmacist: { view: 'pharm-rappels', title: 'Rappels de lots actifs' },
  laboratory_staff: { view: 'lab-alertes', title: 'Alertes & recalls' },
  // Org-scoped portal keys (see navConfig.js): only the
  // vigilance_responsible seat's portal has an Alertes page — the
  // administrator seat's nav has no alertes item, so it deliberately
  // has no entry here (alertCfg stays undefined, no alert button
  // rendered — same "only if it exists" rule as the nav).
  'hospital-qualite': { view: 'hosp-alertes', title: 'Alertes ANPP & recalls' },
  'clinique-qualite': { view: 'clin-alertes', title: 'Alertes & recalls' },
  'centremedical-qualite': { view: 'cm-alertes', title: 'Alertes & recalls' },
  // Administrateur d'établissement : la cloche ouvre ses notifications (déclarations reçues de ses équipes).
  'hospital-admin': { view: 'org-notifications', title: 'Notifications' },
  'clinique-admin': { view: 'org-notifications', title: 'Notifications' },
  'centremedical-admin': { view: 'org-notifications', title: 'Notifications' },
};

export default function Topbar({
  portalKey,
  userInitials,
  userName,
  onToggleSidebar,
  onGoDashboard,
  onOpenAlerts,
  onToggleTheme,
  onLogout,
  onOpenProfile,
  onNavigate,
  user,
  theme,
  activeId,
  queueUnread = null,
}) {
  const alertCfg = ALERT_TARGET_BY_ROLE[portalKey];
  // Pastille rouge de la cloche : uniquement s'il reste quelque chose de non lu.
  //  - notifications d'établissement : nombre réel d'éléments non lus (serveur) ;
  //  - autres rôles : la page d'alertes n'a pas encore été ouverte par cet utilisateur (mémorisé sur cet appareil).
  const seenKey = `vigicore.alerts-seen.${user?.id || 'anon'}.${alertCfg?.view || ''}`;
  const [alertsSeen, setAlertsSeen] = useState(() => { try { return localStorage.getItem(seenKey) === '1'; } catch { return false; } });
  useEffect(() => {
    if (!alertCfg || activeId !== alertCfg.view) return;
    try { localStorage.setItem(seenKey, '1'); } catch { /* stockage indisponible : la pastille disparaît pour cette session */ }
    setAlertsSeen(true);
  }, [activeId, alertCfg, seenKey]);
  const showDot = alertCfg?.view === 'org-notifications' ? Number(queueUnread) > 0 : !alertsSeen;

  return (
    <header className="topbar">
      <button
        className="hamburger"
        aria-label={tr("Ouvrir le menu de navigation")}
        aria-expanded="false"
        aria-controls="sidebar"
        onClick={onToggleSidebar}
      >
        <Icon name="menu-2" />
      </button>

      <div
        className="logo nav-logo"
        role="button"
        tabIndex={0}
        aria-label={tr("VigiCore — retour au tableau de bord")}
        onClick={onGoDashboard}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onGoDashboard();
          }
        }}
      >
        <Logo idPrefix="dash-nav" />
      </div>

      <div className="topbar-center">
        <GlobalSearch portalKey={portalKey} user={user} onNavigate={onNavigate} />
      </div>

      <div className="topbar-end">
        {alertCfg && (
          <button
            className={`icon-btn${showDot ? ' icon-btn--alert' : ''}`}
            title={tr(alertCfg.title)}
            aria-label={tr(alertCfg.title)}
            onClick={() => onOpenAlerts(alertCfg.view)}
          >
            <Icon name="bell" />
          </button>
        )}

        <TopbarLanguage />

        <button
          className="icon-btn theme-toggle-btn"
          title={tr("Changer l'apparence")}
          aria-label={tr("Basculer entre thème clair et sombre")}
          onClick={onToggleTheme}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>

        <div className="divider" role="separator" />

        {user?.isStaff && (
          <a className="icon-btn" href="/admin" title={tr("Espace staff VigiCore : paiements et validation des produits")} aria-label={tr("Espace staff VigiCore")}
            style={{ width: 'auto', padding: '0 12px', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            {tr("Staff")}
          </a>
        )}

        <button className="icon-btn" title={tr("Se déconnecter")} aria-label={tr("Se déconnecter de VigiCore")} onClick={onLogout}>
          <Icon name="logout-2" />
        </button>

        <div className="divider" role="separator" />

        <button
          className="avatar u-pointer"
          title={tr("{0} — Ouvrir le profil", [userName])}
          aria-label={tr("Ouvrir le profil de {0}", [userName])}
          onClick={onOpenProfile}
        >
          {userInitials}
        </button>
      </div>
    </header>
  );
}
