// Petits utilitaires d'affichage partagés par les pages du fournisseur.
import { localeTag } from '../../../i18n/translate.js';

/** « il y a 3 h » / « hier » / « 3 days ago » selon la langue choisie ; date courte au-delà de 30 jours. */
export function ago(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat(localeTag(), { numeric: 'auto' });
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), 'day');
  return new Date(t).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
}
