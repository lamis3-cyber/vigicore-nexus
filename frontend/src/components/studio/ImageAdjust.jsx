import React, { useEffect, useRef, useState } from 'react'
import { adjustCssFilter, applyAdjustments, autoEnhance, flipImage, rotateImage } from '../../lib/image.js'
import { tr } from '../../i18n/translate.js';

const ZERO = { brightness: 0, contrast: 0, saturation: 0, sharpenAmount: 0 }

// A handful of one-tap looks — the presets big publicity/e-commerce editors ship — expressed
// as slider values so "Apply" bakes them in exactly like a manual adjustment would.
const PRESETS = [
  { id: 'natural', label: 'Natural', v: ZERO },
  { id: 'studio', label: 'Studio bright', v: { brightness: 10, contrast: 14, saturation: 6, sharpenAmount: 20 } },
  { id: 'vivid', label: 'Vivid', v: { brightness: 4, contrast: 18, saturation: 30, sharpenAmount: 10 } },
  { id: 'crisp', label: 'Crisp & clean', v: { brightness: 6, contrast: 8, saturation: -4, sharpenAmount: 45 } },
  { id: 'mono', label: 'Mono', v: { brightness: 2, contrast: 12, saturation: -100, sharpenAmount: 15 } },
]

/**
 * Sits alongside ImageFramer: lets the person correct exposure/colour, sharpen, rotate and
 * flip the cover photo. Sliders only preview live (via CSS filter, reported through
 * onPreview so the surrounding cards can mirror it) — nothing is redrawn until "Apply",
 * which bakes the result into a new image via onApplied(url). Rotate/flip act immediately
 * since there's nothing to preview: the photo's geometry itself changes.
 */
export default function ImageAdjust({ imageUrl, onPreview, onApplied }) {
  const [v, setV] = useState(ZERO)
  const [busy, setBusy] = useState(null) // which action is running, for button labels
  const [stack, setStack] = useState([]) // photos as they were BEFORE each edit; stack[0] = the original
  const lastResult = useRef(null)        // the url this component last produced
  const autoOf = useRef(null)            // { result, base } when the last edit was Auto-enhance
  const dirty = JSON.stringify(v) !== JSON.stringify(ZERO)

  // A photo that did not come from us (new upload, cutout, etc.) starts a fresh history.
  useEffect(() => {
    if (imageUrl !== lastResult.current) { setStack([]); autoOf.current = null }
  }, [imageUrl])

  function update(patch) {
    const next = { ...v, ...patch }
    setV(next)
    onPreview(adjustCssFilter(next))
  }
  function reset() { setV(ZERO); onPreview('none') }
  function emit(url) { lastResult.current = url; onApplied(url) }

  async function apply() {
    if (!dirty || busy) return
    setBusy('apply')
    try {
      const out = await applyAdjustments(imageUrl, v)
      setStack((s) => [...s, imageUrl]); autoOf.current = null
      emit(out); reset()
    } finally { setBusy(null) }
  }
  async function run(label, fn) {
    if (busy) return
    setBusy(label)
    try {
      const out = await fn()
      setStack((s) => [...s, imageUrl]); autoOf.current = null
      emit(out)
    } finally { setBusy(null) }
  }
  // Auto-enhance always starts from the photo as it was before the previous Auto-enhance,
  // so pressing it again never stacks (or degrades) the effect.
  async function auto() {
    if (busy) return
    reset()
    setBusy('auto')
    try {
      const again = autoOf.current && autoOf.current.result === imageUrl
      const base = again ? autoOf.current.base : imageUrl
      const out = await autoEnhance(base)
      if (!again) setStack((s) => [...s, imageUrl])
      autoOf.current = { result: out, base }
      emit(out)
    } finally { setBusy(null) }
  }
  function undo() {
    if (busy || !stack.length) return
    const prev = stack[stack.length - 1]
    setStack(stack.slice(0, -1)); autoOf.current = null
    reset(); emit(prev)
  }
  // Reset = sliders back to 0 AND the photo back to how it was before any edit here.
  function resetAll() {
    if (busy) return
    reset()
    if (stack.length) { const original = stack[0]; setStack([]); autoOf.current = null; emit(original) }
  }

  const slider = (key, label, min, max) => (
    <label className="ia-slider">
      <span>{tr(label)}<small>{v[key] > 0 ? `+${v[key]}` : v[key]}</small></span>
      <input type="range" min={min} max={max} step="1" value={v[key]} style={{ '--p': `${((v[key] - min) / (max - min)) * 100}%` }} onChange={(e) => update({ [key]: Number(e.target.value) })} />
    </label>
  )

  return (
    <div className="ia-wrap">
      <span className="if-label">{tr("Adjust & retouch")}</span>

      <div className="ia-row">
        {[['↺', '90° left', () => rotateImage(imageUrl, 3)], ['↻', '90° right', () => rotateImage(imageUrl, 1)],
          ['⇋', 'Flip horizontal', () => flipImage(imageUrl, 'h')], ['⇵', 'Flip vertical', () => flipImage(imageUrl, 'v')]].map(([ic, lb, fn]) => (
          <button key={lb} type="button" className="ia-icon" title={lb} aria-label={lb} disabled={!!busy} onClick={() => run(lb, fn)}>{ic}</button>
        ))}
        <button type="button" className="ia-icon ia-icon--wide" disabled={!!busy} onClick={auto}>
          {busy === 'auto' ? '…' : tr("✨ Auto-enhance")}
        </button>
      </div>

      <div className="ia-presets" role="group" aria-label={tr("Filter presets")}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="ia-preset" disabled={!!busy} onClick={() => update(p.v)}>{tr(p.label)}</button>
        ))}
      </div>

      {slider('brightness', 'Brightness', -60, 60)}
      {slider('contrast', 'Contrast', -60, 60)}
      {slider('saturation', 'Saturation', -100, 60)}
      {slider('sharpenAmount', 'Sharpen', 0, 100)}

      <div className="ia-actions">
        <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" disabled={!!busy || !stack.length} onClick={undo}>{tr("Undo")}</button>
        <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" disabled={!!busy || (!dirty && !stack.length)} onClick={resetAll}>{tr("Reset all")}</button>
        <button type="button" className="msp-btn msp-btn--primary msp-btn--sm" disabled={!dirty || !!busy} onClick={apply} title={tr("Save slider changes to the photo")}>{busy === 'apply' ? tr("Applying…") : tr("Apply adjustments")}</button>
      </div>
    </div>
  )
}
