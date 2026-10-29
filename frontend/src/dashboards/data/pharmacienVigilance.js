// ═══════════════════════════════════════════════════════════════
// Pharmacien-portal vigilance data — ported 1:1 from the original HTML's
// PHARM_PRODUCTS / PHARM_STOCK_META / PHARM_BRANCHES /
// PHARM_RECENT_VERIFICATIONS globals and their pharmParseDate() /
// pharmDaysUntil() / pharmDaysSince() / pharmProductAlerts() /
// pharmStockList() helpers (original HTML, ~L7472-7688).
//
// Recalls (PHARM_RECALLS), declarations (DR_DECLARATIONS), suppliers
// (DR_LABS), orders (ORDERS_LOG / ORDER_STATUS / STOCK_TONE), lot
// verification (QR_LOT_DB / QR_VERDICT_META), and the audit trail
// (AUDIT_LOG / logAudit) already live in doctorVigilance.js — ported
// there first because the Doctor portal reused them from the same
// original globals. Pharmacien pages import those from there rather
// than duplicating them, exactly like the original's single
// shared-global-array model (one PHARM_RECALLS, one DR_LABS, etc.,
// read/written by every role that needed them).
// ═══════════════════════════════════════════════════════════════

import { demoRows } from './demoMode';
import { isOrgScopedRecordVisible } from '../config/organizations';

// ── Blocker 1 fix: organization → branch → stock/verification ───────
// PHARM_PRODUCTS / PHARM_RECENT_VERIFICATIONS were a single shared
// array read identically by every pharmacien account — standalone
// (pharmacien@demo.dz), CHU Alger's, and Clinique El Fedjr's — so one
// organization's officine stock was visible to (and editable from) a
// completely unrelated organization. Fixed the exact same way the
// Doctor portal's Blocker 1/2 fix handled DR_PATIENTS/DR_DECLARATIONS
// (see doctorVigilance.js's header): every record below is explicitly
// stamped `organizationId: null` — this is the pre-existing "Officine
// El Badr" demo network, which predates organization identity and
// cannot be reliably attributed to any real org, so it stays
// legacy/standalone (visible only to accounts with no orgId — i.e.
// exactly today's pharmacien@demo.dz — never guessed into belonging
// to CHU Alger or Clinique El Fedjr). CHU Alger's and Clinique El
// Fedjr's pharmaciens correctly start with an EMPTY officine stock —
// same "org-scoped account, no seed data yet" state every other
// org-scoped role already has for its own domain (see
// doctorVigilance.js's DR_PATIENTS/DR_DECLARATIONS) — rather than
// inventing stock data for organizations the source material never
// described.
//
// pharmScopedProducts()/pharmScopedBranches()/pharmScopedVerifications()
// below are the one shared place this scoping rule is applied — pages
// call these instead of reading PHARM_PRODUCTS/PHARM_BRANCHES/
// PHARM_RECENT_VERIFICATIONS directly, reusing the exact same
// isOrgScopedRecordVisible() rule every other org-scoped record in
// this app already uses, so a Blocker-1-style fix can never silently
// diverge between pages (see organizations.js's own header on this).

export const PHARM_RECENT_VERIFICATIONS = demoRows([
  { time: 'Hier · 16:40', product: 'Atorvastatine 20mg', lot: 'ATO-20260510-X', verdict: 'suspicious', risk: 68, organizationId: null },
  { time: 'Hier · 11:05', product: 'Dexamethasone 4mg/2ml', lot: 'DXP-20250612-B', verdict: 'recalled', risk: 92, organizationId: null },
  { time: '28/06 · 09:20', product: 'Metformine 850mg', lot: 'MET-20260502-A', verdict: 'authentic', risk: 4, organizationId: null },
  // F6 addition (Demo Data & Functional Coverage audit) — organization
  // -scoped verifications for CHU Alger / Clinique El Fedjr, reusing
  // the same QR_LOT_DB lots (doctorVigilance.js) so the verdict/risk
  // shown here stays consistent with the lot-verification tool.
  { time: "Aujourd'hui · 08:15", product: 'Dexamethasone 4mg/2ml', lot: 'DXP-20250612-B', verdict: 'recalled', risk: 92, organizationId: 'chu-alger' },
  { time: 'Hier · 15:30', product: 'Metformine 850mg', lot: 'MET-20260502-A', verdict: 'authentic', risk: 4, organizationId: 'clinique-el-fedjr' },
]);

