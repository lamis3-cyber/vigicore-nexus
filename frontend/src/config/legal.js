// Operator identity shown on the legal pages. NOTHING here is invented: every value comes from a
// build-time variable supplied by the owner (see .env.example). Missing values are shown as such.
const e = import.meta.env
export const LEGAL = {
  publisher: e.VITE_LEGAL_PUBLISHER_NAME || '',
  address: e.VITE_LEGAL_ADDRESS || '',
  registration: e.VITE_LEGAL_REGISTRATION || '', // RC / NIF as applicable
  contactEmail: e.VITE_LEGAL_CONTACT_EMAIL || '',
  dataProtectionContact: e.VITE_LEGAL_DPO_CONTACT || '', // data-protection contact / officer
  host: e.VITE_LEGAL_HOST || '', // hosting provider (name + address)
  lastUpdated: e.VITE_LEGAL_LAST_UPDATED || '',
}
export const legalIncomplete = Object.entries(LEGAL).filter(([k]) => k !== 'lastUpdated').some(([, v]) => !v)
