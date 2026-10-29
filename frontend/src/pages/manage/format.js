export const endsAt = (l) => (l.placementUntil ? +new Date(l.placementUntil) : 8.64e15)

// One label/state per row: a pending order wins over the stored status,
// because the org's next action is "pay", not "promote".
// status comes from the server's effective state: DRAFT | PENDING_REVIEW | REJECTED | PUBLISHED | ARCHIVED.
// (There is no EXPIRED any more: when a paid promotion ends the product just stays in the free catalog.)
export function rowState(l) {
  if (l.pendingOrder) return { key: 'pending', label: 'Awaiting payment' }
  if (l.status === 'PUBLISHED') return { key: 'published', label: 'Live' }
  if (l.status === 'PENDING_REVIEW') return { key: 'review', label: 'Awaiting validation' }
  if (l.status === 'REJECTED') return { key: 'rejected', label: 'Not approved' }
  return { key: (l.status ?? 'draft').toLowerCase(), label: (l.status ?? 'draft').toLowerCase() }
}
