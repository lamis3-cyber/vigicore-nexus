import React, { useCallback, useEffect, useRef, useState } from 'react'
import { trimTransparentCanvas, canvasToPngWithinBudget, removeWhiteBackground } from '../../lib/image.js'
import { peelWhiteRim, sharpenCutout, growShrinkAlpha, softenAlpha, adjustLook } from '../../lib/cutoutTools.js'
import { tr } from '../../i18n/translate.js';

const MAX_SIDE = 1600 // working resolution cap, keeps undo snapshots affordable
const MAX_HISTORY = 12
const FX0 = { edge: 0, soft: 0, rim: 0, sharp: 0 }
const LOOK0 = { brightness: 0, contrast: 0, saturation: 0 }
const BACKDROPS = [['checker', 'Checker'], ['white', 'White'], ['black', 'Black']]

/**
 * Manual finishing tools for a cutout. The AI background removal is now good enough that most
 * photos need nothing, so this editor is deliberately small and predictable:
 *
 *  Brush  - Erase paints away a leftover; Restore paints the original photo back (Smart = without its
 *           backdrop, Raw = untouched). Nothing is "protected" any more: what you paint is what changes,
 *           and Undo / Ctrl+Z always takes it back.
 *  Edge   - Shrink/Grow the outline, Soften it (inward feather), and "White rim" to remove the thin white
 *           outline that a photo backdrop leaves around the product. Live preview, derived from the picture
 *           as it was when the slider was first touched, so dragging back and forth never stacks up.
 *  Look   - Brightness / Contrast / Saturation (live preview, baked in on Apply) and Sharpen.
 *
 * Only the pixels of the cutout are edited; the result is trimmed and returned as PNG (WebP if too big).
 */
