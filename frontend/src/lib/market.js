/**
 * market.js — commandes aux fabricants depuis /services (sans paiement en ligne).
 * Serveur : backend/nexus-api/src/routes/market.routes.ts. Même forme de retour que lib/services.js : { ok, data|error }.
 */
import { apiFetch } from './api.js'

export const BUYER_CATEGORIES = [
  { id: 'DISTRIBUTOR', label: 'Distributeur en gros', hint: 'Agrément de distribution en gros de produits pharmaceutiques.' },
  { id: 'PUBLIC_INSTITUTION', label: 'Établissement public', hint: 'CHU, EPH, EPSP, établissement public de santé…' },
  { id: 'EXPORT', label: "Entité d'exportation", hint: 'Achat destiné à l’exportation.' },
  { id: 'PRIVATE_PHARMACY', label: 'Pharmacie privée (officine)', hint: 'Demandes de commande validées au cas par cas par le fabricant.' },
  { id: 'PRIVATE_CLINIC', label: 'Clinique privée', hint: 'Demandes de commande validées au cas par cas par le fabricant.' },
  { id: 'PRIVATE_OTHER', label: 'Autre structure privée', hint: 'Cabinet, centre privé… Demandes de commande validées au cas par cas par le fabricant.' },
]
export const CATEGORY_LABEL = Object.fromEntries([...BUYER_CATEGORIES.map((c) => [c.id, c.label]), ['INDIVIDUAL', 'Particulier']])
export const CATEGORY_SHORT = {
  DISTRIBUTOR: 'Distributeurs', PUBLIC_INSTITUTION: 'Établissements publics', EXPORT: 'Exportation',
  PRIVATE_PHARMACY: 'Pharmacies privées', PRIVATE_CLINIC: 'Cliniques privées', PRIVATE_OTHER: 'Structures privées',
}

export const getMarketMe = () => apiFetch('GET', '/market/me')
export const getCatalogueAccess = () => apiFetch('GET', '/market/catalogue-access')
export const listOffers = (q) => apiFetch('GET', `/market/offers${q ? `?q=${encodeURIComponent(q)}` : ''}`)
export const sendOrder = (body) => apiFetch('POST', '/market/orders', body)
export const sendInterest = (body) => apiFetch('POST', '/market/interests', body)
export const listMyRequests = () => apiFetch('GET', '/market/requests')
// Annule une commande adressée à un fournisseur tant qu'il ne l'a pas confirmée (le serveur tranche).
export const cancelMyRequest = (id) => apiFetch('POST', `/market/requests/${encodeURIComponent(id)}/cancel`)

// ── Fournisseur : commandes REÇUES de ses clients (compte FOURNISSEUR seulement) ──
// { sales: [{ id, reference, kind, status, statusLabel, summary, totalAmount, buyer: { name, category, verified, contactName, contactEmail, contactPhone },
//   note, sellerNote, nextStatuses, lines, history, createdAt, updatedAt }], counts: { pending, confirmed, shipped, delivered, newInterests } }
export const listMySales = () => apiFetch('GET', '/market/sales')
export const setSaleStatus = (id, status, note) => apiFetch('POST', `/market/sales/${encodeURIComponent(id)}/status`, { status, ...(note ? { note } : {}) })
export const SALE_STATUS = {
  PENDING: { label: 'À confirmer', tone: 'wait' }, CONFIRMED: { label: 'Confirmée', tone: 'ok' }, SHIPPED: { label: 'Expédiée', tone: 'ok' },
  DELIVERED: { label: 'Livrée', tone: 'done' }, CANCELLED: { label: 'Annulée', tone: 'off' }, REJECTED: { label: 'Refusée', tone: 'off' },
  NEW: { label: 'Nouvelle demande', tone: 'wait' }, CONTACTED: { label: 'Client contacté', tone: 'ok' }, CLOSED: { label: 'Clôturée', tone: 'done' },
}
// Action proposée au vendeur pour chaque transition (libellé du bouton ; `ask` = motif obligatoire).
export const SALE_ACTION = {
  CONFIRMED: { label: 'Confirmer la commande', icon: 'circle-check', primary: true },
  SHIPPED: { label: 'Marquer comme expédiée', icon: 'truck-delivery', primary: true },
  DELIVERED: { label: 'Marquer comme livrée', icon: 'package', primary: true },
  REJECTED: { label: 'Refuser', icon: 'x', ask: 'Motif du refus (visible du client)' },
  CANCELLED: { label: 'Annuler la commande', icon: 'x', ask: "Motif de l'annulation (visible du client)" },
  CONTACTED: { label: 'Client contacté', icon: 'phone', primary: true },
  CLOSED: { label: 'Clôturer', icon: 'check' },
}

// Alertes de retrait / rétablissement de lot (étape 3) : seulement celles dont l'utilisateur est destinataire.
// { unread, alerts: [{ id, event: 'WITHDRAWN'|'REINSTATED', productName, lotNumber, manufacturer, instruction, detectedAt, read }] }
export const listLotAlerts = () => apiFetch('GET', '/market/lot-alerts')
export const markLotAlertRead = (id) => apiFetch('POST', `/market/lot-alerts/${encodeURIComponent(id)}/read`)
export const markAllLotAlertsRead = () => apiFetch('POST', '/market/lot-alerts/read-all')