// ── SMART STOCK — gestion prédictive du stock officine ── Ported 1:1
//    from the original's PHARM_PRODUCTS. A single dataset feeds both
//    the Smart Stock alerts and the detailed product card, staying
//    consistent with PHARM_RECALLS and QR_LOT_DB used elsewhere in
//    the officine portal. ──
export const PHARM_PRODUCTS = demoRows([
  { id: 'prod-1', name: 'Metformine 850mg', manufacturer: 'Merck DZ', form: 'Comprimé pelliculé', lot: 'MET-20260502-A', mfgDate: '02/05/2026', expDate: '02/05/2028', qty: 8, reorderThreshold: 15, recalled: false, lastSaleDate: '29/06/2026', branch: 'Alger', verdict: 'authentic', risk: 4, incidents: 1, organizationId: null },
  { id: 'prod-2', name: 'Atorvastatine 20mg (Tahor®)', manufacturer: 'Sanofi Algérie', form: 'Comprimé pelliculé', lot: 'ATO-20260510-X', mfgDate: '10/05/2026', expDate: '10/05/2028', qty: 1, reorderThreshold: 10, recalled: false, lastSaleDate: '28/06/2026', branch: 'Alger', verdict: 'suspicious', risk: 68, incidents: 0, organizationId: null },
  { id: 'prod-3', name: 'Dexamethasone 4mg/2ml injectable', manufacturer: 'Laboratoires Saidal', form: 'Ampoule injectable', lot: 'DXP-20250612-B', mfgDate: '12/06/2025', expDate: '12/06/2027', qty: 6, reorderThreshold: 5, recalled: true, lastSaleDate: '20/06/2026', branch: 'Alger', verdict: 'recalled', risk: 92, incidents: 0, organizationId: null },
  { id: 'prod-4', name: 'Amoxicilline 500mg', manufacturer: 'Laboratoires Saidal', form: 'Gélule', lot: 'AMX-20260201-C', mfgDate: '01/02/2026', expDate: '20/07/2026', qty: 40, reorderThreshold: 20, recalled: false, lastSaleDate: '27/06/2026', branch: 'Alger', verdict: 'authentic', risk: 6, incidents: 0, organizationId: null },
  { id: 'prod-5', name: 'Ibuprofène 400mg', manufacturer: 'Laboratoires Saidal', form: 'Comprimé pelliculé', lot: 'IBU-20250815-E', mfgDate: '15/08/2025', expDate: '15/08/2027', qty: 55, reorderThreshold: 20, recalled: false, lastSaleDate: '02/04/2026', branch: 'Oran', verdict: 'authentic', risk: 5, incidents: 0, organizationId: null },
  { id: 'prod-6', name: 'Insuline Lantus® 100UI/ml', manufacturer: 'Sanofi Algérie', form: 'Stylo prérempli', lot: 'INS-20260410-F', mfgDate: '10/04/2026', expDate: '25/07/2026', qty: 3, reorderThreshold: 8, recalled: false, lastSaleDate: '29/06/2026', branch: 'Oran', verdict: 'authentic', risk: 7, incidents: 0, organizationId: null },
  { id: 'prod-7', name: 'Oméprazole 20mg', manufacturer: 'Laboratoires Saidal', form: 'Gélule gastro-résistante', lot: 'OMZ-20260301-G', mfgDate: '01/03/2026', expDate: '01/03/2028', qty: 70, reorderThreshold: 20, recalled: false, lastSaleDate: '26/06/2026', branch: 'Constantine', verdict: 'authentic', risk: 2, incidents: 0, organizationId: null },
  { id: 'prod-8', name: 'Crème apaisante DermaSoft®', manufacturer: 'Laboratoire non précisé', form: 'Crème topique', lot: 'DSF-20260115-A', mfgDate: '15/01/2026', expDate: '15/01/2028', qty: 2, reorderThreshold: 5, recalled: true, lastSaleDate: '10/06/2026', branch: 'Constantine', verdict: 'recalled', risk: 85, incidents: 1, organizationId: null },
  { id: 'prod-9', name: 'Paracétamol 500mg', manufacturer: 'Laboratoires Saidal', form: 'Comprimé', lot: 'PAR-20260110-H', mfgDate: '10/01/2026', expDate: '10/01/2028', qty: 5, reorderThreshold: 25, recalled: false, lastSaleDate: '29/06/2026', branch: 'Oran', verdict: 'authentic', risk: 9, incidents: 0, organizationId: null },
  { id: 'prod-10', name: 'Tensiomètre électronique bras', manufacturer: 'Biomedical Devices Algérie', form: 'Dispositif électronique', lot: 'TEN-20250501-K', mfgDate: '01/05/2025', expDate: null, qty: 12, reorderThreshold: 5, recalled: false, lastSaleDate: '15/03/2026', branch: 'Constantine', verdict: 'authentic', risk: 3, incidents: 0, organizationId: null },

  // ── F6 addition (Demo Data & Functional Coverage audit) — organization
  // -scoped officine stock for CHU Alger / Clinique El Fedjr's pharmacist
  // seats (Centre Médical Sétif has no pharmacist role — organizations.js
  // — so it intentionally has no stock module at all). `branch` uses the
  // organization's own name since each institutional pharmacy is a
  // single officine, not a multi-city network like the standalone demo.
  { id: 'prod-chu-1', name: 'Paracétamol 500mg', manufacturer: 'Laboratoires Saidal', form: 'Comprimé', lot: 'PAR-20260110-H', mfgDate: '10/01/2026', expDate: '10/01/2028', qty: 4, reorderThreshold: 25, recalled: false, lastSaleDate: '27/06/2026', branch: 'CHU Alger', verdict: 'authentic', risk: 9, incidents: 0, organizationId: 'chu-alger' },
  { id: 'prod-chu-2', name: 'Dexamethasone 4mg/2ml injectable', manufacturer: 'Laboratoires Saidal', form: 'Ampoule injectable', lot: 'DXP-20250612-B', mfgDate: '12/06/2025', expDate: '12/06/2027', qty: 3, reorderThreshold: 5, recalled: true, lastSaleDate: '18/06/2026', branch: 'CHU Alger', verdict: 'recalled', risk: 92, incidents: 1, organizationId: 'chu-alger' },
  { id: 'prod-chu-3', name: 'Insuline Lantus® 100UI/ml', manufacturer: 'Sanofi Algérie', form: 'Stylo prérempli', lot: 'INS-20260410-F', mfgDate: '10/04/2026', expDate: '25/07/2026', qty: 6, reorderThreshold: 8, recalled: false, lastSaleDate: '27/06/2026', branch: 'CHU Alger', verdict: 'authentic', risk: 7, incidents: 0, organizationId: 'chu-alger' },
  { id: 'prod-clin-1', name: 'Amoxicilline/Acide clavulanique 500/125mg', manufacturer: 'Sanofi Algérie', form: 'Comprimé pelliculé', lot: 'AMC-20260118-B', mfgDate: '18/01/2026', expDate: '18/01/2028', qty: 30, reorderThreshold: 20, recalled: false, lastSaleDate: '22/06/2026', branch: 'Clinique El Fedjr', verdict: 'authentic', risk: 6, incidents: 0, organizationId: 'clinique-el-fedjr' },
  { id: 'prod-clin-2', name: 'Fer + Acide folique (Tardyferon®)', manufacturer: 'Pierre Fabre Algérie', form: 'Comprimé pelliculé', lot: 'TDF-20260212-C', mfgDate: '12/02/2026', expDate: '20/07/2026', qty: 5, reorderThreshold: 10, recalled: false, lastSaleDate: '25/06/2026', branch: 'Clinique El Fedjr', verdict: 'authentic', risk: 8, incidents: 1, organizationId: 'clinique-el-fedjr' },
]);

