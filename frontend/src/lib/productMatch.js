/**
 * Cohérence fiche ↔ produit lié (2026-10-29) — MÊME règle que le serveur (backend services/listingProductLink.ts) :
 * la fiche et le produit partagent au moins un mot significatif (≥ 4 lettres, hors mots vides et nombres), ou la fiche
 * cite la référence du produit. Ici seulement pour prévenir avant d'enregistrer ; le serveur décide.
 */
const STOP_WORDS = new Set([
  'avec', 'pour', 'sans', 'dans', 'boite', 'boites', 'flacon', 'flacons', 'unite', 'unites', 'produit', 'tres', 'haute',
  'with', 'from', 'pack', 'box', 'boxes', 'unit', 'units', 'the', 'and',
])

export function significantWords(text) {
  const norm = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return new Set(norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/\d/.test(w) && !STOP_WORDS.has(w)))
}

export function productNameMatches(listingTitle, product) {
  const title = String(listingTitle ?? '')
  if (!title.trim() || !product) return true
  const ref = String(product.reference ?? '').trim().toLowerCase()
  if (ref.length >= 3 && title.toLowerCase().includes(ref)) return true
  const a = significantWords(title)
  for (const w of significantWords(product.name)) if (a.has(w)) return true
  return false
}
