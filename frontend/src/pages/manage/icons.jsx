import React from 'react'

// `className` defaults to the manage-page icon class; pass '' for an unstyled icon.
export const Ic = (d, className = 'ic') => (props) => (
  <svg className={className || undefined} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{d}</svg>
)

export const IcBox = Ic(<><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></>)

export const IcLive = Ic(<><circle cx="12" cy="12" r="3" /><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M5 5a10 10 0 000 14M19 5a10 10 0 010 14" /></>)

export const IcPause = Ic(<><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>)

export const IcEye = Ic(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>)

export const IcCheck = Ic(<path d="M5 12.5l4.5 4.5L19 7.5" />)

export const IcPlus = Ic(<path d="M12 5v14M5 12h14" />)

export const IcEditSm = Ic(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>)

export const IcCopy = Ic(<><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5v-2a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" /></>)

export const IcArchive = Ic(<><rect x="3.5" y="4.5" width="17" height="4.5" rx="1" /><path d="M5 9v9a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 18V9M10 13h4" /></>)

export const IcTrash = Ic(<><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4L17.5 7M10 11v6M14 11v6" /></>)