// Fixed demo "today" — matches the original's hardcoded reference date
// (consistent with capaSlaStatus()'s own fixed "today" in doctorVigilance.js).
export const PHARM_TODAY = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();

export function pharmParseDate(str) {
  if (!str) return null;
  const [d, m, y] = str.split('/').map(Number);
  return new Date(y, m - 1, d);
}
export function pharmDaysUntil(str) {
  const d = pharmParseDate(str);
  return d ? Math.round((d - PHARM_TODAY) / 86400000) : null;
}
export function pharmDaysSince(str) {
  const d = pharmParseDate(str);
  return d ? Math.round((PHARM_TODAY - d) / 86400000) : null;
}

// Each product can trigger more than one alert at once (e.g. a recalled
// product that is also low on stock) — returns every category it
// matches rather than a single verdict, so nothing gets silently
// hidden. Ported 1:1 from pharmProductAlerts().
export function pharmProductAlerts(p) {
  const alerts = [];
  if (p.qty <= p.reorderThreshold) alerts.push('low');
  const du = pharmDaysUntil(p.expDate);
  if (du !== null && du >= 0 && du <= 60) alerts.push('expiry');
  if (p.recalled && p.qty > 0) alerts.push('recalled');
  const ds = pharmDaysSince(p.lastSaleDate);
  if (ds !== null && ds >= 60) alerts.push('dead');
  return alerts;
}

