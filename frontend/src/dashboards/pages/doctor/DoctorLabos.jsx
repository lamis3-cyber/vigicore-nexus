import { useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  DR_LABS,
  CAPA_STAGES,
  DR_DOMAIN_CHIP,
  capaSlaStatus,
  capaColor,
  labPriorityRank,
  STOCK_TONE,
  ORDER_STATUS,
  ORDERS_LOG,
  addOrder,
  AUDIT_LOG,
  logAudit,
} from '../../data/doctorVigilance';
import { isOrgScopedRecordVisible } from '../../config/organizations';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-doc-labos (doctor scope), 1:1 with the
// original's renderDrLabsKpis() / filterDrLabs() / searchDrLabs() /
// toggleLabsView() / filteredSortedLabs() / renderDrLabs() /
// openCapaDetail() / advanceCapa() / openSupplierCatalog() /
// renderSupplierCatalogRows() / sendSupplierSelection() /
// openOrdersTracking() / advanceOrderStatus().
//
// Notes on fidelity:
//  - "Avancement CAPA moyen" KPI originally used the ti-chart-donut
//    icon; that glyph isn't in this app's subsetted icon font, so
//    ti-chart-bar is used instead (closest available icon, same slot).
//  - "Contacter" on a lab (list row / card / CAPA drawer) closes the
//    drawer and opens the Messages page (doc-messagerie).
//  - The generic #detailDrawer/#drawerOverlay singleton is reimplemented
//    as local React state here, same pattern as DoctorPatients.jsx /
//    DoctorDeclarations.jsx, using the same chat-overlay/chat-panel/
//    drawer-* CSS.
// ═══════════════════════════════════════════════════════════════

const LABS_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'risk', label: 'À risque' },
  { id: 'open', label: 'Ouverts' },
  { id: 'closed', label: 'Clôturés' },
];

function filteredSortedLabs(query, filterActive) {
  return DR_LABS.filter((l) => {
    const isClosed = l.capaStage >= CAPA_STAGES.length - 1;
    const sla = capaSlaStatus(l);
    if (filterActive === 'open' && isClosed) return false;
    if (filterActive === 'closed' && !isClosed) return false;
    if (filterActive === 'risk' && !(sla.tone === 'red' || sla.tone === 'amber')) return false;
    if (query && !(l.name.toLowerCase().includes(query) || l.lot.toLowerCase().includes(query))) return false;
    return true;
  }).sort((a, b) => labPriorityRank(a) - labPriorityRank(b));
}

