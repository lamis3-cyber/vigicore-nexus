import React, { useEffect, useRef, useState } from 'react'
import { tr } from '../../i18n/translate.js';

// Reusable themed dropdown — same look/behaviour as the Role selector,
// used for any single-choice field so every list in the form matches.
export default function CustomSelect({ id, value, onChange, options, placeholder, invalid }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className="cd-wrap">
      <button
        type="button"
        ref={triggerRef}
        className={`cd-trigger${open ? ' open' : ''}${value ? ' has-value' : ''}${invalid ? ' invalid' : ''}`}
        onClick={() => setOpen(p => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cd-label">{selected ? tr(selected.label) : placeholder}</span>
        <svg className="cd-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <ul ref={listRef} className={`cd-list${open ? ' open' : ''}`} role="listbox">
        {options.map(({ value: v, label }) => (
          <li
            key={v}
            className={`cd-opt${value === v ? ' selected' : ''}`}
            onClick={() => { onChange(v); setOpen(false) }}
            role="option"
            aria-selected={value === v}
          >
            {tr(label)}
          </li>
        ))}
      </ul>
      <input type="hidden" id={id} value={value} readOnly/>
    </div>
  )
}
