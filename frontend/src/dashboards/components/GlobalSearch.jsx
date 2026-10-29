import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { tr } from '../../i18n/translate.js';
import { searchEverything } from '../lib/globalSearch';

// Barre de recherche du haut : suggestions groupées (pages, déclarations, brouillons, patients), clavier complet.
export default function GlobalSearch({ portalKey, user, onNavigate }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const box = useRef(null);
  const results = open ? searchEverything(q, { portalKey, user }) : [];

  useEffect(() => {
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, []);

  function pick(r) { setOpen(false); setQ(''); onNavigate?.(r.target); }
  function onKey(e) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[Math.min(idx, results.length - 1)]); }
  }

  let lastGroup = null;
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div className="topbar-search" role="search">
        <Icon name="search" />
        <label htmlFor="globalSearch" className="sr-only">{tr("Rechercher un médicament, lot, symptôme ou déclaration")}</label>
        <input
          type="text" id="globalSearch" autoComplete="off" value={q}
          placeholder={tr("Ex : Metformine, lot ATO-B, nausée, #DEC-2026…")}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={results.length > 0} aria-controls="globalSearchList"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <ul id="globalSearchList" role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 400, listStyle: 'none', margin: 0, padding: 4,
          maxHeight: 360, overflowY: 'auto', background: 'var(--surface-2)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.35)',
        }}>
          {results.length === 0 && <li style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{tr("Aucun résultat")}</li>}
          {results.map((r, i) => {
            const head = r.group !== lastGroup; lastGroup = r.group;
            return (
              <li key={r.key} role="presentation">
                {head && <div style={{ padding: '6px 10px 2px', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{tr(r.group)}</div>}
                <button type="button" role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => pick(r)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', border: 0, borderRadius: 8, font: 'inherit', fontSize: 12.5, cursor: 'pointer',
                    background: i === idx ? 'var(--surface-3, rgba(127,127,127,.18))' : 'transparent', color: 'var(--text-primary)' }}>
                  <Icon name={r.icon || 'search'} />
                  <span><strong>{tr(r.title)}</strong>{r.sub ? <span style={{ color: 'var(--text-secondary)' }}> · {r.sub}</span> : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
