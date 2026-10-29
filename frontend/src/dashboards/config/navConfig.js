// ═══════════════════════════════════════════════════════════
// Navigation config — ONE source of truth per role.
// Sidebar.jsx reads this instead of having 7 copies of rail-item markup.
// Add a new role by adding an entry here — no component changes needed.
// ═══════════════════════════════════════════════════════════
import { DR_ALERTS, PHARM_RECALLS, DR_DECLARATIONS } from '../data/doctorVigilance';
import { PHARM_PRODUCTS, pharmStockList } from '../data/pharmacienVigilance';
import { LAB_DECLARATIONS, LAB_SURVEILLANCE, LAB_REAGENTS } from '../data/laboVigilance';

// Ported 1:1 from the original's updateDrBadges(): the "Alertes" rail
// badge is the live count of un-acknowledged DR_ALERTS, not a fixed
// number — it must stay in sync with the same figure shown in the
// "Alertes actives" KPI card on the doctor dashboard (DoctorDashboard.jsx
// computes it the same way from the same array).
const DR_ACTIVE_ALERTS_COUNT = DR_ALERTS.filter((a) => !a.ack).length;

// Ported 1:1 from the original's updatePharmBadges(): computed once at
// import time from the same shared arrays the pages themselves read —
// same "not fully live" compromise already accepted for
// DR_ACTIVE_ALERTS_COUNT above (badges don't re-run after in-page
// actions like confirming a recall return; only a fresh page load
// recomputes them, matching this app's existing precedent).
//
// Blocker 1 fix: PHARM_PRODUCTS became org-scoped, so this fallback is
// now only correct for the standalone pharmacien (no orgId). Like the
// pharm-declarations/lab-declarations badges before it, the org-aware
// number is computed live in Sidebar.jsx's dynamicBadgeFor() instead —
// this constant stays only as the value used before any user is known
// (kept, not removed, so nothing regresses for the standalone account).
const PHARM_ACTIVE_RECALLS_COUNT = PHARM_RECALLS.filter((r) => !r.returned).length;
const PHARM_STOCK_ALERTS_COUNT = pharmStockList(PHARM_PRODUCTS, 'all').length;
const PHARM_DECL_PENDING_COUNT = DR_DECLARATIONS.filter((d) => d.dept === 'Pharmacie' && (d.status === 'review' || d.status === 'draft')).length;

// Ported 1:1 from the original's updateLabBadges() — same once-at-import
// compromise as the counts above.
const LAB_DECL_PENDING_COUNT = LAB_DECLARATIONS.filter((d) => d.status === 'review' || d.status === 'draft').length;
const LAB_ALERT_COUNT = DR_ALERTS.filter((a) => !a.ack).length + PHARM_RECALLS.filter((r) => !r.returned).length;
const LAB_SURVEILLANCE_CRITIQUE_COUNT = LAB_SURVEILLANCE.filter((s) => s.niveau === 'critique').length;
const LAB_REACTIFS_ACTIVE_COUNT = LAB_REAGENTS.filter((r) => r.vigilanceStatus === 'active').length;