export default function DoctorLabos({ onNavigate }) {
  const toast = useToast();
  const { user } = useAuth();

  // DR_LABS / ORDERS_LOG / AUDIT_LOG are shared mutable arrays (same
  // pattern as DoctorPatients.jsx's DR_PATIENTS) — forceTick triggers a
  // re-render after in-place edits (advanceCapa, sendSupplierSelection,
  // advanceOrderStatus).
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);

  const [filterActive, setFilterActive] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list');

  // drawer: null | { type:'capa', labId } | { type:'catalog', labId } | { type:'orders' }
  const [drawer, setDrawer] = useState(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogStock, setCatalogStock] = useState('all');
  const [catalogSelection, setCatalogSelection] = useState({}); // { [idx]: { checked, qty } }

  function closeDrawer() {
    setDrawer(null);
  }

  // Blocker fix (audit round 2 §3 High) — org scoping. DR_LABS itself
  // stays intentionally global (the supplier catalog), but an actual
  // ORDER placed against it is this organization's own purchase and
  // must not be visible to/editable by another organization.
  const scopedOrders = ORDERS_LOG.filter((o) => isOrgScopedRecordVisible(o, user));
  const pendingOrders = scopedOrders.filter((o) => o.status === 'pending').length;
  const list = filteredSortedLabs(searchQuery.trim().toLowerCase(), filterActive);

  const total = DR_LABS.length;
  const openCount = DR_LABS.filter((l) => l.capaStage < CAPA_STAGES.length - 1).length;
  const atRisk = DR_LABS.filter((l) => { const s = capaSlaStatus(l); return s.tone === 'red' || s.tone === 'amber'; }).length;
  const avgPct = total === 0 ? 0 : Math.round(DR_LABS.reduce((sum, l) => sum + l.capaStage / (CAPA_STAGES.length - 1), 0) / total * 100);
  const kpis = [
    { label: 'Laboratoires connectés', value: total, icon: 'building-factory-2', color: 'var(--color-brand)', sub: 'Fabricants & fournisseurs' },
    { label: 'Investigations ouvertes', value: openCount, icon: 'clipboard-list', color: 'var(--color-cyan)', sub: tr("{0} clôturée(s)", [total - openCount]) },
    { label: 'À risque / en retard', value: atRisk, icon: 'alert-triangle', color: atRisk > 0 ? 'var(--color-red)' : 'var(--color-green)', sub: 'Selon SLA convenu' },
    { label: 'Avancement CAPA moyen', value: avgPct + '%', icon: 'chart-bar', color: 'var(--color-purple)', sub: 'Toutes investigations' },
  ];

  function openCapaDetail(labId) {
    setDrawer({ type: 'capa', labId });
  }

  function advanceCapa(labId) {
    const l = DR_LABS.find((x) => x.id === labId);
    if (!l || l.capaStage >= CAPA_STAGES.length - 1) return;
    l.capaStage++;
    logAudit('capa', labId, `CAPA "${l.name}" (lot ${l.lot}) → ${CAPA_STAGES[l.capaStage]}`, user?.name, user?.organizationId ?? null);
    rerender();
    toast('success', tr("CAPA mise à jour"), l.name + ' — étape : ' + CAPA_STAGES[l.capaStage], 'ti ti-circle-check');
  }

  function openSupplierCatalog(labId) {
    setCatalogQuery('');
    setCatalogStock('all');
    setCatalogSelection({});
    setDrawer({ type: 'catalog', labId });
  }

  function toggleCatalogCheck(idx) {
    setCatalogSelection((sel) => ({ ...sel, [idx]: { checked: !sel[idx]?.checked, qty: sel[idx]?.qty ?? 1 } }));
  }

  function setCatalogQty(idx, qty) {
    setCatalogSelection((sel) => ({ ...sel, [idx]: { checked: sel[idx]?.checked ?? false, qty } }));
  }

  function sendSupplierSelection(labId) {
    const l = DR_LABS.find((x) => x.id === labId);
    if (!l) return;
    const items = Object.entries(catalogSelection)
      .filter(([, v]) => v.checked)
      .map(([idx, v]) => ({ name: l.catalog[idx].name, qty: Math.max(1, parseInt(v.qty, 10) || 1) }));
    if (!items.length) {
      toast('info', tr("Aucune sélection"), tr("Cochez au moins un produit avant d'envoyer votre demande."), 'ti ti-alert-circle');
      return;
    }
    // Blocker fix — real org attribution, and the single canonical
    // write path shared with PharmCommandes.jsx (see addOrder,
    // doctorVigilance.js).
    addOrder({ labId: l.id, labName: l.name, items });
    logAudit('lab', l.id, `Demande de commande envoyée à ${l.name} : ${items.map((it) => it.qty + '× ' + it.name).join(', ')}`, user?.name, user?.organizationId ?? null);
    closeDrawer();
    toast('success', tr("Demande envoyée"), items.length + ' produit(s) transmis à ' + l.name + '. Suivez son statut dans « Commandes en cours ».', 'ti ti-circle-check');
    rerender();
  }

  function openOrdersTracking() {
    setDrawer({ type: 'orders' });
  }

  function advanceOrderStatus(orderId) {
    const o = scopedOrders.find((x) => x.id === orderId);
    if (!o) return;
    o.status = o.status === 'pending' ? 'confirmed' : 'delivered';
    logAudit('lab', o.labId, `Commande envoyée à ${o.labName} → ${ORDER_STATUS[o.status][1]}`, user?.name, user?.organizationId ?? null);
    rerender();
    toast('success', tr("Commande mise à jour"), o.labName + ' — statut : ' + ORDER_STATUS[o.status][1], 'ti ti-circle-check');
  }

  function contactLab(labId) {
    const l = DR_LABS.find((x) => x.id === labId);
    if (!l) return;
    closeDrawer();
    onNavigate('doc-messagerie');
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Laboratoires &")} <span className="page-title-accent">{tr("fournisseurs")}</span></h1></div>
        <div className="page-actions">
          <button className="btn" onClick={openOrdersTracking}>
            <Icon name="truck-delivery" />{tr("Commandes en cours")}
            {pendingOrders > 0 && <span className="badge badge--amber" style={{ marginLeft: '6px' }}>{pendingOrders}</span>}
          </button>
        </div>
      </div>

      <div className="grid-kpi">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-accent" style={{ background: k.color }} />
            <div className="kpi-header">
              <div className="kpi-label">{tr(k.label)}</div>
              <div className="kpi-icon" style={{ background: 'var(--surface-3)', color: k.color }}><Icon name={k.icon} /></div>
            </div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{tr(k.sub)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div className="filter-tabs" role="tablist" aria-label={tr("Filtrer les laboratoires par statut")}>
          {LABS_FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-tab${filterActive === f.id ? ' is-active' : ''}`}
              role="tab"
              aria-selected={filterActive === f.id}
              onClick={() => setFilterActive(f.id)}
            >
              {tr(f.label)}
            </button>
          ))}
        </div>
        <div className="topbar-search" style={{ width: '260px', marginLeft: 'auto' }}>
          <Icon name="search" />
          <input
            type="text"
            placeholder={tr("Rechercher un labo, un lot…")}
            aria-label={tr("Rechercher un laboratoire ou un lot")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <button className={`view-toggle-btn${viewMode === 'cards' ? ' is-active' : ''}`} onClick={() => setViewMode('cards')} aria-label={tr("Vue cartes")} title={tr("Vue cartes")}>
            <Icon name="layout-grid" />
          </button>
          <button className={`view-toggle-btn${viewMode === 'list' ? ' is-active' : ''}`} onClick={() => setViewMode('list')} aria-label={tr("Vue liste")} title={tr("Vue liste")}>
            <Icon name="list" />
          </button>
        </div>
      </div>

      <div className="grid-2col" style={{ gridTemplateColumns: viewMode === 'list' ? '1fr' : undefined }}>
        {list.length === 0 && (
          <div className="inbox-empty" style={{ gridColumn: '1 / -1' }}>
            <Icon name="building-factory-2" />{tr("Aucun laboratoire ne correspond à ce filtre")}
          </div>
        )}

        {list.length > 0 && viewMode === 'list' && list.map((l) => {
          const pct = Math.round((l.capaStage / (CAPA_STAGES.length - 1)) * 100);
          const color = l.capaStage >= 4 ? 'var(--color-green)' : l.capaStage >= 2 ? 'var(--color-amber)' : 'var(--color-red)';
          const sla = capaSlaStatus(l);
          const domainColor = `var(--color-${DR_DOMAIN_CHIP[l.domain]})`;
          return (
            <div className="lab-list-row" style={{ borderLeft: `3px solid ${domainColor}` }} key={l.id}>
              <div className="kpi-icon" style={{ background: 'var(--surface-3)', color, flexShrink: 0 }}><Icon name="building-factory-2" /></div>
              <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                <div className="u-fs13-strong">{tr(l.name)}</div>
                <div className="u-fs10-5-tertiary">{tr("{0} · Lot {1}", [l.type, l.lot])}</div>
              </div>
              <span className={`chip chip--${DR_DOMAIN_CHIP[l.domain]} u-t75`}>{tr(l.domain)}</span>
              <div style={{ width: '120px', flexShrink: 0 }}>
                <div className="lab-status-track"><div className="lab-status-fill" style={{ width: pct + '%', background: color }} /></div>
              </div>
              <span className={`badge badge--${sla.tone} u-t75`}><Icon name="clock" className="u-fs-10" />&nbsp;{tr(sla.label)}</span>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button className="btn" onClick={() => openCapaDetail(l.id)} aria-label={tr("Dossier CAPA de {0}", [l.name])}><Icon name="clipboard-list" /></button>
                <button className="btn" onClick={() => openSupplierCatalog(l.id)} aria-label={tr("Catalogue produits de {0}", [l.name])}><Icon name="list-details" /></button>
                <button className="btn btn--primary" onClick={() => contactLab(l.id)} aria-label={tr("Contacter {0}", [l.name])}><Icon name="message" /></button>
              </div>
            </div>
          );
        })}

        {list.length > 0 && viewMode === 'cards' && list.map((l) => {
          const pct = Math.round((l.capaStage / (CAPA_STAGES.length - 1)) * 100);
          const color = l.capaStage >= 4 ? 'var(--color-green)' : l.capaStage >= 2 ? 'var(--color-amber)' : 'var(--color-red)';
          const sla = capaSlaStatus(l);
          const domainColor = `var(--color-${DR_DOMAIN_CHIP[l.domain]})`;
          return (
            <div className="card lab-card" style={{ borderLeft: `3px solid ${domainColor}` }} key={l.id}>
              <div className="lab-card-header">
                <div className="kpi-icon" style={{ background: 'var(--surface-3)', color }}><Icon name="building-factory-2" /></div>
                <div className="u-flex-1">
                  <div className="u-fs13-strong">{tr(l.name)}</div>
                  <div className="u-fs10-5-tertiary">{tr("{0} · Lot {1}", [l.type, l.lot])}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                  <span className={`chip chip--${DR_DOMAIN_CHIP[l.domain]}`}>{tr(l.domain)}</span>
                  <span className={`badge badge--${sla.tone}`}><Icon name="clock" className="u-fs-10" />&nbsp;{tr(sla.label)}</span>
                </div>
              </div>
              <div className="u-fs-12 u-t63">{tr(l.note)}</div>
              <div className="u-fs10-5-tertiary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="user-circle" />{l.contact}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}><Icon name="paperclip" />{l.attachments} {tr("pièce(s)")}</span>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                  <span>{tr("CAPA : {0}", [CAPA_STAGES[l.capaStage]])}</span><span>{pct}%</span>
                </div>
                <div className="lab-status-track"><div className="lab-status-fill" style={{ width: pct + '%', background: color }} /></div>
              </div>
              <div className="u-t111">
                <button className="btn u-flex-1" onClick={() => openCapaDetail(l.id)}><Icon name="clipboard-list" />{tr("Dossier CAPA")}</button>
                <button className="btn u-flex-1" onClick={() => openSupplierCatalog(l.id)}><Icon name="list-details" />{tr("Catalogue")}</button>
                <button className="btn btn--primary u-flex-1" onClick={() => contactLab(l.id)}><Icon name="message" />{tr("Contacter")}</button>
              </div>
            </div>
          );
        })}
      </div>

      {drawer && drawer.type === 'capa' && (() => {
        const l = DR_LABS.find((x) => x.id === drawer.labId);
        if (!l) return null;
        const auditEntries = AUDIT_LOG.filter((a) => a.refId === l.id);
        const isClosed = l.capaStage >= CAPA_STAGES.length - 1;
        return (
          <>
            <div className="chat-overlay is-open" onClick={closeDrawer} />
            <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="capaDrawerTitle">
              <div className="chat-header">
                <div className="chat-header-inner">
                  <div className="drawer-icon" style={{ background: capaColor(l), color: '#fff' }}><Icon name="clipboard-list" /></div>
                  <div className="u-flex-1 u-t31">
                    <div id="capaDrawerTitle" className="u-fs13-strong">{tr("Dossier CAPA — {0}", [l.name])}</div>
                    <div className="u-fs10-5-tertiary">{tr(l.domain)}</div>
                  </div>
                  <button className="chat-close" onClick={closeDrawer} aria-label={tr("Fermer le panneau de détail")}><Icon name="x" /></button>
                </div>
              </div>

              <div className="chat-messages" style={{ gap: '16px' }}>
                <div className="drawer-section">
                  <div className="drawer-kv">
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Domaine")}</span><span className="drawer-kv-value">{tr(l.domain)}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Lot concerné")}</span><span className="drawer-kv-value u-mono">{l.lot}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Contact responsable")}</span><span className="drawer-kv-value">{l.contact}</span></div>
                    <div className="drawer-kv-item"><span className="drawer-kv-label">{tr("Pièces jointes")}</span><span className="drawer-kv-value">{tr("{0} document(s)", [l.attachments])}</span></div>
                  </div>
                  <div className="u-fs-12 u-t63">{tr(l.note)}</div>
                </div>

                <div className="drawer-section">
                  <div className="drawer-section-title">{tr("Cycle CAPA (Corrective & Preventive Action)")}</div>
                  <div className="timeline">
                    {CAPA_STAGES.map((s, i) => (
                      <div className="tl-item" key={s}>
                        <div
                          className={`tl-dot ${i < l.capaStage ? 'tl-dot--green' : i === l.capaStage ? 'tl-dot--active' : ''}`}
                          style={i > l.capaStage ? { background: 'var(--surface-3)', borderColor: 'var(--border-subtle)' } : undefined}
                        />
                        <div className="tl-time">{i <= l.capaStage ? tr("Franchie") : tr("À venir")}</div>
                        <div className="tl-body"><div className="tl-event">{s}</div></div>
                      </div>
                    ))}
                  </div>
                </div>

                {auditEntries.length > 0 && (
                  <div className="drawer-section">
                    <div className="drawer-section-title">{tr("Historique & audit")}</div>
                    <div className="timeline">
                      {auditEntries.map((a) => (
                        <div className="tl-item" key={a.id}>
                          <div className="tl-dot tl-dot--green" />
                          <div className="tl-time">{a.ts}</div>
                          <div className="tl-body">
                            <div className="tl-event">{tr(a.action)}</div>
                            <div className="tl-sub">{a.actor}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="drawer-actions">
                {!isClosed ? (
                  <>
                    <button className="btn btn--primary btn--full" onClick={() => advanceCapa(l.id)}>
                      <Icon name="arrow-right" />{tr("Faire avancer :")} {CAPA_STAGES[l.capaStage + 1]}
                    </button>
                    <button className="btn" onClick={() => toast('info', tr("Disponibilité produit"), 'Demande envoyée à ' + l.name, 'ti ti-package')}>
                      <Icon name="package" />{tr("Disponibilité produit")}
                    </button>
                  </>
                ) : (
                  <button className="btn btn--full" onClick={closeDrawer}><Icon name="check" />{tr("Dossier clôturé")}</button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {drawer && drawer.type === 'catalog' && (() => {
        const l = DR_LABS.find((x) => x.id === drawer.labId);
        if (!l) return null;
        const filtered = l.catalog
          .map((p, i) => ({ ...p, idx: i }))
          .filter((p) => {
            if (catalogStock !== 'all' && p.stock !== catalogStock) return false;
            if (catalogQuery && !(p.name.toLowerCase().includes(catalogQuery) || p.ref.toLowerCase().includes(catalogQuery))) return false;
            return true;
          });
        return (
          <>
            <div className="chat-overlay is-open" onClick={closeDrawer} />
            <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="catalogDrawerTitle">
              <div className="chat-header">
                <div className="chat-header-inner">
                  <div className="drawer-icon" style={{ background: 'var(--color-brand)', color: '#fff' }}><Icon name="list-details" /></div>
                  <div className="u-flex-1 u-t31">
                    <div id="catalogDrawerTitle" className="u-fs13-strong">{tr("Catalogue produits — {0}", [l.name])}</div>
                    <div className="u-fs10-5-tertiary">{l.type}</div>
                  </div>
                  <button className="chat-close" onClick={closeDrawer} aria-label={tr("Fermer le panneau de détail")}><Icon name="x" /></button>
                </div>
              </div>

              <div className="chat-messages" style={{ gap: '16px' }}>
                <div className="drawer-section">
                  <div className="u-fs-12 u-t63">{tr("Catalogue produits transmis par")} <strong>{tr(l.name)}</strong>{tr(". Sélectionnez les produits et quantités à commander, puis envoyez votre demande directement au fournisseur — plus besoin d'échanger par e-mail.")}</div>
                </div>
                <div className="drawer-section">
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <div className="topbar-search" style={{ flex: '1 1 160px' }}>
                      <Icon name="search" />
                      <input type="text" placeholder={tr("Rechercher un produit, une réf…")} aria-label={tr("Rechercher dans le catalogue")} value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value.trim().toLowerCase())} />
                    </div>
                    <div className="filter-tabs" role="tablist" aria-label={tr("Filtrer par disponibilité")}>
                      {[['all', 'Tous'], ['disponible', 'Disponible'], ['stock limité', 'Stock limité'], ['en rupture', 'Rupture']].map(([val, label]) => (
                        <button key={val} className={`filter-tab${catalogStock === val ? ' is-active' : ''}`} role="tab" aria-selected={catalogStock === val} onClick={() => setCatalogStock(val)}>{tr(label)}</button>
                      ))}
                    </div>
                  </div>
                  <div className="drawer-section-title">{tr("{0} produit(s) sur {1} au total", [filtered.length, l.catalog.length])}</div>
                  <div>
                    {filtered.length === 0 && (
                      <div className="inbox-empty"><Icon name="search-off" />{tr("Aucun produit ne correspond")}</div>
                    )}
                    {filtered.map((p) => (
                      <label className="drawer-catalog-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 4px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }} key={p.idx}>
                        <input
                          type="checkbox"
                          checked={!!catalogSelection[p.idx]?.checked}
                          onChange={() => toggleCatalogCheck(p.idx)}
                          style={{ width: '16px', height: '16px', flexShrink: 0, accentColor: 'var(--color-brand)' }}
                        />
                        <div className="u-t44">
                          <div className="u-fs12-5-500">{tr(p.name)}</div>
                          <div className="u-fs10-5-tertiary">{p.form} · {p.pack} {tr("· Réf.")} <span className="u-mono">{p.ref}</span></div>
                        </div>
                        <span className={`badge badge--${STOCK_TONE[p.stock]}`} style={{ flexShrink: 0, textTransform: 'capitalize' }}>{p.stock}</span>
                        <input
                          type="number"
                          min="1"
                          value={catalogSelection[p.idx]?.qty ?? 1}
                          aria-label={tr("Quantité pour {0}", [p.name])}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setCatalogQty(p.idx, e.target.value)}
                          style={{ width: '52px', flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '5px 6px', fontSize: '11px', textAlign: 'center' }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="drawer-actions">
                <button className="btn btn--primary btn--full" onClick={() => sendSupplierSelection(l.id)}>
                  <Icon name="send" />{tr("Envoyer la sélection au fournisseur")}
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {drawer && drawer.type === 'orders' && (
        <>
          <div className="chat-overlay is-open" onClick={closeDrawer} />
          <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="ordersDrawerTitle">
            <div className="chat-header">
              <div className="chat-header-inner">
                <div className="drawer-icon" style={{ background: 'var(--color-cyan)', color: '#fff' }}><Icon name="truck-delivery" /></div>
                <div className="u-flex-1 u-t31">
                  <div id="ordersDrawerTitle" className="u-fs13-strong">{tr("Commandes en cours")}</div>
                  <div className="u-fs10-5-tertiary">{tr("{0} commande(s) au total", [scopedOrders.length])}</div>
                </div>
                <button className="chat-close" onClick={closeDrawer} aria-label={tr("Fermer le panneau de détail")}><Icon name="x" /></button>
              </div>
            </div>

            <div className="chat-messages" style={{ gap: '16px' }}>
              {scopedOrders.length === 0 && (
                <div className="inbox-empty"><Icon name="package" />{tr("Aucune commande envoyée pour le moment")}</div>
              )}
              {scopedOrders.map((o) => {
                const [tone, label] = ORDER_STATUS[o.status];
                const itemsText = o.items.map((it) => it.qty + '× ' + it.name).join(', ');
                const nextLabel = o.status === 'pending' ? 'Marquer confirmée' : o.status === 'confirmed' ? 'Marquer livrée' : null;
                return (
                  <div className="drawer-section" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }} key={o.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div className="u-fs12-5-500">{o.labName}</div>
                        <div className="u-fs10-5-tertiary">{itemsText}</div>
                        <div className="u-fs10-5-tertiary">{tr("Envoyée le {0}", [o.date])}</div>
                      </div>
                      <span className={`badge badge--${tone} u-t75`}>{tr(label)}</span>
                    </div>
                    {nextLabel && (
                      <button className="btn u-t7" onClick={() => advanceOrderStatus(o.id)}><Icon name="arrow-right" />{nextLabel}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
