import { tr } from '../../../i18n/translate.js';
// ═══════════════════════════════════════════════════════════════
// Medical Staff (role: 'medical_staff') — job title labels.
//
// `jobTitle` is a separate field from `role` (see permissions.js's
// medical_staff comment): every job title under this role shares the
// exact same role/permissions — only the display label differs. This
// map is UI-display-only; it is never read by permissions.js or by
// any authorization check.
//
// Not an exhaustive enum — humanizeJobTitle() below provides a
// reasonable fallback label for any jobTitle value not listed here,
// so a future seat with an unlisted title (aide-soignant, medical
// assistant, etc.) still renders something readable instead of the
// raw snake_case value.
// ═══════════════════════════════════════════════════════════════
const JOB_TITLE_LABELS = {
  nurse: 'Infirmier(ère)',
  aide_soignant: 'Aide-soignant(e)',
  medical_assistant: 'Assistant(e) médical(e)',
};

function humanizeJobTitle(jobTitle) {
  return jobTitle
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getJobTitleLabel(jobTitle) {
  if (!jobTitle) return tr('Personnel médical');
  return tr(JOB_TITLE_LABELS[jobTitle] || humanizeJobTitle(jobTitle));
}
