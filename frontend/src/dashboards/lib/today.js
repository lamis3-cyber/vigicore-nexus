import { localeTag } from '../../i18n/translate.js';
// Real "today" for UI labels (replaces the hardcoded demo date 29/06/2026).
const pad = (n) => String(n).padStart(2, '0');
export const todayDdMmYyyy = (d = new Date()) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const todayLongFr = (d = new Date()) => {
  const s = new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
};
