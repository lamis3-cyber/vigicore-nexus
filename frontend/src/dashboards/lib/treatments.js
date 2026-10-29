import { todayIso } from './usePersonal';

// Treatment helpers shared by the patient's Treatments page and dashboard.
const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day (YYYY-MM-DD) of an ISO timestamp. */
export function localDay(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A treatment is active today when today lies between its (optional) start and end dates. */
export const isActiveTreatment = (t, today = todayIso()) =>
  (!t.startDate || t.startDate <= today) && (!t.endDate || t.endDate >= today);

/**
 * Adherence over the last `days` days, in %: doses marked as taken / doses planned.
 * Only treatments with a known number of doses per day count. null when nothing is planned.
 */
export function adherence(treatments, intakes, now = new Date(), days = 7) {
  const today = todayIso();
  const since = new Date(now.getTime() - days * DAY_MS);
  let expected = 0;
  let taken = 0;
  for (const t of treatments) {
    if (!t.dosesPerDay || !isActiveTreatment(t, today)) continue;
    const start = t.startDate ? new Date(`${t.startDate}T00:00:00`) : since;
    const from = start > since ? start : since;
    const activeDays = Math.max(1, Math.ceil((now - from) / DAY_MS));
    expected += t.dosesPerDay * Math.min(days, activeDays);
    taken += intakes.filter((i) => i.treatmentId === t.id && new Date(i.takenAt) >= from).length;
  }
  if (!expected) return null;
  return Math.min(100, Math.round((taken / expected) * 100));
}
