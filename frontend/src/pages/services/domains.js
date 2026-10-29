// Vigilance domains, in the same order as the particle product shapes (components/shared/productShapes.jsx).
export const DOMS = [
  { key: 'medical', k: '50,180,255' },
  { key: 'pharmaceuticals', k: '60,200,160' },
  { key: 'cosmetic', k: '220,140,60' },
  { key: 'ivd', k: '255,60,90' },
  { key: 'chemical', k: '180,80,255' },
]
export const DEFAULT_K = '25,240,208'
export const domIndex = (cat = '') => {
  const c = String(cat).trim().toLowerCase()
  const i = DOMS.findIndex((d) => c.startsWith(d.key))
  return i < 0 ? null : i
}
