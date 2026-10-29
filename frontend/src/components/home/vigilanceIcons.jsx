import React from 'react'

// Brand icons for the five vigilance modules (moved verbatim from the old Hero tab bar).
// Each is rendered exactly ONCE on the page: the SVG gradient/filter ids inside are global.

export const ReactoIcon = React.memo(function ReactoIcon() {
  return (
<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="gr-rack-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a0810" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#0e0206" stopOpacity="1"/>
              </linearGradient>
              <linearGradient id="gr-rack-edge" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ff8098"/>
                <stop offset="50%" stopColor="#ff3a5e"/>
                <stop offset="100%" stopColor="#ff6a86"/>
              </linearGradient>
              <linearGradient id="gr-tube-glass" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,180,195,0.10)"/>
                <stop offset="50%" stopColor="rgba(255,220,225,0.22)"/>
                <stop offset="100%" stopColor="rgba(255,150,170,0.08)"/>
              </linearGradient>
              <linearGradient id="gr-liquid-a" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(210,110,255,0.85)"/>
                <stop offset="100%" stopColor="rgba(140,30,210,0.95)"/>
              </linearGradient>
              <linearGradient id="gr-liquid-b" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,150,90,0.85)"/>
                <stop offset="100%" stopColor="rgba(230,80,30,0.95)"/>
              </linearGradient>
              <linearGradient id="gr-liquid-warn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,210,90,0.9)"/>
                <stop offset="100%" stopColor="rgba(255,60,90,0.95)"/>
              </linearGradient>
              <radialGradient id="gr-glow-ring" cx="50%" cy="50%" r="50%">
                <stop offset="65%" stopColor="rgba(255,60,90,0)"/>
                <stop offset="85%" stopColor="rgba(255,60,90,0.22)"/>
                <stop offset="100%" stopColor="rgba(255,60,90,0)"/>
              </radialGradient>
              <filter id="gr-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gr-glow-md" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gr-bloom" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <clipPath id="gr-tube1-clip"><rect x="16" y="30" width="8" height="26" rx="4"/></clipPath>
              <clipPath id="gr-tube2-clip"><rect x="32" y="24" width="8" height="32" rx="4"/></clipPath>
              <clipPath id="gr-tube3-clip"><rect x="48" y="20" width="8" height="36" rx="4"/></clipPath>
            </defs>
            <ellipse cx="36" cy="61" rx="27" ry="6" fill="rgba(255,60,90,0.10)" filter="url(#gr-bloom)"/>
            <circle cx="36" cy="34" r="30" fill="url(#gr-glow-ring)" opacity="0.55"/>
            <circle cx="36" cy="34" r="25" fill="none" stroke="rgba(255,60,90,0.06)" strokeWidth="0.6" strokeDasharray="3,5"/>
            <rect x="10" y="56" width="52" height="5" rx="2.4" fill="url(#gr-rack-body)" stroke="url(#gr-rack-edge)" strokeWidth="1.2" filter="url(#gr-glow)"/>
            <rect x="11" y="56.4" width="50" height="1.4" rx="0.7" fill="rgba(255,140,160,0.18)"/>
            <rect x="10" y="49" width="52" height="4" rx="2" fill="url(#gr-rack-body)" stroke="url(#gr-rack-edge)" strokeWidth="1" filter="url(#gr-glow)" opacity="0.9"/>
            <g id="reacto-tube1">
              <rect x="16" y="30" width="8" height="26" rx="4" fill="rgba(10,2,5,0.55)" stroke="rgba(255,120,145,0.55)" strokeWidth="1" filter="url(#gr-glow)"/>
              <rect x="16.5" y="38" width="7" height="17.4" rx="3.4" fill="url(#gr-liquid-a)" clipPath="url(#gr-tube1-clip)"/>
              <path d="M16.5,38 Q20,36.4 23.5,38" stroke="rgba(220,160,255,0.7)" strokeWidth="0.9" fill="none"/>
              <rect x="17.2" y="32" width="1.6" height="20" rx="0.8" fill="url(#gr-tube-glass)"/>
            </g>
            <g id="reacto-tube2">
              <rect x="32" y="24" width="8" height="32" rx="4" fill="rgba(10,2,5,0.55)" stroke="rgba(255,120,145,0.55)" strokeWidth="1" filter="url(#gr-glow)"/>
              <rect x="32.5" y="34" width="7" height="21.4" rx="3.4" fill="url(#gr-liquid-b)" clipPath="url(#gr-tube2-clip)"/>
              <path d="M32.5,34 Q36,32.4 39.5,34" stroke="rgba(255,200,170,0.7)" strokeWidth="0.9" fill="none"/>
              <rect x="33.2" y="26" width="1.6" height="26" rx="0.8" fill="url(#gr-tube-glass)"/>
            </g>
            <g id="reacto-tube3">
              <rect x="48" y="20" width="8" height="36" rx="4" fill="rgba(10,2,5,0.55)" stroke="rgba(255,180,90,0.7)" strokeWidth="1.1" filter="url(#gr-glow-md)"/>
              <rect x="48.5" y="27" width="7" height="26.4" rx="3.4" fill="url(#gr-liquid-warn)" clipPath="url(#gr-tube3-clip)" style={{'animation':'screenGlowPulse 2.5s ease-in-out infinite'}}/>
              <path d="M48.5,27 Q52,25.4 55.5,27" stroke="rgba(255,225,150,0.85)" strokeWidth="1" fill="none"/>
              <rect x="49.2" y="22" width="1.6" height="30" rx="0.8" fill="url(#gr-tube-glass)"/>
              <circle cx="52" cy="14" r="2.1" fill="#ffc23c" filter="url(#gr-glow)" style={{'animation':'ecgStatusDot 2.4s linear infinite'}}/>
              <path d="M52,10.4 L50.7,13.6 L53.3,13.6 Z" fill="none" stroke="rgba(255,196,60,0.9)" strokeWidth="0.7" strokeLinejoin="round"/>
            </g>
            <path d="M4,50 A32,32 0 0,1 12,58" stroke="rgba(255,90,120,0.25)" strokeWidth="0.8" fill="none" strokeDasharray="2,3"/>
            <path d="M64,50 A32,32 0 0,0 57,42" stroke="rgba(255,90,120,0.2)" strokeWidth="0.8" fill="none" strokeDasharray="2,3"/>
            <circle cx="6" cy="20" r="0.9" fill="rgba(255,90,120,0.6)" filter="url(#gr-glow)"/>
            <circle cx="63" cy="30" r="0.8" fill="rgba(255,90,120,0.5)" filter="url(#gr-glow)"/>
            <circle cx="60" cy="16" r="0.6" fill="rgba(255,90,120,0.4)"/>
            <circle cx="8" cy="12" r="0.7" fill="rgba(255,150,90,0.45)"/>
          </svg>
  )
})

