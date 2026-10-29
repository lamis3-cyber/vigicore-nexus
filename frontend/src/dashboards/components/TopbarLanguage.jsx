import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { saveField } from '../data/settingsStore';
import { useI18n } from '../../i18n/index.jsx';
import { tr } from '../../i18n/translate.js';

// Menu de langue de la barre du haut. Remplace le <select> natif dont la liste ne s'affichait pas
// toujours (couleurs du système en thème sombre) : bouton + liste dessinés avec les variables du thème.
const OPTIONS = [
  { code: 'fr', short: 'FR', label: 'Français' },
  { code: 'ar', short: 'عربي', label: 'العربية' },
  { code: 'en', short: 'EN', label: 'English' },
];

export default function TopbarLanguage() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const current = OPTIONS.find((o) => o.code === lang) ?? OPTIONS[0];
  const choose = (code) => { saveField('lang', code); setLang(code); setOpen(false); };

  return (
    <div className="tb-lang" ref={root} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        title={tr("Langue de l'interface")}
        aria-label={tr("Langue de l'interface")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ width: 'auto', padding: '0 10px', gap: 6, fontSize: 12, fontWeight: 600 }}
      >
        <Icon name="language" />
        <span>{current.short}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={tr("Langue de l'interface")}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', insetInlineEnd: 0, zIndex: 1000, margin: 0, padding: 4,
            listStyle: 'none', minWidth: 140, background: 'var(--surface-1)', color: 'var(--text-primary)',
            border: '1px solid var(--border-accent, var(--border))', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,.35)',
          }}
        >
          {OPTIONS.map((o) => (
            <li
              key={o.code}
              role="option"
              aria-selected={o.code === lang}
              tabIndex={0}
              onClick={() => choose(o.code)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(o.code); } }}
              style={{
                padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                fontWeight: o.code === lang ? 700 : 500,
                background: o.code === lang ? 'var(--surface-2)' : 'transparent',
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
