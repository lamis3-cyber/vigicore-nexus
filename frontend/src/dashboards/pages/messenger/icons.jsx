// Small inline SVG set for the Messages page (the dashboards' icon font is a trimmed subset
// that has no paperclip / microphone / user-plus glyphs, so this page carries its own).
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const make = (children) => function Icon({ size = 16, ...rest }) {
  return <svg {...base} width={size} height={size} {...rest}>{children}</svg>
}

export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>)
export const IconUserPlus = make(<><path d="M15 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 2 19.5V21" /><circle cx="8.5" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>)
export const IconX = make(<path d="M18 6 6 18M6 6l12 12" />)
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />)
export const IconPaperclip = make(<path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />)
export const IconMic = make(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></>)
export const IconSend = make(<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></>)
export const IconTrash = make(<><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>)
export const IconDownload = make(<><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 19h16" /></>)
export const IconFile = make(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></>)
export const IconPlay = make(<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />)
export const IconPause = make(<><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></>)
export const IconReply = make(<><path d="m9 14-5-5 5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v3" /></>)
export const IconDots = make(<><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></>)
export const IconSmile = make(<><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></>)
export const IconBack = make(<path d="m15 18-6-6 6-6" />)
export const IconChat = make(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />)

// ── Calls ────────────────────────────────────────────────────────────────
export const IconPhone = make(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />)
export const IconPhoneOff = make(<><path d="M10.7 13.3a16 16 0 0 0 2.6 2.1l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1M6.3 6.3A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9" /><path d="m2 2 20 20" /></>)
export const IconVideo = make(<><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" /></>)
export const IconVideoOff = make(<><path d="M16 16v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.7 0H14a2 2 0 0 1 2 2v3.3l1 1L22 8v8" /><path d="m2 2 20 20" /></>)
export const IconMicOff = make(<><path d="m2 2 20 20" /><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.7-1.3" /><path d="M5 11a7 7 0 0 0 11.1 5.7M19 11a7 7 0 0 1-.9 3.4M12 18v4" /></>)
