import { useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { usePersonalList } from '../../lib/usePersonal';
import { productSafety, SAFETY_BADGE, CATEGORY_LABEL, CATEGORY_ICON } from '../../lib/patientProducts';
import { tr } from '../../../i18n/translate.js';

// Patient information page.
// "Notices" lists the patient's OWN products (/api/personal/product) with what VigiCore really knows
// about each one: lot verification (ANPP lot base) and the patient's own treatment instructions.
// VigiCore has no official notice (SmPC/RCP) database: the page says so and points to the paper
// leaflet and the pharmacist instead of inventing indications or side effects.
// The regulatory explainer and the generic FAQ below are reference text.

const FAQ = [
  {
    q: "Qu'est-ce que le CNPM ?",
    a: "Le Centre National de Pharmacovigilance et de Matériovigilance est l'organisme algérien chargé de recueillir, analyser et suivre les effets indésirables des médicaments et dispositifs médicaux.",
  },
  {
    q: "Qu'est-ce que l'ANPP ?",
    a: "L'Agence Nationale des Produits Pharmaceutiques encadre la mise sur le marché des médicaments en Algérie et émet les rappels de lots en cas de problème de qualité ou de sécurité avéré.",
  },
  {
    q: 'Dans quel délai dois-je déclarer un effet indésirable grave ?',
    a: "Selon la réglementation algérienne, tout effet indésirable grave doit être signalé au CNPM dans les 15 jours suivant sa survenue ou sa constatation.",
  },
  {
    q: 'Que faire si je reçois un rappel de produit ?',
    a: "Arrêtez immédiatement d'utiliser le produit concerné, consultez les instructions du rappel dans Mes alertes, et rapportez-le à votre pharmacie sans le jeter vous-même.",
  },
];

const TABS = [
  { id: 'notices', label: 'Mes produits', icon: 'file-text' },
  { id: 'reglementation', label: 'Réglementation', icon: 'certificate' },
  { id: 'faq', label: 'FAQ', icon: 'message-question' },
];

export default function PatientInformation({ onNavigate }) {
  const [tab, setTab] = useState('notices');
  const [query, setQuery] = useState('');
  const [openNotice, setOpenNotice] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  const products = usePersonalList('product');
  const treatments = usePersonalList('treatment');

  const notices = useMemo(() => (products.items || []).map((p) => {
    const safety = productSafety(p);
    const name = p.name.toLowerCase();
    const treatment = (treatments.items || []).find((t) => t.name.toLowerCase() === name || name.includes(t.name.toLowerCase()));
    return {
      id: p.id,
      name: p.name,
      sub: [CATEGORY_LABEL[p.category], p.manufacturer || safety.info?.manufacturer].filter(Boolean).join(' · '),
      icon: CATEGORY_ICON[p.category] || 'package',
      lot: p.lot,
      safety,
      treatment,
    };
  }), [products.items, treatments.items]);

  const visibleNotices = notices.filter((n) => {
    const q = query.trim().toLowerCase();
    return !q || n.name.toLowerCase().includes(q) || n.sub.toLowerCase().includes(q);
  });

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Informations")} <span className="page-title-accent">{tr("santé")}</span></h1></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div className="filter-tabs" role="tablist" aria-label={tr("Sections d'information")}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`filter-tab${tab === t.id ? ' is-active' : ''}`}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} style={{ marginRight: '4px' }} />{tr(t.label)}
            </button>
          ))}
        </div>
        {tab === 'notices' && (
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '240px' }}
            placeholder={tr("Rechercher un médicament…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={tr("Rechercher une notice")}
          />
        )}
      </div>

      {tab === 'notices' && (
        <div className="u-col-gap10">
          {products.loading && <div className="card"><div className="u-fs-12 u-t102">{tr("Chargement…")}</div></div>}

          {!products.loading && notices.length === 0 && (
            <div className="card">
              <div className="u-fs-12 u-t102" style={{ marginBottom: '10px' }}>{tr("Aucun produit enregistré. Ajoutez vos produits pour retrouver ici leurs informations de sécurité.")}</div>
              <button className="btn btn--primary u-btn-sm" onClick={() => onNavigate('produits')}><Icon name="plus" />{tr("Ajouter un produit")}</button>
            </div>
          )}

          {visibleNotices.map((n) => {
            const open = openNotice === n.id;
            const badge = SAFETY_BADGE[n.safety.status];
            const alert = n.safety.status === 'recall' || n.safety.status === 'suspicious';
            return (
              <div className="card" key={n.id}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                  onClick={() => setOpenNotice(open ? null : n.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={open}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenNotice(open ? null : n.id); }}
                >
                  <div className="med-icon u-t10"><Icon name={n.icon} /></div>
                  <div className="u-flex-1">
                    <div className="med-name">{n.name}</div>
                    <div className="med-dosage">{tr(n.sub)}</div>
                  </div>
                  <span className={`badge ${badge.className}`}>{tr(badge.label)}</span>
                  <Icon name="chevron-down" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'var(--ease-default)' }} />
                </div>
                {open && (
                  <div className="info-grid-2 u-t17" style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div><div className="info-item-label">{tr("Lot")}</div><div className="info-item-value u-mono">{n.lot || '—'}</div></div>
                    <div><div className="info-item-label">{tr("Vérification ANPP")}</div><div className="info-item-value">{n.safety.info?.note || tr(badge.label)}</div></div>
                    <div><div className="info-item-label">{tr("Votre posologie")}</div><div className="info-item-value">{n.treatment ? [n.treatment.dosage, n.treatment.dosesPerDay ? tr("{0} prise(s) / jour", [n.treatment.dosesPerDay]) : null, n.treatment.instructions].filter(Boolean).join(' · ') || '—' : tr("Aucun traitement associé")}</div></div>
                    <div><div className="info-item-label">{tr("Péremption (base ANPP)")}</div><div className="info-item-value">{n.safety.info?.expiry || '—'}</div></div>
                  </div>
                )}
                {open && (
                  <div className="u-fs-12 u-t102" style={{ marginTop: '10px' }}>
                    <Icon name="info-circle" /> {tr("La notice officielle (indications, effets indésirables, contre-indications) n'est pas disponible dans VigiCore : reportez-vous à la notice papier de la boîte ou demandez à votre pharmacien.")}
                  </div>
                )}
                {open && (
                  <div className="u-row-gap6" style={{ marginTop: '12px' }}>
                    <button className="btn u-flex-1" onClick={() => onNavigate('declarer')}><Icon name="clipboard" />{tr("Déclarer un effet")}</button>
                    {alert && (
                      <button className="btn btn--danger u-flex-1" onClick={() => onNavigate('alertes')}><Icon name="alert-triangle" />{tr("Voir l'alerte")}</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {notices.length > 0 && visibleNotices.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Icon name="search-off" style={{ fontSize: '20px', marginBottom: '6px' }} />
              <div>{tr("Aucun produit ne correspond à votre recherche.")}</div>
            </div>
          )}
        </div>
      )}

      {tab === 'reglementation' && (
        <div className="grid-2col">
          <div className="card">
            <div className="section-header"><h2 className="section-title"><Icon name="shield-check" className="u-c-cyan" />{tr("CNPM")}</h2></div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {tr("Le Centre National de Pharmacovigilance et de Matériovigilance recueille, analyse et suit les effets indésirables des médicaments et dispositifs médicaux déclarés par les patients et les professionnels de santé en Algérie.")}
            </div>
          </div>
          <div className="card">
            <div className="section-header"><h2 className="section-title"><Icon name="building-bank" className="u-c-blue" />{tr("ANPP")}</h2></div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {tr("L'Agence Nationale des Produits Pharmaceutiques encadre la mise sur le marché des médicaments et émet les rappels de lots (comme celui affiché dans Mes alertes) en cas de problème de qualité avéré.")}
            </div>
          </div>
          <div className="card">
            <div className="section-header"><h2 className="section-title"><Icon name="certificate" className="u-c-purple" />{tr("Décret exécutif n° 92-276")}</h2></div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {tr("Ce texte encadre la pharmacovigilance en Algérie et fixe l'obligation de signalement des effets indésirables graves dans un délai de 15 jours après leur survenue.")}
            </div>
          </div>
          <div className="card">
            <div className="section-header"><h2 className="section-title"><Icon name="user-check" className="u-c-green" />{tr("Vos droits")}</h2></div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {tr("En tant que patiente, vous pouvez déclarer directement tout effet indésirable via l'assistant de déclaration, suivre l'avancement de vos dossiers, et être informée de tout rappel concernant vos produits.")}
            </div>
          </div>
        </div>
      )}

      {tab === 'faq' && (
        <div className="u-col-gap10">
          {FAQ.map((f, i) => {
            const open = openFaq === i;
            return (
              <div className="card" key={i}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                  onClick={() => setOpenFaq(open ? null : i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenFaq(open ? null : i); }}
                >
                  <Icon name="message-question" className="u-c-cyan" />
                  <div className="u-flex-1" style={{ fontSize: '13px', fontWeight: 600 }}>{f.q}</div>
                  <Icon name="chevron-down" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'var(--ease-default)' }} />
                </div>
                {open && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
