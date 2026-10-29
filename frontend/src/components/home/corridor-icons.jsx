import React from 'react'

/* ── Custom monoline icon set for the Corridor section ──────
   Hand-drawn, consistent 24×24 grid, 1.6 stroke, round joins.
   Replaces the old inline circle/blob stick-figure icons.
   Rendered inside a chamfered (not circular) badge — see
   .corridor-role-icon / .corridor-outcome-icon in index.css. */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const CorridorIcon = {
  patient: () => (
    <svg {...base}>
      <circle cx="12" cy="8" r="3.1" />
      <path d="M5.4 20c0-4 3-6.6 6.6-6.6S18.6 16 18.6 20" />
    </svg>
  ),
  physician: () => (
    <svg {...base}>
      <path d="M7.2 3v5.2a4.3 4.3 0 0 0 8.6 0V3" />
      <path d="M11.5 12.4v2.4a4.6 4.6 0 0 0 9.2 0v-1.3" />
      <circle cx="20.1" cy="12.6" r="1.35" />
    </svg>
  ),
  pharmacist: () => (
    <svg {...base}>
      <rect x="3.2" y="9.4" width="17.6" height="6.6" rx="3.3" transform="rotate(-32 12 12.7)" />
      <line x1="12" y1="7.3" x2="12" y2="18.1" transform="rotate(-32 12 12.7)" />
    </svg>
  ),
  hospital: () => (
    <svg {...base}>
      <rect x="5" y="4" width="14" height="17" rx="1.2" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="5" y1="17.2" x2="19" y2="17.2" />
    </svg>
  ),
  clinic: () => (
    <svg {...base}>
      <path d="M4 11 12 4.8 20 11" />
      <rect x="6.2" y="11" width="11.6" height="9" rx="1" />
      <line x1="12" y1="14.2" x2="12" y2="18" />
      <line x1="10.1" y1="16.1" x2="13.9" y2="16.1" />
    </svg>
  ),
  lab: () => (
    <svg {...base}>
      <path d="M9.4 3h5.2" />
      <path d="M10.3 3v6.2l-5 8.6a1.9 1.9 0 0 0 1.65 2.85h9.7a1.9 1.9 0 0 0 1.65-2.85l-5-8.6V3" />
      <line x1="8.4" y1="14.5" x2="15.6" y2="14.5" />
    </svg>
  ),
  manufacturer: () => (
    <svg {...base}>
      <path d="M3.2 21V11.4l5 3.1v-3.1l5 3.1V8l6 3.9V21z" />
      <line x1="3.2" y1="21" x2="20.8" y2="21" />
    </svg>
  ),
  vigilance: () => (
    <svg {...base}>
      <path d="M12 3.2 18.7 6v5.4c0 4.6-3.2 6.9-6.7 8.4-3.5-1.5-6.7-3.8-6.7-8.4V6z" />
      <circle cx="12" cy="10.9" r="2" />
    </svg>
  ),
  quality: () => (
    <svg {...base}>
      <path d="M12 3.2 18.7 6v5.4c0 4.6-3.2 6.9-6.7 8.4-3.5-1.5-6.7-3.8-6.7-8.4V6z" />
      <path d="M9.1 11.9 11.2 14l3.7-4" />
    </svg>
  ),
  labmanager: () => (
    <svg {...base}>
      <rect x="5.2" y="4" width="13.6" height="17" rx="1.8" />
      <rect x="9.2" y="2.4" width="5.6" height="3" rx="1" />
      <line x1="8" y1="10.4" x2="16" y2="10.4" />
      <line x1="8" y1="13.8" x2="16" y2="13.8" />
      <line x1="8" y1="17.2" x2="13.2" y2="17.2" />
    </svg>
  ),
  executive: () => (
    <svg {...base}>
      <rect x="3.2" y="8" width="17.6" height="12" rx="2" />
      <path d="M8.4 8V6.2A2 2 0 0 1 10.4 4.2h3.2a2 2 0 0 1 2 2V8" />
      <line x1="3.2" y1="13.4" x2="20.8" y2="13.4" />
    </svg>
  ),
  authority: () => (
    <svg {...base}>
      <line x1="12" y1="3" x2="12" y2="18.6" />
      <line x1="5.2" y1="7" x2="18.8" y2="7" />
      <path d="M5.2 7 2.4 12.6a2.8 2.8 0 0 0 5.6 0z" />
      <path d="M18.8 7 16 12.6a2.8 2.8 0 0 0 5.6 0z" />
      <line x1="8.2" y1="21" x2="15.8" y2="21" />
    </svg>
  ),
  outcome: () => (
    <svg {...base}>
      <path d="M12 2.6 19.4 5.8v6.3c0 5.3-3.7 8-7.4 9.3-3.7-1.3-7.4-4-7.4-9.3V5.8z" />
      <path d="M8.7 12.3 11 14.6l4.3-4.6" />
    </svg>
  ),
}

export default function CorridorRoleIcon({ id }) {
  const Icon = CorridorIcon[id]
  if (!Icon) return null
  return <Icon />
}
