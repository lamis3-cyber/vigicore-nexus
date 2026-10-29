import React from 'react'
import { tr } from '../../i18n/translate.js';

const LABELS = {
  remove: ['Cutout', 'Transparent background'],
  keep: ['Original', 'Your photo as it is'],
  color: ['Colour', 'Cutout on a background colour'],
}
const ISSUE_TEXT = {
  white_rim: 'a thin white rim along the edge',
  missing_parts: 'parts of the product may be missing',
  jagged_edges: 'slightly rough edges',
  shadow_left: 'a leftover shadow',
  cut_off: 'the product looks cut off by the photo border',
  low_resolution: 'the photo is low resolution',
}

/**
 * Result of the photo advisor: what was chosen and why, plus one-tap switching between the looks
 * (Cutout / Original / Colour) so the person always has the last word.
 * advice = { choice, options: { remove?, keep?, color? }, background, reason, source, issues[], confidence }
 */
export default function PhotoAdvice({ advice, onPick, onColor, onEdit }) {
  if (!advice) return null
  const { choice, options, background, source, reason, issues = [] } = advice
  const keys = ['remove', 'color', 'keep'].filter((k) => options[k])
  // Every preview is drawn the same way (whole product, centred, never cropped) over its own backdrop, so what you
  // see is what the card will show. The transparent cutout sits on a checkerboard, layered UNDER the photo: the
  // checkerboard has its own tile size, so it can no longer shrink the picture to a dot.
  const CHECKER = 'conic-gradient(#2a3f5c 25%, #14243b 0 50%, #2a3f5c 0 75%, #14243b 0)'
  const thumb = (k) => {
    const u = `url(${JSON.stringify(options[k].url)})`
    if (k === 'remove') return { backgroundImage: `${u}, ${CHECKER}`, backgroundSize: 'contain, 12px 12px', backgroundRepeat: 'no-repeat, repeat', backgroundPosition: 'center, 0 0' }
    // Same framing the card will use ('cover' fills the frame, 'contain' shows the whole photo), so the preview matches the result.
    const fill = options[k].fit === 'cover' && k === 'keep'
    return { backgroundImage: u, backgroundSize: fill ? 'cover' : 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: k === 'color' ? background : '#fff' }
  }
  const note = issues.map((i) => ISSUE_TEXT[i]).filter(Boolean)
  return (
    <div className="pa" role="group" aria-label={tr("Photo look")}>
      <div className="pa-head">
        <b>{source === 'ai' ? tr("✨ AI recommendation") : tr("✨ Smart recommendation")}</b>
        <span className={`pa-src${source === 'ai' ? ' is-ai' : ''}`}>{source === 'ai' ? tr("AI vision") : tr("Auto analysis")}</span>
      </div>
      <div className="pa-opts">
        {keys.map((k) => (
          <button key={k} type="button" className={`pa-opt${choice === k ? ' is-on' : ''}`} style={{ position: 'relative' }} aria-pressed={choice === k} onClick={() => onPick(k)}>
            <span className={`pa-thumb${k === 'remove' ? ' is-checker' : ''}`} style={thumb(k)} />
            {choice === k && <span aria-hidden="true" style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: 'var(--cyan, #00e5ff)', color: '#001018', fontSize: 11, fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>✓</span>}
            <strong>{LABELS[k][0]}</strong>
            <small>{LABELS[k][1]}</small>
          </button>
        ))}
      </div>
      {choice === 'color' && (
        <label className="pa-color">{tr("Background colour")}
          <input type="color" value={background || '#dde6f0'} onChange={(e) => onColor(e.target.value)} />
        </label>
      )}
      {reason && <p className="pa-why">{tr(reason)}</p>}
      {note.length > 0 && choice !== 'keep' && (
        <p className="pa-issues">{tr("Noticed")} {note.join(', ')}. <button type="button" className="pa-link" onClick={onEdit}>{tr("Fine-tune in Edit cutout →")}</button></p>
      )}
    </div>
  )
}
