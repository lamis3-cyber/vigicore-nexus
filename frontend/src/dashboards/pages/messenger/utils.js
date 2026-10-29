import { localeTag } from '../../../i18n/translate.js';
const ROLE_LABELS = {
  PATIENT: 'Patient',
  DOCTOR: 'Médecin',
  PHARMACIEN: 'Pharmacien',
  LABO: 'Laboratoire',
  HOSPITAL: 'Personnel hospitalier',
  VIGILANCE_REVIEWER: 'Vigilance',
  ESTABLISHMENT_ADMIN: 'Fabricant',
  FOURNISSEUR: 'Fournisseur / distributeur',
  ORG_ADMIN: 'Administrateur',
}
export const roleLabel = (role) => ROLE_LABELS[role] ?? 'Utilisateur'
export const personSub = (p) => [roleLabel(p.role), p.organization].filter(Boolean).join(' · ')

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}

/** Stable soft colour per person, readable on both the light and the dark theme. */
export function avatarStyle(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return { background: `hsl(${h} 65% 55% / .18)`, color: `hsl(${h} 70% 48%)` }
}

const pad = (n) => String(n).padStart(2, '0')
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const formatClock = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function formatListTime(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  if (sameDay(d, now)) return formatClock(iso)
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Hier'
  const days = (now - d) / 86400000
  if (days < 7) return d.toLocaleDateString(localeTag(), { weekday: 'short' })
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

export function dayLabel(iso) {
  const d = new Date(iso), now = new Date()
  if (sameDay(d, now)) return 'Aujourd’hui'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Hier'
  return d.toLocaleDateString(localeTag(), { weekday: 'long', day: 'numeric', month: 'long' })
}
export const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

export function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const m = Math.floor(totalSeconds / 60), s = Math.floor(totalSeconds % 60)
  return `${m}:${pad(s)}`
}
