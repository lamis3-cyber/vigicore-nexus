import React from 'react'

/* ────────────────────────────────────────────────────────────
   SHIELD MARK — the one VigiCore Nexus logo shield (navbar, footer,
   hero, login, about…). idPrefix keeps SVG def/id references unique
   when the mark is used more than once on a page.
   ──────────────────────────────────────────────────────────── */

// One heartbeat, repeated three times along the strip.
const ECG_SEGMENTS = [
  '60,168 63.5,168 65,165.5 66.5,168 68.5,168 70,161 72,175 73.5,168 75.5,168 77,164.5 78.5,168 80,168 81.5,165 83,168 85,168 87.5,168 90,168 93.5,168',
  '93.5,168 97,168 98.5,165.5 100,168 102,168 103.5,161 105.5,175 107,168 109,168 110.5,164.5 112,168 113.5,168 115,165 116.5,168 118.5,168 121,168 123.5,168 127,168',
  '127,168 130.5,168 132,165.5 133.5,168 135.5,168 137,161 139,175 140.5,168 142.5,168 144,164.5 145.5,168 147,168 148.5,165 150,168 152,168 154.5,168 157,168 160.5,168',
]

export default function ShieldMark({ idPrefix = 'sm', className = 'nav-logo-mark', width, height, showCenterText = true, centerText = 'VN', centerFontSize = 52 }) {
  const p = idPrefix
  return (
    <svg className={className} width={width} height={height} viewBox="0 0 210 245" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${p}-sg1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#001a2e"/>
          <stop offset="100%" stopColor="#000d1a"/>
        </linearGradient>
        <linearGradient id={`${p}-sg-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.9"/>
          <stop offset="50%" stopColor="#00ffc8" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#0a7aff" stopOpacity="0.8"/>
        </linearGradient>
        <filter id={`${p}-shield-glow`}>
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feComposite in="SourceGraphic" in2="b" operator="over"/>
        </filter>
        <clipPath id={`${p}-shield-clip`}>
          <path d="M105,8 L195,42 L195,118 Q195,182 105,232 Q15,182 15,118 L15,42 Z"/>
        </clipPath>
        <linearGradient id={`${p}-ecg-grad`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#00ffcc" stopOpacity="0"/>
          <stop offset="20%"  stopColor="#00ffcc" stopOpacity="0.9"/>
          <stop offset="55%"  stopColor="#00f0ff"/>
          <stop offset="80%"  stopColor="#38c8ff" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#38c8ff" stopOpacity="0"/>
        </linearGradient>
        <clipPath id={`${p}-ecg-clip`}>
          <rect x="60" y="148" width="80" height="30"/>
        </clipPath>
      </defs>

      <path d="M105,4 L200,40 L200,120 Q200,188 105,238 Q10,188 10,120 L10,40 Z" fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="4"/>

      <path d="M105,8 L196,43 L196,119 Q196,183 105,233 Q14,183 14,119 L14,43 Z" fill="none" stroke={`url(#${p}-sg-edge)`} strokeWidth="1.8" filter={`url(#${p}-shield-glow)`}/>

      <path d="M105,18 L186,50 L186,120 Q186,176 105,222 Q24,176 24,120 L24,50 Z" fill="none" stroke="rgba(0,229,255,0.22)" strokeWidth="1.2"/>

      <path d="M105,30 L174,58 L174,120 Q174,168 105,210 Q36,168 36,120 L36,58 Z" fill="none" stroke="rgba(0,229,255,0.14)" strokeWidth="1"/>

      <path d="M105,8 L195,42 L195,118 Q195,182 105,232 Q15,182 15,118 L15,42 Z" fill={`url(#${p}-sg1)`} opacity="0.95"/>

      <line x1="105" y1="30" x2="105" y2="210" stroke="rgba(0,229,255,0.07)" strokeWidth="1"/>
      <line x1="40" y1="80" x2="170" y2="80" stroke="rgba(0,229,255,0.07)" strokeWidth="1"/>
      <line x1="30" y1="120" x2="180" y2="120" stroke="rgba(0,229,255,0.05)" strokeWidth="1"/>

      <path d="M50,55 L50,70 M50,55 L62,55" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M160,55 L160,70 M160,55 L148,55" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>

      <g clipPath={`url(#${p}-shield-clip)`} opacity="0.06">
        <path d="M58,78 L70,72 L82,78 L82,90 L70,96 L58,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
        <path d="M82,78 L94,72 L106,78 L106,90 L94,96 L82,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
        <path d="M106,78 L118,72 L130,78 L130,90 L118,96 L106,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
        <path d="M130,78 L142,72 L154,78 L154,90 L142,96 L130,90 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
        <path d="M70,96 L82,90 L94,96 L94,108 L82,114 L70,108 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
        <path d="M94,96 L106,90 L118,96 L118,108 L106,114 L94,108 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
        <path d="M118,96 L130,90 L142,96 L142,108 L130,114 L118,108 Z" fill="none" stroke="#00e5ff" strokeWidth="0.8"/>
      </g>

      {showCenterText && (
        <text x="105" y="130" textAnchor="middle" dominantBaseline="middle" fontFamily="'Rajdhani', sans-serif" fontSize={centerFontSize} fontWeight="700" fill="rgba(0,229,255,0.75)" letterSpacing="2">{centerText}</text>
      )}

      <g clipPath={`url(#${p}-ecg-clip)`}>
        {[
          { stroke: 'rgba(0,255,210,0.22)', strokeWidth: 5.5, pulse: 'ecgBloomPulse' },
          { stroke: `url(#${p}-ecg-grad)`, strokeWidth: 1.7, pulse: 'ecgBrightPulse' },
        ].map(({ stroke, strokeWidth, pulse }) => (
          <g key={pulse} style={{ animation: 'ecgScroll 2.4s linear infinite' }}>
            {ECG_SEGMENTS.map((points) => (
              <polyline key={points} points={points} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ animation: `${pulse} 2.4s linear infinite` }} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  )
}