export const MaterioIcon = React.memo(function MaterioIcon() {
  return (
<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" style={{'overflow':'hidden'}}>
            <defs>
              <linearGradient id="gm-body" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#0d2a4a" stopOpacity="0.97"/>
                <stop offset="100%" stopColor="#020d1e" stopOpacity="1"/>
              </linearGradient>
              <linearGradient id="gm-frame" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60d8ff"/>
                <stop offset="40%" stopColor="#00e8ff"/>
                <stop offset="100%" stopColor="#00b4ff"/>
              </linearGradient>
              <linearGradient id="gm-screen" x1="0" y1="0" x2="0.1" y2="1">
                <stop offset="0%" stopColor="#071830" stopOpacity="0.98"/>
                <stop offset="100%" stopColor="#020810" stopOpacity="1"/>
              </linearGradient>
              <linearGradient id="gm-shine-l" x1="0" y1="0" x2="0.5" y2="1">
                <stop offset="0%" stopColor="rgba(160,240,255,0.28)"/>
                <stop offset="60%" stopColor="rgba(0,180,255,0.06)"/>
                <stop offset="100%" stopColor="rgba(0,100,200,0)"/>
              </linearGradient>
              <linearGradient id="gm-ecg-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00ffcc" stopOpacity="0"/>
                <stop offset="20%" stopColor="#00ffcc" stopOpacity="0.9"/>
                <stop offset="55%" stopColor="#00f0ff"/>
                <stop offset="80%" stopColor="#38c8ff" stopOpacity="0.9"/>
                <stop offset="100%" stopColor="#38c8ff" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="gm-syringe-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1a5080" stopOpacity="0.9"/>
                <stop offset="100%" stopColor="#0a2040" stopOpacity="0.95"/>
              </linearGradient>
              <linearGradient id="gm-iv-body" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0a2038"/>
                <stop offset="100%" stopColor="#0d2840"/>
              </linearGradient>
              <radialGradient id="gm-screen-glow" cx="50%" cy="60%" r="55%">
                <stop offset="0%" stopColor="rgba(0,220,255,0.10)"/>
                <stop offset="100%" stopColor="rgba(0,100,200,0)"/>
              </radialGradient>
              <radialGradient id="gm-hud-ring" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stopColor="rgba(0,232,255,0)"/>
                <stop offset="85%" stopColor="rgba(0,232,255,0.18)"/>
                <stop offset="100%" stopColor="rgba(0,232,255,0)"/>
              </radialGradient>
              <filter id="gm-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.4" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gm-glow-soft" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="2.8" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gm-bloom">
                <feGaussianBlur stdDeviation="3.5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <clipPath id="gm-screen-clip">
                <rect x="11.5" y="10" width="35" height="22" rx="1.5"/>
              </clipPath>
              <clipPath id="gm-monitor-clip">
                <rect x="8" y="7" width="42" height="28" rx="3"/>
              </clipPath>
            </defs>
            <ellipse cx="30" cy="42" rx="28" ry="10" fill="rgba(0,160,255,0.09)" filter="url(#gm-bloom)"/>
            <circle cx="30" cy="26" r="30" fill="url(#gm-hud-ring)" opacity="0.6"/>
            <circle cx="30" cy="26" r="24" fill="none" stroke="rgba(0,232,255,0.07)" strokeWidth="0.6" strokeDasharray="3,5"/>
            <circle cx="30" cy="26" r="30" fill="none" stroke="rgba(0,200,255,0.05)" strokeWidth="0.5" strokeDasharray="2,8"/>
            <rect x="10" y="9" width="42" height="30" rx="3.5" fill="rgba(0,10,25,0.8)"/>
            <rect x="8" y="7" width="42" height="30" rx="3.5" fill="url(#gm-body)" stroke="url(#gm-frame)" strokeWidth="1.3" filter="url(#gm-glow)"/>
            <path d="M11.5,7 Q8,7 8,10.5 L8,11 Q8,7.5 11.5,7.5 L49.5,7.5 Q50,7.5 50,8 L50,7 Q50,7 49.5,7 Z" fill="rgba(120,220,255,0.15)"/>
            <rect x="11.5" y="10" width="35" height="22" rx="1.5" fill="url(#gm-screen)"/>
            <rect x="11.5" y="10" width="35" height="22" rx="1.5" fill="url(#gm-screen-glow)" style={{'animation':'screenGlowPulse 2.5s ease-in-out infinite'}}/>
            <path d="M13,11 Q19,10 25,10.5 L25,16 Q19,15.5 13,16.5 Z" fill="url(#gm-shine-l)" clipPath="url(#gm-screen-clip)"/>
            <g clipPath="url(#gm-screen-clip)" opacity="0.12">
              <line x1="11.5" y1="17" x2="46.5" y2="17" stroke="#00e8ff" strokeWidth="0.5"/>
              <line x1="11.5" y1="23" x2="46.5" y2="23" stroke="#00e8ff" strokeWidth="0.5"/>
              <line x1="20" y1="10" x2="20" y2="32" stroke="#00e8ff" strokeWidth="0.5"/>
              <line x1="29" y1="10" x2="29" y2="32" stroke="#00e8ff" strokeWidth="0.5"/>
              <line x1="38" y1="10" x2="38" y2="32" stroke="#00e8ff" strokeWidth="0.5"/>
            </g>
            
            <foreignObject x="11.5" y="10" width="35" height="22">
              <canvas id="ecg-canvas-monitor" xmlns="http://www.w3.org/1999/xhtml"
                style={{'width':'35px','height':'22px','display':'block'}}></canvas>
            </foreignObject>
            <circle cx="44" cy="12" r="2" fill="#00ffaa" filter="url(#gm-glow)" style={{'animation':'ecgStatusDot 2.4s linear infinite'}}/>
            <circle cx="44" cy="12" r="3.5" fill="none" stroke="rgba(0,255,160,0.25)" strokeWidth="0.7" style={{'animation':'ecgStatusDot 2.4s linear infinite','animationDelay':'0.10s'}}/>
            <rect x="13" y="26" width="8" height="1.2" rx="0.6" fill="rgba(0,220,255,0.35)"/>
            <rect x="23" y="26" width="5" height="1.2" rx="0.6" fill="rgba(0,220,255,0.25)"/>
            <rect x="30" y="26" width="10" height="1.2" rx="0.6" fill="rgba(0,220,255,0.2)"/>
            <path d="M10,10 L10,8 L13,8" stroke="rgba(0,232,255,0.7)" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
            <path d="M50,10 L50,8 L47,8" stroke="rgba(0,232,255,0.7)" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
            <path d="M10,34 L10,37 L13,37" stroke="rgba(0,232,255,0.4)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
            <path d="M50,34 L50,37 L47,37" stroke="rgba(0,232,255,0.4)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
            <rect x="27" y="37" width="7" height="6" rx="1.2" fill="#040e20" stroke="rgba(0,180,255,0.3)" strokeWidth="0.8"/>
            <rect x="27.5" y="37" width="3" height="6" rx="1" fill="rgba(0,100,180,0.12)"/>
            <rect x="18" y="43" width="22" height="3.5" rx="2" fill="#04101e" stroke="url(#gm-frame)" strokeWidth="0.9" filter="url(#gm-glow)"/>
            <rect x="19" y="43.3" width="14" height="1.2" rx="0.8" fill="rgba(0,200,255,0.12)"/>
            <g transform="translate(50, 11) rotate(-35) scale(0.88)">
              <rect x="-2.5" y="0" width="5" height="14" rx="1.2" fill="url(#gm-syringe-body)" stroke="rgba(0,200,255,0.7)" strokeWidth="0.7" filter="url(#gm-glow)"/>
              <line x1="0" y1="-1" x2="0" y2="1" stroke="rgba(0,200,255,0.9)" strokeWidth="1.2" strokeLinecap="round"/>
              <rect x="-3.5" y="-2" width="7" height="2" rx="1" fill="rgba(0,180,255,0.55)" stroke="rgba(0,232,255,0.6)" strokeWidth="0.5"/>
              <rect x="-1.8" y="4" width="3.6" height="7" rx="0.8" fill="rgba(0,220,255,0.35)"/>
              <line x1="0" y1="14" x2="0" y2="19" stroke="rgba(140,220,255,0.85)" strokeWidth="0.9" strokeLinecap="round"/>
              <circle cx="0" cy="20" r="0.7" fill="rgba(0,255,200,0.7)" filter="url(#gm-glow)"/>
              <rect x="-2" y="1" width="1.2" height="11" rx="0.6" fill="rgba(160,240,255,0.2)"/>
            </g>
            <g transform="translate(53, 38) scale(0.88)">
              <path d="M-6,-10 Q-8,-12 -6,-14 L6,-14 Q8,-12 6,-10 L4,2 Q4,5 0,5 Q-4,5 -4,2 Z" fill="url(#gm-iv-body)" stroke="rgba(0,180,255,0.55)" strokeWidth="0.8" filter="url(#gm-glow)"/>
              <path d="M-4.5,-6 Q-5,-8 -4,-9.5 L4,-9.5 Q5,-8 4.5,-6 L3,2 Q3,4 0,4 Q-3,4 -3,2 Z" fill="rgba(0,200,255,0.22)"/>
              <path d="M-5,-12 Q-4,-13 -2.5,-12.5 L-2.5,-7 Q-4,-7.5 -5,-9 Z" fill="rgba(160,240,255,0.18)"/>
              <path d="M0,-14 L0,-17" stroke="rgba(0,200,255,0.6)" strokeWidth="0.9" strokeLinecap="round"/>
              <circle cx="0" cy="-18" r="1.2" fill="none" stroke="rgba(0,200,255,0.5)" strokeWidth="0.7"/>
              <line x1="0" y1="5" x2="0" y2="10" stroke="rgba(0,180,255,0.45)" strokeWidth="0.8" strokeLinecap="round"/>
              <ellipse cx="0" cy="11.5" rx="0.8" ry="1.1" fill="rgba(0,232,255,0.65)" filter="url(#gm-glow)"/>
            </g>
            <path d="M4,52 A30,30 0 0,1 12,58" stroke="rgba(0,200,255,0.25)" strokeWidth="0.8" fill="none" strokeDasharray="2,3"/>
            <path d="M56,52 A30,30 0 0,0 63,44" stroke="rgba(0,200,255,0.2)" strokeWidth="0.8" fill="none" strokeDasharray="2,3"/>
            <circle cx="6" cy="20" r="0.9" fill="rgba(0,232,255,0.6)" filter="url(#gm-glow)"/>
            <circle cx="4" cy="32" r="0.7" fill="rgba(0,200,255,0.45)"/>
            <circle cx="63" cy="28" r="0.8" fill="rgba(0,220,255,0.5)" filter="url(#gm-glow)"/>
            <circle cx="60" cy="18" r="0.6" fill="rgba(0,232,255,0.4)"/>
            <circle cx="5" cy="44" r="0.7" fill="rgba(0,200,255,0.35)"/>
          </svg>
  )
})

