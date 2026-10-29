import React, { useCallback, useRef } from 'react'
import { ZONE_ASPECT } from '../../lib/imageFrame.js'
import { tr } from '../../i18n/translate.js';

/**
 * Lets the person choose how the cover image is cropped wherever it's shown
 * small: drag inside the box to pan, use the slider to zoom. Reports
 * { imageZoom, imageFocusX, imageFocusY } (percentages), the same values the
 * live preview and every card use for backgroundSize/backgroundPosition.
 */
// Each placement's actual on-page image area has a different shape (a wide
// card thumbnail vs. the near-square Featured panel). The little editor box
// below mirrors whichever one is currently selected, so dragging/zooming
// here shows exactly what that placement will crop to — not a generic shape
// that happens to match one placement and silently lies about the others.
export default function ImageFramer({ imageUrl, fit = 'cover', zoom, focusX, focusY, filter = 'none', zone = 'RECOMMENDED', onChange }) {
  const boxRef = useRef(null)
  const dragging = useRef(false)
  const contain = fit === 'contain'

  const setFocusFromEvent = useCallback((e) => {
    const box = boxRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))
    onChange({ imageFocusX: Math.round(x), imageFocusY: Math.round(y) })
  }, [onChange])

  function onPointerDown(e) {
    dragging.current = true
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not supported everywhere; drag still works via pointermove */ }
    setFocusFromEvent(e)
  }
  function onPointerMove(e) { if (dragging.current && !contain) setFocusFromEvent(e) }
  function onPointerUp() { dragging.current = false }


  return (
    <div className="if-wrap">
      <span className="if-label">{tr("Frame the cover")}</span>
      <div className="if-fit" role="tablist" aria-label={tr("How the photo fills the card")}>
        <button type="button" role="tab" aria-selected={!contain} className={!contain ? 'on' : ''} onClick={() => onChange({ imageFit: 'cover' })}>{tr("Fill & crop")}</button>
        <button type="button" role="tab" aria-selected={contain} className={contain ? 'on' : ''} onClick={() => onChange({ imageFit: 'contain' })}>{tr("Show whole photo")}</button>
      </div>
      <div
        ref={boxRef} className={`if-box${contain ? ' if-box--contain' : ''}`} role={contain ? undefined : 'slider'} tabIndex={contain ? -1 : 0}
        aria-label={tr("Cover image position — drag to pan")}
        aria-valuetext={contain ? undefined : `Focus at ${Math.round(focusX)}%, ${Math.round(focusY)}%`}
        style={{ '--if-ar': ZONE_ASPECT[zone] ?? 1.76, backgroundImage: `url(${JSON.stringify(imageUrl)})`, backgroundRepeat: 'no-repeat', filter, ...(contain ? { backgroundSize: 'contain', backgroundPosition: 'center' } : { backgroundSize: `${zoom}%`, backgroundPosition: `${focusX}% ${focusY}%` }) }}
        onPointerDown={contain ? undefined : onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onKeyDown={(e) => {
          if (contain) return
          const step = e.shiftKey ? 10 : 3
          const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
          if (!moves[e.key]) return
          e.preventDefault()
          const [dx, dy] = moves[e.key]
          onChange({ imageFocusX: Math.min(100, Math.max(0, Math.round(focusX + dx))), imageFocusY: Math.min(100, Math.max(0, Math.round(focusY + dy))) })
        }}
      >
        {!contain && <i className="if-cross" style={{ left: `${focusX}%`, top: `${focusY}%` }} aria-hidden="true" />}
      </div>
      {contain ? (
        <p className="if-hint">{tr("The entire photo stays visible, nothing is cropped.")}</p>
      ) : (
        <>
          <label className="if-zoom">
            {tr("Zoom")}
            <input type="range" min="100" max="200" step="1" value={zoom} style={{ '--p': `${zoom - 100}%` }} onChange={(e) => onChange({ imageZoom: Number(e.target.value) })} />
            <small>{zoom}%</small>
          </label>
          <p className="if-hint">{tr("Drag the photo to reposition it.")}</p>
        </>
      )}
    </div>
  )
}
