import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { getRecord, saveMeasures, markQueueSeen } from '../../lib/declarationsApi';
import { useToast } from '../context/ToastContext';
import {
  titleOf, refOf, KIND_SHORT, agoOf, dateOf, detailSections, transmissionRows, MEASURE_OPTIONS, MEASURE_LABEL,
} from './recordPresentation';
import { tr } from '../../i18n/translate.js';
import './record-panel.css';

const NOTE_MAX = 500;

// Panneau latéral : une déclaration reçue par l'établissement. L'établissement n'enquête pas (c'est le rôle du fabricant) :
// il enregistre ses MESURES INTERNES et suit la transmission et l'enquête. Les droits viennent du SERVEUR (record.permissions).
export default function RecordPanel({ id, onClose, onChanged }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true });
  const load = useCallback(async () => { setState({ loading: false, ...(await getRecord(id)) }); }, [id]);
  useEffect(() => { setState({ loading: true }); load(); }, [load]);
  useEffect(() => { markQueueSeen(id); }, [id]); // ouvrir la déclaration = lue
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const rec = state.ok ? state.record : null;
  const canMeasure = !!rec?.permissions?.measures;
  const measures = rec?.measures || [];
  const signal = rec?.signal;

  return (
    <div className="rp-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rp-panel" role="dialog" aria-modal="true" aria-labelledby="rp-title">
        <div className="rp-head">
          <div className="rp-head-main">
            <div className="rp-eyebrow">{rec ? `${tr(KIND_SHORT[rec.kind] || 'Déclaration')} · ${refOf(rec)}` : tr('Déclaration')}</div>
            <h2 id="rp-title" className="rp-title">{rec ? titleOf(rec) : tr('Déclaration')}</h2>
            {rec && <div className="rp-meta">{[rec.authorName && tr('Par {0}', [rec.authorName]), rec.departmentName, tr(agoOf(rec.createdAt))].filter(Boolean).join(' · ')}</div>}
          </div>
          <button className="icon-btn" aria-label={tr('Fermer')} onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="rp-body">
          {state.loading && <div className="rp-note">{tr('Chargement de la déclaration…')}</div>}
          {!state.loading && !state.ok && <div className="rp-note" role="alert">{state.notFound ? tr('Déclaration introuvable ou hors de votre périmètre.') : tr('Déclaration momentanément indisponible.')}</div>}

          {rec && signal && (signal.sameLot > 1 || signal.sameProduct > 1) && (
            <div className="rp-signal" role="note">
              <Icon name="alert-triangle" />
              <div>
                <strong>{signal.sameLot > 1
                  ? tr('{0} déclarations sur ce lot', [signal.sameLot])
                  : tr('{0} déclarations sur ce produit', [signal.sameProduct])}</strong>
                <span>{signal.sameLot > 1 && signal.lot
                  ? tr('Lot {0} · dans votre établissement, sur les 90 derniers jours.', [signal.lot])
                  : tr('Dans votre établissement, sur les 90 derniers jours.')}</span>
              </div>
            </div>
          )}

          {rec && detailSections(rec).length === 0 && <div className="rp-note">{tr('Aucun détail disponible pour cette déclaration.')}</div>}
          {rec && detailSections(rec).map((sec) => (
            <section key={sec.title} className="rp-section">
              <h3 className="rp-section-title">{tr(sec.title)}</h3>
              <dl className="rp-dl">
                {sec.rows.map((row) => (
                  <div key={row.key} className={`rp-row${row.long ? ' is-long' : ''}`}>
                    <dt>{tr(row.label)}</dt><dd>{tr(String(row.value))}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          {rec && rec.kind !== 'PATIENT' && (
            <section className="rp-section">
              <h3 className="rp-section-title">{tr('Mesures internes')}</h3>
              {measures.length === 0 && (
                <div className="rp-empty">{canMeasure
                  ? tr("Aucune mesure enregistrée pour le moment.")
                  : tr("Aucune mesure enregistrée pour le moment. Elles sont saisies par le responsable vigilance de l'établissement.")}</div>
              )}
              {measures.length > 0 && (
                <ol className="rp-timeline">
                  {measures.map((m, i) => (
                    <li key={`${m.at}-${i}`}>
                      <div className="rp-tl-head">{dateOf(m.at)}{m.byName ? ` · ${m.byName}` : ''}</div>
                      <div className="rp-tl-chips">{m.measures.map((x) => <span key={x} className="rp-chip">{tr(MEASURE_LABEL[x] || x)}</span>)}</div>
                      {m.note && <div className="rp-tl-note">{m.note}</div>}
                    </li>
                  ))}
                </ol>
              )}
              {canMeasure && <MeasureForm id={rec.id} toast={toast} onSaved={async () => { await load(); onChanged?.(); window.dispatchEvent(new Event('vigicore:submissions-changed')); }} />}
            </section>
          )}

          {rec && transmissionRows(rec).length > 0 && (
            <section className="rp-section rp-section--tx">
              <h3 className="rp-section-title">{tr('Transmission et enquête')}</h3>
              <ul className="rp-tx">
                {transmissionRows(rec).map((t) => (
                  <li key={t.id} className={`rp-tx-row is-${t.tone}`}>
                    <span className="rp-tx-dot" aria-hidden="true" />
                    <span className="rp-tx-label">{tr(t.label)}</span>
                    <span className="rp-tx-text">{tr(t.text)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {rec && <p className="rp-privacy">{rec.sharedWithMe
            ? tr("Déclaration partagée par votre patient. Elle n'a été transmise ni au CNPM ni à un fabricant.")
            : tr("L'enquête est menée par le fabricant. Les informations identifiant le patient ne sont visibles que par le déclarant.")}</p>}
        </div>

        {rec && (
          <div className="rp-foot">
            <span className="rp-foot-note">{canMeasure ? '' : tr('Consultation seule')}</span>
            <div className="rp-actions"><button className="btn" onClick={onClose}>{tr('Fermer')}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function MeasureForm({ id, toast, onSaved }) {
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (m) => setPicked((cur) => {
    if (m === 'aucune') return cur.includes('aucune') ? [] : ['aucune'];
    const base = cur.filter((x) => x !== 'aucune');
    return base.includes(m) ? base.filter((x) => x !== m) : [...base, m];
  });
  async function submit() {
    if (!picked.length || busy) return;
    setBusy(true);
    const r = await saveMeasures(id, picked, note.trim());
    setBusy(false);
    if (typeof toast === 'function') {
      if (r.ok) toast('success', tr('Mesures enregistrées'), tr("Les mesures internes de l'établissement ont été enregistrées."), 'ti ti-circle-check');
      else toast('error', tr('Enregistrement impossible'), r.httpStatus === 403 ? tr("Vous n'avez pas le droit d'enregistrer des mesures.") : tr(r.message || 'Réessayez dans un instant.'), 'ti ti-alert-triangle');
    }
    if (r.ok) { setPicked([]); setNote(''); await onSaved(); }
  }
  return (
    <div className="rp-form">
      <div className="rp-form-label">{tr('Enregistrer une mesure')}</div>
      <div className="rp-options" role="group" aria-label={tr('Mesures internes')}>
        {MEASURE_OPTIONS.map((m) => (
          <button key={m.id} type="button" role="checkbox" aria-checked={picked.includes(m.id)}
            className={`rp-option${picked.includes(m.id) ? ' is-on' : ''}`} onClick={() => toggle(m.id)}>
            <span className="rp-option-box" aria-hidden="true">{picked.includes(m.id) && <Icon name="check" />}</span>{tr(m.label)}
          </button>
        ))}
      </div>
      <textarea className="form-input rp-note-input" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={tr('Précision (facultatif) : lieu, quantité, personnes informées…')} aria-label={tr('Précision')} />
      <div className="rp-form-foot">
        <button className="btn btn--primary" disabled={!picked.length || busy} onClick={submit}><Icon name="device-floppy" />{busy ? tr('Enregistrement…') : tr('Enregistrer les mesures')}</button>
      </div>
    </div>
  );
}
