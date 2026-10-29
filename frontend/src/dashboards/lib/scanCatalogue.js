import { searchCatalogue } from '../../lib/declarationsApi';

// Vérifie un code scanné (QR / DataMatrix) dans la BASE (catalogue des produits approuvés du serveur).
// On cherche d'abord par GTIN/référence, puis par le numéro de lot lu. Aucune authenticité n'est affirmée :
//   { status: 'found', product, ambiguous }   un produit du catalogue correspond (ambiguous = plusieurs)
//   { status: 'notFound' }                    aucun produit du catalogue ne correspond à ce code
//   { status: 'unavailable' }                 catalogue injoignable : rien n'est conclu
// Le catalogue ne contient pas les lots : « found » identifie le PRODUIT, pas la conformité du lot.
export async function verifyScannedCode(parsed) {
  const candidates = [parsed?.gtin, parsed?.lot].map((v) => String(v ?? '').trim()).filter((v, i, a) => v.length >= 2 && a.indexOf(v) === i);
  let anyOk = false;
  for (const q of candidates) {
    const r = await searchCatalogue(q);
    if (!r.ok) continue;
    anyOk = true;
    const usable = r.products.filter((p) => p.intakeAvailable);
    const pool = usable.length ? usable : r.products;
    if (pool.length) return { status: 'found', product: pool[0], ambiguous: pool.length > 1, matchedOn: q };
  }
  return { status: anyOk ? 'notFound' : 'unavailable' };
}
