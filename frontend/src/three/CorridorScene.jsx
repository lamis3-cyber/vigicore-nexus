import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import useOnScreen from './useOnScreen.js'
import { Sparkles } from '@react-three/drei'

/* ────────────────────────────────────────────────────────────
   THE SEAM — atmosphere layer for "Where healthcare meets
   enterprise."

   This replaces the old hub / orbiting-node / conduit-tube
   concept entirely. There is no diagram here at all: the
   canvas only supplies the *light* for an architectural scene
   built in DOM/CSS around it — a vertical seam where two glass
   volumes meet, a cool cyan haze drifting on the Healthcare
   side, a warm amber haze on the Enterprise side, and a soft
   vertical glow that slowly intensifies as the section scrolls
   through view (driven by `progressRef`, a plain ref so it
   never forces a React re-render).
   ──────────────────────────────────────────────────────────── */

function SeamGlow({ progressRef, reducedMotion, isLight }) {
  const matRef = useRef(null)
  const meshRef = useRef(null)

  const texture = useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, size, 0)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.5, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])

  // On a light page, a near-white additive glow just reads as a
  // formless pale smear instead of a lit seam. Swap in a deeper,
  // saturated cyan and cap the opacity much lower so it shows as a
  // soft colored column of light rather than a wash of brightness.
  const seamColor = isLight ? '#0ea5e9' : '#bff2ff'
  const peakOpacity = isLight ? 0.24 : 0.27
  const baseOpacity = isLight ? 0.10 : 0.09

  useFrame((state) => {
    if (!matRef.current) return
    const progress = Math.min(Math.max(progressRef?.current ?? 0, 0), 1)
    // Brightest through the middle of the section, fading at both ends.
    const bell = Math.sin(Math.min(Math.max(progress, 0.02), 0.98) * Math.PI)
    const flicker = reducedMotion ? 1 : 0.95 + Math.sin(state.clock.elapsedTime * 1.4) * 0.05
    matRef.current.opacity = (baseOpacity + bell * (peakOpacity - baseOpacity)) * flicker
    if (meshRef.current) {
      meshRef.current.scale.y = 1 + bell * 0.35
    }
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1.15, 11]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        color={seamColor}
        transparent
        opacity={baseOpacity}
        blending={isLight ? THREE.NormalBlending : THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

function DriftingHaze({ side, color, lightColor, isLight, reducedMotion }) {
  const groupRef = useRef(null)
  const x = side === 'left' ? -3.1 : 3.1

  useFrame((state) => {
    if (!groupRef.current || reducedMotion) return
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.15 + (side === 'left' ? 0 : 2)) * 0.4
  })

  return (
    <group ref={groupRef} position={[x, 0, -0.6]}>
      <Sparkles
        count={reducedMotion ? 0 : 46}
        scale={[3.4, 9, 2]}
        size={2.4}
        speed={0.18}
        opacity={isLight ? 0.7 : 0.55}
        color={isLight ? lightColor : color}
        noise={1.1}
      />
    </group>
  )
}

export default function CorridorScene({ progressRef, reducedMotion = false, isLight = false }) {
  const { onScreen, onCreated } = useOnScreen()
  return (
    <Canvas
      onCreated={onCreated}
      dpr={typeof window !== 'undefined' && window.__vgLite ? 1 : [1, 1.6]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 7.4], fov: 34 }}
      frameloop={reducedMotion ? 'demand' : onScreen ? 'always' : 'never'}
    >
      <ambientLight intensity={0.3} />
      <SeamGlow progressRef={progressRef} reducedMotion={reducedMotion} isLight={isLight} />
      <DriftingHaze side="left" color="#00c8e8" lightColor="#0074a8" isLight={isLight} reducedMotion={reducedMotion} />
      <DriftingHaze side="right" color="#dc8c3c" lightColor="#a85a10" isLight={isLight} reducedMotion={reducedMotion} />
    </Canvas>
  )
}
