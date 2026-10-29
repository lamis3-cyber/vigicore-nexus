// Shared display formatters.

/** 12 500 → "12 500 DA" */
export const fmt = (n) => `${Number(n).toLocaleString('fr-DZ')} DA`

/** Date → "07 Oct 2026". `month` is 'short' | 'long'; `locale` defaults to en-GB. */
export const fmtDate = (d, month = 'short', locale = 'en-GB') =>
  new Date(d).toLocaleDateString(locale, { day: '2-digit', month, year: 'numeric' })

/** ISO string `m` months after `d`. */
export const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x.toISOString() }

/** Stable 0-359 hue from a string, for placeholder card colours. `empty` is returned for ''. */
export const hue = (s = '', empty = 7) => (s ? [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7) : empty)

/** Second hue flavour (char-sum based) used by the public Services cards and the manage hero art. */
export const sumHue = (s = '') => (Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360
