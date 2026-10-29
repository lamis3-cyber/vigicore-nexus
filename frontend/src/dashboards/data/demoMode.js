// ═══════════════════════════════════════════════════════════════
// Demo-data gate (Step 16 — "real data only").
//
// The seed arrays in doctorVigilance.js / laboVigilance.js /
// pharmacienVigilance.js are INVENTED sample records (patients,
// declarations, recalls, orders, stock, audit entries …). They used to be
// served to every real account, which made a brand-new user's dashboard
// look populated with activity that never happened.
//
// They are now empty by default. A developer who wants the old showcase
// data locally can opt in explicitly:
//
//     VITE_DEMO_DATA=true npm run dev
//
// This is NOT a production feature and NOT a security mechanism — it only
// controls whether the sample records are loaded at all.
// ═══════════════════════════════════════════════════════════════
export const DEMO_DATA_ENABLED = import.meta.env?.VITE_DEMO_DATA === 'true';

/** Sample rows are kept only when demo data was explicitly enabled. */
export const demoRows = (rows) => (DEMO_DATA_ENABLED ? rows : []);

/** Same, for keyed lookup tables (e.g. a fake lot database). */
export const demoMap = (obj) => (DEMO_DATA_ENABLED ? obj : {});
