import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/index.jsx'
import { tr } from '../../i18n/translate.js';

// Desktop dropdown. Replaces the lang-dropdown wiring that lived at the end of
// public/script.js (document-level click listeners, classList toggling, ...).
// Same class names / [data-open] attribute, so the existing CSS is untouched.
export function LangDropdown() {
  const { lang, setLang, languages } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('click', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = languages.find((l) => l.code === lang)

  return (
    <div className="lang-dropdown" id="lang-dropdown" ref={rootRef} data-open={open ? '' : undefined}>
      <button
        type="button"
        className="lang-dropdown-btn"
        id="lang-dropdown-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tr("Select language")}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
      >
        <span className="lang-dropdown-current" id="lang-dropdown-current">{current?.label ?? lang.toUpperCase()}</span>
      </button>
      <ul className="lang-dropdown-menu" id="lang-dropdown-menu" role="listbox" aria-label={tr("Language options")}>
        {languages.map((l) => (
          <li
            key={l.code}
            className={`lang-dropdown-item${l.code === lang ? ' lang-dropdown-item--active' : ''}`}
            data-lang={l.code}
            role="option"
            aria-selected={l.code === lang}
            onClick={() => { setLang(l.code); setOpen(false) }}
          >
            {tr(l.label)}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Mobile drawer version (three small buttons).
export function LangMobileButtons() {
  const { lang, setLang, languages } = useI18n()
  return (
    <div className="lang-switcher-mobile" id="lang-switcher-mobile">
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-mob-btn${l.code === lang ? ' lang-mob-btn--active' : ''}`}
          data-lang={l.code}
          onClick={() => setLang(l.code)}
        >
          {tr(l.label)}
        </button>
      ))}
    </div>
  )
}
