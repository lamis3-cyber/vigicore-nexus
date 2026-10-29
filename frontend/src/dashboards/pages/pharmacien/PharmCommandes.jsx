import MarketOrders from '../market/MarketOrders';

// « Commandes » du pharmacien : commandes RÉELLES aux fabricants (API /api/market), plus l'ancien catalogue de démonstration
// gardé en mémoire. Le pharmacien est celui qui achète : il crée la demande ici (produit présélectionné quand il vient
// d'une fiche produit du site) et suit son état (en attente → confirmée → livrée, ou annulée). Le serveur vérifie
// l'établissement et sa catégorie d'acheteur ; voir MarketOrders.jsx.
export default function PharmCommandes({ entry, onEntryConsumed }) {
  return <MarketOrders entry={entry} onEntryConsumed={onEntryConsumed} />;
}
