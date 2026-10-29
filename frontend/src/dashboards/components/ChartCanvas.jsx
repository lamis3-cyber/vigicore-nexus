import { tr } from '../../i18n/translate.js';
import { useEffect, useRef } from 'react';

// Replaces the original's ensureChartJsLoaded() + initChartsForView():
// - Original: Chart.js source sat inert in a type="text/plain" tag and was
//   injected as a real <script> the first time a chart-bearing view opened.
// - Here: `import('chart.js/auto')` is a dynamic import, so Vite code-splits
//   chart.js into its own chunk that's only fetched when this component
//   first mounts — same "don't pay for it on views that never show a
//   chart" behavior, just done through the bundler instead of a DOM hack.
//
// `configFactory` is one of the functions from chartConfigs.js — called
// fresh on mount so each chart instance gets its own data/options object
// (Chart.js mutates the config it's given).
export default function ChartCanvas({ configFactory, height = 180, ariaLabel }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return;
      chartRef.current = new Chart(canvasRef.current, configFactory());
    });

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height, position: 'relative' }}>
      <canvas ref={canvasRef} role="img" aria-label={tr(ariaLabel)} />
    </div>
  );
}
