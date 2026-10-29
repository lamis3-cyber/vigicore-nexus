// Listing quality score (0-100) + a short placement hint.
export function scoreListing(f = {}, { imageLong = 0, org = false } = {}) {
  const len = (k) => String(f[k] ?? '').trim().length
  const items = [
    { id: 'title', label: 'Clear name', pts: 15, ok: len('title') >= 4, tab: 'content', tip: org ? 'Add your organization name (4+ characters).' : 'Give the product a clear name (4+ characters).' },
    { id: 'summary', label: org ? 'Tagline' : 'Summary', pts: 15, ok: len('summary') >= 40, tab: 'content', tip: org ? 'Write a tagline of at least 40 characters.' : 'Write a summary of at least 40 characters.' },
    { id: 'description', label: 'Description', pts: 20, ok: len('description') >= 120, tab: 'content', tip: org ? 'An organization presentation of 120+ characters builds trust.' : 'A description of 120+ characters builds trust.' },
    { id: 'category', label: org ? 'Activity' : 'Category', pts: 5, ok: len('category') > 0, tab: 'content', tip: org ? 'Add your field of activity so buyers can find you.' : 'Add a category so buyers can find you.' },
    { id: 'image', label: org ? 'Organization photo' : 'Cover image', pts: 15, ok: !!f.imageUrl, tab: 'image', tip: org ? 'Add your logo or a photo of your organization.' : 'Add a cover image.' },
    { id: 'quality', label: 'Sharp photo', pts: 10, ok: imageLong >= 800, tab: 'image', tip: 'Use a photo at least 800 px on its longest side.' },
    { id: 'contact', label: 'Contact', pts: 15, ok: !!(f.contactEmail || f.website || f.contactPhone), tab: 'contact', tip: 'Add an email, phone or website.' },
    { id: 'phone', label: 'WhatsApp-ready phone', pts: 5, ok: /^0?[567]/.test(String(f.contactPhone ?? '').replace(/\D/g, '')), tab: 'contact', tip: 'A mobile number adds a WhatsApp button.' },
  ]
  const score = items.reduce((n, i) => n + (i.ok ? i.pts : 0), 0)
  return { score, items, level: score >= 80 ? 'great' : score >= 55 ? 'ok' : 'low' }
}

export function placementAdvice({ score = 0, stat, zone } = {}) {
  if (stat && stat.views >= 100 && stat.contacts / Math.max(stat.clicks, 1) < 0.1 && score < 80)
    return { tone: 'warn', text: 'People view your listing but rarely contact you. A better photo and description usually help.' }
  if (score >= 80) return { tone: 'good', text: 'Your listing is in great shape for this placement.' }
  return null
}