export const PharmacoIcon = React.memo(function PharmacoIcon() {
  return (
<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="gp2-bottle-body" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#050f07"/>
                <stop offset="40%" stopColor="#071409"/>
                <stop offset="100%" stopColor="#020805"/>
              </linearGradient>
              <linearGradient id="gp2-bottle-edge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60ffb0"/>
                <stop offset="40%" stopColor="#00ffa0"/>
                <stop offset="100%" stopColor="#20f870"/>
              </linearGradient>
              <linearGradient id="gp2-shine-l" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(220,255,235,0.55)"/>
                <stop offset="50%" stopColor="rgba(80,255,160,0.12)"/>
                <stop offset="100%" stopColor="rgba(0,200,100,0)"/>
              </linearGradient>
              <linearGradient id="gp2-shine-r" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(0,200,100,0)"/>
                <stop offset="100%" stopColor="rgba(100,255,180,0.18)"/>
              </linearGradient>
              <linearGradient id="gp2-liquid" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="rgba(80,255,150,0.6)"/>
                <stop offset="60%" stopColor="rgba(20,220,100,0.75)"/>
                <stop offset="100%" stopColor="rgba(0,160,70,0.85)"/>
              </linearGradient>
              <radialGradient id="gp2-liquid-glow" cx="30%" cy="20%" r="70%">
                <stop offset="0%" stopColor="rgba(120,255,180,0.5)"/>
                <stop offset="100%" stopColor="rgba(0,180,80,0)"/>
              </radialGradient>
              <linearGradient id="gp2-cap" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0%" stopColor="#50ffb0"/>
                <stop offset="50%" stopColor="#00e880"/>
                <stop offset="100%" stopColor="#00c060"/>
              </linearGradient>
              <linearGradient id="gp2-pill-dark" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#041209"/>
                <stop offset="100%" stopColor="#071a0e"/>
              </linearGradient>
              <linearGradient id="gp2-pill-bright" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#30ff90"/>
                <stop offset="100%" stopColor="#00ffc0"/>
              </linearGradient>
              <linearGradient id="gp2-pill-shine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(220,255,240,0.5)"/>
                <stop offset="100%" stopColor="rgba(0,200,100,0)"/>
              </linearGradient>
              <linearGradient id="gp2-bond" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(80,255,140,0.9)"/>
                <stop offset="100%" stopColor="rgba(0,255,160,0.35)"/>
              </linearGradient>
              <linearGradient id="gp2-ring" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(0,255,140,0)"/>
                <stop offset="25%" stopColor="rgba(60,255,150,0.8)"/>
                <stop offset="50%" stopColor="rgba(0,255,180,1)"/>
                <stop offset="75%" stopColor="rgba(60,255,150,0.8)"/>
                <stop offset="100%" stopColor="rgba(0,255,140,0)"/>
              </linearGradient>
              <radialGradient id="gp2-atom" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(160,255,200,1)"/>
                <stop offset="50%" stopColor="rgba(0,255,140,0.7)"/>
                <stop offset="100%" stopColor="rgba(0,200,100,0)"/>
              </radialGradient>
              <filter id="gp2-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.2" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gp2-glow-md" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gp2-bloom" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gp2-bloom-lg" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="8" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <clipPath id="gp2-bottle-clip">
                <path d="M18,20 Q17,23 16,27 L16,58 Q16,63 21,63 L33,63 Q38,63 38,58 L38,27 Q37,23 36,20 Z"/>
              </clipPath>
              <clipPath id="gp2-pill-clip">
                <rect x="40" y="42" width="28" height="13" rx="6.5"/>
              </clipPath>
            </defs>
            <ellipse cx="36" cy="64" rx="28" ry="5" fill="rgba(0,255,140,0.12)" filter="url(#gp2-bloom)"/>
            <ellipse cx="36" cy="64" rx="26" ry="4" fill="none" stroke="rgba(0,255,140,0.22)" strokeWidth="1.5"/>
            <ellipse cx="36" cy="64" rx="20" ry="3" fill="none" stroke="url(#gp2-ring)" strokeWidth="1.2" filter="url(#gp2-glow)"/>
            <ellipse cx="36" cy="64" rx="18" ry="2.5" fill="rgba(0,255,140,0.07)"/>
            <path d="M18,64 Q28,61 36,64 Q44,67 54,64" fill="none" stroke="rgba(60,255,150,0.35)" strokeWidth="0.7" strokeDasharray="2,3"/>
            <line x1="10" y1="64" x2="12" y2="64" stroke="rgba(0,255,140,0.5)" strokeWidth="0.8" filter="url(#gp2-glow)"/>
            <line x1="60" y1="64" x2="62" y2="64" stroke="rgba(0,255,140,0.5)" strokeWidth="0.8" filter="url(#gp2-glow)"/>
            <line x1="36" y1="59" x2="36" y2="61" stroke="rgba(0,255,140,0.5)" strokeWidth="0.8" filter="url(#gp2-glow)"/>
            <g id="pharma-bottle-group">
              <ellipse cx="27" cy="64.5" rx="10" ry="2" fill="rgba(0,0,0,0.5)"/>
              <path d="M36,21 Q37.5,24 38.5,28 L38.5,59 Q38.5,64 34,64 L35,64 Q39.5,64 39.5,59 L39.5,28 Q38.5,24 37,21 Z" fill="rgba(0,0,0,0.35)"/>
              <path d="M18,20 Q17,23 16,27 L16,58 Q16,63 21,63 L33,63 Q38,63 38,58 L38,27 Q37,23 36,20 Z" fill="url(#gp2-bottle-body)" stroke="url(#gp2-bottle-edge)" strokeWidth="1.4" filter="url(#gp2-glow)"/>
              <path d="M18,20 Q17,23 16,27 L16,58 Q16,63 21,63 L33,63 Q38,63 38,58 L38,27 Q37,23 36,20 Z" fill="rgba(0,255,140,0.04)"/>
              <path d="M16.5,43 L37.5,43 L37.5,58 Q37.5,62.5 33,62.5 L21,62.5 Q16.5,62.5 16.5,58 Z" fill="url(#gp2-liquid)" clipPath="url(#gp2-bottle-clip)" opacity="0.9"/>
              <path d="M16.5,43 L37.5,43 L37.5,58 Q37.5,62.5 33,62.5 L21,62.5 Q16.5,62.5 16.5,58 Z" fill="url(#gp2-liquid-glow)" clipPath="url(#gp2-bottle-clip)"/>
              <path d="M16.8,43 Q19,40.5 23,42.5 Q27,44.5 31,42 Q35,39.5 37.8,43" stroke="rgba(120,255,180,0.9)" strokeWidth="1.3" fill="none" strokeLinecap="round" filter="url(#gp2-glow)"/>
              <path d="M16.8,43 Q19,40.5 23,42.5 Q27,44.5 31,42 Q35,39.5 37.8,43" stroke="rgba(80,255,160,0.35)" strokeWidth="3.5" fill="none" strokeLinecap="round" filter="url(#gp2-glow-md)"/>
              <line x1="20" y1="46" x2="24" y2="46" stroke="rgba(160,255,200,0.25)" strokeWidth="0.6" strokeLinecap="round"/>
              <line x1="21" y1="50" x2="26" y2="50" stroke="rgba(120,255,170,0.18)" strokeWidth="0.5" strokeLinecap="round"/>
              <path d="M18,24 Q19.5,21 22,20.5 L22,52 Q19.5,51.5 18,48 Z" fill="url(#gp2-shine-l)" clipPath="url(#gp2-bottle-clip)" opacity="0.9"/>
              <path d="M19.5,26 Q20,23 21,22 L21,40 Q20,40 19.5,38 Z" fill="rgba(255,255,255,0.12)" clipPath="url(#gp2-bottle-clip)"/>
              <path d="M35.5,22 Q37,25 37.5,30 L37.5,55 Q36.5,55 36,50 Q35,35 35.5,22 Z" fill="url(#gp2-shine-r)" clipPath="url(#gp2-bottle-clip)"/>
              <path d="M23,44 Q27,41 31,44 L31,60 Q27,61.5 23,60 Z" fill="rgba(0,255,140,0.04)" clipPath="url(#gp2-bottle-clip)"/>
              <rect x="18" y="29" width="19" height="11" rx="2.5" fill="rgba(0,255,100,0.04)" stroke="rgba(0,255,120,0.28)" strokeWidth="0.8"/>
              <line x1="20.5" y1="33" x2="35" y2="33" stroke="rgba(80,255,160,0.30)" strokeWidth="0.65"/>
              <line x1="20.5" y1="36" x2="32" y2="36" stroke="rgba(80,255,160,0.20)" strokeWidth="0.55"/>
              <rect x="26" y="22" width="2" height="6" rx="0.8" fill="rgba(0,255,140,0.75)" filter="url(#gp2-glow)"/>
              <rect x="24.2" y="24.2" width="5.5" height="1.8" rx="0.8" fill="rgba(0,255,140,0.75)" filter="url(#gp2-glow)"/>
              <rect x="22" y="13" width="10" height="8" rx="2.5" fill="url(#gp2-bottle-body)" stroke="url(#gp2-bottle-edge)" strokeWidth="1.1" filter="url(#gp2-glow)"/>
              <rect x="23" y="14" width="3" height="6" rx="1.2" fill="rgba(180,255,220,0.22)"/>
              <rect x="21" y="7.5" width="13.5" height="6" rx="3" fill="rgba(0,0,0,0.3)"/>
              <rect x="20" y="6" width="14" height="6" rx="3" fill="url(#gp2-cap)" stroke="rgba(120,255,180,0.8)" strokeWidth="0.9" filter="url(#gp2-glow)"/>
              <rect x="21" y="6.2" width="8" height="1.6" rx="0.8" fill="rgba(230,255,245,0.55)"/>
              <path d="M31,6.5 Q33,7 33,9 Q32,9.5 31.5,8.5 Z" fill="rgba(180,255,220,0.25)"/>
            </g>
            <ellipse cx="54" cy="57" rx="9" ry="2" fill="rgba(0,0,0,0.4)" transform="rotate(-8 54 57)"/>
            <ellipse cx="54" cy="49.5" rx="16" ry="9" fill="rgba(0,255,140,0.08)" filter="url(#gp2-bloom)"/>
            <rect x="39" y="41" width="30" height="14" rx="7" fill="none" stroke="rgba(0,255,140,0.20)" strokeWidth="2.8" filter="url(#gp2-glow-md)" transform="rotate(-8 54 48)"/>
            <path d="M54,42 L47,42 Q40,42 40,48.5 Q40,55 47,55 L54,55 Z" fill="url(#gp2-pill-dark)" transform="rotate(-8 54 48.5)"/>
            <path d="M54,42 L61,42 Q68,42 68,48.5 Q68,55 61,55 L54,55 Z" fill="url(#gp2-pill-bright)" transform="rotate(-8 54 48.5)" filter="url(#gp2-glow)"/>
            <rect x="40" y="42" width="28" height="13" rx="6.5" fill="none" stroke="rgba(60,255,160,0.9)" strokeWidth="1.5" filter="url(#gp2-glow)" transform="rotate(-8 54 48.5)"/>
            <line x1="54" y1="42" x2="54" y2="55" stroke="rgba(100,255,180,0.6)" strokeWidth="1.1" strokeDasharray="2,1.5" transform="rotate(-8 54 48.5)"/>
            <path d="M42,43.5 Q47,41 53,42.5 L53,46 Q47,44.5 42,46 Z" fill="url(#gp2-pill-shine)" clipPath="url(#gp2-pill-clip)" transform="rotate(-8 54 48.5)" opacity="0.5"/>
            <path d="M55,42.5 Q61,41.5 66,43.5 L66,47 Q61,45 55,46 Z" fill="rgba(220,255,240,0.35)" clipPath="url(#gp2-pill-clip)" transform="rotate(-8 54 48.5)"/>
            <path d="M65,43 Q67.5,46 67.5,50 L66.5,50 Q66.5,46 64.5,43 Z" fill="rgba(180,255,220,0.18)" clipPath="url(#gp2-pill-clip)" transform="rotate(-8 54 48.5)"/>
            <circle cx="57" cy="16" r="4" fill="url(#gp2-atom)" filter="url(#gp2-glow)"/>
            <circle cx="57" cy="16" r="6" fill="none" stroke="rgba(0,255,140,0.35)" strokeWidth="0.9" filter="url(#gp2-glow)"/>
            <circle cx="57" cy="16" r="8" fill="none" stroke="rgba(0,255,140,0.12)" strokeWidth="0.7"/>
            <circle cx="57" cy="16" r="2" fill="rgba(220,255,230,0.9)" filter="url(#gp2-glow)"/>
            <circle cx="67" cy="8" r="2.5" fill="rgba(40,255,140,0.8)" filter="url(#gp2-glow)"/>
            <circle cx="67" cy="8" r="4" fill="none" stroke="rgba(0,255,140,0.25)" strokeWidth="0.7"/>
            <circle cx="67" cy="8" r="1.2" fill="rgba(200,255,225,0.9)"/>
            <circle cx="70" cy="22" r="2" fill="rgba(60,255,150,0.75)" filter="url(#gp2-glow)"/>
            <circle cx="70" cy="22" r="3.2" fill="none" stroke="rgba(0,255,140,0.20)" strokeWidth="0.6"/>
            <circle cx="70" cy="22" r="0.9" fill="rgba(220,255,235,0.9)"/>
            <circle cx="46" cy="7" r="1.8" fill="rgba(80,255,160,0.7)" filter="url(#gp2-glow)"/>
            <circle cx="46" cy="7" r="2.8" fill="none" stroke="rgba(0,255,140,0.22)" strokeWidth="0.6"/>
            <line x1="57" y1="16" x2="67" y2="8" stroke="url(#gp2-bond)" strokeWidth="1.5" filter="url(#gp2-glow)"/>
            <line x1="57" y1="16" x2="70" y2="22" stroke="url(#gp2-bond)" strokeWidth="1.3" filter="url(#gp2-glow)"/>
            <line x1="57" y1="16" x2="46" y2="7" stroke="rgba(60,255,150,0.5)" strokeWidth="1.1" filter="url(#gp2-glow)"/>
            <line x1="67" y1="8" x2="70" y2="22" stroke="rgba(40,255,140,0.5)" strokeWidth="0.9" opacity="0.7"/>
            <line x1="57" y1="16" x2="67" y2="8" stroke="rgba(0,255,140,0.20)" strokeWidth="4" filter="url(#gp2-glow-md)"/>
            <line x1="57" y1="16" x2="70" y2="22" stroke="rgba(0,255,140,0.16)" strokeWidth="3.5" filter="url(#gp2-glow-md)"/>
            <ellipse cx="57" cy="16" rx="12" ry="5" fill="none" stroke="rgba(0,255,140,0.18)" strokeWidth="0.7" transform="rotate(30 57 16)"/>
            <circle cx="65" cy="13" r="1.2" fill="rgba(0,255,160,0.9)" filter="url(#gp2-glow)"/>
            <circle cx="7" cy="14" r="1.4" fill="rgba(0,255,140,0.7)" filter="url(#gp2-glow)"/>
            <circle cx="5" cy="24" r="1.0" fill="rgba(60,255,150,0.55)" filter="url(#gp2-glow)"/>
            <circle cx="8" cy="35" r="1.2" fill="rgba(0,255,140,0.5)"/>
            <circle cx="6" cy="47" r="0.9" fill="rgba(40,255,130,0.45)" filter="url(#gp2-glow)"/>
            <circle cx="9" cy="56" r="0.8" fill="rgba(0,255,140,0.4)"/>
            <circle cx="9" cy="68" r="1.1" fill="rgba(0,255,140,0.55)" filter="url(#gp2-glow)"/>
            <circle cx="64" cy="35" r="1.0" fill="rgba(60,255,150,0.5)" filter="url(#gp2-glow)"/>
            <circle cx="66" cy="60" r="0.9" fill="rgba(0,255,140,0.45)"/>
            <g transform="translate(12, 10)" opacity="0.8" filter="url(#gp2-glow)">
              <line x1="0" y1="-2.8" x2="0" y2="2.8" stroke="rgba(100,255,170,0.9)" strokeWidth="0.7"/>
              <line x1="-2.8" y1="0" x2="2.8" y2="0" stroke="rgba(100,255,170,0.9)" strokeWidth="0.7"/>
              <line x1="-2" y1="-2" x2="2" y2="2" stroke="rgba(60,255,150,0.5)" strokeWidth="0.5"/>
              <line x1="2" y1="-2" x2="-2" y2="2" stroke="rgba(60,255,150,0.5)" strokeWidth="0.5"/>
            </g>
            <g transform="translate(65, 52)" opacity="0.6" filter="url(#gp2-glow)">
              <line x1="0" y1="-2.2" x2="0" y2="2.2" stroke="rgba(80,255,160,0.8)" strokeWidth="0.6"/>
              <line x1="-2.2" y1="0" x2="2.2" y2="0" stroke="rgba(80,255,160,0.8)" strokeWidth="0.6"/>
            </g>
            <ellipse cx="27" cy="65" rx="11" ry="2.2" fill="rgba(0,255,140,0.20)" filter="url(#gp2-glow-md)"/>
            <ellipse cx="54" cy="65" rx="8" ry="1.6" fill="rgba(0,255,140,0.14)" filter="url(#gp2-glow-md)"/>
          </svg>
  )
})