// Icon substitutions (subsetted icon font, no exact glyph available):
// ti-trending-down → ti-alert-circle, ti-hourglass-low → ti-clock-exclamation
// (closest available icons, same slot — same convention already used
// throughout the Doctor pages for missing glyphs).
export const PHARM_STOCK_META = {
  low: { label: 'Stock faible', short: 'Faible', icon: 'alert-circle', tone: 'amber', color: 'var(--color-amber)' },
  expiry: { label: 'Presque expiré', short: 'Péremption', icon: 'clock-exclamation', tone: 'red', color: 'var(--color-red)' },
  recalled: { label: 'Rappelé — en stock', short: 'Rappelé', icon: 'ban', tone: 'red', color: 'var(--color-red)' },
  dead: { label: 'Mouvement lent', short: 'Dort', icon: 'moon', tone: 'cyan', color: 'var(--color-cyan)' },
};

export const PHARM_BRANCHES = ['Alger', 'Oran', 'Constantine'];

// Ported 1:1 from pharmStockList(branch) — takes the product list
// explicitly (rather than closing over a module-level PHARM_PRODUCTS)
// so callers stay explicit about which dataset they're filtering.
export function pharmStockList(products, branch) {
  return products.filter((p) => (branch === 'all' || p.branch === branch) && pharmProductAlerts(p).length > 0);
}

// ── Blocker 1 fix — the scoped accessors every pharmacien page below
//    now calls instead of importing PHARM_PRODUCTS/PHARM_BRANCHES/
//    PHARM_RECENT_VERIFICATIONS directly. ──
export function pharmScopedProducts(user) {
  return PHARM_PRODUCTS.filter((p) => isOrgScopedRecordVisible(p, user));
}
// Branch tabs/cards must only ever list officines this organization
// actually has products in — never the full PHARM_BRANCHES constant,
// which would otherwise imply e.g. Clinique El Fedjr has an "Alger"
// officine it doesn't. Preserves PHARM_BRANCHES's existing order.
export function pharmScopedBranches(user) {
  const scoped = pharmScopedProducts(user);
  return PHARM_BRANCHES.filter((b) => scoped.some((p) => p.branch === b));
}
export function pharmScopedVerifications(user) {
  return PHARM_RECENT_VERIFICATIONS.filter((v) => isOrgScopedRecordVisible(v, user));
}

// ── Cross-page "aller à cette officine" handoff — ported from the
//    original's navigate('pharm-stock');filterPharmStockBranch(branch)
//    pattern (goToPharmBranch()). Since routing in this port is a
//    single activeId with no extra params, the Dashboard's branch
//    cards stash which branch to pre-select here, and PharmStock
//    consumes it once on mount. ──
let pendingStockBranchRequest = null;
export function requestStockBranch(branch) {
  pendingStockBranchRequest = branch;
}
export function consumePendingStockBranchRequest() {
  const r = pendingStockBranchRequest;
  pendingStockBranchRequest = null;
  return r;
}
