import { useEffect, useRef, useState } from "react";
import "./StakeholderRelay.css";
import { prefersReducedMotion } from '../../lib/motion.js'
import { tr, getLang } from '../../i18n/translate.js'

/* ------------------------------------------------------------------ */
/*  Content (swap these strings with your i18n keys if you have them)  */
/* ------------------------------------------------------------------ */
const COPY = {
  eyebrow: "STAKEHOLDERS",
  title: "Who Uses VigiCore Nexus",
  sub: "Seven roles across two environments, all collaborating through one connected platform toward one shared goal: patient safety.",
  following: "Following INC-0412 · Lot C-88",
  elapsed: "Since the first report",
  availability: "Availability",
  atMoment: "At this moment",
  handsOver: "Hands over to",
  illustrative: "Illustrative",
  play: "Play",
  pause: "Pause",
  last: "Back to the start",
  receives: "Receives from",
  step: "Step",
  origin: "Origin of the case",
};

const STEP_MS = 5200;

/* One entry per role. `rows` feed the mock portal on the right;
   tone: "ok" | "warn" | "bad" | undefined. All figures are illustrative. */
const ROLES = [
  {
    id: "patient",
    acc: "#1de9d3",
    name: "Patient",
    short: "Declares incidents",
    time: "09:12",
    env: "Portal · Care",
    desc: "Reports a problem with a product in a few taps, from any phone. The report becomes a case straight away.",
    action: "Declares the incident and the lot number.",
    portal: "Patient app",
    heading: "Report an incident",
    rows: [
      ["Product lot", "C-88"],
      ["Symptom", "Rash, itching"],
      ["Status", "Declared", "ok"],
    ],
    chip: "Case INC-0412 created",
  },
  {
    id: "physician",
    acc: "#3da5ff",
    name: "Physician",
    short: "Submits incident reports",
    time: "09:15",
    env: "Portal · Care",
    desc: "Confirms the clinical picture and files a structured incident report on the same case.",
    action: "Submits the medical report against INC-0412.",
    portal: "Physician portal",
    heading: "Incident report",
    rows: [
      ["Severity", "Moderate", "warn"],
      ["Lot", "C-88"],
      ["Report", "Submitted", "ok"],
    ],
    chip: "Linked to INC-0412",
  },
  {
    id: "pharmacist",
    acc: "#a66bff",
    name: "Pharmacist",
    short: "Flags drug reactions",
    time: "09:40",
    env: "Portal · Care",
    desc: "Checks dispensing records and flags reactions seen on the same product across patients.",
    action: "Flags the reaction pattern on lot C-88.",
    portal: "Pharmacist portal",
    heading: "Drug reaction flag",
    rows: [
      ["Product lot", "C-88"],
      ["Similar reports", "3", "warn"],
      ["Signal", "Possible", "warn"],
    ],
    chip: "Reaction flagged",
  },
  {
    id: "laboratory",
    acc: "#ffb21f",
    name: "Laboratory",
    short: "Feeds test results",
    time: "11:20",
    env: "Portal · Scientific",
    desc: "Analyzes samples and feeds test results directly into the vigilance pipeline in real time.",
    action: "Tests the retained sample and feeds the result back.",
    portal: "Laboratory portal",
    heading: "Sample S-114",
    rows: [
      ["Received", "Logged"],
      ["Analysis", "58%", "warn"],
      ["Result", "Out of spec", "bad"],
    ],
    chip: "Result auto-attached",
  },
  {
    id: "clinic",
    acc: "#2ee59d",
    name: "Clinic",
    short: "Syncs case records",
    time: "11:22",
    env: "Portal · Care",
    desc: "Receives the lab result on the patient's file and keeps the care record in step with the case.",
    action: "Syncs the patient record and plans the follow-up.",
    portal: "Clinic portal",
    heading: "Patient record",
    rows: [
      ["Case records", "Synced", "ok"],
      ["Follow-up", "Scheduled"],
      ["Outcome", "Recovering", "ok"],
    ],
    chip: "Records synced",
  },
  {
    id: "hospital",
    acc: "#ff5d7a",
    name: "Hospital",
    short: "Monitors dashboards",
    time: "11:25",
    env: "Portal · Care",
    desc: "Sees the whole case and its history on one dashboard, and decides on the safety response.",
    action: "Reviews the case and proposes quarantine of the lot.",
    portal: "Hospital dashboard",
    heading: "INC-0412 overview",
    rows: [
      ["Status", "Under review", "warn"],
      ["Lot C-88", "Quarantine proposed", "bad"],
      ["Reports linked", "5"],
    ],
    chip: "Dashboard updated",
  },
  {
    id: "vendor",
    acc: "#18b8ff",
    name: "Vendor",
    short: "Connects every environment",
    time: "Always on",
    env: "Portal · Scientific",
    desc: "Keeps every system talking to the platform, so a signal raised anywhere reaches everyone who needs it.",
    action: "Keeps the connectors running between all environments.",
    portal: "Vendor console",
    heading: "Connected systems",
    rows: [
      ["Connectors", "Active", "ok"],
      ["Sync", "Live", "ok"],
      ["Alerts", "Enabled", "ok"],
    ],
    chip: "Always connected",
  },
];
const N = ROLES.length;

