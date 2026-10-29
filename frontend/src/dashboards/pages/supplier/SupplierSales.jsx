import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { CATEGORY_LABEL, listMySales, SALE_ACTION, SALE_STATUS, setSaleStatus } from '../../../lib/market';
import { money } from '../market/MarketOrders';
import { tr, localeTag } from '../../../i18n/translate.js';
import { ago } from './supplierUi.js';
import { downloadCsv } from './supplierOrders.js';
import './supplier.css';

// ═══════════════════════════════════════════════════════════════
// Fournisseur / distributeur — « Commandes clients » : les commandes REÇUES des établissements qui achètent ses produits
// (à ne pas confondre avec « Suivi » = ses propres achats chez les fabricants). Il confirme, expédie, marque livrée ou
// refuse ; le client voit chaque changement dans son propre suivi. Aucun paiement en ligne : facturation et livraison se
// font hors plateforme. Le serveur contrôle chaque changement d'état (étapes dans l'ordre, motif obligatoire pour refuser).
// ═══════════════════════════════════════════════════════════════

const TONE = { wait: 'amber', ok: 'cyan', done: 'green', off: 'red' };
const dt = (iso) => new Date(iso).toLocaleString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const OPEN = new Set(['PENDING', 'CONFIRMED', 'SHIPPED']);
const TABS = [['todo', 'À traiter'], ['open', 'En cours'], ['done', 'Terminées'], ['interests', "Demandes d'intérêt"]];

