// Algerian phone -> WhatsApp number (international, digits only), or null for landlines / invalid numbers.
export function waNumber(phone = '') {
  let d = String(phone).replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('213')) d = d.slice(3)
  else if (d.startsWith('0')) d = d.slice(1)
  return /^[567]\d{8}$/.test(d) ? `213${d}` : null
}
