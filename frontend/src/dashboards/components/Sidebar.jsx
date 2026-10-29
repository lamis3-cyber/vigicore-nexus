import Icon from './Icon';
import { navItemsFor } from '../config/navConfig';
import { DR_DECLARATIONS } from '../data/doctorVigilance';
import { LAB_DECLARATIONS } from '../data/laboVigilance';
import { pharmScopedProducts, pharmStockList } from '../data/pharmacienVigilance';
import { getCurrentAuthUser } from '../context/AuthContext';
import { isOrgScopedRecordVisible } from '../config/organizations';
import { tr } from '../../i18n/translate.js';
import { QUEUE_NAV_IDS } from '../lib/useQueueAlerts';

// Doctor portal audit fix (Step 3A §3) — 'doc-declarations' joins the
// list below: navConfig.js hardcoded `badge: 3` for every doctor
// account (standalone AND all three organization-employed doctors)
// regardless of what was actually pending, and it never respected
// organization scope. Same 'review'-only definition of "pending" that
// DoctorDashboard.jsx's own pendingCount KPI already uses, so the
// rail badge, the dashboard KPI, and the Déclarations page's own
// "à valider" filter can never disagree with each other.
//
// Blocker fix (audit round 2 §3 Medium) — 'pharm-declarations' and
// 'lab-declarations' had their badge counts baked into NAV_CONFIG at
// *module-import* time (navConfig.js's PHARM_DECL_PENDING_COUNT /
// LAB_DECL_PENDING_COUNT), computed from the full, unscoped
// DR_DECLARATIONS/LAB_DECLARATIONS arrays before any user had even
// logged in. That both froze the number forever and, for
// pharm-declarations specifically, leaked a cross-organization count
// (the underlying page is org-scoped; the badge wasn't). The other
// badges in navConfig.js (alerts, recalls, lab surveillance/reagents)
// are correctly left as-is — they're computed once from genuinely
// GLOBAL data (DR_ALERTS/PHARM_RECALLS/LAB_SURVEILLANCE/LAB_REAGENTS),
// so there's no organization to leak and the existing "recomputed on
// page load, not after every action" tradeoff (already documented in
// navConfig.js) is unaffected.
//
// Blocker 1 fix (this pass) — 'pharm-stock' joins the two above:
// PHARM_PRODUCTS became org-scoped, so its badge needs the same
// per-user recomputation, not navConfig.js's static, pre-login count.
//
// Blocker 3 fix (this pass) — patient 'declarations' ("Dossiers")
// joins them too: navConfig.js hardcoded `badge: 3` for every patient
// account regardless of what they'd actually declared, because the
// page it pointed to (PatientDossiers.jsx) used to show 5 static
// fake rows unrelated to that patient's real submissions. Now that
// PatientDossiers reads DR_DECLARATIONS for real, the badge does too —
// same per-user, `authoredByUserId`-scoped count that page itself
// renders, so the rail can never disagree with the page.
//
// Rather than restructure NAV_CONFIG's static per-role shape (would
// touch the config for a small, two-item fix and risks a second,
// competing navigation representation), these counts are recomputed
// HERE, at Sidebar render time, using the exact same
// isOrgScopedRecordVisible rule every scoped page already filters
// with — so the badge can never disagree with what the page itself
// would show. Sidebar re-renders on every navigation, so this is
// "live enough" without introducing a new refresh mechanism.
function dynamicBadgeFor(itemId) {
  const user = getCurrentAuthUser();
  if (itemId === 'doc-declarations') {
    return DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user) && d.status === 'review').length;
  }
  if (itemId === 'pharm-declarations') {
    return DR_DECLARATIONS.filter((d) => d.dept === 'Pharmacie' && isOrgScopedRecordVisible(d, user) && (d.status === 'review' || d.status === 'draft')).length;
  }
  if (itemId === 'lab-declarations') {
    return LAB_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user) && (d.status === 'review' || d.status === 'draft')).length;
  }
  // Medical Staff (role: 'medical_staff') — dashboard-architecture fix,
  // Step 1. Same org-scoped "pending" pattern as pharm-declarations/
  // lab-declarations above: no per-role dept filter (Medical Staff
  // isn't tied to one dept label the way Pharmacien is to
  // 'Pharmacie'), just this organization's own pending declarations.
  if (itemId === 'ms-declarations') {
    return DR_DECLARATIONS.filter((d) => isOrgScopedRecordVisible(d, user) && (d.status === 'review' || d.status === 'draft')).length;
  }
  if (itemId === 'pharm-stock') {
    return pharmStockList(pharmScopedProducts(user), 'all').length;
  }
  if (itemId === 'declarations' && user?.role === 'patient') {
    return DR_DECLARATIONS.filter((d) => user?.id && d.authoredByUserId === user.id && (d.status === 'review' || d.status === 'draft')).length;
  }
  return null;
}

// ONE sidebar for every role. The old HTML had all 7 roles' rail-items
// sitting in the DOM together, toggled with data-scope + CSS.
// Here we just render the array that matches the current portal key
// (navConfig.js's getPortalKey — role/org/department refactor: for
// most roles this is just the role itself; for
// 'vigilance_responsible'/'administrator' it also encodes which
// organization type, so the right existing nav list is picked).
export default function Sidebar({ portalKey, activeId, onSelect, onOpenChat, queueUnread = null }) {
  const items = navItemsFor(portalKey, getCurrentAuthUser());
  // Responsable vigilance (« <org>-qualite ») et administrateur (« <org>-admin ») : pastille = éléments NON LUS (calculée dans AppLayout).
  const queueEnabled = /-(qualite|admin)$/.test(String(portalKey || ''));

  return (
    <nav className="sidebar" aria-label={tr("Navigation principale")}>
      <div className="rail-nav" role="tablist" aria-orientation="vertical">
        {items.map((item, i) =>
          item.divider ? (
            <div className="rail-divider" role="separator" key={`div-${i}`} />
          ) : (
            <div
              key={item.id}
              className={`rail-item${activeId === item.id ? ' is-active' : ''}`}
              role="tab"
              tabIndex={0}
              aria-selected={activeId === item.id}
              title={tr(item.label)}
              onClick={() => onSelect(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(item.id);
              }}
            >
              <Icon name={item.icon} className={item.colorClass} />
              <span className="rail-item-label">{tr(item.label)}</span>
              {(() => {
                const dynamic = queueEnabled && QUEUE_NAV_IDS.has(item.id) ? queueUnread : dynamicBadgeFor(item.id);
                const badge = dynamic !== null ? dynamic : item.badge;
                // A "0" badge reads as a pending alert: show a badge only when there is something to count.
                return badge != null && Number(badge) !== 0 && (
                  <span
                    className={`rail-badge${item.badgeVariant ? ` rail-badge--${item.badgeVariant}` : ''}`}
                    aria-label={tr("{0} notifications", [badge])}
                  >
                    {tr(badge)}
                  </span>
                );
              })()}
            </div>
          )
        )}
      </div>
      <div className="rail-footer">
        <button className="rail-ai-btn" aria-label={tr("Ouvrir l'assistant VigiCore AI")} onClick={onOpenChat}>
          <Icon name="sparkles" />
        </button>
      </div>
    </nav>
  );
}
