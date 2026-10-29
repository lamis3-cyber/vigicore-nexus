import React from 'react'

// Shown only when there is no real backend/data yet (API unreachable, or
// zero PUBLISHED listings) — purely so the page has something to look at
// while /api/services isn't live. Each card is clearly tagged "Example" so
// nobody mistakes it for a real listing. Swap this array out entirely once
// real organizations are publishing — see status === 'ready' below, which
// prefers real data and only falls back to this.
export const DEMO_LISTINGS = [
  {
    id: 'demo-1',
    imageUrl: '/demo-products/catheter-18g.jpg',
    imageFit: 'contain',
    title: 'SafeTrack Device Registry',
    summary: 'Cloud-based serial-number tracking for medical devices, from shipment to patient outcome.',
    category: 'Medical',
    orgName: 'MedGuard Devices',
    icon: 'device',
    verified: true,
  },
  {
    id: 'demo-2',
    imageUrl: '/demo-products/paracetamol-500.jpg',
    imageFit: 'contain',
    title: 'PharmaSignal AI',
    summary: 'Automated adverse-event pattern detection across pharmacy dispensing records.',
    category: 'Pharmaceuticals',
    orgName: 'Atlas Pharma Solutions',
    icon: 'pulse',
    verified: true,
  },
  {
    id: 'demo-3',
    imageUrl: '/demo-products/ethanol-96.jpg',
    imageFit: 'contain',
    title: 'CleanLab Exposure Monitor',
    summary: 'Real-time sensors and alerts for hazardous chemical exposure in clinical labs.',
    category: 'Chemical',
    orgName: 'Northline Laboratories',
    icon: 'flask',
    verified: true,
  },
  {
    id: 'demo-4',
    imageUrl: '/demo-products/dermia-creme.jpg',
    imageFit: 'contain',
    title: 'DermaCheck Reporting Portal',
    summary: 'Consumer-facing adverse-event reporting for cosmetic and skincare products.',
    category: 'Cosmetic',
    orgName: 'Belle Sante Cosmetics',
    icon: 'shield',
    verified: false,
  },
  {
    id: 'demo-5',
    imageUrl: '/demo-products/seringue-5ml.jpg',
    imageFit: 'contain',
    title: 'BioTrace Cold Chain Monitor',
    summary: 'End-to-end temperature and integrity tracking for biologics in transit.',
    category: 'Medical',
    orgName: 'MedGuard Devices',
    icon: 'device',
    verified: true,
  },
  {
    id: 'demo-6',
    imageUrl: '/demo-products/insuline-glargine.jpg',
    imageFit: 'contain',
    title: 'ReactAlert Triage Engine',
    summary: 'Prioritizes incoming adverse-event reports so reviewers see the urgent ones first.',
    category: 'Pharmaceuticals',
    orgName: 'Atlas Pharma Solutions',
    icon: 'pulse',
    verified: true,
  },
  {
    id: 'demo-7',
    imageUrl: '/demo-products/test-hepatite-b.jpg',
    imageFit: 'contain',
    title: 'ReagentTrace Lot Monitor',
    summary: 'Lot-level quality control and incident tracking for diagnostic reagents and in-vitro test kits.',
    category: 'IVD products',
    orgName: 'Northline Laboratories',
    icon: 'droplet',
    verified: true,
  },
  // The demo set below exists purely so pagination has more than one page
  // to demonstrate on a fresh install with no real backend yet — remove
  // this block once real listings make the catalog large enough on its
  // own (see the comment at the top of DEMO_LISTINGS).
  {
    id: 'demo-8',
    imageUrl: '/demo-products/catheter-18g.jpg',
    imageFit: 'contain',
    title: 'VaxLog Distribution Tracker',
    summary: 'Chain-of-custody logging for vaccine batches from cold storage to clinic.',
    category: 'Medical',
    orgName: 'MedGuard Devices',
    icon: 'device',
    verified: true,
  },
  {
    id: 'demo-9',
    imageUrl: '/demo-products/paracetamol-500.jpg',
    imageFit: 'contain',
    title: 'DoseCheck Interaction Engine',
    summary: 'Flags risky drug interactions at the point of prescription in real time.',
    category: 'Pharmaceuticals',
    orgName: 'Atlas Pharma Solutions',
    icon: 'pulse',
    verified: true,
  },
  {
    id: 'demo-10',
    imageUrl: '/demo-products/gel-hydroalcoolique.jpg',
    imageFit: 'contain',
    title: 'SolventGuard Air Monitor',
    summary: 'Continuous air-quality monitoring for volatile solvents on the production floor.',
    category: 'Chemical',
    orgName: 'Northline Laboratories',
    icon: 'flask',
    verified: false,
  },
  {
    id: 'demo-11',
    imageUrl: '/demo-products/nour-spf50.jpg',
    imageFit: 'contain',
    title: 'PureGlow Ingredient Tracer',
    summary: 'Full ingredient traceability and recall management for cosmetic manufacturers.',
    category: 'Cosmetic',
    orgName: 'Belle Sante Cosmetics',
    icon: 'shield',
    verified: true,
  },
  {
    id: 'demo-12',
    imageUrl: '/demo-products/bandelettes-glycemie.jpg',
    imageFit: 'contain',
    title: 'RapidTest Result Sync',
    summary: 'Syncs point-of-care diagnostic results directly into patient records.',
    category: 'IVD products',
    orgName: 'Northline Laboratories',
    icon: 'droplet',
    verified: true,
  },
  {
    id: 'demo-13',
    imageUrl: '/demo-products/seringue-5ml.jpg',
    imageFit: 'contain',
    title: 'ImplantWatch Registry',
    summary: 'Long-term post-market surveillance for implantable medical devices.',
    category: 'Medical',
    orgName: 'MedGuard Devices',
    icon: 'device',
    verified: true,
  },
  {
    id: 'demo-14',
    imageUrl: '/demo-products/insuline-glargine.jpg',
    imageFit: 'contain',
    title: 'BatchTrace QC Suite',
    summary: 'Batch-level quality control workflows for pharmaceutical manufacturing lines.',
    category: 'Pharmaceuticals',
    orgName: 'Atlas Pharma Solutions',
    icon: 'pulse',
    verified: false,
  },
  {
    id: 'demo-15',
    imageUrl: '/demo-products/ethanol-96.jpg',
    imageFit: 'contain',
    title: 'SpillGuard Response Kit',
    summary: 'Digitized spill-response protocols and reporting for lab chemical incidents.',
    category: 'Chemical',
    orgName: 'Northline Laboratories',
    icon: 'flask',
    verified: true,
  },
  {
    id: 'demo-16',
    imageUrl: '/demo-products/dermia-creme.jpg',
    imageFit: 'contain',
    title: 'HydraSkin Patch Analytics',
    summary: 'Wear-testing analytics and adverse-reaction tracking for cosmetic patches.',
    category: 'Cosmetic',
    orgName: 'Belle Sante Cosmetics',
    icon: 'shield',
    verified: true,
  },
  {
    id: 'demo-17',
    imageUrl: '/demo-products/test-hepatite-b.jpg',
    imageFit: 'contain',
    title: 'LotSure Reagent Passport',
    summary: 'Digital passport for reagent lots, from manufacture to lab shelf life.',
    category: 'IVD products',
    orgName: 'Northline Laboratories',
    icon: 'droplet',
    verified: false,
  },
  {
    id: 'demo-18',
    imageUrl: '/demo-products/catheter-18g.jpg',
    imageFit: 'contain',
    title: 'FieldTrace Device Auditor',
    summary: 'Mobile audit tool for field technicians servicing deployed medical devices.',
    category: 'Medical',
    orgName: 'MedGuard Devices',
    icon: 'device',
    verified: true,
  },
]