// ── Role/Organization/Department refactor — portal key ───────────────
// `role` (AuthContext.jsx) is now ALWAYS a clean, normalized business
// role — it never encodes an organization type. But this app still
// has THREE separately-coded dashboard implementations for
// 'vigilance_responsible' (CHU/Clinique/Centre Médical each have their
// own Dashboard/Alertes/Rapports pages) and for 'administrator'
// (Personnel+Paramètres vs. just Paramètres) — merging those into one
// generic implementation would be a much larger, riskier rewrite than
// this refactor asked for, and isn't required by it: nothing in the
// brief says these institutions must share one dashboard, only that
// the same PROFESSIONAL ROLE must be reusable across organizations,
// which it already is here (same 'vigilance_responsible'/
// 'administrator' role string, just routed to a different existing
// page set depending on orgType).
//
// getPortalKey(user) is that routing decision, and the ONLY place it's
// made: a small, derived, NON-BUSINESS key computed from
// (role, orgType), used exclusively by navConfig.js/App.jsx/
// Topbar.jsx/Sidebar.jsx to pick which existing nav items and page
// components to render. It is never assigned to `user.role`, never
// read by permissions.js, never used for an authorization decision,
// and never persisted — recomputed fresh from the session every
// render. This is exactly the "clean mapping layer instead of
// polluting the business role" the refactor brief's §7 explicitly
// calls for.
//
// For every OTHER role (patient/doctor/pharmacist/laboratory_staff/
// medical_staff/auditor), the portal key is simply the role itself —
// those roles are already reused identically across every
// organization (or no organization at all), exactly as required.
const PORTAL_PREFIX_BY_ORG_TYPE = { hospital: 'hospital', clinic: 'clinique', medical_centre: 'centremedical' };
export function getPortalKey(user) {
  if (!user) return null;
  if (user.role === 'vigilance_responsible' || user.role === 'administrator') {
    const prefix = PORTAL_PREFIX_BY_ORG_TYPE[user.orgType];
    // A standalone vigilance_responsible/administrator (no
    // organization) has no existing portal to route to yet — falls
    // through to <ComingSoon/> rather than guessing which
    // institution's pages to show.
    if (!prefix) return null;
    return `${prefix}-${user.role === 'vigilance_responsible' ? 'qualite' : 'admin'}`;
  }
  return user.role;
}

// Entrées réservées à l'ADMINISTRATEUR de la société fournisseur : achats chez les fabricants et ses suivis.
// Un employé (commercial, magasinier) traite les commandes de ses clients ; il n'achète pas au nom de la société.
export const SUPPLIER_ADMIN_ONLY = new Set(['sup-catalogue', 'sup-suivi', 'sup-historique', 'sup-organisations']);

/** Un employé d'un fournisseur n'a pas accès aux pages d'ACHAT (le serveur le refuse aussi : NOT_ESTABLISHMENT_ADMIN). */
export const supplierPageBlocked = (user, id) => user?.isOrgAdmin === false && SUPPLIER_ADMIN_ONLY.has(id);

/** Entrées du menu pour ce compte (même liste que NAV_CONFIG, sans les entrées administrateur pour un employé fournisseur). */
export function navItemsFor(portalKey, user) {
  const items = NAV_CONFIG[portalKey] || [];
  if (portalKey !== 'supplier' || user?.isOrgAdmin !== false) return items;
  const kept = items.filter((i) => !SUPPLIER_ADMIN_ONLY.has(i.id));
  // pas de séparateur en double ni en bout de liste
  return kept.filter((i, idx) => !(i.divider && (kept[idx - 1]?.divider || idx === kept.length - 1 || idx === 0)));
}