export default function ImageEraser({ src, restoreSrc, onApply, onCancel }) {
  const canvasRef = useRef(null)
  const initialData = useRef(null)
  const origCanvas = useRef(null) // what Restore paints from
  const restoreSets = useRef({})  // { smart, raw }
  const history = useRef([])
  const drawing = useRef(false)
  const lastPt = useRef(null)
  const stackBase = useRef(null)  // picture as it was when an Edge/Sharpen slider was first touched
  const timer = useRef(null)
  const pending = useRef(null)   // slider change waiting for its 60 ms debounce
  const restoreKindRef = useRef('smart')

  const [tab, setTab] = useState('brush') // brush | edge | look
  const [brushMode, setBrushMode] = useState('erase') // erase | restore
  const [restoreKind, setRestoreKind] = useState('smart')
  const [hasOrig, setHasOrig] = useState(false)
  const [brush, setBrush] = useState(32) // diameter in on-screen pixels
  const [zoom, setZoom] = useState(100)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [undoCount, setUndoCount] = useState(0)
  const [ring, setRing] = useState(null)
  const [fx, setFx] = useState(FX0)
  const [look, setLook] = useState(LOOK0)
  const [bg, setBg] = useState('checker')
  const [note, setNote] = useState('')

  useEffect(() => {
    let off = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (off) return
      try {
        const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
        const c = canvasRef.current
        c.width = Math.max(1, Math.round(img.width * k))
        c.height = Math.max(1, Math.round(img.height * k))
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, c.width, c.height)
        initialData.current = ctx.getImageData(0, 0, c.width, c.height)
        const oc = document.createElement('canvas')
        oc.width = c.width; oc.height = c.height
        oc.getContext('2d').putImageData(initialData.current, 0, 0)
        origCanvas.current = oc
        setStatus("ready")
        if (restoreSrc) loadRestoreSources(restoreSrc, c.width, c.height, oc)
      } catch {
        setStatus("error") // a cross-origin image without CORS headers taints the canvas
      }
    }
    img.onerror = () => { if (!off) setStatus("error") }
    img.src = src
    return () => { off = true; clearTimeout(timer.current) }
  }, [src])

  // Two restore sources, both aligned with the editor canvas:
  //  - smart: the original photo with its plain backdrop made transparent (+ the current cutout underneath),
  //  - raw:   the untouched photo, for when the smart one still misses something.
  function loadRestoreSources(url, w, h, cutCanvas) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = async () => {
      const mk = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv }
      const raw = mk(); raw.getContext('2d').drawImage(img, 0, 0, w, h)
      const smart = mk()
      restoreSets.current = { raw, smart: raw }
      try {
        const u = await removeWhiteBackground(url, { trim: false })
        const ci = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u })
        const sctx = smart.getContext('2d')
        sctx.drawImage(ci, 0, 0, w, h)
        sctx.drawImage(cutCanvas, 0, 0)
        restoreSets.current = { raw, smart }
      } catch { /* keep raw for both */ }
      origCanvas.current = restoreSets.current[restoreKindRef.current] || restoreSets.current.smart
      setHasOrig(true)
    }
    img.src = url
  }
  function pickRestore(kind) {
    restoreKindRef.current = kind
    setRestoreKind(kind)
    if (restoreSets.current[kind]) origCanvas.current = restoreSets.current[kind]
  }

  const snapshot = useCallback(() => {
    const c = canvasRef.current
    history.current.push(c.getContext('2d').getImageData(0, 0, c.width, c.height))
    if (history.current.length > MAX_HISTORY) history.current.shift()
    setUndoCount(history.current.length)
  }, [])

  // Forget the live slider base (its result stays in the picture) and put the sliders back to 0.
  const commitStack = useCallback(() => {
    clearTimeout(timer.current); pending.current = null
    stackBase.current = null
    setFx(FX0)
  }, [])

  const undo = useCallback(() => {
    commitStack()
    const snap = history.current.pop()
    if (!snap) return
    canvasRef.current.getContext('2d').putImageData(snap, 0, 0)
    setUndoCount(history.current.length)
  }, [commitStack])

  function reset() {
    if (!initialData.current) return
    commitStack(); setLook(LOOK0)
    snapshot() // so even "reset" can be undone
    canvasRef.current.getContext('2d').putImageData(initialData.current, 0, 0)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, undo])

  function flash(msg) { setNote(msg); setTimeout(() => setNote(''), 5000) }

  // ---- Edge / Sharpen: live, non-stacking ---------------------------------------------------------
  function runStack(next) {
    const c = canvasRef.current, ctx = c.getContext('2d', { willReadFrequently: true })
    const img = new ImageData(new Uint8ClampedArray(stackBase.current.data), c.width, c.height)
    const d = img.data
    if (next.rim) {
      const r = peelWhiteRim(d, c.width, c.height, next.rim === 2 ? { force: true, maxDepth: 12 } : {})
      if (r.skipped === 'white-product') flash('This product is mostly white, so "Light" skips it to protect the product. Choose "Strong" to trim the rim anyway.')
    }
    if (next.edge) growShrinkAlpha(d, c.width, c.height, next.edge)
    if (next.soft) softenAlpha(d, c.width, c.height, next.soft)
    if (next.sharp) sharpenCutout(d, c.width, c.height, { amount: (next.sharp / 100) * 1.2 })
    ctx.putImageData(img, 0, 0)
  }
  function setFxKey(key, value) {
    const c = canvasRef.current, ctx = c.getContext('2d', { willReadFrequently: true })
    if (!stackBase.current) { snapshot(); stackBase.current = ctx.getImageData(0, 0, c.width, c.height) }
    const next = { ...fx, [key]: value }
    setFx(next)
    clearTimeout(timer.current)
    pending.current = next
    timer.current = setTimeout(() => { pending.current = null; runStack(next) }, 60)
  }

  // ---- Brush ------------------------------------------------------------------------------------
  const toCanvas = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const sx = c.width / r.width, sy = c.height / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy, s: sx }
  }
  const paint = (p, from) => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.save()
    if (brushMode === 'restore') {
      const pat = ctx.createPattern(origCanvas.current, 'no-repeat')
      ctx.fillStyle = pat; ctx.strokeStyle = pat
    } else {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.lineWidth = brush * p.s
    if (from) { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y); ctx.stroke() }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, (brush * p.s) / 2, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  }
  function onPointerDown(e) {
    if (status !== 'ready' || tab !== 'brush') return
    commitStack() // a stroke "keeps" whatever the Edge sliders did
    snapshot()
    const p = toCanvas(e)
    drawing.current = true
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* drag still works through pointermove */ }
    paint(p, null)
    lastPt.current = p
  }
  function onPointerMove(e) {
    setRing({ x: e.clientX, y: e.clientY })
    if (!drawing.current) return
    const p = toCanvas(e)
    paint(p, lastPt.current)
    lastPt.current = p
  }
  function stop() { drawing.current = false; lastPt.current = null }

  // ---- Apply ------------------------------------------------------------------------------------
  function apply() {
    try {
      clearTimeout(timer.current)
      if (pending.current && stackBase.current) { runStack(pending.current); pending.current = null } // don't lose a slider move made <60 ms ago
      const src = canvasRef.current
      const out = document.createElement('canvas')
      out.width = src.width; out.height = src.height
      const octx = out.getContext('2d', { willReadFrequently: true })
      octx.drawImage(src, 0, 0)
      if (look.brightness || look.contrast || look.saturation) {
        const img = octx.getImageData(0, 0, out.width, out.height)
        adjustLook(img.data, look)
        octx.putImageData(img, 0, 0)
      }
      onApply(canvasToPngWithinBudget(trimTransparentCanvas(out)))
    } catch { setStatus("error") }
  }

  const cssFilter = (look.brightness || look.contrast || look.saturation)
    ? `brightness(${1 + look.brightness / 100}) contrast(${1 + look.contrast / 100}) saturate(${1 + look.saturation / 100})`
    : 'none'
  const fitted = zoom === 100
  const stageBg = bg === 'checker' ? undefined : { backgroundImage: 'none', backgroundColor: bg === 'white' ? '#ffffff' : '#000000' }
  const brushing = tab === 'brush'
  const tips = {
    brush: 'Paint over a leftover to erase it. Switch to Restore to paint back anything removed by mistake. Ctrl+Z undoes.',
    edge: 'Fine-tune the outline: shrink or grow it, soften it, or trim the white rim a photo backdrop leaves around the product.',
    look: 'Adjust the product\'s own colours and crispness. Brightness, contrast and saturation are applied when you press Apply.',
  }
  const slider = (label, key, min, max, fmt) => (
    <label>{tr(label)}<input type="range" min={min} max={max} step="1" value={fx[key]} onChange={(e) => setFxKey(key, Number(e.target.value))} /><small>{fmt(fx[key])}</small></label>
  )
  const lookSlider = (label, key) => (
    <label>{tr(label)}<input type="range" min="-50" max="50" step="1" value={look[key]} onChange={(e) => setLook({ ...look, [key]: Number(e.target.value) })} /><small>{look[key] > 0 ? `+${look[key]}` : look[key]}</small></label>
  )

  return (
    <div className="ie-modal" role="dialog" aria-modal="true" aria-label={tr("Edit cutout")} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="ie-box">
        <header className="ie-head">
          <strong>{tr("Edit cutout")}</strong>
          <span className="ie-tip">{tips[tab]}</span>
        </header>

        <div className="ie-stage" style={stageBg}>
          {status === 'loading' && <p className="ie-note">{tr("Loading the photo…")}</p>}
          {status === 'error' && <p className="ie-note">{tr("This photo can't be edited from a link — upload the file itself and try again.")}</p>}
          <canvas
            ref={canvasRef} className="ie-canvas"
            style={{ display: status === 'ready' ? 'block' : 'none', cursor: brushing ? 'none' : 'default', filter: cssFilter, ...(fitted ? { maxWidth: '100%', maxHeight: '58vh' } : { width: `${zoom}%`, maxWidth: 'none', maxHeight: 'none' }) }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stop} onPointerCancel={stop}
            onPointerLeave={() => { stop(); setRing(null) }}
          />
        </div>

        {note && <p className="ie-warn" role="status">{tr(note)}</p>}
        {status === 'ready' && (
          <>
            <div className="ie-controls">
              <span className="ie-modes" role="tablist" aria-label={tr("Tool")}>
                {[['brush', 'Brush'], ['edge', 'Edge'], ['look', 'Look']].map(([k, label]) => (
                  <button key={k} type="button" role="tab" className={`ie-mode${tab === k ? ' is-on' : ''}`} aria-selected={tab === k} onClick={() => setTab(k)}>{tr(label)}</button>
                ))}
              </span>

              {tab === 'brush' && (
                <>
                  <span className="ie-modes" role="group" aria-label={tr("Brush")}>
                    <button type="button" className={`ie-mode${brushMode === 'erase' ? ' is-on' : ''}`} onClick={() => setBrushMode('erase')}>{tr("Erase")}</button>
                    <button type="button" className={`ie-mode${brushMode === 'restore' ? ' is-on' : ''}`} onClick={() => setBrushMode('restore')}>{tr("Restore")}</button>
                  </span>
                  {brushMode === 'restore' && hasOrig && (
                    <span className="ie-modes" role="group" aria-label={tr("Restore from")}>
                      <button type="button" className={`ie-mode${restoreKind === 'smart' ? ' is-on' : ''}`} title={tr("Brings parts back from the original photo without their white/grey backdrop")} onClick={() => pickRestore('smart')}>{tr("Smart")}</button>
                      <button type="button" className={`ie-mode${restoreKind === 'raw' ? ' is-on' : ''}`} title={tr("Brings back the untouched photo pixels, backdrop included")} onClick={() => pickRestore('raw')}>{tr("Raw photo")}</button>
                    </span>
                  )}
                  <label>{tr("Size")}<input type="range" min="8" max="120" value={brush} onChange={(e) => setBrush(Number(e.target.value))} /><small>{tr("{0}px", [brush])}</small></label>
                </>
              )}

              {tab === 'edge' && (
                <>
                  {slider('Shrink / Grow', 'edge', -8, 8, (v) => (v > 0 ? `+${v}px` : v < 0 ? `${v}px` : '0'))}
                  {slider('Soften', 'soft', 0, 4, (v) => (v ? `${v}px` : 'off'))}
                  <span className="ie-modes" role="group" aria-label={tr("White rim")}>
                    {[[0, 'Rim: off'], [1, 'Light'], [2, 'Strong']].map(([k, label]) => (
                      <button key={k} type="button" className={`ie-mode${fx.rim === k ? ' is-on' : ''}`} title={tr("Removes the thin white outline left by a white photo backdrop")} onClick={() => setFxKey('rim', k)}>{tr(label)}</button>
                    ))}
                  </span>
                </>
              )}

              {tab === 'look' && (
                <>
                  {lookSlider('Brightness', 'brightness')}
                  {lookSlider('Contrast', 'contrast')}
                  {lookSlider('Saturation', 'saturation')}
                  {slider('Sharpen', 'sharp', 0, 100, (v) => (v ? `${v}%` : 'off'))}
                </>
              )}
            </div>

            <div className="ie-controls">
              <label>{tr("Zoom")}<input type="range" min="100" max="300" step="10" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /><small>{zoom}%</small></label>
              <span className="ie-modes" role="group" aria-label={tr("Preview background")}>
                {BACKDROPS.map(([k, label]) => (
                  <button key={k} type="button" className={`ie-mode${bg === k ? ' is-on' : ''}`} title={tr("Only changes the preview, not the image")} onClick={() => setBg(k)}>{tr(label)}</button>
                ))}
              </span>
              <span className="ie-sp" />
              <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" onClick={undo} disabled={!undoCount}>{tr("Undo")}</button>
              <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" onClick={reset}>{tr("Reset")}</button>
            </div>
          </>
        )}

        <footer className="ie-foot">
          <button type="button" className="msp-btn msp-btn--ghost msp-btn--sm" onClick={onCancel}>{tr("Cancel")}</button>
          <button type="button" className="msp-btn msp-btn--primary msp-btn--sm" onClick={apply} disabled={status !== 'ready'}>{tr("Apply")}</button>
        </footer>
      </div>
      {ring && brushing && status === 'ready' && <div className="ie-ring" style={{ left: ring.x, top: ring.y, width: brush, height: brush }} aria-hidden="true" />}
    </div>
  )
}
