import { useEffect, useRef, useState } from 'react';
import { searchCatalogue } from '../../lib/declarationsApi';
import { tr } from '../../i18n/translate.js';

// Champ "Nom du produit" branché sur le catalogue d'Audit (produits approuvés).
// Le routage a besoin d'un productRef : le texte libre ne suffit plus.
// value      : texte affiché
// selected   : { productRef, name, organizationName, intakeAvailable } | null
// onChange   : (text) => void           (saisie libre : efface la sélection côté parent)
// onSelect   : (product) => void
// onStatus   : ({ state, total, selectable }) => void   (facultatif) — état de la recherche, pour que le parent
//              distingue « aucun produit » (hors catalogue) de « catalogue injoignable » (rien n'a pu être vérifié).
// onBlur     : () => void (facultatif)
// Couleurs issues du thème (clair/sombre) : liste lisible dans les deux, jamais du texte noir sur fond sombre.
const box = {
  listStyle: 'none', margin: '6px 0 0', padding: 4, maxHeight: 280, overflowY: 'auto',
  background: 'var(--surface-2)', color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: 10,
};
const itemBtn = (enabled) => ({
  width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 0, borderRadius: 8,
  color: 'var(--text-primary)', font: 'inherit', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.55,
});

export default function ProductCatalogueField({ id = 'dwProduct', value, selected, onChange, onSelect, onStatus, onBlur }) {
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | empty | error
  const timer = useRef(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const report = (st, list = []) => statusRef.current?.({ state: st, total: list.length, selectable: list.filter((p) => p.intakeAvailable).length });

  useEffect(() => {
    clearTimeout(timer.current);
    if (selected) { setResults([]); setState('idle'); report('selected'); return undefined; }
    if (value.trim().length < 2) { setResults([]); setState('idle'); report('idle'); return undefined; }
    setState('loading');
    report('loading');
    timer.current = setTimeout(async () => {
      const r = await searchCatalogue(value.trim());
      if (!r.ok) { setResults([]); setState('error'); report('error'); return; }
      setResults(r.products);
      setState(r.products.length ? 'idle' : 'empty');
      report(r.products.length ? 'results' : 'empty', r.products);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [value, selected?.productRef]); // eslint-disable-line react-hooks/exhaustive-deps -- `selected` est recréé à chaque rendu par le parent

  return (
    <div>
      <input
        id={id}
        className="form-input"
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-describedby={`${id}Hint`}
      />
      <div id={`${id}Hint`} aria-live="polite" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
        {selected && tr("Produit du catalogue · {0}", [selected.organizationName])}
        {!selected && state === 'loading' && tr("Recherche dans le catalogue…")}
        {!selected && state === 'empty' && tr("Aucun produit du catalogue VigiCore ne correspond. Vérifiez l'orthographe ou la référence.")}
        {!selected && state === 'error' && tr("Catalogue injoignable : le produit ne peut pas être vérifié pour le moment.")}
        {!selected && state === 'idle' && results.length > 0 && tr("Choisissez votre produit dans la liste.")}
      </div>
      {!selected && results.length > 0 && (
        <ul role="listbox" style={box}>
          {results.map((p) => (
            <li key={p.productRef} role="option" aria-selected="false">
              <button
                type="button"
                disabled={!p.intakeAvailable}
                onClick={() => onSelect(p)}
                style={itemBtn(p.intakeAvailable)}
              >
                <strong>{tr(p.name)}</strong>{p.reference ? <span style={{ color: 'var(--text-secondary)' }}> · {p.reference}</span> : ''}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {p.organizationName}{!p.intakeAvailable && tr("— réception indisponible pour le moment")}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
