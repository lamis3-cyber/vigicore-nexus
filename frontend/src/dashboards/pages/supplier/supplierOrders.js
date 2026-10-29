// Logique d'affichage des commandes du fournisseur (pure, sans React) : étapes, issue, export CSV.
// Source de vérité = l'état renvoyé par l'API (GET /api/market/requests) : on ne l'invente jamais.

// Commande chez un FABRICANT (relayée à Audit) : Envoyée → Confirmée → Livrée.
export const STAGES = [
  { id: 'SENT', label: 'Envoyée' },
  { id: 'CONFIRMED', label: 'Confirmée par le fabricant' },
  { id: 'DELIVERED', label: 'Livrée' },
];
// Commande chez un FOURNISSEUR (source 'SUPPLIER') : une étape de plus, l'expédition.
export const SUPPLIER_STAGES = [
  { id: 'SENT', label: 'Envoyée' },
  { id: 'CONFIRMED', label: 'Confirmée par le fournisseur' },
  { id: 'SHIPPED', label: 'Expédiée' },
  { id: 'DELIVERED', label: 'Livrée' },
];
export const isOrder = (r) => r.kind === 'ORDER';
export const stagesFor = (r) => (r?.source === 'SUPPLIER' ? SUPPLIER_STAGES : STAGES);

/**
 * Où en est une COMMANDE : `done` = nombre d'étapes franchies, `outcome` = open | delivered | cancelled | refused.
 * Envoi pas encore reçu par le fabricant (PENDING / FAILED) : aucune étape franchie.
 */
export function stageOf(r) {
  if (r.delivery === 'REJECTED') return { done: 0, outcome: 'refused' };
  if (r.delivery !== 'SENT') return { done: 0, outcome: 'open' };
  if (r.status === 'CANCELLED') return { done: 1, outcome: 'cancelled' };
  const total = stagesFor(r).length;
  if (r.status === 'DELIVERED') return { done: total, outcome: 'delivered' };
  if (r.status === 'SHIPPED') return { done: 3, outcome: 'open' };
  if (r.status === 'CONFIRMED') return { done: 2, outcome: 'open' };
  return { done: 1, outcome: 'open' };
}

export const isClosed = (r) => stageOf(r).outcome !== 'open';
export const hasWithdrawnLot = (r) => (r.lines ?? []).some((l) => l.lotStatus === 'WITHDRAWN');

export const HISTORY_LABEL = {
  PENDING: 'En attente de confirmation', CONFIRMED: 'Confirmée', SHIPPED: 'Expédiée', DELIVERED: 'Livrée', CANCELLED: 'Annulée',
  NEW: 'Envoyée', CONTACTED: 'Le vendeur vous a contacté', CLOSED: 'Clôturée',
};

export const OUTCOME_LABEL = { delivered: 'Livrée', cancelled: 'Annulée', refused: 'Refusée', open: 'En cours' };

/** CSV (séparateur « ; » : s'ouvre directement dans Excel en français), préfixé d'un BOM pour les accents. */
export function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
  return `\uFEFF${rows.map((r) => r.map(esc).join(';')).join('\r\n')}`;
}
export function downloadCsv(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
