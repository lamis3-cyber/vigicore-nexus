import { useEffect, useRef } from 'react';
import Icon from './Icon';
import './declaration-wizard.css';
import { tr } from '../../i18n/translate.js';

// Shared shell for the "Déclarer un incident" wizard: header + stepper +
// form card + live summary + footer buttons. The steps' content is passed in
// as children, so each role keeps its own fields while sharing one design.
//
// summary: [{ label, value, tone? }]  tone: 'green' | 'amber' | 'red' | 'cyan'
export default function DeclarationWizard({
  breadcrumb = ['Déclarations', 'Nouvelle déclaration'],
  onBreadcrumbClick,
  titlePrefix = 'Déclarer un',
  accent = 'incident',
  onChangeKind,
  steps,
  stepIdx,
  savedAt,
  summary = [],
  onPrev,
  onNext,
  onSaveDraft,
  onSubmit,
  submitLabel = 'Envoyer la déclaration',
  submitDisabled = false,
  submitting = false,
  children,
}) {
  const isLast = stepIdx === steps.length - 1;
  const cardRef = useRef(null);
  // A new step starts at the top of the card (the card scrolls inside the screen).
  useEffect(() => { if (cardRef.current) cardRef.current.scrollTop = 0; }, [stepIdx]);
  const pct = Math.round(((stepIdx + 1) / steps.length) * 100);

  return (
    <div className="view is-active">
      <div className="dw">
        <div className="dw-head">
          <div>
            <div className="dw-crumb">
              {onBreadcrumbClick
                ? <button type="button" onClick={onBreadcrumbClick}>{tr(breadcrumb[0])}</button>
                : tr(breadcrumb[0])}
              {breadcrumb.slice(1).map((b) => ` › ${tr(b)}`).join('')}
              {onChangeKind && <button type="button" className="dw-change" onClick={onChangeKind}>{tr("Changer de type")}</button>}
            </div>
            <h1 className="dw-title">{tr(titlePrefix)} <span>{tr(accent)}</span></h1>
          </div>
          {savedAt && (
            <div className="dw-pill" role="status"><Icon name="check" />{tr("Brouillon enregistré à")} {savedAt}</div>
          )}
        </div>

        <div className="dw-steps" role="progressbar" aria-valuemin="1" aria-valuemax={steps.length} aria-valuenow={stepIdx + 1}>
          {steps.map((s, i) => (
            <span key={s.key} style={{ display: 'contents' }}>
              <div className={`dw-step${i === stepIdx ? ' is-active' : i < stepIdx ? ' is-done' : ''}`}>
                <div className="dw-step-dot">{i < stepIdx ? <Icon name="check" /> : i + 1}</div>
                <div className="dw-step-label">{tr(s.label)}</div>
              </div>
              {i < steps.length - 1 && <div className={`dw-link${i < stepIdx ? ' is-done' : ''}`} />}
            </span>
          ))}
        </div>

        <div className="dw-body">
          <div className="dw-card" ref={cardRef}>{children}</div>

          <aside className="dw-aside" aria-label={tr("Résumé en direct")}>
            <div className="dw-aside-head">
              <span className="dw-eyebrow">{tr("Avancement")}</span>
              <span className="dw-aside-pct">{pct}%</span>
            </div>
            <div className="dw-bar"><div style={{ width: `${pct}%` }} /></div>
            <div className="dw-aside-step">
              {tr("Étape {0} sur {1}", [stepIdx + 1, steps.length])}
              {steps[stepIdx] && <strong>{tr(steps[stepIdx].label)}</strong>}
            </div>
            <div className="dw-eyebrow dw-aside-title">{tr("Résumé en direct")}</div>
            <dl className="dw-sum">
              {summary.map((r) => (
                <div className="dw-sum-row" key={r.label}>
                  <dt>{tr(r.label)}</dt>
                  <dd className={r.value ? (r.tone ? `tone-${r.tone}` : '') : 'is-empty'} title={r.value ? String(r.value) : undefined}>{r.value || tr('Non renseigné')}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>

        <div className="dw-foot">
          <button type="button" className="btn" onClick={stepIdx === 0 && onChangeKind ? onChangeKind : onPrev}
            style={{ visibility: stepIdx === 0 && !onChangeKind ? 'hidden' : 'visible' }}>
            <Icon name="arrow-left" />{tr("Précédent")}
          </button>
          <div className="dw-foot-right">
            <button type="button" className="btn" onClick={onSaveDraft}>{tr("Enregistrer le brouillon")}</button>
            {isLast ? (
              <button type="button" className="btn btn--primary" onClick={onSubmit} disabled={submitDisabled || submitting} aria-busy={submitting}><Icon name="send" />{submitting ? tr("Envoi en cours…") : submitLabel}</button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={onNext}>{tr("Suivant")}<Icon name="arrow-right" /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