export const DEMO_ICONS = {
  device: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" /><line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  ),
  pulse: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2 7 4-14 2 7h6" />
    </svg>
  ),
  flask: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M10 3v6l-6 10a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L14 9V3" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
    </svg>
  ),
  droplet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c4 5 6.5 8.6 6.5 11.5A6.5 6.5 0 1 1 5.5 14.5C5.5 11.6 8 8 12 3z" />
    </svg>
  ),
}

// Same "example until real data exists" spirit as DEMO_LISTINGS above.
// Once the backend exists, the natural place to hang these is a `featured`
// boolean (promo banner + spotlight) and a simple "same category as your
// last search" or "most recently published" rule (recommended row) — none
// of that logic exists yet, so this stays static and demo-only for now.
export const DEMO_PROMOS = [
  {
    id: 'demo-2',
    imageUrl: '/demo-products/paracetamol-500.jpg',
    imageFit: 'contain',
    orgName: 'Atlas Pharma Solutions',
    category: 'Pharmaceuticals',
    title: 'Cut signal-detection time from weeks to hours',
    summary: 'PharmaSignal AI flags adverse-event patterns across dispensing records the moment they emerge.',
    stat: { value: '3,200+', label: 'reports screened / mo' },
    icon: 'pulse',
  },
  {
    id: 'demo-1',
    imageUrl: '/demo-products/catheter-18g.jpg',
    imageFit: 'contain',
    orgName: 'MedGuard Devices',
    category: 'Medical',
    title: 'Every device, traceable from shipment to patient',
    summary: 'SafeTrack gives manufacturers and hospitals one shared registry — recalls go out in hours.',
    stat: { value: '48h', label: 'avg. recall notice' },
    icon: 'device',
  },
  {
    id: 'demo-4',
    imageUrl: '/demo-products/dermia-creme.jpg',
    imageFit: 'contain',
    orgName: 'Belle Sante Cosmetics',
    category: 'Cosmetic',
    title: 'Consumer adverse events, routed automatically',
    summary: 'DermaCheck turns scattered complaints into a structured, regulator-ready pipeline.',
    stat: { value: '12', label: 'countries covered' },
    icon: 'shield',
  },
  {
    id: 'demo-3',
    imageUrl: '/demo-products/ethanol-96.jpg',
    imageFit: 'contain',
    orgName: 'Northline Laboratories',
    category: 'Chemical',
    title: 'Exposure incidents, caught at the bench',
    summary: 'Sensor-based monitoring and automated alerting for clinical and industrial labs.',
    stat: { value: '24/7', label: 'live alerting' },
    icon: 'flask',
  },
]