/* inline stroke icons (24x24) */
const ICONS = {
  patient: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c.6-4 3.7-6 7.5-6s6.9 2 7.5 6" />
    </>
  ),
  physician: (
    <>
      <path d="M6 3v6a4 4 0 0 0 8 0V3" />
      <path d="M10 13v2a5 5 0 0 0 10 0v-1.5" />
      <circle cx="20" cy="12" r="2" />
    </>
  ),
  pharmacist: (
    <>
      <path d="M10.5 20.5l-7-7a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7z" />
      <path d="M8.5 8.5l7 7" />
    </>
  ),
  laboratory: (
    <>
      <path d="M9 3h6M10 3v6l-5.5 10a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
      <path d="M7.5 14h9" />
    </>
  ),
  clinic: (
    <>
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M12 10v6M9 13h6" />
    </>
  ),
  hospital: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M3 21h18" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </>
  ),
  vendor: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="19" r="2.2" />
      <circle cx="19" cy="19" r="2.2" />
      <path d="M12 7.2V12l-5.4 5.2M12 12l5.4 5.2" />
    </>
  ),
};
const Icon = ({ id, className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    {ICONS[id]}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Modern per-role illustrations (animated SVG, no external assets)   */
/* ------------------------------------------------------------------ */
const TEAL = "var(--acc)";
const BLUE = "#4d8bd6";
const AMBER = "#ffc24a";
const RED = "#ff6b7a";

const Check = ({ x, y, d = "0s" }) => (
  <path
    className="art-tick"
    style={{ "--d": d }}
    d={`M${x} ${y} l4.6 4.6 l8.6 -9.6`}
    fill="none"
    stroke={TEAL}
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    pathLength="20"
  />
);

const ART = {
  patient: (
    <svg viewBox="0 0 240 220" className="art" aria-hidden="true">
      <defs>
        <linearGradient id="ap-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15294d" />
          <stop offset="1" stopColor="#0a1530" />
        </linearGradient>
        <linearGradient id="ap-btn" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={TEAL} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <rect x="70" y="12" width="100" height="196" rx="22" fill="url(#ap-body)" stroke="rgba(255,255,255,.28)" strokeWidth="1.5" />
      <rect x="104" y="21" width="32" height="5" rx="2.5" fill="#263a58" />
      <rect x="84" y="40" width="54" height="8" rx="4" fill={TEAL} opacity=".9" />
      <circle cx="152" cy="44" r="5" fill="rgba(255,255,255,.2)" />
      {[62, 88, 114].map((y, i) => (
        <g key={y}>
          <rect x="84" y={y} width="72" height="20" rx="7" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.14)" />
          <rect x="92" y={y + 5} width="24" height="3.5" rx="1.75" fill="rgba(255,255,255,.28)" />
          <rect x="92" y={y + 11} width={[44, 52, 36][i]} height="4" rx="2" fill="#cfe2f3" opacity=".85" />
        </g>
      ))}
      <g className="art-pulse">
        <rect x="84" y="150" width="72" height="26" rx="13" fill="url(#ap-btn)" />
        <rect x="102" y="160" width="36" height="4.5" rx="2.25" fill="#04141a" opacity=".7" />
      </g>
      <g className="art-float">
        <rect x="0" y="40" width="64" height="24" rx="12" fill="#07101f" stroke="color-mix(in srgb, var(--acc) 55%, transparent)" />
        <circle cx="12" cy="52" r="3.3" fill={TEAL} />
        <text x="20" y="56" className="art-t" style={{ fontSize: 10 }} textLength="36" lengthAdjust="spacingAndGlyphs">{tr("Lot C-88")}</text>
      </g>
      <g className="art-pop">
        <circle cx="190" cy="150" r="17" fill="color-mix(in srgb, var(--acc) 14%, transparent)" stroke={TEAL} />
        <path d="M182 150.5l5.2 5.2 9.4-10.4" fill="none" stroke={TEAL} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  ),

  physician: (
    <svg viewBox="0 0 240 220" className="art" aria-hidden="true">
      <defs>
        <linearGradient id="ay-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15294d" />
          <stop offset="1" stopColor="#0a1530" />
        </linearGradient>
      </defs>
      <rect x="44" y="18" width="152" height="184" rx="18" fill="url(#ay-body)" stroke="rgba(255,255,255,.26)" strokeWidth="1.5" />
      <circle cx="70" cy="46" r="11" fill="rgba(77,139,214,.22)" stroke={BLUE} />
      <rect x="90" y="38" width="64" height="6" rx="3" fill="#cfe2f3" opacity=".85" />
      <rect x="90" y="50" width="40" height="4" rx="2" fill="rgba(255,255,255,.3)" />
      <rect x="58" y="72" width="124" height="66" rx="12" fill="color-mix(in srgb, var(--acc) 6%, transparent)" stroke="color-mix(in srgb, var(--acc) 28%, transparent)" />
      <path className="art-ecg" pathLength="100" d="M64 108 h22 l8 -26 l13 48 l10 -34 l6 10 h50" />
      <g className="art-float">
        <rect x="58" y="150" width="78" height="24" rx="12" fill="rgba(255,194,74,.12)" stroke="rgba(255,194,74,.65)" />
        <circle cx="70" cy="162" r="3.2" fill={AMBER} />
        <text x="78" y="166" className="art-t" style={{ fill: AMBER, fontSize: 10.5 }}>{tr("Moderate")}</text>
      </g>
      <rect x="142" y="150" width="40" height="24" rx="12" fill="color-mix(in srgb, var(--acc) 10%, transparent)" stroke="color-mix(in srgb, var(--acc) 50%, transparent)" />
      <text x="162" y="166" textAnchor="middle" className="art-t" style={{ fontSize: 10.5 }}>{tr("Sent")}</text>
      <rect x="58" y="184" width="124" height="5" rx="2.5" fill="rgba(255,255,255,.08)" />
      <rect x="58" y="184" width="124" height="5" rx="2.5" fill={TEAL} className="art-bar" />
    </svg>
  ),

  pharmacist: (
    <svg viewBox="0 0 240 220" className="art" aria-hidden="true">
      <defs>
        <linearGradient id="ar-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset="1" stopColor="#bcd3ea" stopOpacity=".75" />
        </linearGradient>
        <linearGradient id="ar-teal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="color-mix(in srgb, var(--acc) 70%, #fff)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--acc) 65%, #000)" />
        </linearGradient>
        <linearGradient id="ar-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd77a" />
          <stop offset="1" stopColor="#e08a1e" />
        </linearGradient>
        <linearGradient id="ar-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fb8ff" />
          <stop offset="1" stopColor="#3a63c9" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx="120" cy="112" r="40" className="art-ring" style={{ animationDelay: `${i * 0.9}s` }} />
      ))}
      <g className="art-float" style={{ animationDelay: "-1s" }}>
        <g transform="translate(120 112) rotate(-32)">
          <rect x="-50" y="-20" width="100" height="40" rx="20" fill="url(#ar-glass)" />
          <path d="M0 -20 h30 a20 20 0 0 1 0 40 h-30 z" fill="url(#ar-teal)" />
          <rect x="-40" y="-14" width="76" height="6" rx="3" fill="#fff" opacity=".45" />
        </g>
      </g>
      <g className="art-float" style={{ animationDelay: "-2.2s" }}>
        <g transform="translate(62 54) rotate(30) scale(.62)">
          <rect x="-50" y="-20" width="100" height="40" rx="20" fill="url(#ar-glass)" />
          <path d="M0 -20 h30 a20 20 0 0 1 0 40 h-30 z" fill="url(#ar-amber)" />
          <rect x="-40" y="-14" width="76" height="6" rx="3" fill="#fff" opacity=".45" />
        </g>
      </g>
      <g className="art-float" style={{ animationDelay: "-0.3s" }}>
        <g transform="translate(170 176) rotate(-14) scale(.56)">
          <rect x="-50" y="-20" width="100" height="40" rx="20" fill="url(#ar-glass)" />
          <path d="M0 -20 h30 a20 20 0 0 1 0 40 h-30 z" fill="url(#ar-blue)" />
          <rect x="-40" y="-14" width="76" height="6" rx="3" fill="#fff" opacity=".45" />
        </g>
      </g>
      <g className="art-pop">
        <circle cx="190" cy="50" r="17" fill="#2a1d05" stroke={AMBER} strokeWidth="1.6" />
        <text x="190" y="56" textAnchor="middle" className="art-n" style={{ fill: AMBER }}>3</text>
      </g>
      <g className="art-float" style={{ animationDelay: "-1.6s" }}>
        <rect x="10" y="150" width="82" height="26" rx="13" fill="#07101f" stroke="rgba(255,194,74,.55)" />
        <circle cx="25" cy="163" r="3.5" fill={AMBER} />
        <text x="35" y="167" className="art-t" style={{ fill: AMBER }}>{tr("Flagged")}</text>
      </g>
    </svg>
  ),

  laboratory: (
    <svg viewBox="0 0 240 220" className="art" aria-hidden="true">
      <defs>
        <clipPath id="al-clip">
          <path d="M104 26 H136 V82 L176 160 a15 15 0 0 1 -13 22 H77 a15 15 0 0 1 -13 -22 L104 82 Z" />
        </clipPath>
        <linearGradient id="al-liq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="color-mix(in srgb, var(--acc) 70%, #fff)" stopOpacity=".95" />
          <stop offset="1" stopColor="#0f8f9c" stopOpacity=".95" />
        </linearGradient>
      </defs>
      <path d="M104 26 H136 V82 L176 160 a15 15 0 0 1 -13 22 H77 a15 15 0 0 1 -13 -22 L104 82 Z" fill="rgba(255,255,255,.05)" />
      <g clipPath="url(#al-clip)">
        <g transform="translate(0 122)">
          <path className="art-wave art-wave-b" d="M-120 0 Q-90 -9 -60 0 T0 0 T60 0 T120 0 T180 0 T240 0 T300 0 T360 0 V100 H-120 Z" fill={TEAL} opacity=".35" />
          <path className="art-wave" d="M-120 0 Q-90 -9 -60 0 T0 0 T60 0 T120 0 T180 0 T240 0 T300 0 T360 0 V100 H-120 Z" fill="url(#al-liq)" />
        </g>
        <circle className="art-bubble" cx="104" cy="170" r="4" style={{ animationDelay: "0s" }} />
        <circle className="art-bubble" cx="124" cy="176" r="3" style={{ animationDelay: "-1.1s" }} />
        <circle className="art-bubble" cx="138" cy="166" r="5" style={{ animationDelay: "-2s" }} />
        <circle className="art-bubble" cx="116" cy="158" r="2.5" style={{ animationDelay: "-0.6s" }} />
        <rect x="76" y="100" width="12" height="90" rx="6" fill="#fff" opacity=".07" transform="rotate(-24 82 145)" />
      </g>
      <path d="M104 26 H136 V82 L176 160 a15 15 0 0 1 -13 22 H77 a15 15 0 0 1 -13 -22 L104 82 Z" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="96" y="20" width="48" height="8" rx="4" fill="#0b1a33" stroke="rgba(255,255,255,.55)" strokeWidth="2" />
      <g transform="translate(192 52)">
        <circle r="22" fill="rgba(5,11,23,.85)" />
        <circle r="18" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
        <circle r="18" fill="none" stroke={AMBER} strokeWidth="5" strokeLinecap="round" strokeDasharray="113.1" strokeDashoffset="47.5" transform="rotate(-90)" className="art-gauge" />
        <text y="4.5" textAnchor="middle" className="art-g">58%</text>
      </g>
      <g className="art-float">
        <rect x="6" y="40" width="72" height="24" rx="12" fill="#07101f" stroke="rgba(255,107,122,.6)" />
        <circle cx="20" cy="52" r="3.5" fill={RED} />
        <text x="30" y="56" className="art-t" style={{ fill: RED }}>S-114</text>
      </g>
    </svg>
  ),

  clinic: (
    <svg viewBox="0 0 240 220" className="art" aria-hidden="true">
      <defs>
        <linearGradient id="ac-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15294d" />
          <stop offset="1" stopColor="#0a1530" />
        </linearGradient>
      </defs>
      <rect x="40" y="22" width="160" height="170" rx="18" fill="url(#ac-body)" stroke="rgba(255,255,255,.26)" strokeWidth="1.5" />
      <rect x="54" y="36" width="30" height="30" rx="9" fill="color-mix(in srgb, var(--acc) 14%, transparent)" stroke="color-mix(in srgb, var(--acc) 60%, transparent)" />
      <path d="M69 44v14M62 51h14" stroke={TEAL} strokeWidth="2.6" strokeLinecap="round" />
      <rect x="94" y="40" width="70" height="6" rx="3" fill="#cfe2f3" opacity=".85" />
      <rect x="94" y="53" width="44" height="4" rx="2" fill="rgba(255,255,255,.3)" />
      {[84, 112, 140].map((y, i) => (
        <g key={y}>
          <rect x="54" y={y} width="132" height="22" rx="8" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)" />
          <circle cx="70" cy={y + 11} r="8" fill="color-mix(in srgb, var(--acc) 12%, transparent)" stroke="color-mix(in srgb, var(--acc) 50%, transparent)" />
          <Check x={65.4} y={y + 11.4} d={`${i * 0.45}s`} />
          <rect x="86" y={y + 6} width={[70, 58, 64][i]} height="4" rx="2" fill="#cfe2f3" opacity=".8" />
          <rect x="86" y={y + 13} width={[40, 34, 46][i]} height="3.5" rx="1.75" fill="rgba(255,255,255,.25)" />
        </g>
      ))}
      <g transform="translate(194 188)">
       <g className="art-pop">
        <circle r="20" fill="#07101f" stroke={TEAL} strokeWidth="1.6" />
        <g className="art-spin">
          <path d="M-8 -3 A9 9 0 0 1 8 -4 M8 -4 l0 -5 M8 -4 l-5 0.5" fill="none" stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 3 A9 9 0 0 1 -8 4 M-8 4 l0 5 M-8 4 l5 -0.5" fill="none" stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
       </g>
      </g>
    </svg>
  ),

  hospital: (
    <svg viewBox="0 0 240 220" className="art" aria-hidden="true">
      <defs>
        <linearGradient id="ah-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15294d" />
          <stop offset="1" stopColor="#0a1530" />
        </linearGradient>
        <linearGradient id="ah-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="color-mix(in srgb, var(--acc) 70%, #fff)" />
          <stop offset="1" stopColor="#0f8f9c" />
        </linearGradient>
        <linearGradient id="ah-bad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8d9a" />
          <stop offset="1" stopColor="#c43c52" />
        </linearGradient>
      </defs>
      <rect x="22" y="22" width="196" height="176" rx="18" fill="url(#ah-body)" stroke="rgba(255,255,255,.26)" strokeWidth="1.5" />
      <rect x="38" y="36" width="88" height="22" rx="11" fill="color-mix(in srgb, var(--acc) 8%, transparent)" stroke="color-mix(in srgb, var(--acc) 50%, transparent)" />
      <circle cx="52" cy="47" r="3.5" fill={TEAL} />
      <text x="62" y="51" className="art-t">INC-0412</text>
      <g transform="translate(190 50)">
        <circle r="15" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
        <circle r="15" fill="none" stroke={TEAL} strokeWidth="5" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="28" transform="rotate(-90)" />
      </g>
      <line x1="38" y1="172" x2="202" y2="172" stroke="rgba(255,255,255,.14)" />
      {[30, 46, 38, 60, 52, 74, 92].map((h, i) => (
        <rect
          key={i}
          className="art-hbar"
          style={{ animationDelay: `${i * 0.09}s` }}
          x={44 + i * 23}
          y={172 - h}
          width="15"
          height={h}
          rx="5"
          fill={i === 6 ? "url(#ah-bad)" : "url(#ah-bar)"}
        />
      ))}
      <polyline
        className="art-trend"
        pathLength="100"
        points={[30, 46, 38, 60, 52, 74, 92].map((h, i) => `${51.5 + i * 23},${160 - h}`).join(" ")}
        fill="none"
        stroke="#fff"
        strokeOpacity=".85"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),

  vendor: (() => {
    const sats = [-90, -18, 54, 126, 198].map((a) => {
      const r = (a * Math.PI) / 180;
      return [120 + Math.cos(r) * 76, 110 + Math.sin(r) * 76];
    });
    return (
      <svg viewBox="0 0 240 220" className="art" aria-hidden="true">
        <defs>
          <radialGradient id="av-core" cx=".5" cy=".4" r=".7">
            <stop offset="0" stopColor="#7ff7ea" />
            <stop offset="1" stopColor="#0b8c93" />
          </radialGradient>
        </defs>
        <circle className="art-orbit" cx="120" cy="110" r="52" fill="none" stroke="color-mix(in srgb, var(--acc) 30%, transparent)" strokeDasharray="2 7" />
        <circle className="art-orbit art-orbit-r" cx="120" cy="110" r="76" fill="none" stroke="rgba(255,255,255,.14)" strokeDasharray="1 8" />
        {sats.map(([x, y], i) => (
          <g key={i}>
            <line x1="120" y1="110" x2={x} y2={y} className="art-link" />
            <circle r="3.2" fill="#fff" className="art-dot">
              <animateMotion dur={`${2.2 + i * 0.25}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" path={`M120 110 L${x} ${y}`} />
            </circle>
          </g>
        ))}
        {sats.map(([x, y], i) => (
          <g key={`n${i}`} className="art-float" style={{ animationDelay: `${-i * 0.7}s` }}>
            <circle cx={x} cy={y} r="13" fill="#07101f" stroke="color-mix(in srgb, var(--acc) 70%, transparent)" strokeWidth="1.6" />
            <circle cx={x} cy={y} r="4" fill={TEAL} />
          </g>
        ))}
        <g className="art-pulse">
          <circle cx="120" cy="110" r="28" fill="url(#av-core)" />
          <circle cx="120" cy="110" r="28" fill="none" stroke="#fff" strokeOpacity=".35" />
          <circle cx="120" cy="103" r="3.6" fill="#04141a" />
          <circle cx="111" cy="118" r="3.6" fill="#04141a" />
          <circle cx="129" cy="118" r="3.6" fill="#04141a" />
          <path d="M120 103 L111 118 M120 103 L129 118 M111 118 H129" stroke="#04141a" strokeWidth="1.8" fill="none" />
        </g>
      </svg>
    );
  })(),
};

const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const T0 = toMin(ROLES[0].time);
function elapsedLabel(i) {
  const m = toMin(ROLES[i].time);
  if (m === null) return tr("Always on");
  const d = m - T0;
  if (d === 0) return "T + 0";
  const h = Math.floor(d / 60);
  const mm = d % 60;
  const hu = getLang() === "ar" ? "س" : "h";
  const mu = getLang() === "ar" ? "د" : "min";
  return h ? `T + ${h} ${hu} ${String(mm).padStart(2, "0")} ${mu}` : `T + ${mm} ${mu}`;
}

export default function StakeholderRelay() {
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const cardRef = useRef(null);
  const [seen, setSeen] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hold, setHold] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* keep the active node visible when the track scrolls sideways (mobile) */
  useEffect(() => {
    const tr = trackRef.current;
    if (!tr || tr.scrollWidth <= tr.clientWidth + 2) return;
    const node = tr.querySelectorAll(".st-node")[active];
    if (node) {
      tr.scrollTo({
        left: node.offsetLeft - tr.clientWidth / 2 + node.offsetWidth / 2,
        behavior: "smooth",
      });
    }
  }, [active]);

  const go = (i) => setActive(((i % N) + N) % N);
  const next = () => go(active + 1);
  const role = ROLES[active];
  const nextRole = ROLES[(active + 1) % N];
  const prevRole = active > 0 ? ROLES[active - 1] : null;
  const stepNo = String(active + 1).padStart(2, "0");
  const running = seen && playing && !hold;
  const pct = (active / (N - 1)) * 100;

  /* 3D tilt + spotlight on the card */
  const onCardMove = (e) => {
    const el = cardRef.current;
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.setProperty("--ry", `${(x - 0.5) * 7}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 5}deg`);
  };
  const onCardLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  };

  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      go(active + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      go(active - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(N - 1);
    }
  };

  const feed = ROLES.slice(Math.max(0, active - 2), active + 1);

  return (
    <section
      ref={rootRef}
      className={`st-root ${seen ? "is-seen" : ""}`}
      style={{ "--acc": role.acc }}
      aria-labelledby="st-title"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
    >
      <div className="st-aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="st-grid-bg" aria-hidden="true" />

      <div className="st-wrap">
        <header className="st-head">
          <p className="st-eyebrow">{tr(COPY.eyebrow)}</p>
          <h2 id="st-title" className="st-title">
            {tr(COPY.title)}
          </h2>
          <p className="st-sub">{tr(COPY.sub)}</p>
        </header>

        {/* case bar */}
        <div className="st-bar">
          <span className="st-following">
            <i aria-hidden="true" />
            {tr(COPY.following)}
          </span>
          <span className="st-elapsed">
            <small>{toMin(ROLES[active].time) === null ? tr(COPY.availability) : tr(COPY.elapsed)}</small>
            <b key={active}>{elapsedLabel(active)}</b>
          </span>
          <button
            type="button"
            className="st-play"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? tr(COPY.pause) : tr(COPY.play)}
            aria-pressed={playing}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14M16 5v14" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" />
              </svg>
            )}
          </button>
        </div>

        {/* relay track */}
        <div className="st-track-wrap">
          <div className="st-track" ref={trackRef} role="tablist" aria-label={tr("Roles following the case")} onKeyDown={onKey}>
            <div className="st-line" aria-hidden="true">
              <span className="st-line-fill" style={{ width: `${pct}%` }} />
              <span className="st-packet" style={{ left: `${pct}%` }} />
            </div>

            {ROLES.map((r, i) => {
              const state = i < active ? "is-done" : i === active ? "is-on" : "";
              return (
                <button
                  type="button"
                  key={r.id}
                  role="tab"
                  id={`st-tab-${r.id}`}
                  aria-selected={i === active}
                  aria-controls="st-panel"
                  tabIndex={i === active ? 0 : -1}
                  className={`st-node ${state}`}
                  style={{ "--i": i, "--nc": r.acc }}
                  onClick={() => go(i)}
                >
                  <span className="st-circle">
                    {i === active && (
                      <>
                        <span className="st-burst" key={`b-${active}`} aria-hidden="true">
                          <i />
                          <i />
                        </span>
                        <svg className="st-ring" viewBox="0 0 80 80" aria-hidden="true">
                          <circle cx="40" cy="40" r="37" className="st-ring-bg" />
                          <circle
                            key={active}
                            cx="40"
                            cy="40"
                            r="37"
                            className="st-ring-fg"
                            style={{
                              animationDuration: `${STEP_MS}ms`,
                              animationPlayState: running ? "running" : "paused",
                            }}
                            onAnimationEnd={() => {
                              if (running) next();
                            }}
                          />
                        </svg>
                      </>
                    )}
                    <Icon id={r.id} className="st-ico" />
                  </span>
                  <span className="st-name">{tr(r.name)}</span>
                  <span className="st-short">{tr(r.short)}</span>
                  <span className={`st-time ${r.time === "Always on" ? "is-always" : ""}`}>{tr(r.time)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* detail card */}
        <div
          className="st-card"
          ref={cardRef}
          role="tabpanel"
          id="st-panel"
          aria-labelledby={`st-tab-${role.id}`}
          onMouseMove={onCardMove}
          onMouseLeave={onCardLeave}
        >
          <span className="st-caret" style={{ left: `${((active + 0.5) / N) * 100}%` }} aria-hidden="true" />
          <span className="st-spot" aria-hidden="true" />
          <div className="st-card-l" key={`l-${role.id}`}>
            <span className="st-ghost" aria-hidden="true">{stepNo}</span>
            <div className="st-stepbar">
              <span className="st-stepno">
                {tr(COPY.step)} <b>{stepNo}</b> / {String(N).padStart(2, "0")}
              </span>
              <span className="st-segs" aria-hidden="true">
                {ROLES.map((r, i) => (
                  <i key={r.id} className={i <= active ? "is-lit" : ""} style={{ "--nc": r.acc }} />
                ))}
              </span>
            </div>
            <span className="st-env">{tr(role.env)}</span>
            <h3 className="st-role">{tr(role.name)}</h3>
            <p className="st-desc">{tr(role.desc)}</p>
            <div className="st-moment">
              <span className="st-moment-k">{tr(COPY.atMoment)}</span>
              <strong>{tr(role.action)}</strong>
            </div>
            <div className="st-relay">
              <span className="st-from" style={{ "--nc": prevRole ? prevRole.acc : role.acc }}>
                <small>{tr(COPY.receives)}</small>
                <b>{prevRole ? tr(prevRole.name) : tr(COPY.origin)}</b>
              </span>
              <span className="st-relay-arrow" aria-hidden="true" />
              <button type="button" className="st-hand" onClick={next} style={{ "--nc": nextRole.acc }}>
                <small>{active === N - 1 ? tr(COPY.last) : tr(COPY.handsOver)}</small>
                <b>{active === N - 1 ? ROLES[0].name : nextRole.name}</b>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          <div className="st-win-wrap">
            <div className="st-win" key={`w-${role.id}`}>
              <div className="st-win-bar">
                <span className="st-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="st-win-title">{tr(role.portal)}</span>
                <span className="st-win-tag">{tr(COPY.illustrative)}</span>
              </div>
              <div className="st-win-body">
                <h4>{tr(role.heading)}</h4>
                <div className="st-win-mid">
                  <div className="st-art" aria-hidden="true">
                    {ART[role.id]}
                  </div>
                  <dl className="st-rows">
                    {role.rows.map(([k, v, tone], n) => (
                      <div key={k} className={tone ? `is-${tone}` : ""} style={{ "--n": n }}>
                        <dt>{tr(k)}</dt>
                        <dd>{tr(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <span className="st-chip">
                  <i aria-hidden="true" />
                  {tr(role.chip)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* live handover feed */}
        <ol className="st-feed" aria-label={tr("Case history so far")}>
          {feed.map((r) => (
            <li key={r.id} className={r.id === role.id ? "is-now" : ""} style={{ "--nc": r.acc }}>
              <i aria-hidden="true" />
              <time>{tr(r.time)}</time>
              <b>{tr(r.name)}</b>
              <span>{tr(r.action)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