export default function SupplierSales({ onNavigate }) {
  const toast = useToast();
  const [data, setData] = useState(undefined); // undefined = chargement ; null = indisponible
  const [tab, setTab] = useState('todo');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    const r = await listMySales();
    setData(r.ok ? r.data : null);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const sales = data?.sales ?? [];
  const orders = useMemo(() => sales.filter((s) => s.kind === 'ORDER'), [sales]);
  const interests = useMemo(() => sales.filter((s) => s.kind === 'INTEREST'), [sales]);
  const q = query.trim().toLowerCase();
  const inTab = {
    todo: orders.filter((s) => s.status === 'PENDING'),
    open: orders.filter((s) => s.status === 'CONFIRMED' || s.status === 'SHIPPED'),
    done: orders.filter((s) => !OPEN.has(s.status)),
    interests,
  };
  const list = inTab[tab].filter((s) => !q || `${s.reference} ${s.summary} ${s.buyer.name ?? ''} ${s.buyer.contactName ?? ''}`.toLowerCase().includes(q));
  const detail = openId ? sales.find((s) => s.id === openId) : null;
  const c = data?.counts;
  const num = (v) => (data ? v ?? 0 : '—');
  const revenue = orders.filter((s) => s.status === 'DELIVERED').reduce((n, s) => n + (s.totalAmount ?? 0), 0);

  async function act(sale, status, note) {
    const r = await setSaleStatus(sale.id, status, note);
    if (!r.ok) { toast('error', tr('Action impossible'), tr(r.error), 'ti ti-alert-circle'); await load(); return false; }
    toast('success', tr('Commande mise à jour'), `${sale.reference} → ${tr(SALE_STATUS[status]?.label ?? status)}`, 'ti ti-circle-check');
    await load();
    return true;
  }

  const exportCsv = () => downloadCsv(`commandes-clients-${new Date().toISOString().slice(0, 10)}.csv`, [
    [tr('Référence'), tr('Date'), tr('Client'), tr('Contact'), tr('E-mail'), tr('Téléphone'), tr('Produits'), tr('Montant (DA)'), tr('Statut')],
    ...orders.map((s) => [s.reference, new Date(s.createdAt).toISOString().slice(0, 10), s.buyer.name ?? '', s.buyer.contactName ?? '', s.buyer.contactEmail ?? '', s.buyer.contactPhone ?? '', s.summary, s.totalAmount ?? '', tr(SALE_STATUS[s.status]?.label ?? s.status)]),
  ]);

  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr('Commandes clients')}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr('Les commandes que vos clients vous ont passées. Vos propres achats sont dans « Suivi ».')}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={load}><Icon name="rotate-clockwise" />{tr('Actualiser')}</button>
          <button className="btn" onClick={exportCsv} disabled={orders.length === 0}><Icon name="download" />{tr('Exporter en CSV')}</button>
          <button className="btn btn--primary" onClick={() => onNavigate?.('sup-produits')}><Icon name="package" />{tr('Mes produits')}</button>
        </div>
      </div>

      <div className="sup-stats">
        <button type="button" className="sup-stat t-red" onClick={() => setTab('todo')}><span className="sup-stat-ico"><Icon name="bell-ringing" /></span><span><div className="sup-stat-num">{num(c?.pending)}</div><div className="sup-stat-lab">{tr('À confirmer')}</div><div className="sup-stat-sub">{tr('nouvelles commandes')}</div></span></button>
        <button type="button" className="sup-stat t-blue" onClick={() => setTab('open')}><span className="sup-stat-ico"><Icon name="truck-delivery" /></span><span><div className="sup-stat-num">{num((c?.confirmed ?? 0) + (c?.shipped ?? 0))}</div><div className="sup-stat-lab">{tr('En cours')}</div><div className="sup-stat-sub">{tr('à expédier ou en livraison')}</div></span></button>
        <button type="button" className="sup-stat t-green" onClick={() => setTab('done')}><span className="sup-stat-ico"><Icon name="package" /></span><span><div className="sup-stat-num">{num(c?.delivered)}</div><div className="sup-stat-lab">{tr('Livrées')}</div><div className="sup-stat-sub">{data ? money(revenue) : '—'}</div></span></button>
      </div>

      <div className="card">
        <div className="sup-card-h">
          <h2><Icon name="receipt" className="u-c-green" />{tr(TABS.find((t) => t[0] === tab)[1])}</h2>
          <div className="sup-seg" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} className={tab === id ? 'is-active' : ''} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {tr(label)}{data ? ` (${inTab[id].length})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-search" style={{ margin: '4px 0 10px' }}>
          <Icon name="search" />
          <input type="text" placeholder={tr('Rechercher un client, une référence, un produit…')} aria-label={tr('Rechercher')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {data === undefined && <p className="u-fs-12 u-t8">{tr('Chargement…')}</p>}
        {data === null && <p className="u-fs-12 u-t8">{tr('Impossible de charger les commandes pour le moment.')}</p>}
        {data && list.length === 0 && (
          <div className="sup-empty">
            <span className="sup-empty-ico"><Icon name={tab === 'interests' ? 'message' : 'receipt'} /></span>
            <div className="sup-empty-t">{tab === 'todo' ? tr('Rien à traiter') : tr('Aucune commande ici')}</div>
            <div className="sup-empty-d">{tr("Quand un client vérifié commande l'un de vos produits, sa commande apparaît ici et vous êtes à une confirmation de lui répondre.")}</div>
            <button className="btn btn--primary" onClick={() => onNavigate?.('sup-produits')}>{tr('Gérer mes produits')}</button>
          </div>
        )}
        <div className="sup-orders">
          {list.map((s) => {
            const st = SALE_STATUS[s.status] ?? { label: s.status, tone: 'wait' };
            return (
              <button key={s.id} type="button" className="sup-order" onClick={() => setOpenId(s.id)}>
                <div className="sup-order-top">
                  <div>
                    <div className="sup-order-t">{s.summary}</div>
                    <div className="sup-order-s">{s.buyer.name ?? s.buyer.contactName ?? '—'} · {s.reference} · {ago(s.createdAt)}</div>
                  </div>
                  <span className={`badge badge--${TONE[st.tone] ?? 'amber'}`}>{tr(st.label)}</span>
                </div>
                <div className="sup-order-foot">
                  {s.kind === 'ORDER' && s.totalAmount != null && <span><strong>{money(s.totalAmount)}</strong></span>}
                  {s.buyer.category && <span className="u-fs10-5-tertiary">{tr(CATEGORY_LABEL[s.buyer.category] ?? s.buyer.category)}</span>}
                  <span className="sup-link">{tr('Ouvrir')} →</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {detail && <SaleDrawer sale={detail} onClose={() => setOpenId(null)} onAct={act} />}
    </div>
  );
}

function SaleDrawer({ sale, onClose, onAct }) {
  const [asking, setAsking] = useState(null); // statut qui demande un motif
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const st = SALE_STATUS[sale.status] ?? { label: sale.status, tone: 'wait' };
  const history = [...(sale.history ?? [])].filter((h) => h?.at).sort((a, b) => new Date(a.at) - new Date(b.at));
  const isOrder = sale.kind === 'ORDER';

  async function run(status) {
    const spec = SALE_ACTION[status] ?? {};
    if (spec.ask && asking !== status) { setAsking(status); setNote(''); return; }
    if (spec.ask && !note.trim()) return;
    setBusy(true);
    const ok = await onAct(sale, status, spec.ask ? note.trim() : undefined);
    setBusy(false);
    if (ok) { setAsking(null); setNote(''); }
  }

  return (
    <>
      <div className="chat-overlay is-open" onClick={onClose} />
      <div className="chat-panel chat-panel--wide overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="saleTitle">
        <div className="chat-header">
          <div className="chat-header-inner">
            <div className="drawer-icon" style={{ background: 'var(--color-brand)', color: '#fff' }}><Icon name={isOrder ? 'receipt' : 'message'} /></div>
            <div className="u-flex-1 u-t31">
              <div id="saleTitle" className="u-fs13-strong">{isOrder ? tr('Commande client') : tr("Demande d'intérêt")}</div>
              <div className="u-fs10-5-tertiary">{sale.reference}</div>
            </div>
            <button className="chat-close" onClick={onClose} aria-label={tr('Fermer')}><Icon name="x" /></button>
          </div>
        </div>

        <div className="chat-messages" style={{ gap: 18 }}>
          <div className="drawer-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div className="u-fs13-strong" style={{ overflowWrap: 'anywhere' }}>{sale.summary}</div>
              <span className={`badge badge--${TONE[st.tone] ?? 'amber'}`}>{tr(st.label)}</span>
            </div>
            {sale.sellerNote && <div className="sup-alert-note">{tr('Votre message au client :')} {sale.sellerNote}</div>}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">{tr('Client')}</div>
            <div className="drawer-kv">
              <div className="drawer-kv-item"><span className="drawer-kv-label">{tr('Établissement')}</span><span className="drawer-kv-value">{sale.buyer.name ?? '—'}{sale.buyer.verified ? ` · ${tr('vérifié')}` : ''}</span></div>
              {sale.buyer.category && <div className="drawer-kv-item"><span className="drawer-kv-label">{tr('Catégorie')}</span><span className="drawer-kv-value">{tr(CATEGORY_LABEL[sale.buyer.category] ?? sale.buyer.category)}</span></div>}
              <div className="drawer-kv-item"><span className="drawer-kv-label">{tr('Contact')}</span><span className="drawer-kv-value">{sale.buyer.contactName ?? '—'}</span></div>
              <div className="drawer-kv-item"><span className="drawer-kv-label">{tr('E-mail')}</span><span className="drawer-kv-value">{sale.buyer.contactEmail ? <a href={`mailto:${sale.buyer.contactEmail}`}>{sale.buyer.contactEmail}</a> : '—'}</span></div>
              <div className="drawer-kv-item"><span className="drawer-kv-label">{tr('Téléphone')}</span><span className="drawer-kv-value">{sale.buyer.contactPhone ? <a href={`tel:${sale.buyer.contactPhone}`}>{sale.buyer.contactPhone}</a> : '—'}</span></div>
              <div className="drawer-kv-item"><span className="drawer-kv-label">{tr('Reçue le')}</span><span className="drawer-kv-value">{dt(sale.createdAt)}</span></div>
            </div>
            {sale.note && <div className="sup-alert-note" style={{ whiteSpace: 'pre-wrap' }}>{sale.note}</div>}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">{tr('Produits')}</div>
            <div className="u-overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>{tr('PRODUIT')}</th><th>{tr('QTÉ')}</th>{isOrder && <th>{tr('TOTAL')}</th>}</tr></thead>
                <tbody>
                  {sale.lines.map((l, i) => (
                    <tr key={i}>
                      <td><div className="u-fs12-500">{l.product}</div>{l.unitPrice != null && <div className="u-fs10-5-tertiary">{money(l.unitPrice)} / {tr('unité')}</div>}</td>
                      <td>{l.quantity ?? '—'}</td>
                      {isOrder && <td>{money((l.quantity ?? 0) * (l.unitPrice ?? 0))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isOrder && <div className="u-fs13-strong" style={{ textAlign: 'right', marginTop: 8 }}>{tr('Total')} : {money(sale.totalAmount)}</div>}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-title">{tr('Chronologie')}</div>
            <ol className="sup-timeline">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`}><b>{tr(SALE_STATUS[h.status]?.label ?? h.status)}{h.note ? ` — ${h.note}` : ''}</b><span>{dt(h.at)}</span></li>
              ))}
            </ol>
          </div>

          <div className="drawer-actions">
            {asking && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                <span className="u-fs-12">{tr(SALE_ACTION[asking].ask)}</span>
                <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
              </label>
            )}
            {sale.nextStatuses.length === 0 && <div className="u-fs-12 u-c-tertiary">{tr("Cette commande est terminée : plus aucune action possible.")}</div>}
            {sale.nextStatuses.map((status) => {
              const spec = SALE_ACTION[status] ?? { label: status };
              const confirming = asking === status;
              return (
                <button key={status} className={`btn btn--full${spec.primary ? ' btn--primary' : ''}`} disabled={busy || (confirming && !note.trim())} onClick={() => run(status)}>
                  <Icon name={spec.icon ?? 'check'} />{confirming ? tr('Confirmer : {0}', [tr(spec.label)]) : tr(spec.label)}
                </button>
              );
            })}
            <button className="btn btn--full" onClick={onClose}>{tr('Fermer')}</button>
          </div>
        </div>
      </div>
    </>
  );
}
