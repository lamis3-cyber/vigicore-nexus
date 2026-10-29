import React from 'react'
import { tr } from '../../i18n/translate.js';

// Builds a Google-style page list: first, last, current ± neighbors, with
// '…' standing in for any gap so the control stays a fixed, scannable
// width even when there are dozens of pages.
export function buildPageList(current, total) {
  const pages = []
  const add = (n) => pages.push(n)
  const delta = 1

  add(1)
  if (current - delta > 2) pages.push('…')
  for (let n = Math.max(2, current - delta); n <= Math.min(total - 1, current + delta); n++) add(n)
  if (current + delta < total - 1) pages.push('…')
  if (total > 1) add(total)

  return pages
}

export default function ServicesPagination({ page, totalPages, onChange }) {
  const pages = buildPageList(page, totalPages)
  return (
    <nav className="services-pagination" aria-label={tr("Catalog pages")}>
      <button
        type="button"
        className="services-pagination-arrow"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label={tr("Previous page")}
      >
        ‹
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="services-pagination-ellipsis" aria-hidden="true">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={`services-pagination-num${p === page ? ' is-active' : ''}`}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={tr("Page {0}", [p])}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        className="services-pagination-arrow"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label={tr("Next page")}
      >
        ›
      </button>
    </nav>
  )
}

/**
 * Anonymous visit counters for the owners' dashboard. Elements carrying
 * data-listing-id count one "view" per session once half visible; a click on
 * a link inside one counts as "click" (or "contact" for mailto:/tel:).
 */