export const NAV_CONFIG = {
  patient: [
    { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'declarer', icon: 'clipboard-plus', label: 'Incident', colorClass: 'u-c-amber' },
    { id: 'declarations', icon: 'folder', label: 'Dossiers', badgeVariant: 'amber' },
    { id: 'medecins', icon: 'stethoscope', label: 'Médecins', colorClass: 'u-c-blue' },
    { divider: true },
    { id: 'traitements', icon: 'pill', label: 'Traitements', colorClass: 'u-c-cyan' },
    { id: 'produits', icon: 'package', label: 'Produits', colorClass: 'u-c-green' },
    { id: 'alertes', icon: 'alert-triangle', label: 'Alertes', colorClass: 'u-c-red' },
    { id: 'rdv', icon: 'calendar', label: 'RDV', colorClass: 'u-c-purple' },
    { divider: true },
    { id: 'communication', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { id: 'information', icon: 'books', label: 'Infos', colorClass: 'u-c-blue' },
    { divider: true },
    { id: 'profil', icon: 'user', label: 'Profil' },
    { id: 'parametres', icon: 'settings', label: 'Réglages' },
  ],
  doctor: [
    { id: 'doc-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'doc-patients', icon: 'users', label: 'Patients', colorClass: 'u-c-blue' },
    { id: 'doc-declarer', icon: 'clipboard-plus', label: 'Déclarer', colorClass: 'u-c-amber' },
    { id: 'doc-declarations', icon: 'folder', label: 'Déclarations', colorClass: 'u-c-cyan', badgeVariant: 'amber' },
    { divider: true },
    { id: 'doc-alertes', icon: 'alert-triangle', label: 'Alertes', colorClass: 'u-c-red', badge: DR_ACTIVE_ALERTS_COUNT },
    { id: 'doc-labos', icon: 'flask', label: 'Labos', colorClass: 'u-c-green' },
    { id: 'doc-demandes', icon: 'message-circle', label: 'Demandes', colorClass: 'u-c-blue' },
    { divider: true },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { id: 'my-org', icon: 'building-hospital', label: 'Organisation', colorClass: 'u-c-blue' },
    { id: 'doc-parametres', icon: 'settings', label: 'Réglages' },
  ],
  // Ported 1:1 from the original rail's pharmacien block (~L1925-1985),
  // same order/dividers/icons/colors. "Commandes" (rail id
  // rail-pharm-labos) and "Labos" (rail id rail-pharm-fournisseurs) keep
  // their original rail ids as labels even though "Commandes" routes to
  // the pharm-commandes view and "Labos" reuses the Doctor portal's own
  // Labos page (doc-labos) — exactly what the original did (its own
  // comments note Pharmacien deliberately reuses the Médecin portal's
  // Labos/CAPA page and secure inbox rather than duplicating them).
  // "Profil" has no rail entry here either, matching the original —
  // it's reached only via the topbar avatar (PROFILE_ID_BY_ROLE below).
  pharmacist: [
    { id: 'pharm-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'pharm-declarer', icon: 'clipboard-plus', label: 'Déclarer', colorClass: 'u-c-amber' },
    { id: 'pharm-declarations', icon: 'folder', label: 'Déclarations', colorClass: 'u-c-cyan', badge: PHARM_DECL_PENDING_COUNT, badgeVariant: 'amber' },
    { divider: true },
    { id: 'pharm-verification', icon: 'qrcode', label: 'Vérifier', colorClass: 'u-c-cyan' },
    { divider: true },
    { id: 'pharm-rappels', icon: 'alert-triangle', label: 'Rappels', colorClass: 'u-c-red', badge: PHARM_ACTIVE_RECALLS_COUNT },
    { id: 'pharm-stock', icon: 'box', label: 'Stock', colorClass: 'u-c-amber', badge: PHARM_STOCK_ALERTS_COUNT, badgeVariant: 'amber' },
    { id: 'pharm-commandes', icon: 'truck-delivery', label: 'Commandes', colorClass: 'u-c-green' },
    { id: 'doc-labos', icon: 'building-factory-2', label: 'Labos', colorClass: 'u-c-purple' },
    { divider: true },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { id: 'my-org', icon: 'building-hospital', label: 'Organisation', colorClass: 'u-c-blue' },
    { id: 'pharm-parametres', icon: 'settings', label: 'Paramètres' },
  ],
  // Ported 1:1 from the original rail's labo block (~L1988-2051), same
  // order/dividers/icons/colors, including the "Dossiers" label for the
  // Déclarations rail item (the original rail label differs from the
  // view/page title "Mes déclarations" — kept as found). "Messages"
  // reuses doc-messagerie and "Docs" reuses doc-documentation, same
  // original design already used for Pharmacien's "Labos"/"Messages".
  // No "Profil" rail entry, matching the original (topbar avatar only).
  laboratory_staff: [
    { id: 'lab-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'lab-declarer', icon: 'clipboard-plus', label: 'Déclarer', colorClass: 'u-c-amber' },
    { divider: true },
    { id: 'lab-declarations', icon: 'folder', label: 'Dossiers', colorClass: 'u-c-cyan', badge: LAB_DECL_PENDING_COUNT, badgeVariant: 'amber' },
    { divider: true },
    { id: 'lab-recherche', icon: 'qrcode', label: 'Vérifier', colorClass: 'u-c-cyan' },
    { id: 'lab-reactifs', icon: 'test-pipe', label: 'Réactifs', colorClass: 'u-c-purple', badge: LAB_REACTIFS_ACTIVE_COUNT, badgeVariant: 'amber' },
    { id: 'lab-surveillance', icon: 'eye', label: 'Surveillance', colorClass: 'u-c-amber', badge: LAB_SURVEILLANCE_CRITIQUE_COUNT, badgeVariant: 'amber' },
    { divider: true },
    { id: 'lab-alertes', icon: 'alert-triangle', label: 'Alertes', colorClass: 'u-c-red', badge: LAB_ALERT_COUNT },
    { id: 'lab-demandes', icon: 'message-circle', label: 'Demandes', colorClass: 'u-c-blue' },
    { divider: true },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { id: 'doc-documentation', icon: 'books', label: 'Docs', colorClass: 'u-c-blue' },
    { id: 'my-org', icon: 'building-hospital', label: 'Organisation', colorClass: 'u-c-blue' },
    { id: 'lab-parametres', icon: 'settings', label: 'Paramètres' },
  ],
  // Ported 1:1 from the original rail's hospital block (~L2054-2103).
  // "Admin." (rail id rail-hosp-admin, a subnav group over Personnel/
  // Rapports/Paramètres in the original) is flattened into its three
  // destination items directly — same flattening already applied to
  // every other role's subnav groups in this file — and "Messages"
  // reuses doc-messagerie, exactly like the original's own
  // 'hosp-messagerie' subnav entry (its single item routes to view
  // 'doc-messagerie', not a hospital-specific inbox).
  // Medical Staff (role: 'medical_staff') — dashboard-architecture fix,
  // Step 1. Only exposes what the role's actual permissions allow
  // (declaration:create, declaration:view — see permissions.js): a
  // dashboard, "Déclarer" (new declaration) and "Déclarations" (own
  // org's declarations, read-only — see MedicalStaffDeclarations.jsx).
  // No Doctor/Pharmacist/Lab/Admin items — this role never gets
  // prescription, stock, lab, or organization-management navigation.
  // "Déclarations"'s badge is computed live per-organization in
  // Sidebar.jsx's dynamicBadgeFor() (same pattern as pharm-declarations/
  // lab-declarations above) rather than a static import-time count
  // here, since this nav array is shared by every organization's
  // Medical Staff account.
  medical_staff: [
    { id: 'medical-staff-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'ms-declarer', icon: 'clipboard-plus', label: 'Déclarer', colorClass: 'u-c-amber' },
    { id: 'ms-declarations', icon: 'folder', label: 'Déclarations', colorClass: 'u-c-cyan', badgeVariant: 'amber' },
    { divider: true },
    { id: 'my-org', icon: 'building-hospital', label: 'Organisation', colorClass: 'u-c-blue' },
  ],
  // Auditor (role: 'auditor') — dashboard-architecture fix, Step 2.
  // Only exposes what the role's actual permissions allow
  // (declaration:view, audit:view — see permissions.js): a global
  // dashboard and a global, read-only declarations list. No
  // Doctor/Pharmacist/Lab/Medical Staff/Admin items, and no write/
  // create action anywhere — Auditor is strictly read-only. Unlike
  // medical_staff above, Auditor is NOT organization-scoped (it has
  // no orgId at all — see AuthContext.jsx), so both pages read
  // across every organization instead of filtering to one (see
  // AuditorDashboard.jsx / AuditorDeclarations.jsx).
  auditor: [
    { id: 'auditor-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'auditor-declarations', icon: 'folder', label: 'Déclarations', colorClass: 'u-c-cyan' },
  ],
  // Fournisseur / distributeur (role: 'supplier'), une page = un sujet : ses produits à vendre et les commandes de ses clients ; alertes de lot ; déclaration d'incident et ses
  // déclarations ; commander (catalogue) ; suivi des commandes en cours ; historique des achats ; fabricants ; messagerie.
  // Tout vient de l'API.
  supplier: [
    { id: 'sup-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'sup-notifications', icon: 'bell', label: 'Alertes', colorClass: 'u-c-amber' },
    { id: 'sup-declarer', icon: 'clipboard-plus', label: 'Incident', colorClass: 'u-c-red' },
    { id: 'sup-declarations', icon: 'folder', label: 'Déclarations', colorClass: 'u-c-cyan' },
    { divider: true },
    { id: 'sup-produits', icon: 'building-store', label: 'Mes produits', colorClass: 'u-c-green' },
    { id: 'sup-ventes', icon: 'receipt', label: 'Commandes clients', colorClass: 'u-c-amber' },
    { divider: true },
    { id: 'sup-catalogue', icon: 'package', label: 'Commander', colorClass: 'u-c-green' },
    { id: 'sup-suivi', icon: 'truck-delivery', label: 'Suivi', colorClass: 'u-c-cyan' },
    { id: 'sup-historique', icon: 'history', label: 'Historique', colorClass: 'u-c-purple' },
    { id: 'sup-organisations', icon: 'building-factory-2', label: 'Fabricants', colorClass: 'u-c-blue' },
    { divider: true },
    { id: 'sup-equipe', icon: 'users-group', label: 'Équipe', colorClass: 'u-c-cyan' },
    { id: 'sup-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple' },
  ],
  // ═══════════════════════════════════════════════════════════
  // Org-scoped PORTAL KEYS (role/org/department refactor — see
  // getPortalKey() above). These object keys ('hospital-qualite',
  // etc.) are NOT roles — no account's `role` field is ever one of
  // these strings any more. They're the derived UI-routing keys
  // getPortalKey(user) produces for a 'vigilance_responsible' or
  // 'administrator' account, based on which organization TYPE they
  // belong to, purely so this file can keep exposing
  // CHU/Clinique/Centre Médical's three separately-coded dashboard
  // implementations without a business role ever encoding which one.
  //
  // A hospital/clinique/centre médical is an ORGANIZATION: Doctor,
  // Pharmacist and Laboratory Staff employees of that org reuse the
  // plain 'doctor' / 'pharmacist' / 'laboratory_staff' entries above
  // verbatim (same nav, same pages — "reuse existing components,
  // don't duplicate portals"). Only the two org-specific roles get
  // their own nav below, keyed by portal key:
  //   - "<org>-qualite" (role: 'vigilance_responsible'): declaration
  //     review, vigilance, CAPA, audit — i.e. what the old single
  //     'hospital'/'clinique'/'centremedical' nav used to expose,
  //     minus organization-management items.
  //   - "<org>-admin" (role: 'administrator'): a landing Dashboard
  //     (src/pages/admin/AdminDashboard.jsx, shared across all three
  //     org types — organization-scoped, no invented data) plus ONLY
  //     organization-management functionality that actually exists in
  //     the frontend (Personnel where that page exists, Paramètres).
  //     Never given declaration/vigilance items.
  // Every item id below is an EXISTING hosp-*/clin-*/cm-* page — no
  // page was invented to fill out these lists.
  // ═══════════════════════════════════════════════════════════
  'hospital-qualite': [
    { id: 'hosp-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'hosp-declarer', icon: 'clipboard-plus', label: 'Déclarer', colorClass: 'u-c-amber' },
    { id: 'hosp-declarations', icon: 'clipboard-list', label: 'Déclar.', colorClass: 'u-c-cyan' },
    { divider: true },
    { id: 'hosp-produits', icon: 'qrcode', label: 'Produits', colorClass: 'u-c-cyan' },
    { id: 'hosp-alertes', icon: 'alert-triangle', label: 'Alertes', colorClass: 'u-c-red' },
    { divider: true },
    { id: 'hosp-rapports', icon: 'chart-bar', label: 'Rapports', colorClass: 'u-c-amber' },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
  ],
  'hospital-admin': [
    { id: 'admin-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'my-org', icon: 'user-plus', label: 'Équipe', colorClass: 'u-c-green' },
    { divider: true },
    { id: 'org-declarations', icon: 'clipboard-list', label: 'Déclar.', colorClass: 'u-c-cyan' },
    { id: 'org-notifications', icon: 'bell', label: 'Notifs', colorClass: 'u-c-amber', badgeVariant: 'amber' },
    { divider: true },
    { id: 'org-commandes', icon: 'truck-delivery', label: 'Commandes', colorClass: 'u-c-green' },
    { id: 'org-personnel', icon: 'users-group', label: 'Personnel', colorClass: 'u-c-purple' },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { divider: true },
    { id: 'hosp-parametres', icon: 'settings', label: 'Paramètres' },
  ],
  'clinique-qualite': [
    { id: 'clin-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'clin-declarer', icon: 'clipboard-plus', label: 'Déclarer', colorClass: 'u-c-amber' },
    { id: 'clin-declarations', icon: 'clipboard-list', label: 'Déclar.', colorClass: 'u-c-cyan' },
    { id: 'clin-produits', icon: 'qrcode', label: 'Produits', colorClass: 'u-c-cyan' },
    { id: 'clin-alertes', icon: 'alert-triangle', label: 'Alertes', colorClass: 'u-c-red' },
    { divider: true },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { id: 'clin-rapports', icon: 'chart-bar', label: 'Rapports', colorClass: 'u-c-amber' },
  ],
  // Clinique has no dedicated Personnel page (unlike Hospital) — the
  // admin seat is intentionally thin, per "only receive
  // organization-management functionality that actually exists".
  'clinique-admin': [
    { id: 'admin-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'my-org', icon: 'user-plus', label: 'Équipe', colorClass: 'u-c-green' },
    { divider: true },
    { id: 'org-declarations', icon: 'clipboard-list', label: 'Déclar.', colorClass: 'u-c-cyan' },
    { id: 'org-notifications', icon: 'bell', label: 'Notifs', colorClass: 'u-c-amber', badgeVariant: 'amber' },
    { id: 'org-commandes', icon: 'truck-delivery', label: 'Commandes', colorClass: 'u-c-green' },
    { id: 'org-personnel', icon: 'users-group', label: 'Personnel', colorClass: 'u-c-purple' },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { divider: true },
    { id: 'clin-parametres', icon: 'settings', label: 'Paramètres' },
  ],
  'centremedical-qualite': [
    { id: 'cm-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { divider: true },
    { id: 'cm-declarer', icon: 'clipboard-plus', label: 'Déclarer', colorClass: 'u-c-amber' },
    { id: 'cm-declarations', icon: 'clipboard-list', label: 'Déclar.', colorClass: 'u-c-cyan' },
    { id: 'cm-produits', icon: 'qrcode', label: 'Produits', colorClass: 'u-c-cyan' },
    { id: 'cm-alertes', icon: 'alert-triangle', label: 'Alertes', colorClass: 'u-c-red' },
    { divider: true },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { id: 'cm-rapports', icon: 'chart-bar', label: 'Rapports', colorClass: 'u-c-amber' },
  ],
  'centremedical-admin': [
    { id: 'admin-dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'my-org', icon: 'user-plus', label: 'Équipe', colorClass: 'u-c-green' },
    { divider: true },
    { id: 'org-declarations', icon: 'clipboard-list', label: 'Déclar.', colorClass: 'u-c-cyan' },
    { id: 'org-notifications', icon: 'bell', label: 'Notifs', colorClass: 'u-c-amber', badgeVariant: 'amber' },
    { id: 'org-commandes', icon: 'truck-delivery', label: 'Commandes', colorClass: 'u-c-green' },
    { id: 'org-personnel', icon: 'users-group', label: 'Personnel', colorClass: 'u-c-purple' },
    { id: 'doc-messagerie', icon: 'messages', label: 'Messages', colorClass: 'u-c-purple', badgeVariant: 'amber' },
    { divider: true },
    { id: 'cm-parametres', icon: 'settings', label: 'Paramètres' },
  ],
};

// Each role's "home" nav id — used by Topbar's logo-click and by App.jsx
// to pick the default page after login. One place, instead of hardcoding
// 'dashboard' / 'doc-dashboard' / etc. in multiple components.
//
// Looked up by PORTAL KEY (getPortalKey(user)), not by user.role
// directly — for every role except vigilance_responsible/administrator
// the portal key equals the role, so this reads exactly like a
// role-keyed table for those; the org-scoped keys below are portal
// keys (see the NAV_CONFIG header above).
export const DASHBOARD_ID_BY_ROLE = {
  patient: 'dashboard',
  doctor: 'doc-dashboard',
  pharmacist: 'pharm-dashboard',
  laboratory_staff: 'lab-dashboard',
  // medical_staff: implemented (Step 1 of the dashboard-architecture
  // fix) — 'medical-staff-dashboard' now matches a real NAV_CONFIG
  // entry and App.jsx PageRouter route (MedicalStaffDashboard.jsx).
  medical_staff: 'medical-staff-dashboard',
  // auditor: implemented (Step 2 of the dashboard-architecture fix) —
  // 'auditor-dashboard' now matches a real NAV_CONFIG entry and
  // App.jsx PageRouter route (AuditorDashboard.jsx).
  auditor: 'auditor-dashboard',
  supplier: 'sup-dashboard',
  'hospital-qualite': 'hosp-dashboard',
  // Administrator now has a real landing dashboard (see
  // src/pages/admin/AdminDashboard.jsx) instead of landing directly on
  // a secondary page (Personnel/Paramètres) — Administrator audit,
  // step "Administrator landing page".
  'hospital-admin': 'admin-dashboard',
  'clinique-qualite': 'clin-dashboard',
  'clinique-admin': 'admin-dashboard',
  'centremedical-qualite': 'cm-dashboard',
  'centremedical-admin': 'admin-dashboard',
};

// Which nav id the topbar avatar's "Ouvrir le profil" button should go
// to, per role — ported 1:1 from the original's profileView(): each
// professional role has its own dedicated profile/identity view, not
// the patient's generic 'profil'. (hospital maps to its parameters
// view in the source too — hôpital has no separate profile page.)
//
// Looked up by PORTAL KEY, same as DASHBOARD_ID_BY_ROLE above.
export const PROFILE_ID_BY_ROLE = {
  patient: 'profil',
  doctor: 'doc-profil',
  pharmacist: 'pharm-profil',
  laboratory_staff: 'lab-profil',
  medical_staff: 'medical-staff-profil',
  auditor: 'auditor-profil',
  supplier: 'sup-dashboard', // pas encore de page profil dédiée : l'accueil
  'hospital-qualite': 'hosp-parametres',
  'hospital-admin': 'hosp-parametres',
  'clinique-qualite': 'clin-profil',
  'clinique-admin': 'clin-profil',
  'centremedical-qualite': 'cm-profil',
  'centremedical-admin': 'cm-profil',
};

// AI chat identity per role — used by the ONE shared <ChatPanel/> instead of
// aiChat / docAIChat / pharmAIChat / hospAIChat / clinAIChat / cmAIChat copies.
// Looked up by PORTAL KEY (getPortalKey(user)), same as
// DASHBOARD_ID_BY_ROLE/PROFILE_ID_BY_ROLE above.
// `description` is the intro paragraph shown in the greeting card — it spells
// out what the assistant can actually do for that role, so it has to be
// written per role rather than reused.
const PATIENT_DISCLAIMER = "Ces informations sont indicatives et ne remplacent pas l'avis de votre médecin traitant.";
const PRO_DISCLAIMER = 'Ces informations sont indicatives et ne remplacent pas votre jugement professionnel.';

export const AI_CHAT_CONFIG = {
  patient: {
    title: 'VigiCore AI',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PATIENT_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  doctor: {
    title: 'VigiCore AI — Praticien',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  pharmacist: {
    title: 'VigiCore AI — Pharmacien',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  laboratory_staff: {
    title: 'VigiCore AI — Laboratoire',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  // New roles (role/org/department refactor) — no dedicated page
  // exists for these yet, but the chat panel is reachable from any
  // authenticated session regardless of which pages are migrated (see
  // AppLayout.jsx), so a config entry is required here to avoid
  // reading .title off undefined the first time one of these accounts
  // opens the assistant.
  medical_staff: {
    title: 'VigiCore AI — Personnel médical',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  auditor: {
    title: 'VigiCore AI — Audit',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  supplier: {
    title: 'VigiCore AI — Fournisseur',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus et vos déclarations (par statut, domaine ou période). Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  'hospital-qualite': {
    title: 'VigiCore AI — Hôpital · Qualité/Vigilance',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  'hospital-admin': {
    title: 'VigiCore AI — Hôpital · Administration',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  'clinique-qualite': {
    title: 'VigiCore AI — Clinique · Qualité/Vigilance',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  'clinique-admin': {
    title: 'VigiCore AI — Clinique · Administration',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  'centremedical-qualite': {
    title: 'VigiCore AI — Centre médical · Qualité/Vigilance',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
  'centremedical-admin': {
    title: 'VigiCore AI — Centre médical · Administration',
    description: "Je suis VigiCore AI. Je réponds à partir des données de votre compte : vos contacts, vos messages non lus, vos déclarations (par statut, domaine ou période) et, selon votre rôle, les dossiers, les annonces ou les demandes d\u2019adhésion de votre établissement. Posez-moi une question chiffrée, par exemple « Combien de contacts ai-je ? ».",
    disclaimer: PRO_DISCLAIMER,
    suggestions: [
      'Combien de contacts ai-je ?',
      'Ai-je des messages non lus ?',
      'Combien de déclarations ai-je ?',
    ],
  },
};

// Accounts that log in AS the organisation itself (a
// 'vigilance_responsible' or 'administrator' account belonging to an
// organization, and the standalone Laboratoire Central account) are
// greeted with the org name. Individual employees — including a
// laboratory_staff/doctor/pharmacist who happens to belong to one of
// these organizations (they log in as themselves, with `orgId` set,
// but their `role` stays the plain 'doctor'/'pharmacist'/
// 'laboratory_staff') — are greeted by first name, same as any
// standalone professional account — keeping "Dr." for doctors since
// dropping the title reads oddly.
function isOrgIdentityAccount(user) {
  if (user.role === 'vigilance_responsible' || user.role === 'administrator') return true;
  // The standalone lab-organization login ('labo@demo.dz') has no
  // orgId — an org-employed laboratory_staff does, and should be
  // greeted as themselves, not as the organization.
  if (user.role === 'laboratory_staff' && !user.orgId) return true;
  return false;
}

export function getChatGreetingName(user) {
  if (isOrgIdentityAccount(user)) return user.name;
  const parts = user.name.split(' ');
  if (parts[0] === 'Dr.') return `${parts[0]} ${parts[1]}`;
  return parts[0];
}