export const adminListBuyers = (status) => apiFetch('GET', `/market/admin/buyers${status && status !== 'all' ? `?status=${status}` : ''}`)
// approval (optionnel, distributeur vérifié) : { approvalNumber, approvalDate } — absent = serveur ne touche pas à l'agrément ; null = effacé.
export const adminReviewBuyer = (id, decision, note, approval) => apiFetch('POST', `/market/admin/buyers/${encodeURIComponent(id)}/review`, { decision, note, ...(approval ?? {}) })

/** Clé anti double-clic : la même clé pour les renvois d'un même envoi. */
export const newRequestKey = () => `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const ORDER_STATUS = {
  PENDING: { label: 'En attente du fabricant', tone: 'wait' },
  CONFIRMED: { label: 'Confirmée', tone: 'ok' },
  SHIPPED: { label: 'Expédiée', tone: 'ok' },
  DELIVERED: { label: 'Livrée', tone: 'done' },
  CANCELLED: { label: 'Annulée', tone: 'off' },
}
export const INTEREST_STATUS = {
  NEW: { label: 'Envoyée', tone: 'wait' },
  CONTACTED: { label: 'Le fabricant vous a contacté', tone: 'ok' },
  CLOSED: { label: 'Clôturée', tone: 'done' },
  // Le fabricant a confirmé la commande issue de la demande (VigiCore Audit, 2026-10-29) ; annulée => CLOSED.
  CONVERTED: { label: 'Commande confirmée par le fabricant', tone: 'ok' },
}
/** État affiché d'une demande : d'abord l'envoi (Site → fabricant), puis le traitement chez le fabricant. */
export function requestState(r) {
  if (r.delivery === 'PENDING') return { label: 'Envoi en cours', tone: 'wait' }
  if (r.delivery === 'FAILED') return { label: 'Envoi impossible pour le moment', tone: 'off' }
  if (r.delivery === 'REJECTED') return { label: 'Refusée', tone: 'off' }
  if (r.demo) return { label: 'Démonstration — non transmise au fabricant', tone: 'off' }
  const map = r.kind === 'ORDER' ? ORDER_STATUS : INTEREST_STATUS
  return map[r.status] ?? { label: r.status ?? '—', tone: 'wait' }
}

// ── Fiche produit /services/:id (2026-10-27) ──
export const getListingEngagement = (listingId) => apiFetch('GET', `/market/listings/${encodeURIComponent(listingId)}/engagement`)
export const likeListing = (listingId) => apiFetch('PUT', `/market/listings/${encodeURIComponent(listingId)}/like`)
export const unlikeListing = (listingId) => apiFetch('DELETE', `/market/listings/${encodeURIComponent(listingId)}/like`)
export const adminListManufacturers = () => apiFetch('GET', '/market/admin/manufacturers')
export const adminLinkManufacturer = (establishmentId, manufacturerRef) =>
  apiFetch('PUT', '/market/admin/manufacturers/link', { establishmentId, manufacturerRef: manufacturerRef || null })

export const NOTE_MAX = 2000
/**
 * Précisions de livraison ajoutées en tête de la note au fabricant (le contrat avec Audit ne change pas :
 * un seul champ `note`, 2000 caractères au plus). La note libre est tronquée si nécessaire, jamais la livraison.
 */
export function composeOrderNote({ deliveryPlace, desiredDate, purchaseOrderRef, note } = {}) {
  const head = [
    deliveryPlace?.trim() && `Lieu de livraison : ${deliveryPlace.trim()}`,
    desiredDate?.trim() && `Date souhaitée : ${desiredDate.trim()}`,
    purchaseOrderRef?.trim() && `Bon de commande : ${purchaseOrderRef.trim()}`,
  ].filter(Boolean).join('\n')
  const free = note?.trim() ?? ''
  if (!free) return head.slice(0, NOTE_MAX)
  const room = NOTE_MAX - head.length - (head ? 2 : 0)
  const body = room > 0 ? free.slice(0, room) : ''
  return (head ? (body ? `${head}\n\n${body}` : head) : body).slice(0, NOTE_MAX)
}

// ── Intention de commande d'un visiteur (2026-10-27) ──
// Le visiteur clique « Commander » -> connexion / inscription. L'inscription passe par une validation (écran « en attente ») :
// on retient donc la fiche visée pour y rouvrir la carte de commande à la première connexion, même sans `?next=`.
const ORDER_INTENT_KEY = 'vigicore:order-intent'
const ORDER_INTENT_TTL = 24 * 60 * 60 * 1000
export const orderPathFor = (listingId) => `/services/${encodeURIComponent(listingId)}?order=1`
export function rememberOrderIntent(path) {
  try { localStorage.setItem(ORDER_INTENT_KEY, JSON.stringify({ path, at: Date.now() })) } catch { /* stockage indisponible : le ?next= suffit */ }
}
/** Lit ET efface l'intention (usage unique). Renvoie un chemin interne ou null. */
export function takeOrderIntent() {
  try {
    const v = JSON.parse(localStorage.getItem(ORDER_INTENT_KEY) || 'null')
    localStorage.removeItem(ORDER_INTENT_KEY)
    return v && typeof v.path === 'string' && Date.now() - v.at < ORDER_INTENT_TTL ? v.path : null
  } catch { return null }
}
