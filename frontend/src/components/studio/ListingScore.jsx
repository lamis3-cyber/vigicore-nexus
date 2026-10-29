import React from 'react'
import './listing-score.css'
import { tr } from '../../i18n/translate.js';

const LEVEL = {
  great: { label: 'Excellent', sub: 'Your listing is ready to attract buyers.' },
  ok: { label: 'Good', sub: 'A few more details will boost your visibility.' },
  low: { label: 'Needs work', sub: 'Complete the steps below to stand out.' },
}
const R = 34
const C = 2 * Math.PI * R
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const Check = (p) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
)
const Chevron = (p) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M6 3l5 5-5 5" /></svg>
)
const Alert = (p) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><circle cx="8" cy="8" r="6.5" /><path d="M8 4.8v3.6M8 11.1v.1" /></svg>
)

export default function ListingScore({ result, requiredMissing = [], onGo }) {
  if (!result) return null
  const { score, level, items } = result
  const todo = items.filter((i) => !i.ok).sort((a, b) => b.pts - a.pts)
  const done = items.filter((i) => i.ok)
  const lv = LEVEL[level]

  return (
    <div className="lq" data-level={level}>
      <div className="lq-head">
        <div className="lq-ring" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label={tr("Listing quality score")}>
          <svg viewBox="0 0 80 80">
            <circle className="lq-track" cx="40" cy="40" r={R} />
            <circle className="lq-arc" cx="40" cy="40" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} />
          </svg>
          <div className="lq-num"><b>{score}</b><small>/ 100</small></div>
        </div>
        <div className="lq-meta">
          <span className="lq-badge">{tr(lv.label)}</span>
          <span className="lq-sub">{tr(lv.sub)}</span>
        </div>
      </div>

      {requiredMissing.length > 0 && (
        <div className="lq-alert" role="alert">
          <Alert />
          <div>
            <strong>{tr("Required to publish")}</strong>
            <span>{requiredMissing.map(cap).join(' · ')}</span>
          </div>
        </div>
      )}

      {todo.length > 0 && (
        <>
          <p className="lq-title">{tr("Next steps")}</p>
          <ul className="lq-list">
            {todo.map((i) => (
              <li key={i.id}>
                <button type="button" className="lq-todo" onClick={() => onGo?.(i.tab)}>
                  <span className="lq-dot" aria-hidden="true" />
                  <span className="lq-txt">{i.tip}</span>
                  <span className="lq-pts">+{i.pts}</span>
                  <Chevron className="lq-go" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {done.length > 0 && (
        <>
          <p className="lq-title">{tr("Completed")}</p>
          <div className="lq-done">
            {done.map((i) => <span key={i.id}><Check />{tr(i.label)}</span>)}
          </div>
        </>
      )}
    </div>
  )
}
