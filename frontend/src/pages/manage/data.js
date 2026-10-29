// Prices, durations and payment methods come from GET /api/services/pricing
// (server/src/services/pricing.ts) so what is displayed is exactly what the
// server charges. This copy is used ONLY in preview mode, when the backend is
// unreachable — keep it in the same shape as the endpoint's response.
export const FALLBACK_PRICING = {
  freeListingLimit: 10,
  placements: [
    { id: 'STANDARD', name: 'Catalog listing', section: 'All products & services grid', tag: 'Free', monthlyPrice: 0, purchasable: false },
    { id: 'RECOMMENDED', name: 'Recommended row', section: 'Scrolling row above the catalog', tag: 'Popular', monthlyPrice: 3000, purchasable: true },
    { id: 'SPONSORED', name: 'Sponsored strip', section: '"What our partners are offering"', tag: 'High visibility', monthlyPrice: 8000, purchasable: true },
    { id: 'FEATURED', name: 'Featured partner', section: 'Full panel at the top, one partner at a time', tag: 'Premium', monthlyPrice: 15000, purchasable: true },
  ],
  durations: [{ months: 1, discountPercent: 0 }, { months: 3, discountPercent: 10 }, { months: 6, discountPercent: 15 }],
  paymentMethods: [
    { id: 'EDAHABIA_CIB', name: 'Edahabia / CIB card', hint: 'Instant · secured by SATIM', enabled: true },
    { id: 'BARIDIMOB', name: 'BaridiMob / CCP', hint: 'Pay in the app quoting your order reference', enabled: true },
    { id: 'BANK_TRANSFER', name: 'Bank transfer', hint: 'Live once we confirm the transfer', enabled: true },
  ],
  featuredTakenUntil: null,
  featuredHolderId: null,
}

export const EMPTY = { title: '', summary: '', description: '', category: '', imageUrl: '', imageZoom: 100, imageFocusX: 50, imageFocusY: 50, imageFit: 'cover', imageAccent: '', logoUrl: '', logoShape: 'hexagon', logoPlacement: 'seam', coverSide: 'left', certifications: [], contactEmail: '', contactPhone: '', website: '', unitPrice: '', priceUnit: '', minOrderQty: 1, inStock: true, stockQty: '', auditProductRef: null }

export const DEMO = [
  { id: 'd1', title: 'SafeTrack Device Registry', summary: 'Serial-number tracking for medical devices.', description: 'Demo', category: 'Medical', status: 'PUBLISHED', placement: 'RECOMMENDED', placementUntil: null, paidActive: true, promoAllowed: true },
  { id: 'd2', title: 'BioTrace Cold Chain Monitor', summary: 'Temperature tracking for biologics.', description: 'Demo', category: 'Medical', status: 'DRAFT' },
]

export const FILTERS = [['all', 'All'], ['published', 'Live'], ['review', 'Awaiting validation'], ['rejected', 'Not approved'], ['draft', 'Drafts'], ['pending', 'Awaiting payment'], ['archived', 'Archived']]

export const SORTS = [['new', 'Newest'], ['expiring', 'Expiring soon'], ['az', 'A → Z']]

export const DAY = 86_400_000

export const ORDER_LABEL = { PAID: 'Paid', PENDING: 'Awaiting payment', CANCELLED: 'Cancelled' }

export const DEMO_STATS = { d1: { views: 1240, clicks: 86, contacts: 14, series: [120, 140, 95, 210, 180, 260, 235] } }

export const DEMO_ORDERS = [{ id: 'o1', reference: 'VG-202609-K7QF2M', listingId: 'd1', listingTitle: 'SafeTrack Device Registry', placement: 'RECOMMENDED', months: 3, total: 8100, paymentMethod: 'BARIDIMOB', status: 'PAID', createdAt: '2026-09-01T10:00:00Z' }]