export const DEMO_SPOTLIGHTS = [
  {
    orgName: 'Northline Laboratories',
    category: 'Chemical', listingsCount: 7, trend: [38,32,35,24,27,16,20,5], stats: [{ value: '99.6%', label: 'uptime' }, { value: '1,430', label: 'views / month' }],
    tagline: 'Featured this month',
    title: 'Chemical exposure surveillance, built for real labs',
    description: 'Northline equips clinical and industrial labs with sensor-based monitoring and automated alerting, so exposure incidents get caught at the bench, not in the incident report.',
    tags: ['ISO 17025 accredited', '24/7 alerting', 'Ministry of Commerce compliant'],
    stat: { value: '99.6%', label: 'uptime' },
    icon: 'flask',
  },
  {
    orgName: 'Atlas Pharma Solutions',
    category: 'Pharmaceuticals', listingsCount: 5, trend: [30,34,28,26,20,22,12,8], stats: [{ value: '78%', label: 'auto-triaged' }, { value: '2,000+', label: 'pharmacies' }],
    tagline: 'Trending this week',
    title: 'AI-assisted pharmacovigilance, without the noise',
    description: 'PharmaSignal filters routine side-effect reports from genuine emerging signals, so reviewers spend their time on what actually needs a second look.',
    tags: ['ANPP-aligned', 'GVP-compliant'],
    stat: { value: '78%', label: 'auto-triaged' },
    icon: 'pulse',
  },
  {
    orgName: 'MedGuard Devices',
    category: 'Medical', listingsCount: 4, trend: [36,30,31,22,24,18,14,10], stats: [{ value: '48h', label: 'recall time' }, { value: '120', label: 'devices tracked' }],
    tagline: 'New partner',
    title: 'A single registry for every device in the field',
    description: 'From first shipment to end-of-life, MedGuard keeps one traceable record per device — shared between manufacturer, hospital and regulator.',
    tags: ['ISO 13485', 'Serial-level tracking'],
    stat: { value: '48h', label: 'recall time' },
    icon: 'device',
  },
]

export const DEMO_RECOMMENDED = DEMO_LISTINGS.slice(1, 5)
