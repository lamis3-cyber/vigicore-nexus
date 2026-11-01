import { useEffect, useRef, useState } from 'react';
import { searchManufacturers } from '../../lib/declarationsApi';
import { tr } from '../../i18n/translate.js';

// Champ « Nom du fabricant » avec liste des fabricants présents dans VigiCore Audit (noms seulement).
// value    : texte affiché                locked : fabricant imposé par le produit du catalogue (lecture seule)
// onChange : (text) => void               hint   : texte d'aide quand le champ est verrouillé
// La saisie libre reste possible (fabricant hors Audit) ; la liste ne sert qu'à éviter de retaper le nom complet.
const box = {
  listStyle: 'none', margin: '6px 0 0', padding: 4, maxHeight: 240, overflowY: 'auto',
  background: 'var(--surface-2)', color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: 10,
};
const itemBtn = {
  width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 0, borderRadius: 8,
  color: 'var(--text-primary)', font: 'inherit', cursor: 'pointer',
};

export default function ManufacturerField({ id = 'dwManuf', value, onChange, locked = false, hint, placeholder, required }) {
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | empty | error
  const [picked, setPicked] = useState(null); // nom choisi dans la liste : on referme la liste tant que le texte n'a pas changé
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = value.trim();
    if (locked || q.length < 2 || picked === q) { setResults([]); setState('idle'); return undefined; }
    setState('loading');
    timer.current = setTimeout(async () => {
      const r = await searchManufacturers(q);
      if (!r.ok) { setResults([]); setState('error'); return; }
      setResults(r.manufacturers);
      setState(r.manufacturers.length ? 'idle' : 'empty');
    }, 300);
    return () => clearTimeout(timer.current);
  }, [value, locked, picked]);

  return (
    <div>
      <input
        id={id}
        className="form-input"
        value={value}
        autoComplete="off"
        readOnly={locked}
        placeholder={placeholder}
        required={required}
        onChange={(e) => { setPicked(null); onChange(e.target.value); }}
        aria-describedby={`${id}Hint`}
      />
      <div id={`${id}Hint`} aria-live="polite" style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
        {locked && hint}
        {!locked && state === 'loading' && tr("Recherche dans les fabricants VigiCore Audit…")}
        {!locked && state === 'empty' && tr("Aucun fabricant relié à VigiCore Audit ne correspond : vous pouvez saisir le nom librement.")}
        {!locked && state === 'error' && tr("Liste des fabricants indisponible pour le moment : vous pouvez saisir le nom librement.")}
        {!locked && state === 'idle' && results.length > 0 && tr("Choisissez le fabricant dans la liste, puis son produit.")}
      </div>
      {!locked && results.length > 0 && (
        <ul role="listbox" style={box}>
          {results.map((m) => (
            <li key={m.organizationName} role="option" aria-selected="false">
              <button type="button" onClick={() => { setPicked(m.organizationName); onChange(m.organizationName); }} style={itemBtn}>
                <strong>{m.organizationName}</strong>
                {!m.intakeAvailable && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> {tr("— réception indisponible pour le moment")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
