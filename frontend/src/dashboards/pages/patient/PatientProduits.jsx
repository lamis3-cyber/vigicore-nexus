import { useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import QrScanner from '../../components/QrScanner';
import { validateScannedLot, lookupLot } from '../../lib/lotVerification';
import { usePersonalList } from '../../lib/usePersonal';
import { productSafety, SAFETY_BADGE, CATEGORY_LABEL, CATEGORY_ICON } from '../../lib/patientProducts';
import { useToast } from '../../context/ToastContext';
import { tr } from '../../../i18n/translate.js';

// Patient products registry — the patient's own products, stored in the account
// (GET/POST/PATCH/DELETE /api/personal/product). Recall status is derived from the lot
// number and the ANPP lot base (lib/patientProducts.js), never typed by hand.

const FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'medicament', label: 'Médicaments' },
  { id: 'dispositif', label: 'Dispositifs' },
  { id: 'recall', label: 'Rappels' },
];

const EMPTY_FORM = { name: '', category: 'medicament', lot: '', manufacturer: '', startedAt: '', notes: '' };

export default function PatientProduits({ onNavigate }) {
  const toast = useToast();
  const { items, loading, error, add, update, remove } = usePersonalList('product');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [lotInput, setLotInput] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const products = useMemo(
    () => (items || []).map((p) => ({ ...p, safety: productSafety(p) })),
    [items]
  );

  const isRecall = (p) => p.safety.status === 'recall' || p.safety.status === 'suspicious';
  const countFor = (id) => {
    if (id === 'all') return products.length;
    if (id === 'recall') return products.filter(isRecall).length;
    return products.filter((p) => p.category === id).length;
  };

  const visible = products.filter((p) => {
    const matchesFilter = filter === 'all' || (filter === 'recall' ? isRecall(p) : p.category === filter);
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || p.name.toLowerCase().includes(q) || String(p.lot || '').toLowerCase().includes(q);
    return matchesFilter && matchesQuery;
  });

  const recallCount = products.filter((p) => p.safety.status === 'recall').length;
  const inUseCount = products.filter((p) => p.inUse !== false).length;

  const updateForm = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('warn', tr("Nom requis"), tr("Indiquez le nom du produit."), 'alert-circle');
      return;
    }
    if (form.lot.trim()) {
      const check = lookupLot(form.lot);
      if (!check.ok) {
        toast('warn', tr("Numéro de lot invalide"), check.problem, 'alert-triangle');
        return;
      }
    }
    setSaving(true);
    const data = { ...form, lot: form.lot.trim().toUpperCase(), inUse: true };
    if (!data.startedAt) delete data.startedAt;
    const r = await add(data);
    setSaving(false);
    if (!r.ok) {
      toast('error', tr("Enregistrement impossible"), r.error, 'alert-triangle');
      return;
    }
    const s = productSafety(r.item.data);
    setForm(EMPTY_FORM);
    setShowForm(false);
    if (s.status === 'recall') {
      toast('error', tr("Rappel actif sur ce lot"), tr("Le lot {0} fait l'objet d'un rappel ANPP — n'utilisez plus ce produit.", [s.lot]), 'alert-triangle');
    } else {
      toast('success', tr("Produit enregistré"), tr("{0} a été ajouté à vos produits.", [data.name]), 'circle-check');
    }
  };

  const toggleInUse = async (p) => {
    const r = await update(p.id, { inUse: p.inUse === false });
    if (!r.ok) toast('error', tr("Modification impossible"), r.error, 'alert-triangle');
  };

  const removeProduct = async (p) => {
    if (!window.confirm(tr("Retirer « {0} » de vos produits ?", [p.name]))) return;
    const r = await remove(p.id);
    if (!r.ok) toast('error', tr("Suppression impossible"), r.error, 'alert-triangle');
  };

  const handleScanned = ({ lot }) => {
    setScanOpen(false);
    setLotInput(lot);
    checkLot(lot);
  };

  const checkLot = (arg) => {
    const raw = (typeof arg === 'string' ? arg : lotInput).trim();
    if (!raw) return;
    const lookup = lookupLot(raw);
    if (!lookup.ok) {
      toast('warn', tr("Code non reconnu"), lookup.problem, 'alert-triangle');
      return;
    }
    const value = lookup.lot;
    const verdict = lookup.known ? lookup.result.verdict : null;
    if (verdict === 'recalled') {
      toast('error', tr("Rappel actif trouvé"), tr("Le lot {0} fait l'objet d'un rappel ANPP — n'utilisez plus ce produit.", [value]), 'alert-triangle');
    } else if (verdict === 'suspicious') {
      toast('warn', tr("Lot suspect"), tr("Le lot {0} est signalé comme suspect. Ne l'utilisez pas et parlez-en à votre pharmacien.", [value]), 'alert-triangle');
    } else if (lookup.known) {
      toast('success', tr("Lot vérifié"), tr("Aucun rappel actif trouvé pour le lot {0}.", [value]), 'shield-check');
    } else {
      toast('warn', tr("Lot non référencé"), tr("Le lot {0} est introuvable dans la base ANPP : impossible de confirmer qu'il est authentique. Vérifiez le numéro sur la boîte ou demandez à votre pharmacien.", [value]), 'alert-triangle');
    }
  };

  return (
    <div className="view is-active">
      <QrScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleScanned} validate={validateScannedLot} />
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mes")} <span className="page-title-accent">{tr("produits")}</span></h1></div>
        <div className="page-actions">
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            <Icon name={showForm ? 'x' : 'plus'} />{showForm ? tr("Annuler") : tr("Ajouter un produit")}
          </button>
          <button className="btn btn--primary" onClick={() => onNavigate('declarer')}>
            <Icon name="alert-circle" />{tr("Signaler un incident")}
          </button>
        </div>
      </div>

      {error && <div className="alert-banner alert-banner--amber"><Icon name="alert-triangle" /><div className="alert-banner-text">{error}</div></div>}

      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="kpi-accent u-t54"></div>
          <div className="kpi-header"><div className="kpi-label">{tr("Produits enregistrés")}</div><div className="kpi-icon u-t10"><Icon name="package" /></div></div>
          <div className="kpi-value">{loading ? '…' : products.length}</div>
          <div className="kpi-sub">{tr("Médicaments, dispositifs et plus")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent" style={{ background: 'linear-gradient(90deg,var(--color-red),#e11d48)' }}></div>
          <div className="kpi-header"><div className="kpi-label">{tr("Rappels ANPP actifs")}</div><div className="kpi-icon u-t4"><Icon name="rotate-clockwise" /></div></div>
          <div className="kpi-value u-c-red">{loading ? '…' : recallCount}</div>
          <div className={`kpi-sub${recallCount > 0 ? ' u-c-red' : ''}`}>{recallCount > 0 ? tr("Action requise") : tr("Aucun rappel en cours")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent u-t12"></div>
          <div className="kpi-header"><div className="kpi-label">{tr("En cours d'utilisation")}</div><div className="kpi-icon u-t15"><Icon name="check" /></div></div>
          <div className="kpi-value">{loading ? '…' : inUseCount}</div>
          <div className="kpi-sub">{tr("Produits que vous utilisez actuellement")}</div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name="plus" className="u-c-cyan" />{tr("Nouveau produit")}</h2>
          </div>
          <form onSubmit={submit}>
            <div className="form-row-2" style={{ marginBottom: '12px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="prodName">{tr("Nom du produit")}</label>
                <input id="prodName" className="form-input" maxLength={160} value={form.name} onChange={updateForm('name')} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prodCat">{tr("Catégorie")}</label>
                <select id="prodCat" className="form-input" value={form.category} onChange={updateForm('category')}>
                  {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prodLot">{tr("Lot / N° série")}</label>
                <input id="prodLot" className="form-input u-mono" maxLength={40} value={form.lot} onChange={updateForm('lot')} placeholder={tr("Sur la boîte, après « Lot »")} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prodManu">{tr("Fabricant")}</label>
                <input id="prodManu" className="form-input" maxLength={160} value={form.manufacturer} onChange={updateForm('manufacturer')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prodStart">{tr("Utilisé depuis")}</label>
                <input id="prodStart" type="date" className="form-input" value={form.startedAt} onChange={updateForm('startedAt')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prodNotes">{tr("Note")}</label>
                <input id="prodNotes" className="form-input" maxLength={1000} value={form.notes} onChange={updateForm('notes')} />
              </div>
            </div>
            <button type="submit" className="btn btn--primary" disabled={saving}><Icon name="device-floppy" />{saving ? tr("Enregistrement…") : tr("Enregistrer")}</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="section-header">
          <h2 className="section-title"><Icon name="scan" className="u-c-cyan" />{tr("Vérifier un numéro de lot")}</h2>
        </div>
        <div className="u-t45" style={{ marginBottom: '10px' }}>
          {tr("Scannez le QR code ou saisissez un numéro de lot pour vérifier s'il fait l'objet d'un rappel ANPP.")}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            style={{ flex: '1', minWidth: '220px' }}
            placeholder={tr("Numéro de lot")}
            value={lotInput}
            onChange={(e) => setLotInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') checkLot(); }}
            aria-label={tr("Numéro de lot à vérifier")}
          />
          <button className="btn" onClick={() => setScanOpen(true)}><Icon name="scan" />{tr("Scanner")}</button>
          <button className="btn btn--primary" onClick={() => checkLot()}><Icon name="search" />{tr("Vérifier")}</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div className="filter-tabs" role="tablist" aria-label={tr("Filtrer les produits par catégorie")}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-tab${filter === f.id ? ' is-active' : ''}`}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {tr(f.label)} ({countFor(f.id)})
            </button>
          ))}
        </div>
        <input
          type="text"
          className="form-input"
          style={{ maxWidth: '240px' }}
          placeholder={tr("Rechercher un produit ou un lot…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={tr("Rechercher parmi mes produits")}
        />
      </div>

      <div className="grid-2col">
        {visible.map((p) => {
          const badge = SAFETY_BADGE[p.safety.status];
          return (
            <div className="med-card" key={p.id}>
              <div className="med-card-header">
                <div className="med-icon u-t10"><Icon name={CATEGORY_ICON[p.category] || 'package'} /></div>
                <div>
                  <div className="med-name">{p.name}</div>
                  <div className="med-dosage">{[p.manufacturer, p.inUse === false ? tr("Arrêté") : null].filter(Boolean).join(' · ') || tr(CATEGORY_LABEL[p.category])}</div>
                </div>
                <span className={`badge ${badge.className} u-ml-auto`}>{tr(badge.label)}</span>
              </div>
              <div className="info-grid-2 u-t17">
                <div><div className="info-item-label">{tr("Lot / N° série")}</div><div className="info-item-value u-mono">{p.lot || '—'}</div></div>
                <div><div className="info-item-label">{tr("Catégorie")}</div><div className="info-item-value">{tr(CATEGORY_LABEL[p.category])}</div></div>
              </div>
              {p.safety.status === 'recall' && p.safety.info?.note && (
                <div className="u-fs-12 u-c-red" style={{ marginBottom: '8px' }}>{p.safety.info.note}</div>
              )}
              <div className="u-row-gap6">
                {p.safety.status === 'recall' || p.safety.status === 'suspicious' ? (
                  <button className="btn btn--danger u-flex-1" onClick={() => onNavigate('alertes')}><Icon name="alert-triangle" />{tr("Voir l'alerte")}</button>
                ) : (
                  <button className="btn btn--primary u-flex-1" onClick={() => onNavigate('declarer')}><Icon name="alert-circle" />{tr("Signaler un incident")}</button>
                )}
                <button className="btn u-flex-1" onClick={() => onNavigate('information')}><Icon name="book" />{tr("Notice")}</button>
                <button className="icon-btn" title={p.inUse === false ? tr("Marquer en cours d'utilisation") : tr("Marquer comme arrêté")} aria-label={tr("Changer l'état d'utilisation")} onClick={() => toggleInUse(p)}>
                  <Icon name={p.inUse === false ? 'player-play' : 'player-pause'} />
                </button>
                <button className="icon-btn" title={tr("Retirer")} aria-label={tr("Retirer ce produit")} onClick={() => removeProduct(p)}><Icon name="trash" /></button>
              </div>
            </div>
          );
        })}
        {!loading && visible.length === 0 && (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Icon name="search-off" style={{ fontSize: '20px', marginBottom: '6px' }} />
            <div>{products.length === 0 ? tr("Aucun produit enregistré. Ajoutez vos médicaments et dispositifs pour être alerté des rappels.") : tr("Aucun produit ne correspond à votre recherche.")}</div>
          </div>
        )}
        {loading && <div className="card" style={{ gridColumn: '1 / -1' }}><div className="u-fs-12 u-t102">{tr("Chargement…")}</div></div>}
      </div>
    </div>
  );
}
