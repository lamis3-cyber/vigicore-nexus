// ═══════════════════════════════════════════════════════════
// Chart configs — ported 1:1 from the original app script's
// initChartsForView() (original HTML, offset ~712,600 onward).
// Each function returns the exact { type, data, options } object
// that was passed to `new Chart(ctx, ...)` in the original.
// Data values, colors, and options are unchanged from the source.
// ═══════════════════════════════════════════════════════════

// Doctor Dashboard → #docDeclTrendChart (bar, 6-month declaration trend)
export function docDeclTrendChartConfig(declarations = []) {
  // Real data only: the last 6 calendar months, counted from the doctor's own
  // submitted declarations (drafts excluded). No declarations -> a flat 0 series
  // (this used to be a hard-coded [2, 1, 3, 5, 2, 3] shown to every account).
  const FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const now = new Date();
  const slots = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: FR[d.getMonth()] };
  });
  const parse = (v) => {
    if (!v) return null;
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v));
    const d = dmy ? new Date(+dmy[3], +dmy[2] - 1, +dmy[1]) : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const months = slots.map((s) => s.label);
  const data = slots.map(() => 0);
  (declarations || []).forEach((decl) => {
    if (!decl || decl.status === 'draft') return;
    const d = parse(decl.date);
    if (!d) return;
    const k = slots.findIndex((s) => s.y === d.getFullYear() && s.m === d.getMonth());
    if (k >= 0) data[k] += 1;
  });
  return {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Déclarations', data, backgroundColor: 'rgba(0,212,232,.55)', borderRadius: 4, borderSkipped: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6e87a5', font: { size: 10 } } },
        y: {
          grid: { color: 'rgba(128,128,128,.08)' },
          ticks: { color: '#6e87a5', font: { size: 10 }, stepSize: 1 },
          beginAtZero: true,
        },
      },
    },
  };
}

// Pharmacien Dashboard → #pharmVerifTrendChart (line, 14-day verification trend)
// Verified byte-for-byte against the original source (initChartsForView,
// 'pharm-dashboard' branch).
export function pharmVerifTrendChartConfig() {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.getDate() + '/' + (d.getMonth() + 1);
  });
  // Real data only: no verification history exists yet, so the series is flat 0.
  const data = Array.from({ length: 14 }, () => 0);
  return {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Vérifications',
          data,
          borderColor: 'rgba(0,212,232,.9)',
          backgroundColor: 'rgba(0,212,232,.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6e87a5', font: { size: 9 }, maxTicksLimit: 7, autoSkip: true } },
        y: {
          grid: { color: 'rgba(128,128,128,.08)' },
          ticks: { color: '#6e87a5', font: { size: 10 }, stepSize: 1 },
          beginAtZero: true,
        },
      },
    },
  };
}
