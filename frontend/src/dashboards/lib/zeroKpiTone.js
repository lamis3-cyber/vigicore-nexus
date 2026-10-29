// Marks KPI figures that are exactly 0 (or an empty "—") with `.is-zero` (neutral colour, see
// styles/polish.css), so a red/amber "0" doesn't look like an alert. One observer
// for every dashboard instead of a conditional in each page; the class is added
// and removed as the value changes. Only childList/characterData are observed
// (not attributes), so toggling the class can't re-trigger it.
const ZERO_SUB = /^0(\s|$)/;

function apply() {
  document.querySelectorAll('.kpi-value').forEach((el) => {
    const t = el.textContent.trim();
    el.classList.toggle('is-zero', t === '0' || t === '—');
  });
  document.querySelectorAll('.kpi-sub .up, .kpi-sub .down').forEach((el) => {
    el.classList.toggle('is-zero', ZERO_SUB.test(el.textContent.trim()));
  });
}

export function installZeroKpiTone() {
  if (typeof document === 'undefined' || window.__zeroKpiTone) return;
  window.__zeroKpiTone = true;
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  schedule();
}
