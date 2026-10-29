import InstitutionalDeclarer from '../institutional/InstitutionalDeclarer';

// Fournisseur / distributeur (role: 'supplier') — « Déclarer un incident ».
// Même assistant partagé que tous les autres portails (produit, faits, gravité, pièces, récapitulatif, destination) :
// seuls `dept` (libellé inscrit sur la déclaration) et la page ouverte après l'envoi changent. Les destinations
// proposées (CNPM, établissement…) sont celles que le SERVEUR déclare réellement disponibles pour ce compte.
export default function SupplierDeclarer({ onNavigate }) {
  return (
    <InstitutionalDeclarer
      dept="Fournisseur / distributeur"
      targetNavId="sup-declarations"
      onNavigate={onNavigate}
    />
  );
}