export const ChemoIcon = React.memo(function ChemoIcon() {
  return (
<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" style={{'overflow':'hidden'}}>
            <defs>
              <linearGradient id="gc-body" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#1a0a30" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#06020f" stopOpacity="1"/>
              </linearGradient>
              <linearGradient id="gc-edge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d080ff"/>
                <stop offset="40%" stopColor="#c060ff"/>
                <stop offset="100%" stopColor="#8020e0"/>
              </linearGradient>
              <linearGradient id="gc-neck-shine" x1="0" y1="0" x2="0.7" y2="1">
                <stop offset="0%" stopColor="rgba(230,170,255,0.38)"/>
                <stop offset="100%" stopColor="rgba(150,50,220,0)"/>
              </linearGradient>
              <linearGradient id="gc-liquid-base" x1="0" y1="0" x2="0.2" y2="1">
                <stop offset="0%" stopColor="#b040ff" stopOpacity="0.85"/>
                <stop offset="100%" stopColor="#6018d0" stopOpacity="0.95"/>
              </linearGradient>
              <linearGradient id="gc-liquid-hot" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(220,90,255,0.75)"/>
                <stop offset="50%" stopColor="rgba(255,90,210,0.42)"/>
                <stop offset="100%" stopColor="rgba(200,70,255,0.65)"/>
              </linearGradient>
              <radialGradient id="gc-liquid-core" cx="35%" cy="40%" r="60%">
                <stop offset="0%" stopColor="rgba(240,140,255,0.60)"/>
                <stop offset="100%" stopColor="rgba(120,30,210,0)"/>
              </radialGradient>
              <radialGradient id="gc-body-glow" cx="30%" cy="40%" r="55%">
                <stop offset="0%" stopColor="rgba(190,90,255,0.22)"/>
                <stop offset="100%" stopColor="rgba(100,20,200,0)"/>
              </radialGradient>
              <radialGradient id="gc-warn-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,200,80,0.9)"/>
                <stop offset="60%" stopColor="rgba(255,140,30,0.5)"/>
                <stop offset="100%" stopColor="rgba(200,80,0,0)"/>
              </radialGradient>
              <linearGradient id="gc-shine" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0%" stopColor="rgba(235,175,255,0.40)"/>
                <stop offset="65%" stopColor="rgba(160,60,255,0.08)"/>
                <stop offset="100%" stopColor="rgba(100,0,200,0)"/>
              </linearGradient>
              <filter id="gc-glow">
                <feGaussianBlur stdDeviation="1.6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gc-glow-soft">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gc-bloom">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gc-warn-filter">
                <feGaussianBlur stdDeviation="2" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <clipPath id="gc-flask-clip">
                <path d="M30,6 L30,24 L14,50 Q10,57 15,61 L57,61 Q62,57 58,50 L42,24 L42,6 Z"/>
              </clipPath>
              <radialGradient id="gc-bubble" cx="38%" cy="32%" r="62%">
                <stop offset="0%"   stopColor="rgba(255,210,255,0.98)"/>
                <stop offset="28%"  stopColor="rgba(230,140,255,0.90)"/>
                <stop offset="65%"  stopColor="rgba(185,70,255,0.72)"/>
                <stop offset="100%" stopColor="rgba(140,30,220,0.20)"/>
              </radialGradient>
              <radialGradient id="gc-bubble-trail" cx="50%" cy="60%" r="50%">
                <stop offset="0%"   stopColor="rgba(200,80,255,0.55)"/>
                <stop offset="100%" stopColor="rgba(160,40,255,0)"/>
              </radialGradient>
              <filter id="gc-bubble-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="1.8" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gc-bubble-bg" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="1.0" result="blur"/>
                <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.65 0" result="faded"/>
                <feMerge><feMergeNode in="faded"/></feMerge>
              </filter>
              <radialGradient id="gc-inner-particle" cx="35%" cy="30%" r="65%">
                <stop offset="0%"   stopColor="rgba(255,220,255,0.95)"/>
                <stop offset="40%"  stopColor="rgba(220,100,255,0.75)"/>
                <stop offset="100%" stopColor="rgba(170,50,255,0.10)"/>
              </radialGradient>
            </defs>
            <ellipse cx="36" cy="60" rx="24" ry="10" fill="rgba(200,70,255,0.42)" filter="url(#gc-bloom)"/>
            <ellipse cx="36" cy="45" rx="17" ry="14" fill="rgba(210,80,255,0.28)" filter="url(#gc-glow-soft)"/>
            <rect x="32" y="7" width="12" height="19" rx="3" fill="rgba(0,0,0,0.5)"/>
            <rect x="30" y="5" width="12" height="20" rx="3.5" fill="url(#gc-body)" stroke="url(#gc-edge)" strokeWidth="1.3" filter="url(#gc-glow)"/>
            <rect x="31.5" y="6.5" width="4" height="17" rx="2" fill="url(#gc-neck-shine)" opacity="0.9"/>
            <rect x="30" y="16" width="12" height="9" rx="1.5" fill="rgba(160,60,255,0.12)"/>
            <line x1="28" y1="5" x2="44" y2="5" stroke="url(#gc-edge)" strokeWidth="2.2" strokeLinecap="round" filter="url(#gc-glow)"/>
            <line x1="29" y1="5" x2="37" y2="5" stroke="rgba(230,180,255,0.55)" strokeWidth="1" strokeLinecap="round"/>
            <path d="M32,24 L15,50 Q11,57 16,62 L58,62 Q63,57 57,50 L40,24 Z" fill="rgba(0,0,0,0.4)"/>
            <path d="M30,23 L13,50 Q9,57 14,62 L58,62 Q63,57 59,50 L42,23 Z" fill="url(#gc-body)" stroke="url(#gc-edge)" strokeWidth="1.4" strokeLinejoin="round" filter="url(#gc-glow)"/>
            <path d="M30,23 L13,50 Q9,57 14,62 L58,62 Q63,57 59,50 L42,23 Z" fill="url(#gc-body-glow)"/>
            <path d="M16,42 Q22,39 28,41 Q34,43 40,40 Q47,37 56,41 L57,63 Q36,65 15,63 Z" fill="url(#gc-liquid-base)" clipPath="url(#gc-flask-clip)" style={{'animation':'gcSurface 2.8s ease-in-out infinite','animationFillMode':'both'}}/>
            <path d="M16,42 Q22,39 28,41 Q34,43 40,40 Q47,37 56,41 L57,63 Q36,65 15,63 Z" fill="url(#gc-liquid-hot)" clipPath="url(#gc-flask-clip)" style={{'animation':'gcSurface 2.8s ease-in-out infinite','animationFillMode':'both'}}/>
            <path d="M16,42 Q22,39 28,41 Q34,43 40,40 Q47,37 56,41 L57,63 Q36,65 15,63 Z" fill="url(#gc-liquid-core)" clipPath="url(#gc-flask-clip)" style={{'animation':'gcLiquidGlow 2.2s 0.4s ease-in-out infinite'}}/>
            <g clipPath="url(#gc-flask-clip)">
              <g transform="translate(21,62)" style={{'animation':'gcBubbleH 3.2s 0.3s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <circle cx="0" cy="0" r="2.4" fill="url(#gc-bubble)" stroke="rgba(200,120,255,0.52)" strokeWidth="0.6" filter="url(#gc-bubble-bg)" opacity="0.60"/>
                <ellipse cx="-0.65" cy="-0.82" rx="0.68" ry="0.52" fill="rgba(255,255,255,0.55)"/>
              </g>
              <g transform="translate(46,62)" style={{'animation':'gcBubbleK 3.5s 1.9s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <circle cx="0" cy="0" r="2.6" fill="url(#gc-bubble)" stroke="rgba(200,120,255,0.48)" strokeWidth="0.6" filter="url(#gc-bubble-bg)" opacity="0.56"/>
                <ellipse cx="-0.72" cy="-0.90" rx="0.76" ry="0.58" fill="rgba(255,255,255,0.50)"/>
              </g>
              <g transform="translate(26,62)" style={{'animation':'gcBubbleA 2.2s 0s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="2" rx="4.5" ry="6" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="2.8" fill="url(#gc-bubble)" stroke="rgba(230,160,255,0.96)" strokeWidth="0.9" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.80" cy="-1.0" rx="0.88" ry="0.68" fill="rgba(255,255,255,0.97)"/>
                <ellipse cx="0.55" cy="-0.45" rx="0.36" ry="0.28" fill="rgba(255,240,255,0.70)"/>
              </g>
              <g transform="translate(49,62)" style={{'animation':'gcBubbleB 2.6s 0.7s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="1.6" rx="3.4" ry="4.5" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="2.0" fill="url(#gc-bubble)" stroke="rgba(228,158,255,0.94)" strokeWidth="0.8" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.58" cy="-0.72" rx="0.64" ry="0.49" fill="rgba(255,255,255,0.96)"/>
                <ellipse cx="0.40" cy="-0.32" rx="0.26" ry="0.20" fill="rgba(255,240,255,0.65)"/>
              </g>
              <g transform="translate(36,62)" style={{'animation':'gcBubbleF 2.4s 1.1s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="1.5" rx="3.2" ry="4.2" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="1.9" fill="url(#gc-bubble)" stroke="rgba(232,162,255,0.94)" strokeWidth="0.75" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.54" cy="-0.68" rx="0.60" ry="0.46" fill="rgba(255,255,255,0.96)"/>
                <ellipse cx="0.36" cy="-0.30" rx="0.24" ry="0.18" fill="rgba(255,240,255,0.62)"/>
              </g>
              <g transform="translate(31,62)" style={{'animation':'gcBubbleC 2.8s 1.6s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="1.3" rx="2.8" ry="3.8" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="1.7" fill="url(#gc-bubble)" stroke="rgba(230,160,255,0.92)" strokeWidth="0.70" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.48" cy="-0.60" rx="0.54" ry="0.41" fill="rgba(255,255,255,0.95)"/>
              </g>
              <g transform="translate(42,62)" style={{'animation':'gcBubbleG 1.8s 0.35s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="0.8" rx="1.4" ry="2.0" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="0.8" fill="url(#gc-bubble)" stroke="rgba(234,165,255,0.90)" strokeWidth="0.45" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.22" cy="-0.28" rx="0.24" ry="0.18" fill="rgba(255,255,255,0.94)"/>
              </g>
              <g transform="translate(19,62)" style={{'animation':'gcBubbleD 3.0s 2.1s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="1.1" rx="2.2" ry="3.0" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="1.3" fill="url(#gc-bubble)" stroke="rgba(228,158,255,0.90)" strokeWidth="0.60" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.37" cy="-0.46" rx="0.42" ry="0.32" fill="rgba(255,255,255,0.94)"/>
              </g>
              <g transform="translate(43,62)" style={{'animation':'gcBubbleE 2.0s 2.7s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="0.9" rx="1.8" ry="2.5" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="1.1" fill="url(#gc-bubble)" stroke="rgba(226,156,255,0.88)" strokeWidth="0.55" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.32" cy="-0.40" rx="0.36" ry="0.27" fill="rgba(255,255,255,0.92)"/>
              </g>
              <g transform="translate(38,62)" style={{'animation':'gcBubbleI 1.9s 0.9s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="0.7" rx="1.2" ry="1.7" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="0.7" fill="url(#gc-bubble)" stroke="rgba(230,160,255,0.88)" strokeWidth="0.40" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.19" cy="-0.24" rx="0.20" ry="0.15" fill="rgba(255,255,255,0.92)"/>
              </g>
              <g transform="translate(52,62)" style={{'animation':'gcBubbleJ 2.5s 1.4s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <ellipse cx="0" cy="1.0" rx="2.0" ry="2.8" fill="url(#gc-bubble-trail)" filter="url(#gc-glow-soft)"/>
                <circle cx="0" cy="0" r="1.2" fill="url(#gc-bubble)" stroke="rgba(228,158,255,0.88)" strokeWidth="0.55" filter="url(#gc-bubble-glow)"/>
                <ellipse cx="-0.34" cy="-0.43" rx="0.38" ry="0.29" fill="rgba(255,255,255,0.93)"/>
              </g>
              <g transform="translate(27,50)" style={{'animation':'gcInnerFloat1 2.2s 0s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <circle cx="0" cy="0" r="1.1" fill="url(#gc-inner-particle)" filter="url(#gc-glow)"/>
              </g>
              <g transform="translate(41,53)" style={{'animation':'gcInnerFloat2 2.7s 0.5s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <circle cx="0" cy="0" r="0.85" fill="url(#gc-inner-particle)" filter="url(#gc-glow)"/>
              </g>
              <g transform="translate(50,47)" style={{'animation':'gcInnerFloat3 2.0s 0.9s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <circle cx="0" cy="0" r="0.70" fill="url(#gc-inner-particle)" filter="url(#gc-glow)"/>
              </g>
              <g transform="translate(34,56)" style={{'animation':'gcInnerFloat1 2.5s 1.3s ease-in-out infinite','transformOrigin':'0px 0px','transformBox':'fill-box'}}>
                <circle cx="0" cy="0" r="0.60" fill="url(#gc-inner-particle)"/>
              </g>
            </g>
            <path d="M15,40 Q19,33 27,41 Q22,46 15,48 Z" fill="url(#gc-shine)" clipPath="url(#gc-flask-clip)"/>
            <path d="M52,42 Q55,38 57,45 L55,47 Q53,43 52,42 Z" fill="rgba(200,160,255,0.12)" clipPath="url(#gc-flask-clip)"/>
            <ellipse cx="36" cy="38" rx="10" ry="5" fill="none" stroke="rgba(190,80,255,0.32)" strokeWidth="0.9" transform="rotate(-25 36 38)" clipPath="url(#gc-flask-clip)" filter="url(#gc-glow)"/>
            <ellipse cx="36" cy="38" rx="10" ry="5" fill="none" stroke="rgba(200,100,255,0.22)" strokeWidth="0.9" transform="rotate(40 36 38)" clipPath="url(#gc-flask-clip)"/>
            <circle cx="36" cy="38" r="2.2" fill="rgba(220,140,255,0.7)" filter="url(#gc-glow)"/>
            <circle cx="36" cy="38" r="3.5" fill="none" stroke="rgba(200,80,255,0.3)" strokeWidth="0.6"/>
            <g transform="translate(58, 10)" filter="url(#gc-warn-filter)">
              <path d="M0,-7 L7,6 L-7,6 Z" fill="rgba(255,160,40,0.15)" stroke="rgba(255,180,60,0.85)" strokeWidth="1.2" strokeLinejoin="round"/>
              <line x1="0" y1="-2.5" x2="0" y2="2.5" stroke="rgba(255,200,80,0.95)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="0" cy="4.2" r="0.9" fill="rgba(255,200,80,0.95)"/>
            </g>
            <circle cx="58" cy="10" r="10" fill="rgba(255,160,40,0.06)" filter="url(#gc-bloom)"/>
            <circle cx="7" cy="30" r="0.9" fill="rgba(180,80,255,0.6)" filter="url(#gc-glow)"/>
            <circle cx="5" cy="44" r="0.7" fill="rgba(160,60,255,0.45)"/>
            <circle cx="67" cy="42" r="0.8" fill="rgba(200,100,255,0.5)" filter="url(#gc-glow)"/>
            <circle cx="65" cy="30" r="0.6" fill="rgba(190,80,255,0.4)"/>
            <circle cx="9" cy="18" r="0.7" fill="rgba(180,80,255,0.4)"/>
          </svg>
  )
})

export const CosmetoIcon = React.memo(function CosmetoIcon() {
  return (
<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" style={{'overflow':'hidden'}}>
            <defs>
              <linearGradient id="gcv2-body" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#180b02"/>
                <stop offset="50%" stopColor="#0e0600"/>
                <stop offset="100%" stopColor="#070300"/>
              </linearGradient>
              <linearGradient id="gcv2-edge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffe080"/>
                <stop offset="40%" stopColor="#ff9a28"/>
                <stop offset="100%" stopColor="#d06000"/>
              </linearGradient>
              <linearGradient id="gcv2-shine-l" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(255,235,190,0.55)"/>
                <stop offset="45%" stopColor="rgba(255,170,80,0.12)"/>
                <stop offset="100%" stopColor="rgba(220,100,0,0)"/>
              </linearGradient>
              <linearGradient id="gcv2-shine-r" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(200,80,0,0)"/>
                <stop offset="100%" stopColor="rgba(255,200,100,0.18)"/>
              </linearGradient>
              <linearGradient id="gcv2-serum" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="rgba(255,200,80,0.7)"/>
                <stop offset="50%" stopColor="rgba(255,140,40,0.85)"/>
                <stop offset="100%" stopColor="rgba(200,80,10,0.95)"/>
              </linearGradient>
              <radialGradient id="gcv2-serum-glow" cx="30%" cy="20%" r="70%">
                <stop offset="0%" stopColor="rgba(255,220,120,0.6)"/>
                <stop offset="100%" stopColor="rgba(220,100,0,0)"/>
              </radialGradient>
              <linearGradient id="gcv2-dropper" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a0c00"/>
                <stop offset="100%" stopColor="#0a0500"/>
              </linearGradient>
              <radialGradient id="gcv2-bulb" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#2a1200"/>
                <stop offset="100%" stopColor="#100600"/>
              </radialGradient>
              <radialGradient id="gcv2-drop" cx="40%" cy="30%" r="60%">
                <stop offset="0%" stopColor="rgba(255,230,140,0.95)"/>
                <stop offset="60%" stopColor="rgba(255,160,40,0.7)"/>
                <stop offset="100%" stopColor="rgba(200,80,0,0.2)"/>
              </radialGradient>
              <linearGradient id="gcv2-neck" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d06800"/>
                <stop offset="100%" stopColor="#ffb040"/>
              </linearGradient>
              <linearGradient id="gcv2-ring" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,160,40,0)"/>
                <stop offset="25%" stopColor="rgba(255,180,60,0.85)"/>
                <stop offset="50%" stopColor="rgba(255,220,100,1)"/>
                <stop offset="75%" stopColor="rgba(255,180,60,0.85)"/>
                <stop offset="100%" stopColor="rgba(255,160,40,0)"/>
              </linearGradient>
              <radialGradient id="gcv2-scene" cx="35%" cy="55%" r="65%">
                <stop offset="0%" stopColor="rgba(255,160,40,0.15)"/>
                <stop offset="100%" stopColor="rgba(200,80,0,0)"/>
              </radialGradient>
              <radialGradient id="gcv2-particle" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,230,120,0.95)"/>
                <stop offset="100%" stopColor="rgba(255,120,20,0)"/>
              </radialGradient>
              <radialGradient id="gcv2-vol" cx="50%" cy="0%" r="80%">
                <stop offset="0%" stopColor="rgba(255,180,60,0.09)"/>
                <stop offset="100%" stopColor="rgba(200,80,0,0)"/>
              </radialGradient>
              <linearGradient id="gcv2-pip-body" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1c0c00"/>
                <stop offset="40%" stopColor="#0d0500"/>
                <stop offset="100%" stopColor="#180900"/>
              </linearGradient>
              <radialGradient id="gcv2-pip-drop" cx="38%" cy="28%" r="62%">
                <stop offset="0%" stopColor="rgba(255,240,160,0.98)"/>
                <stop offset="35%" stopColor="rgba(255,180,60,0.85)"/>
                <stop offset="70%" stopColor="rgba(80,220,255,0.55)"/>
                <stop offset="100%" stopColor="rgba(0,160,220,0.10)"/>
              </radialGradient>
              <filter id="gcv2-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.2" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gcv2-glow-md" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.8" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gcv2-bloom" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="gcv2-bloom-lg" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="8" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <radialGradient id="face-bg" cx="50%" cy="42%" r="65%">
                <stop offset="0%" stopColor="transparent"/>
                <stop offset="60%" stopColor="transparent"/>
                <stop offset="100%" stopColor="transparent"/>
              </radialGradient>
              <radialGradient id="face-faceBase" cx="28%" cy="22%" r="72%">
                <stop offset="0%" stopColor="#ffffff"/>
                <stop offset="5%" stopColor="#d0f8ff"/>
                <stop offset="15%" stopColor="#7adeff"/>
                <stop offset="30%" stopColor="#30a8f0"/>
                <stop offset="50%" stopColor="#1468c8"/>
                <stop offset="72%" stopColor="#063878"/>
                <stop offset="100%" stopColor="#020e2e"/>
              </radialGradient>
              <radialGradient id="face-shadowR" cx="90%" cy="58%" r="62%">
                <stop offset="0%" stopColor="#000820" stopOpacity="0.45"/>
                <stop offset="35%" stopColor="#000820" stopOpacity="0.35"/>
                <stop offset="62%" stopColor="#000820" stopOpacity="0.20"/>
                <stop offset="85%" stopColor="#000000" stopOpacity="0.06"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <linearGradient id="face-shadowSide" x1="55%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#000000" stopOpacity="0"/>
                <stop offset="55%" stopColor="#001020" stopOpacity="0.28"/>
                <stop offset="80%" stopColor="#001428" stopOpacity="0.52"/>
                <stop offset="100%" stopColor="#001428" stopOpacity="0.65"/>
              </linearGradient>
              <radialGradient id="face-foreHead" cx="34%" cy="6%" r="42%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1.0"/>
                <stop offset="18%" stopColor="#c0f8ff" stopOpacity="0.88"/>
                <stop offset="42%" stopColor="#40d8ff" stopOpacity="0.45"/>
                <stop offset="75%" stopColor="#10a0e0" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-cheekL" cx="18%" cy="46%" r="26%">
                <stop offset="0%" stopColor="#aafcff" stopOpacity="0.95"/>
                <stop offset="28%" stopColor="#40d8f8" stopOpacity="0.55"/>
                <stop offset="65%" stopColor="#10a0d0" stopOpacity="0.18"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-rimL" cx="0%" cy="50%" r="58%">
                <stop offset="0%" stopColor="#00ffff" stopOpacity="1.0"/>
                <stop offset="22%" stopColor="#00f0ff" stopOpacity="0.75"/>
                <stop offset="55%" stopColor="#00c8f0" stopOpacity="0.32"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-crownLight" cx="36%" cy="0%" r="68%">
                <stop offset="0%" stopColor="#e8ffff" stopOpacity="1.0"/>
                <stop offset="20%" stopColor="#80f0ff" stopOpacity="0.82"/>
                <stop offset="48%" stopColor="#20c0f0" stopOpacity="0.40"/>
                <stop offset="78%" stopColor="#0870bb" stopOpacity="0.14"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-chinShad" cx="50%" cy="100%" r="58%">
                <stop offset="0%" stopColor="#001020" stopOpacity="0.55"/>
                <stop offset="48%" stopColor="#001020" stopOpacity="0.22"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-lidGrad" cx="32%" cy="26%" r="72%">
                <stop offset="0%" stopColor="#84e2f8"/>
                <stop offset="45%" stopColor="#2272b8"/>
                <stop offset="100%" stopColor="#051a32"/>
              </radialGradient>
              <radialGradient id="face-lipGrad" cx="30%" cy="24%" r="74%">
                <stop offset="0%" stopColor="#62caf2"/>
                <stop offset="40%" stopColor="#125aa2"/>
                <stop offset="100%" stopColor="#040e28"/>
              </radialGradient>
              <radialGradient id="face-earL" cx="68%" cy="34%" r="68%">
                <stop offset="0%" stopColor="#52caf0"/>
                <stop offset="36%" stopColor="#1262aa"/>
                <stop offset="80%" stopColor="#041838"/>
                <stop offset="100%" stopColor="#010610"/>
              </radialGradient>
              <radialGradient id="face-groundG" cx="50%" cy="0%" r="82%">
                <stop offset="0%" stopColor="#006888" stopOpacity="0.55"/>
                <stop offset="55%" stopColor="#003848" stopOpacity="0.22"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-ambientBg" cx="38%" cy="35%" r="52%">
                <stop offset="0%" stopColor="#00ccee" stopOpacity="0.32"/>
                <stop offset="55%" stopColor="#004466" stopOpacity="0.08"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-absorbA" cx="68%" cy="46%" r="72%">
                <stop offset="0%"   stopColor="#ff8c20" stopOpacity="1.0"/>
                <stop offset="18%"  stopColor="#ff6a10" stopOpacity="0.82"/>
                <stop offset="42%"  stopColor="#e84800" stopOpacity="0.45"/>
                <stop offset="68%"  stopColor="#c03000" stopOpacity="0.16"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-absorbB" cx="62%" cy="56%" r="68%">
                <stop offset="0%"   stopColor="#ff8020" stopOpacity="1.0"/>
                <stop offset="18%"  stopColor="#ff5e0e" stopOpacity="0.76"/>
                <stop offset="42%"  stopColor="#e04000" stopOpacity="0.40"/>
                <stop offset="68%"  stopColor="#b02800" stopOpacity="0.14"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="face-absorbC" cx="58%" cy="68%" r="62%">
                <stop offset="0%"   stopColor="#ff7818" stopOpacity="1.0"/>
                <stop offset="18%"  stopColor="#ff540c" stopOpacity="0.68"/>
                <stop offset="42%"  stopColor="#d83800" stopOpacity="0.34"/>
                <stop offset="68%"  stopColor="#a02000" stopOpacity="0.11"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0"/>
              </radialGradient>
              <clipPath id="gcv2-bottle-clip">
                <rect x="15" y="22" width="26" height="43" rx="7"/>
              </clipPath>
              <clipPath id="gcv2-dropper-clip">
                <rect x="57" y="6" width="9" height="30" rx="4"/>
              </clipPath>
              <clipPath id="gcv2-face-round-clip">
                <rect x="7" y="5" width="58" height="58" rx="5"/>
              </clipPath>
              <filter id="face-enhance" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
                <feComponentTransfer result="bright">
                  <feFuncR type="linear" slope="2.3" intercept="0.06"/>
                  <feFuncG type="linear" slope="2.6" intercept="0.07"/>
                  <feFuncB type="linear" slope="3.0" intercept="0.10"/>
                </feComponentTransfer>
                <feColorMatrix type="matrix" result="tinted" values="0.95 0 0.05 0 0.00  0 1.0 0.08 0 0.02  0 0.05 1.1 0 0.06  0 0 0 1 0" in="bright"/>
                <feGaussianBlur in="tinted" stdDeviation="1.2" result="bloom"/>
                <feMerge>
                  <feMergeNode in="bloom"/>
                  <feMergeNode in="tinted"/>
                </feMerge>
              </filter>
              <radialGradient id="face-goldReflect" cx="72%" cy="25%" r="40%">
                <stop offset="0%" stopColor="rgba(255,210,120,0.22)"/>
                <stop offset="45%" stopColor="rgba(255,160,60,0.08)"/>
                <stop offset="100%" stopColor="rgba(255,100,0,0)"/>
              </radialGradient>
              <clipPath id="gcv2-face-clip">
                <rect x="38" y="6" width="32" height="58" rx="3"/>
              </clipPath>
            </defs>
            <ellipse cx="36" cy="67" rx="34" ry="7" fill="rgba(255,140,30,0.10)" filter="url(#gcv2-bloom-lg)"/>
            <ellipse cx="28" cy="42" rx="22" ry="26" fill="url(#gcv2-scene)"/>
            <ellipse cx="28" cy="14" rx="20" ry="18" fill="url(#gcv2-vol)"/>
            <ellipse cx="54" cy="34" rx="12" ry="16" fill="rgba(255,160,60,0.05)" filter="url(#gcv2-bloom)"/>
            <ellipse cx="54" cy="34" rx="15" ry="21" fill="none" stroke="rgba(255,180,60,0.18)" strokeWidth="0.9" filter="url(#gcv2-glow-md)"/>
            <g clipPath="url(#gcv2-face-clip)" filter="url(#face-enhance)">
              <g transform="translate(16.280 -0.480) scale(0.108)">
                <ellipse cx="208" cy="338" rx="20" ry="30" fill="url(#face-earL)"/>
                <path d="M212 318 Q221 328 223 338 Q221 348 212 358" fill="none" stroke="#42d2fa" strokeWidth="1.1" opacity="0.62"/>
                <ellipse cx="202" cy="338" rx="10" ry="20" fill="#000308" opacity="0.75"/>
                <ellipse cx="211" cy="330" rx="5" ry="9" fill="#82eaff" opacity="0.28"/>
                <ellipse cx="472" cy="338" rx="20" ry="30" fill="#020810"/>
                <ellipse cx="478" cy="340" rx="14" ry="24" fill="#000000" opacity="0.85"/>
                <path id="face" d="M340 130 C304 128 266 142 242 170 C216 198 206 238 204 280 C202 320 208 360 222 396 C236 430 256 460 278 483 C298 504 322 518 340 522 C358 518 382 504 402 483 C424 460 444 430 458 396 C472 360 478 320 476 280 C474 238 464 198 438 170 C414 142 376 128 340 130Z" fill="url(#face-faceBase)"/>
                <path d="M340 130 C304 128 266 142 242 170 C216 198 206 238 204 280 C202 320 208 360 222 396 C236 430 256 460 278 483 C298 504 322 518 340 522 C358 518 382 504 402 483 C424 460 444 430 458 396 C472 360 478 320 476 280 C474 238 464 198 438 170 C414 142 376 128 340 130Z" fill="url(#face-shadowR)" opacity="1"/>
                <path d="M340 130 C304 128 266 142 242 170 C216 198 206 238 204 280 C202 320 208 360 222 396 C236 430 256 460 278 483 C298 504 322 518 340 522 C358 518 382 504 402 483 C424 460 444 430 458 396 C472 360 478 320 476 280 C474 238 464 198 438 170 C414 142 376 128 340 130Z" fill="url(#face-shadowSide)" opacity="0.88"/>
                <path d="M340 130 C304 128 266 142 242 170 C216 198 206 238 204 280 C206 254 215 222 232 198 C250 174 278 155 312 145 C328 139 340 136 340 136Z" fill="url(#face-crownLight)" opacity="0.92"/>
                <path d="M340 130 C304 128 266 142 242 170 C216 198 206 238 204 280 C204 308 206 328 210 348 C196 316 192 272 196 240 C202 202 220 170 244 156 C268 141 340 130 340 130Z" fill="url(#face-rimL)" opacity="0.52"/>
                <path d="M340 508 C322 504 304 492 288 476 C270 458 255 430 245 398 C238 378 234 356 234 336 C278 388 294 444 340 508Z" fill="#000000" opacity="0.58"/>
                <ellipse cx="310" cy="178" rx="82" ry="64" fill="url(#face-foreHead)" opacity="0.95"/>
                <ellipse cx="264" cy="314" rx="24" ry="38" fill="url(#face-cheekL)" opacity="0.65"/>
                <ellipse cx="340" cy="512" rx="124" ry="54" fill="url(#face-chinShad)" opacity="0.90"/>
                <path d="M258 162 Q268 176 271 202 Q272 224 266 248" fill="none" stroke="#00e8ff" strokeWidth="14" strokeLinecap="round" opacity="0.07"/>
                <path d="M260 165 Q270 178 273 204 Q274 225 268 248" fill="none" stroke="#88faff" strokeWidth="5" strokeLinecap="round" opacity="0.32"/>
                <path d="M261 168 Q271 180 274 205 Q275 224 269 246" fill="none" stroke="#d0ffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.62"/>
                <ellipse cx="250" cy="348" rx="38" ry="26" fill="#0092c2" opacity="0.14" transform="rotate(-8,250,348)"/>
                <ellipse cx="246" cy="344" rx="24" ry="15" fill="#44d2f2" opacity="0.16" transform="rotate(-8,246,344)"/>
                <ellipse cx="245" cy="341" rx="15" ry="10" fill="#92f2ff" opacity="0.24" transform="rotate(-8,245,341)"/>
                <path d="M252 275 Q270 268 290 269 Q308 268 322 274" fill="none" stroke="#1060a2" strokeWidth="1.1" opacity="0.38"/>
                <path d="M251 279 Q270 271 291 272 Q309 271 323 277" fill="none" stroke="#000000" strokeWidth="3.8" opacity="0.74"/>
                <path d="M256 272 Q272 266 292 267 Q308 266 320 271" fill="none" stroke="#42caf8" strokeWidth="1.3" opacity="0.36"/>
                <path d="M356 275 Q372 268 390 269 Q408 268 428 274" fill="none" stroke="#082840" strokeWidth="1.1" opacity="0.28"/>
                <path d="M355 279 Q372 271 391 272 Q408 271 428 277" fill="none" stroke="#000000" strokeWidth="3.8" opacity="0.65"/>
                <ellipse cx="291" cy="300" rx="48" ry="24" fill="#000000" opacity="0.88"/>
                <ellipse cx="295" cy="302" rx="37" ry="17" fill="#000510" opacity="0.92"/>
                <path d="M252 298 Q264 286 280 282 Q291 280 302 282 Q314 286 326 297 Q314 305 302 308 Q291 310 280 308 Q267 305 252 298Z" fill="url(#face-lidGrad)"/>
                <path d="M253 297 Q269 285 292 283 Q314 285 328 296" fill="none" stroke="#000000" strokeWidth="3.4" strokeLinecap="round" opacity="0.98"/>
                <path d="M263 293 Q276 287 294 286 Q306 287 316 291" fill="none" stroke="#a2f2ff" strokeWidth="1.6" strokeLinecap="round" opacity="0.36"/>
                <ellipse cx="284" cy="294" rx="7" ry="5" fill="#00b8e8" opacity="0.48"/>
                <ellipse cx="284" cy="293" rx="3" ry="2.5" fill="#00e8ff" opacity="0.68"/>
                <ellipse cx="389" cy="300" rx="48" ry="24" fill="#000000" opacity="0.96"/>
                <path d="M355 298 Q367 286 382 282 Q390 280 398 282 Q410 286 424 296 Q410 304 398 307 Q390 309 382 307 Q369 304 355 298Z" fill="#061428"/>
                <path d="M356 297 Q372 285 390 283 Q408 285 425 296" fill="none" stroke="#000000" strokeWidth="4" strokeLinecap="round" opacity="0.99"/>
                <path d="M335 311 Q333 332 330 356 Q328 373 327 386" fill="none" stroke="#2898c8" strokeWidth="1.6" opacity="0.30"/>
                <path d="M337 314 Q337 336 336 360 Q336 378 337 392" fill="none" stroke="#82eaff" strokeWidth="2.4" strokeLinecap="round" opacity="0.32"/>
                <ellipse cx="336" cy="392" rx="7" ry="9" fill="#62eaff" opacity="0.38"/>
                <ellipse cx="340" cy="406" rx="26" ry="16" fill="#000000" opacity="0.60"/>
                <ellipse cx="336" cy="403" rx="16" ry="12" fill="#082038" opacity="0.36"/>
                <path d="M322 406 Q317 413 320 420 Q325 424 331 421 Q336 416 335 409" fill="#000000" opacity="0.86"/>
                <path d="M358 406 Q363 413 360 420 Q355 424 349 421 Q344 416 345 409" fill="#000000" opacity="0.80"/>
                <path d="M324 406 Q319 411 321 417 Q325 421 329 418" fill="none" stroke="#20a2d2" strokeWidth="0.9" opacity="0.36"/>
                <ellipse cx="340" cy="466" rx="46" ry="19" fill="#000000" opacity="0.72"/>
                <path d="M305 457 Q318 446 330 443 Q335 441 340 442 Q345 441 350 443 Q362 446 375 457 Q362 461 350 463 Q345 464 340 464 Q335 464 330 463 Q318 461 305 457Z" fill="url(#face-lipGrad)"/>
                <path d="M307 459 Q322 470 340 473 Q358 470 373 459 Q362 464 350 466 Q345 467 340 467 Q335 467 330 466 Q318 464 307 459Z" fill="url(#face-lipGrad)" opacity="0.86"/>
                <path d="M305 457 Q322 461 340 462 Q358 461 375 457" fill="none" stroke="#000000" strokeWidth="1.7" strokeLinecap="round" opacity="0.93"/>
                <path d="M318 450 Q328 444 336 443 Q340 444 344 443 Q352 444 362 450" fill="none" stroke="#62d8fa" strokeWidth="1.9" strokeLinecap="round" opacity="0.42"/>
                <path d="M318 459 Q328 467 340 469" fill="none" stroke="#c8f6ff" strokeWidth="1.4" strokeLinecap="round" opacity="0.42"/>
                <path d="M318 476 Q340 484 362 476" fill="none" stroke="#000000" strokeWidth="2.6" strokeLinecap="round" opacity="0.56"/>
                <path d="M334 434 Q337 443 340 445 Q343 443 346 434" fill="none" stroke="#1062a2" strokeWidth="1" opacity="0.30"/>
                <path d="M290 136 Q312 133 332 132" fill="none" stroke="#44ccf8" strokeWidth="1.5" opacity="0.52"/>
                <path d="M290 136 Q268 140 252 150" fill="none" stroke="#44ccf8" strokeWidth="1.2" opacity="0.44"/>
                <path d="M390 136 Q412 140 428 150" fill="none" stroke="#44ccf8" strokeWidth="1.2" opacity="0.32"/>
                <ellipse cx="272" cy="133" rx="3" ry="3" fill="#80ecff" opacity="0.68"/>
                <ellipse cx="248" cy="156" rx="2.5" ry="2.5" fill="#60d8ff" opacity="0.60"/>
                <ellipse cx="342" cy="128" rx="3" ry="3" fill="#a8f8ff" opacity="0.72"/>
                <circle cx="150" cy="196" r="1.5" fill="#00f8ff" opacity="0.72"/>
                <circle cx="128" cy="338" r="1.7" fill="#00e8ff" opacity="0.52"/>
                <circle cx="188" cy="440" r="1.1" fill="#40d8ff" opacity="0.58"/>
                <circle cx="166" cy="476" r="0.9" fill="#20e0ff" opacity="0.44"/>
                <circle cx="168" cy="274" r="1.1" fill="#00d0ff" opacity="0.42"/>
                <circle cx="198" cy="214" r="1.0" fill="#00f0ff" opacity="0.45"/>
                <circle cx="520" cy="256" r="1.2" fill="#00c8e8" opacity="0.48"/>
                <circle cx="548" cy="396" r="1.5" fill="#00b8d8" opacity="0.38"/>
                <circle cx="508" cy="488" r="1.1" fill="#40d0f0" opacity="0.55"/>
                <circle cx="534" cy="164" r="1.0" fill="#80e8ff" opacity="0.50"/>
                <circle cx="540" cy="304" r="0.8" fill="#00c0e0" opacity="0.42"/>
                <path d="M340 130 C304 128 266 142 242 170 C216 198 206 238 204 280 C202 320 208 360 222 396 C236 430 256 460 278 483 C298 504 322 518 340 522 C320 498 296 472 278 438 C258 400 244 356 240 312 C236 266 242 222 260 188 C278 154 308 136 340 130Z" fill="none" stroke="#00f0ff" strokeWidth="1.3" opacity="0.58"/>
              </g>
            </g>
            <ellipse cx="58" cy="22" rx="10" ry="8" fill="url(#face-goldReflect)" clipPath="url(#gcv2-face-clip)"/>
            <ellipse cx="51" cy="17" rx="4" ry="3" fill="rgba(200,255,255,0.30)" filter="url(#gcv2-glow)" clipPath="url(#gcv2-face-clip)"/>
            <ellipse cx="42" cy="32" rx="3" ry="5" fill="rgba(0,240,255,0.22)" filter="url(#gcv2-glow)" clipPath="url(#gcv2-face-clip)"/>
            <circle cx="44" cy="14" r="0.8" fill="rgba(180,255,255,0.85)" filter="url(#gcv2-glow)" clipPath="url(#gcv2-face-clip)"/>
            <circle cx="63" cy="20" r="0.7" fill="rgba(255,220,120,0.75)" filter="url(#gcv2-glow)" clipPath="url(#gcv2-face-clip)"/>
            <circle cx="60" cy="44" r="0.6" fill="rgba(100,240,255,0.70)" filter="url(#gcv2-glow)" clipPath="url(#gcv2-face-clip)"/>
            <circle cx="48" cy="52" r="0.5" fill="rgba(255,200,100,0.60)" filter="url(#gcv2-glow)" clipPath="url(#gcv2-face-clip)"/>
            <ellipse cx="36" cy="66" rx="30" ry="5" fill="rgba(255,160,40,0.10)" filter="url(#gcv2-bloom)"/>
            <ellipse cx="36" cy="66" rx="27" ry="4" fill="none" stroke="rgba(255,160,40,0.20)" strokeWidth="1.5"/>
            <ellipse cx="36" cy="66" rx="21" ry="3" fill="none" stroke="url(#gcv2-ring)" strokeWidth="1.3" filter="url(#gcv2-glow)"/>
            <ellipse cx="36" cy="66" rx="15" ry="2" fill="rgba(255,180,60,0.08)"/>
            <path d="M16,66 Q28,63 36,66 Q44,69 56,66" fill="none" stroke="rgba(255,160,40,0.30)" strokeWidth="0.7" strokeDasharray="2,3"/>
            <line x1="7" y1="66" x2="9.5" y2="66" stroke="rgba(255,160,40,0.55)" strokeWidth="0.9" filter="url(#gcv2-glow)"/>
            <line x1="62.5" y1="66" x2="65" y2="66" stroke="rgba(255,160,40,0.55)" strokeWidth="0.9" filter="url(#gcv2-glow)"/>
            <line x1="36" y1="61.5" x2="36" y2="63.5" stroke="rgba(255,180,60,0.55)" strokeWidth="0.8" filter="url(#gcv2-glow)"/>
            <ellipse cx="28" cy="66" rx="11" ry="2.2" fill="rgba(0,0,0,0.5)"/>
            <rect x="38" y="24" width="4" height="41" rx="4" fill="rgba(0,0,0,0.30)"/>
            <rect x="15" y="22" width="26" height="43" rx="7" fill="url(#gcv2-body)" stroke="url(#gcv2-edge)" strokeWidth="1.5" filter="url(#gcv2-glow)"/>
            <rect x="15" y="22" width="26" height="43" rx="7" fill="rgba(255,150,40,0.04)"/>
            <rect x="16.5" y="45" width="23" height="19" rx="0" fill="url(#gcv2-serum)" clipPath="url(#gcv2-bottle-clip)" opacity="0.9"/>
            <rect x="16.5" y="45" width="23" height="19" rx="0" fill="url(#gcv2-serum-glow)" clipPath="url(#gcv2-bottle-clip)"/>
            <path d="M16.5,45 Q20,42.5 28,44 Q34,45.5 40,43.5" stroke="rgba(255,210,100,0.9)" strokeWidth="1.3" fill="none" strokeLinecap="round" filter="url(#gcv2-glow)"/>
            <path d="M16.5,45 Q20,42.5 28,44 Q34,45.5 40,43.5" stroke="rgba(255,180,60,0.35)" strokeWidth="4" fill="none" strokeLinecap="round" filter="url(#gcv2-glow-md)"/>
            <line x1="19" y1="49" x2="25" y2="49" stroke="rgba(255,220,140,0.25)" strokeWidth="0.65" strokeLinecap="round"/>
            <line x1="20" y1="53" x2="27" y2="53" stroke="rgba(255,200,100,0.18)" strokeWidth="0.55" strokeLinecap="round"/>
            <path d="M17,26 Q19,23 23,22.5 L23,52 Q19,51 17,47 Z" fill="url(#gcv2-shine-l)" clipPath="url(#gcv2-bottle-clip)" opacity="0.9"/>
            <path d="M18.5,28 Q19.5,25 20.5,24 L20.5,42 Q19.5,41.5 18.5,39 Z" fill="rgba(255,240,200,0.12)" clipPath="url(#gcv2-bottle-clip)"/>
            <path d="M38,24 Q40,27 40.5,33 L40.5,56 Q39.5,56 39,50 Q38,36 38,24 Z" fill="url(#gcv2-shine-r)" clipPath="url(#gcv2-bottle-clip)"/>
            <rect x="22" y="44" width="12" height="20" rx="0" fill="rgba(255,160,40,0.05)" clipPath="url(#gcv2-bottle-clip)"/>
            <rect x="17" y="27" width="22" height="14" rx="3" fill="rgba(255,140,40,0.05)" stroke="rgba(255,160,60,0.32)" strokeWidth="0.8"/>
            <line x1="20" y1="31" x2="37" y2="31" stroke="rgba(255,190,80,0.32)" strokeWidth="0.65"/>
            <line x1="20" y1="33.5" x2="35" y2="33.5" stroke="rgba(255,170,60,0.24)" strokeWidth="0.6"/>
            <line x1="20" y1="36" x2="32" y2="36" stroke="rgba(255,150,40,0.20)" strokeWidth="0.55"/>
            <path d="M28,28 L29.8,30.5 L28,33 L26.2,30.5 Z" fill="rgba(255,200,80,0.5)" stroke="rgba(255,220,120,0.65)" strokeWidth="0.5" filter="url(#gcv2-glow)"/>
            <circle cx="22" cy="30" r="0.7" fill="rgba(255,180,70,0.55)"/>
            <circle cx="35" cy="36.5" r="0.7" fill="rgba(255,160,50,0.45)"/>
            <path d="M19,16 Q17,17 16,22 L40,22 Q39,17 37,16 Z" fill="url(#gcv2-body)" stroke="url(#gcv2-edge)" strokeWidth="1.2" filter="url(#gcv2-glow)"/>
            <path d="M19,18 Q24,16 32,16.5 L32,20 Q24,19.5 19,21 Z" fill="rgba(255,215,140,0.22)"/>
            <rect x="24" y="8" width="8" height="9" rx="2.5" fill="url(#gcv2-body)" stroke="url(#gcv2-neck)" strokeWidth="1.2" filter="url(#gcv2-glow)"/>
            <rect x="25" y="9" width="2.5" height="7" rx="1.2" fill="rgba(255,205,120,0.22)"/>
            <ellipse cx="29" cy="7.5" rx="7.5" ry="5" fill="rgba(0,0,0,0.3)"/>
            <ellipse cx="28" cy="6" rx="7" ry="4.5" fill="url(#gcv2-bulb)" stroke="url(#gcv2-edge)" strokeWidth="1.1" filter="url(#gcv2-glow)"/>
            <ellipse cx="25" cy="4.5" rx="3.5" ry="1.8" fill="rgba(255,200,120,0.28)"/>
            <path d="M21.5,6.5 Q28,10 34.5,6.5" stroke="rgba(150,60,0,0.30)" strokeWidth="0.8" fill="none"/>
            <ellipse cx="23.5" cy="3.8" rx="2" ry="1.2" fill="rgba(255,225,160,0.40)"/>
            <path d="M32,5 Q34,6.5 33.5,8 L32.5,8 Q33,6.5 31.5,5 Z" fill="rgba(255,180,80,0.20)"/>
            <g transform="translate(63, 11) rotate(-18)">
              <ellipse cx="0" cy="0" rx="5" ry="11" fill="rgba(255,160,40,0.07)" filter="url(#gcv2-bloom)"/>
              <rect x="-1.6" y="-11" width="3.2" height="19" rx="1.6" fill="url(#gcv2-pip-body)" stroke="url(#gcv2-edge)" strokeWidth="0.75" filter="url(#gcv2-glow)" opacity="0.92"/>
              <rect x="-1.4" y="-10" width="1.0" height="16" rx="0.5" fill="rgba(255,210,130,0.22)"/>
              <rect x="-1.1" y="-3" width="2.2" height="9" rx="1.1" fill="rgba(255,170,50,0.50)"/>
              <rect x="-0.7" y="-2" width="1.2" height="7" rx="0.6" fill="rgba(255,230,140,0.30)"/>
              <path d="M-1.6,8 Q0,11.5 1.6,8 Z" fill="url(#gcv2-neck)" stroke="rgba(255,180,60,0.6)" strokeWidth="0.5" filter="url(#gcv2-glow)"/>
              <circle cx="0" cy="11.5" r="0.9" fill="rgba(255,220,100,0.80)" filter="url(#gcv2-glow)"/>
            </g>
            <g style={{'animation':'gcvDropBloomA 3.6s 0s ease-in-out infinite','transformBox':'fill-box'}}>
              <ellipse cx="60" cy="24" rx="4.2" ry="5.5" fill="rgba(255,180,50,0.45)" filter="url(#gcv2-bloom)"/>
            </g>
            <g style={{'animation':'gcvDropA 3.6s 0s ease-in-out infinite','transformBox':'fill-box'}}>
              <ellipse cx="60" cy="24" rx="2.2" ry="2.9" fill="url(#gcv2-pip-drop)" filter="url(#gcv2-glow)" opacity="1.0"/>
              <ellipse cx="59.2" cy="22.5" rx="0.85" ry="1.1" fill="rgba(255,255,250,0.98)"/>
              <ellipse cx="60" cy="24" rx="2.2" ry="2.9" fill="none" stroke="rgba(255,220,90,0.75)" strokeWidth="0.7" filter="url(#gcv2-glow)"/>
            </g>
            <g style={{'animation':'gcvDropBloomB 3.6s 1.2s ease-in-out infinite','transformBox':'fill-box'}}>
              <ellipse cx="57.5" cy="34" rx="3.4" ry="4.4" fill="rgba(255,165,35,0.38)" filter="url(#gcv2-bloom)"/>
            </g>
            <g style={{'animation':'gcvDropB 3.6s 1.2s ease-in-out infinite','transformBox':'fill-box'}}>
              <ellipse cx="57.5" cy="34" rx="1.75" ry="2.3" fill="url(#gcv2-pip-drop)" filter="url(#gcv2-glow)" opacity="0.96"/>
              <ellipse cx="56.9" cy="32.8" rx="0.68" ry="0.88" fill="rgba(255,255,245,0.95)"/>
              <ellipse cx="57.5" cy="34" rx="1.75" ry="2.3" fill="none" stroke="rgba(255,210,70,0.65)" strokeWidth="0.6" filter="url(#gcv2-glow)"/>
            </g>
            <g style={{'animation':'gcvDropBloomC 3.6s 2.4s ease-in-out infinite','transformBox':'fill-box'}}>
              <ellipse cx="55" cy="44" rx="2.6" ry="3.4" fill="rgba(255,148,28,0.32)" filter="url(#gcv2-bloom)"/>
            </g>
            <g style={{'animation':'gcvDropC 3.6s 2.4s ease-in-out infinite','transformBox':'fill-box'}}>
              <ellipse cx="55" cy="44" rx="1.25" ry="1.65" fill="url(#gcv2-pip-drop)" filter="url(#gcv2-glow)" opacity="0.88"/>
              <ellipse cx="54.5" cy="43.1" rx="0.48" ry="0.62" fill="rgba(255,252,240,0.92)"/>
              <ellipse cx="55" cy="44" rx="1.25" ry="1.65" fill="none" stroke="rgba(255,198,58,0.58)" strokeWidth="0.55" filter="url(#gcv2-glow)"/>
            </g>
            <g clipPath="url(#gcv2-face-clip)" style={{'animation':'faceAbsorbA 3.6s 2.88s ease-out infinite','opacity':'0'}}>
              <rect x="38" y="6" width="32" height="58" fill="url(#face-absorbA)" filter="url(#gcv2-glow-md)"/>
            </g>
            <g clipPath="url(#gcv2-face-clip)" style={{'animation':'faceAbsorbB 3.6s 0.48s ease-out infinite','opacity':'0'}}>
              <rect x="38" y="6" width="32" height="58" fill="url(#face-absorbB)" filter="url(#gcv2-glow-md)"/>
            </g>
            <g clipPath="url(#gcv2-face-clip)" style={{'animation':'faceAbsorbC 3.6s 1.68s ease-out infinite','opacity':'0'}}>
              <rect x="38" y="6" width="32" height="58" fill="url(#face-absorbC)" filter="url(#gcv2-glow-md)"/>
            </g>
            <circle cx="6" cy="20" r="1.4" fill="rgba(255,210,80,0.70)" filter="url(#gcv2-glow)"/>
            <circle cx="5" cy="30" r="1.1" fill="rgba(255,190,60,0.58)" filter="url(#gcv2-glow)"/>
            <circle cx="7" cy="41" r="1.3" fill="rgba(255,170,50,0.55)"/>
            <circle cx="5" cy="52" r="1.0" fill="rgba(255,150,40,0.48)" filter="url(#gcv2-glow)"/>
            <circle cx="8" cy="60" r="0.9" fill="rgba(255,140,40,0.42)"/>
            <circle cx="14" cy="14" r="1.1" fill="rgba(255,200,80,0.60)" filter="url(#gcv2-glow)"/>
            <circle cx="43" cy="12" r="1.0" fill="rgba(255,190,60,0.55)" filter="url(#gcv2-glow)"/>
            <circle cx="12" cy="60" r="1.0" fill="rgba(255,180,60,0.52)" filter="url(#gcv2-glow)"/>
            <g transform="translate(11, 9)" opacity="0.85" filter="url(#gcv2-glow)">
              <line x1="0" y1="-3" x2="0" y2="3" stroke="rgba(255,230,120,0.9)" strokeWidth="0.75"/>
              <line x1="-3" y1="0" x2="3" y2="0" stroke="rgba(255,230,120,0.9)" strokeWidth="0.75"/>
              <line x1="-2.1" y1="-2.1" x2="2.1" y2="2.1" stroke="rgba(255,200,80,0.55)" strokeWidth="0.55"/>
              <line x1="2.1" y1="-2.1" x2="-2.1" y2="2.1" stroke="rgba(255,200,80,0.55)" strokeWidth="0.55"/>
            </g>
            <g transform="translate(44, 18)" opacity="0.70" filter="url(#gcv2-glow)">
              <line x1="0" y1="-2.5" x2="0" y2="2.5" stroke="rgba(255,210,100,0.85)" strokeWidth="0.65"/>
              <line x1="-2.5" y1="0" x2="2.5" y2="0" stroke="rgba(255,210,100,0.85)" strokeWidth="0.65"/>
            </g>
            <g transform="translate(9, 55)" opacity="0.60" filter="url(#gcv2-glow)">
              <line x1="0" y1="-2" x2="0" y2="2" stroke="rgba(255,190,80,0.75)" strokeWidth="0.6"/>
              <line x1="-2" y1="0" x2="2" y2="0" stroke="rgba(255,190,80,0.75)" strokeWidth="0.6"/>
            </g>
            <ellipse cx="28" cy="66.5" rx="12" ry="2.2" fill="rgba(255,160,40,0.22)" filter="url(#gcv2-glow-md)"/>
            <ellipse cx="62" cy="66" rx="7" ry="1.5" fill="rgba(255,140,40,0.14)" filter="url(#gcv2-glow-md)"/>
          </svg>
  )
})

