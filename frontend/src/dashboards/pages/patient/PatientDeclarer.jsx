import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import QrScanner from '../../components/QrScanner';
import DeclarationWizard from '../../components/DeclarationWizard';
import EvidenceUpload from '../../components/EvidenceUpload';
import useDeclarationDraft from '../../lib/useDeclarationDraft';
import { validateScannedLot } from '../../lib/lotVerification';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { listMyRecords, createRecord, uploadAttachments, getDestinations } from '../../../lib/declarationsApi';
import { listMyDoctors } from '../../../lib/careApi';
import { tr, localeTag } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Patient "Déclarer un incident" wizard — same design as the other roles
// (stepper, live summary, drafts) with the patient's own content:
//   1 Produit → 2 Symptômes → 3 Gravité → 4 Preuves → 5 Récapitulatif.
//
// The patient is the reporter, so there is no "Patient & contexte" step.
// Kept from the previous wizard: symptom checklist, simplified causality
// questions (arrêt / disparition, conditionnelles), the emergency severity level
// and the duplicate-declaration warning. Il n'y a PAS de choix de destinataires :
// aucune transmission au CNPM ni au médecin n'existe pour un patient, donc aucune n'est proposée.
//
// Real data only: the patient's registered treatments are not loaded yet, so the
// product is typed in (no treatments backend yet, so no suggestions).
// Drafts: enregistrés sur l'appareil et le compte. Pièces jointes : conservées chiffrées dans Nexus
// pour le patient seul si la conservation est activée sur le serveur, sinon refusées et signalées.
// ═══════════════════════════════════════════════════════════════

const STEPS = [
  { key: 'produit', label: 'Produit' },
  { key: 'symptomes', label: 'Symptômes' },
  { key: 'gravite', label: 'Gravité' },
  { key: 'preuves', label: 'Preuves' },
  { key: 'recap', label: 'Récapitulatif' },
];

const PRODUCT_TYPES = [
  { id: 'medicament', label: 'Médicament' },
  { id: 'dispositif', label: 'Dispositif médical' },
  { id: 'cosmetique', label: 'Cosmétique' },
  { id: 'chimique', label: 'Produit chimique' },
  // No 'reactif': an IVD / lab-reagent issue is not a patient's report to make.
];
const TYPE_LABEL = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.id, t.label]));

// The patient's own declarations (GET /api/declarations), used only for the
// duplicate-declaration guard: it warns when a recent declaration already mentions the product.
const STATUS_LABEL = { RECEIVED: 'reçue par la vigilance', PENDING: 'enregistrée, envoi en cours', FAILED: 'non reçue — à renvoyer', NOT_ROUTABLE: 'sans destinataire pour le moment' };

const SYMPTOMS = [
  { label: 'Nausées', meddra: 'MedDRA PT (illustratif) : 10028813 — Nausea' },
  { label: 'Vomissements', meddra: 'MedDRA PT (illustratif) : 10047700 — Vomiting' },
  { label: 'Douleurs abdominales', meddra: 'MedDRA PT (illustratif) : 10000081 — Abdominal pain' },
  { label: 'Éruption cutanée', meddra: 'MedDRA PT (illustratif) : 10037844 — Rash' },
  { label: 'Maux de tête', meddra: 'MedDRA PT (illustratif) : 10019211 — Headache' },
  { label: 'Vertiges', meddra: 'MedDRA PT (illustratif) : 10013573 — Dizziness' },
  { label: 'Fatigue', meddra: 'MedDRA PT (illustratif) : 10016256 — Fatigue' },
  { label: 'Dyspnée', meddra: 'MedDRA PT (illustratif) : 10013968 — Dyspnoea' },
  { label: 'Autres', meddra: null },
];

const DURATIONS = ['Moins de 24 heures', '1 à 3 jours', '4 à 7 jours', "Plus d'une semaine", 'Toujours présents'];

const SEVERITIES = [
  { id: 'legere', tone: 'green', label: 'Légère', desc: "Symptômes bénins n'entravant pas les activités quotidiennes." },
  { id: 'moderee', tone: 'amber', label: 'Modérée', desc: 'Gêne notable, consultation médicale recommandée.' },
  { id: 'grave', tone: 'red', label: 'Sévère', desc: 'Hospitalisation ou incapacité significative.' },
  { id: 'urgence', tone: 'red', label: 'Urgence vitale', desc: 'Menace vitale, perte de conscience, détresse respiratoire.' },
];

const STOPPED = [
  { id: 'stopped', label: "Oui, j'ai arrêté" },
  { id: 'continued', label: "Non, j'ai continué" },
  { id: 'reduced', label: "J'ai réduit la dose" },
  { id: 'na', label: 'Non applicable' },
];
// Résultat APRÈS l'arrêt (en pharmacovigilance : « dechallenge »). Le « rechallenge » est une réexposition : non demandé ici.
const AFTER_STOP = [
  { id: 'resolved', label: 'Oui, disparition complète' },
  { id: 'partial', label: 'Oui, amélioration partielle' },
  { id: 'persistent', label: 'Non, symptômes persistants' },
  { id: 'unknown', label: 'Je ne sais pas' },
];

const MAX_DESC = 2000;
const labelOf = (list, id) => list.find((x) => x.id === id)?.label || '';
// Date du jour LOCALE (pas UTC) : même règle que l'assistant des professionnels.
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const frDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

function initialState() {
  return {
    stepIdx: 0,
    productType: 'medicament',
    productName: '',
    manufacturerName: '',
    lotNumber: '',
    expiryDate: '',
    onsetDate: '',
    duration: DURATIONS[0],
    symptoms: [],
    symptomDesc: '',
    productStopped: '',
    dechallenge: '',
    severity: '',
  };
}

export default function PatientDeclarer({ onNavigate }) {
  const toast = useToast();
  const { user } = useAuth();
  const draftKey = `vigicore.declaration-draft.${user?.id || 'anon'}.patient`;
  const { state: s, update: set, savedAt, saveDraft, reset } = useDeclarationDraft(draftKey, initialState, toast);
  const [files, setFiles] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);

  const currentKey = STEPS[Math.min(s.stepIdx, STEPS.length - 1)].key;
  const isMed = s.productType === 'medicament';
  const sev = SEVERITIES.find((x) => x.id === s.severity);
  // La 2e question n'a de sens que si le produit a été arrêté ou réduit.
  const askAfterStop = isMed && (s.productStopped === 'stopped' || s.productStopped === 'reduced');
  const [dest, setDest] = useState(null);
  const [notes, setNotes] = useState({});
  useEffect(() => { let off = false; getDestinations().then((d) => { if (!off) setDest(d); }); return () => { off = true; }; }, []);
  // Partage avec les médecins que le patient a ACCEPTÉS (« Mes médecins ») : choix explicite, rien n'est partagé par défaut.
  const [doctors, setDoctors] = useState([]);
  const [shareWith, setShareWith] = useState([]);
  useEffect(() => {
    let off = false;
    listMyDoctors().then((r) => { if (!off && r.ok) setDoctors(r.doctors.filter((d) => d.status === 'ACCEPTED')); }).catch(() => {});
    return () => { off = true; };
  }, []);
  const toggleShare = (id) => setShareWith((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Duplicate guard: one of the patient's own recent declarations already mentions this product (first word match).
  const [mine, setMine] = useState([]);
  useEffect(() => {
    let off = false;
    listMyRecords().then((r) => {
      if (!off && r.ok) setMine(r.records);
    }).catch(() => {});    return () => { off = true; };
  }, []);
  const duplicate = useMemo(() => {
  const first = s.productName.trim().split(' ')[0].toLowerCase();
  if (first.length < 3) return null;

  const hit = mine.find((record) => {
    const product = String(
      record.fields?.find((f) => f.key === 'productName')?.value || ''
    ).toLowerCase();

    return record.status !== 'WITHDRAWN' && product.includes(first);
  });

  if (!hit) return null;

  const description = String(
    hit.fields?.find((f) => f.key === 'symptomDesc')?.value ||
    hit.fields?.find((f) => f.key === 'symptoms')?.value ||
    ''
  );

  return {
    ref: String(hit.id).slice(0, 8),
    effect: description.slice(0, 60),
    date: new Date(hit.createdAt).toLocaleDateString(localeTag()),
    status: hit.status,
  };
  }, [s.productName, mine]);

  const toggleSymptom = (label) => set((p) => ({ ...p, symptoms: p.symptoms.includes(label) ? p.symptoms.filter((x) => x !== label) : [...p.symptoms, label] }));
  function fail(title, msg) { toast('error', tr(title), tr(msg), 'ti ti-alert-triangle'); return false; }

  function validate(key) {
     if (key === 'produit') {
       if (!s.productName.trim()) {
         return fail('Produit requis', 'Indiquez le nom du produit concerné avant de continuer.');
       }
       if (!s.manufacturerName.trim()) {
         return fail('Fabricant requis', 'Indiquez le nom du fabricant du produit concerné.');
       }
}    if (key === 'symptomes') {
      if (!s.onsetDate) return fail('Date requise', "Indiquez la date d'apparition des symptômes.");
      if (s.onsetDate > todayIso()) return fail('Date invalide', "La date d'apparition ne peut pas être dans le futur.");
      if (!s.symptoms.length && !s.symptomDesc.trim()) return fail('Symptômes requis', 'Sélectionnez au moins un symptôme ou décrivez ce que vous avez ressenti.');
    }
    if (key === 'gravite' && !s.severity) return fail('Gravité requise', 'Sélectionnez la gravité de ce que vous avez ressenti.');
    return true;
  }

  const next = () => { if (validate(currentKey)) set({ stepIdx: Math.min(STEPS.length - 1, s.stepIdx + 1) }); };
  const goTo = (key) => set({ stepIdx: Math.max(0, STEPS.findIndex((x) => x.key === key)) });
  const prev = () => set({ stepIdx: Math.max(0, s.stepIdx - 1) });

    // Save the patient declaration through the native records API.
  // Patient severity "urgence" is normalized to "grave" for compatibility
  // with the shared professional severity vocabulary.
  // Keep the idempotency key while the payload remains unchanged to prevent duplicates.
  const sendingRef = useRef(false);
  const requestRef = useRef(null);
  function requestIdFor(payload) {
    const fp = JSON.stringify(payload);
    if (requestRef.current && requestRef.current.fp === fp) return requestRef.current.id;
    requestRef.current = { id: crypto.randomUUID(), fp };
    return requestRef.current.id;
  }

  async function submit() {
    for (const k of ['produit', 'symptomes', 'gravite']) {
      if (!validate(k)) { set({ stepIdx: STEPS.findIndex((x) => x.key === k) }); return; }
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      // 1) Enregistrement serveur (POST /api/records, kind PATIENT) : conservé pour le patient seul, jamais
      //    transmis à Audit, au CNPM, au fabricant ni au médecin (aucune intégration autorisée n'existe).
      const opt = (v) => { const t = String(v || '').trim(); return t || undefined; };
      const payload = {
        kind: 'PATIENT',
        productType: s.productType,
        productName: s.productName.trim(),
        manufacturerName: s.manufacturerName.trim(),
        lotNumber: opt(s.lotNumber),
        expiryDate: opt(s.expiryDate),
        onsetDate: s.onsetDate,
        duration: opt(s.duration),
        symptoms: s.symptoms,
        symptomDesc: opt(s.symptomDesc),
        productStopped: isMed ? opt(s.productStopped) : undefined,
        dechallenge: askAfterStop ? opt(s.dechallenge) : undefined,
        severity: s.severity,
      };
      const shared = shareWith.filter((id) => doctors.some((d) => d.doctorId === id));
      if (shared.length) payload.shareWithDoctorIds = shared;
      const res = await createRecord({ ...payload, clientRequestId: requestIdFor(payload) });
      if (res.outcome !== 'CREATED' && res.outcome !== 'REPLAYED') {
        toast('error', tr("Échec de l'enregistrement"), res.message ? tr(res.message) : tr("La déclaration n'a pas été enregistrée. Vos informations n'ont pas été perdues — réessayez."), 'ti ti-alert-triangle');
        return;
      }
      
      requestRef.current = null;
      let attNote = '';

      if (files.length) {
        const up = await uploadAttachments(
          res.record.id, files, 'records', notes
        ).catch(() => ({
          failed: files.map((f) => ({
            name: f.name,
            message: 'Erreur inattendue.'
          }))
        }));

        attNote = up.failed.length
          ? ` ${tr("Pièces non conservées :")} ${up.failed.map((x) => x.name).join(', ')} (${up.failed[0].message}).`
          : ` ${tr("{0} pièce(s) conservée(s) chiffrée(s), visible(s) de vous seul.", [files.length])}`;
      }

      const recordRef = String(res.record.id).slice(0, 8);
      const sharedNames = doctors
        .filter((d) => shared.includes(d.doctorId))
        .map((d) => d.displayName)
        .join(', ');

      reset();
      setFiles([]);
      setShareWith([]);
      onNavigate('declarations');

      setTimeout(() => toast(
        'success',
        tr("Déclaration enregistrée"),
        (sharedNames
          ? tr("Réf. {0} enregistrée dans votre espace et partagée avec {1}. Elle n'a pas été transmise au fabricant ni au CNPM.", [recordRef, sharedNames])
          : tr("Réf. {0} enregistrée dans votre espace. Elle n'a pas été transmise au fabricant ni au CNPM.", [recordRef])
        ) + attNote,
        'circle-check'
      ), 300);

    } catch (err) {
      console.error('submitDeclaration failed:', err);
      toast(
        'error',
        tr("Échec de l'envoi"),
        tr("La déclaration n'a pas pu être enregistrée. Vos informations n'ont pas été perdues — réessayez."),
        'ti ti-alert-triangle'
      );
    } finally {
      sendingRef.current = false;
    }
  }


  const summary = [
    { label: 'Déclarant', value: user?.name || '' },
    { label: 'Produit', value: s.productName.trim() },
    { label: 'Lot', value: s.lotNumber.trim(), tone: 'cyan' },
    { label: 'Apparition', value: frDate(s.onsetDate) },
    { label: 'Symptômes', value: s.symptoms.length ? `${s.symptoms.length} sélectionné${s.symptoms.length > 1 ? 's' : ''}` : '' },
    { label: 'Gravité', value: sev?.label || '', tone: sev?.tone },
  ];

  return (
    <>
      <QrScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={({ lot, expiry }) => { setScanOpen(false); set(expiry ? { lotNumber: lot, expiryDate: expiry } : { lotNumber: lot }); toast('success', tr("Code scanné"), tr("Lot détecté : {0}", [lot]), 'qrcode'); }}
        validate={validateScannedLot}
      />
      <DeclarationWizard
        steps={STEPS}
        stepIdx={s.stepIdx}
        savedAt={savedAt}
        summary={summary}
        onBreadcrumbClick={() => onNavigate('declarations')}
        onPrev={prev}
        onNext={next}
        onSaveDraft={() => saveDraft(false)}
        onSubmit={submit}
      >
        {/* 1. Produit */}
        {currentKey === 'produit' && (
          <>
            <h2 className="dw-card-title">{tr("Produit concerné")}</h2>
            <p className="dw-card-sub">{tr("Quel produit de santé est impliqué dans ce que vous avez ressenti ?")}</p>
            <div className="dw-field">
              <span className="dw-label">{tr("Type de produit")}</span>
              <div className="dw-chips">
                {PRODUCT_TYPES.map((t) => (
                  <button key={t.id} type="button" className={`dw-chip${s.productType === t.id ? ' is-on' : ''}`} onClick={() => set({ productType: t.id })}>{tr(t.label)}</button>
                ))}
              </div>
            </div>
            <div className="dw-field">
              <label className="dw-label" htmlFor="dwpProduct">{tr("Nom du produit")} <i>*</i></label>
              <input id="dwpProduct" className="form-input" value={s.productName} onChange={(e) => set({ productName: e.target.value })} />
            </div>
            {duplicate && (
              <div className="dw-alert is-amber" role="alert" style={{ marginBottom: 20 }}>
                <Icon name="alert-circle" />
                <div><strong>{tr("Une de vos déclarations mentionne déjà ce produit :")}</strong> {tr("Réf.")} {duplicate.ref} · {duplicate.effect} · {duplicate.date} {tr("— statut :")} {STATUS_LABEL[duplicate.status] || tr(duplicate.status)}.</div>
              </div>
            )}
            <div className="dw-row dw-row--2">
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwpLot">{tr("Numéro de lot")}</label>
                <div className="dw-inline">
                  <input id="dwpLot" className="form-input" value={s.lotNumber} onChange={(e) => set({ lotNumber: e.target.value })} />
                  <button type="button" className="btn" onClick={() => setScanOpen(true)}><Icon name="qrcode" />{tr("Scanner")}</button>
                </div>
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwpExpiry">{tr("Date de péremption")}</label>
                <input id="dwpExpiry" className="form-input" type="date" value={s.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {/* 2. Symptômes */}
        {currentKey === 'symptomes' && (
          <>
            <h2 className="dw-card-title">{tr("Symptômes")}</h2>
            <p className="dw-card-sub">{tr("Décrivez ce que vous avez ressenti, avec le plus de précision possible.")}</p>
            <div className="dw-row dw-row--2">
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwpOnset">{tr("Date d'apparition")} <i>*</i></label>
                <input id="dwpOnset" className="form-input" type="date" max={todayIso()} value={s.onsetDate} onChange={(e) => set({ onsetDate: e.target.value })} />
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwpDuration">{tr("Durée des symptômes")}</label>
                <select id="dwpDuration" className="form-input" value={s.duration} onChange={(e) => set({ duration: e.target.value })}>
                  {DURATIONS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="dw-field">
              <span className="dw-label">{tr("Symptômes observés (tout ce qui s'applique)")}</span>
              <div className="dw-chips" role="group" aria-label={tr("Symptômes observés")}>
                {SYMPTOMS.map((c) => (
                  <button key={c.label} type="button" title={c.meddra || undefined} aria-pressed={s.symptoms.includes(c.label)}
                    className={`dw-chip${s.symptoms.includes(c.label) ? ' is-on' : ''}`} onClick={() => toggleSymptom(c.label)}>{tr(c.label)}</button>
                ))}
              </div>
              <div className="dw-count" style={{ textAlign: 'left' }}>{tr("Codification MedDRA illustrative (infobulle), à confirmer par le pharmacovigilant lors de l'analyse.")}</div>
            </div>
            <div className="dw-field dw-field--grow">
              <label className="dw-label" htmlFor="dwpDesc">{tr("Description détaillée")}</label>
              <textarea id="dwpDesc" className="form-input" rows={4} maxLength={MAX_DESC} value={s.symptomDesc} onChange={(e) => set({ symptomDesc: e.target.value })} />
              <div className="dw-count">{s.symptomDesc.length} / {MAX_DESC}</div>
            </div>
            {isMed && (
              <>
                <div className="dw-rule">
                  <Icon name="info-circle" />
                  <div><strong>{tr("Questions de causalité :")}</strong> {tr("elles aident le pharmacovigilant à évaluer le lien entre le médicament et vos symptômes.")}</div>
                </div>
                <div className="dw-row dw-row--2">
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwpStop">{tr("Avez-vous arrêté ce médicament à l'apparition des symptômes ?")}</label>
                    <select id="dwpStop" className="form-input" value={s.productStopped} onChange={(e) => set({ productStopped: e.target.value, ...(e.target.value === 'stopped' || e.target.value === 'reduced' ? {} : { dechallenge: '' }) })}>
                      <option value="">—</option>
                      {STOPPED.map((o) => <option key={o.id} value={o.id}>{tr(o.label)}</option>)}
                    </select>
                  </div>
                  {askAfterStop && (
                    <div className="dw-field">
                      <label className="dw-label" htmlFor="dwpDech">{tr("Après l'arrêt, les symptômes ont-ils disparu ?")}</label>
                      <select id="dwpDech" className="form-input" value={s.dechallenge} onChange={(e) => set({ dechallenge: e.target.value })}>
                        <option value="">—</option>
                        {AFTER_STOP.map((o) => <option key={o.id} value={o.id}>{tr(o.label)}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* 3. Gravité */}
        {currentKey === 'gravite' && (
          <>
            <h2 className="dw-card-title">{tr("Gravité")}</h2>
            <p className="dw-card-sub">{tr("À quel point cela a-t-il affecté votre santé ?")}</p>
            <div className="dw-field">
              <div className="dw-sev dw-sev--2" role="radiogroup" aria-label={tr("Gravité")}>
                {SEVERITIES.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={s.severity === o.id}
                    className={`dw-sev-card is-${o.tone}${s.severity === o.id ? ' is-on' : ''}`} onClick={() => set({ severity: o.id })}>
                    <div className="dw-sev-name"><span className="dw-sev-dot" />{tr(o.label)}</div>
                    <div className="dw-sev-desc">{tr(o.desc)}</div>
                  </button>
                ))}
              </div>
            </div>
            {s.severity === 'urgence' && (
              <div className="dw-alert" role="alert">
                <Icon name="ambulance" />
                <div><strong>{tr("Urgence vitale :")}</strong> {tr("appelez immédiatement les secours (SAMU 115 ou Protection civile 14). Vous pourrez terminer cette déclaration ensuite.")}</div>
              </div>
            )}
          </>
        )}

        {/* 4. Preuves */}
        {currentKey === 'preuves' && (
          <>
            <h2 className="dw-card-title">{tr("Preuves")}</h2>
            <p className="dw-card-sub">{tr("Ajoutez des photos de l'emballage, du produit ou des effets observés pour faciliter l'analyse (facultatif).")}</p>
            <EvidenceUpload files={files} onChange={setFiles} allowedExt={['jpg', 'jpeg', 'png', 'pdf']} notes={notes} onNoteChange={(k, t) => setNotes((n) => ({ ...n, [k]: t }))} />
            <p className="dw-count" style={{ textAlign: 'left' }}>
              {dest && dest.ok && dest.storage
                ? tr("Vos fichiers sont conservés chiffrés dans Nexus et visibles de vous seul. Ils ne sont envoyés à personne.")
                : tr("La conservation des pièces n'est pas activée sur ce serveur : vos fichiers ne seraient PAS conservés. Vous pouvez continuer sans pièce jointe.")}
            </p>
          </>
        )}

        {/* 5. Récapitulatif */}
        {currentKey === 'recap' && (
          <>
            <h2 className="dw-card-title">{tr("Récapitulatif")}</h2>
            <p className="dw-card-sub">{tr("Vérifiez les informations avant l'envoi.")}</p>
            {[
              { id: 'produit', title: 'Produit', step: 'produit', rows: [
                ['Type de produit', TYPE_LABEL[s.productType]], ['Produit', s.productName.trim()], ['Lot', s.lotNumber.trim()], ['Date de péremption', frDate(s.expiryDate)],
              ] },
              { id: 'symptomes', title: 'Symptômes', step: 'symptomes', rows: [
                ["Date d'apparition", s.onsetDate ? `${frDate(s.onsetDate)} · ${s.duration}` : ''], ['Symptômes', s.symptoms.join(', ')], ['Description', s.symptomDesc.trim()],
                ...(isMed ? [['Arrêt du médicament', labelOf(STOPPED, s.productStopped)], ...(askAfterStop ? [['Disparition après arrêt', labelOf(AFTER_STOP, s.dechallenge)]] : [])] : []),
              ] },
              { id: 'gravite', title: 'Gravité', step: 'gravite', rows: [['Gravité', sev?.label]] },
              { id: 'preuves', title: 'Pièces jointes', step: 'preuves', rows: [['Fichiers', files.length ? files.map((f) => f.name).join(', ') : 'Aucune']] },
            ].map((b) => (
              <div key={b.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>{tr(b.title)}</strong>
                  <button type="button" className="btn" onClick={() => goTo(b.step)}>{tr("Modifier")}</button>
                </div>
                <div className="dw-recap">
                  {b.rows.map(([l, v]) => (
                    <div className="dw-recap-item" key={l}>
                      <div className="dw-recap-label">{tr(l)}</div>
                      <div className="dw-recap-value" style={v ? undefined : { opacity: 0.6, fontStyle: 'italic' }}>{v || tr('Non renseigné')}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginBottom: 16 }}>
              <strong>{tr("Partager avec mon médecin")}</strong>
              {doctors.length > 0 ? (
                <>
                  <p className="dw-card-sub dw-card-sub--keep" style={{ marginTop: 4 }}>{tr("Facultatif. Les médecins cochés pourront consulter cette déclaration, y compris votre description.")}</p>
                  <div className="dw-stack" role="group" aria-label={tr("Partager avec mon médecin")}>
                    {doctors.map((d) => (
                      <button key={d.doctorId} type="button" role="checkbox" aria-checked={shareWith.includes(d.doctorId)}
                        className={`dw-choice${shareWith.includes(d.doctorId) ? ' is-on' : ''}`} onClick={() => toggleShare(d.doctorId)}>
                        <Icon name={shareWith.includes(d.doctorId) ? 'circle-check' : 'stethoscope'} />
                        <div>
                          <div className="dw-choice-name">{d.displayName}</div>
                          {d.establishment && <div className="dw-choice-desc">{d.establishment}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="dw-card-sub dw-card-sub--keep" style={{ marginTop: 4 }}>{tr("Aucun médecin accepté. Cette déclaration restera visible de vous seul. Vous pouvez accepter vos médecins dans « Médecins ».")}</p>
              )}
            </div>
            <div className="dw-alert is-amber" role="note">
              <Icon name="info-circle" />
              <div>
                <strong>{tr("Où va cette déclaration ?")}</strong> {shareWith.length
                  ? tr("Elle est enregistrée dans votre espace et partagée avec les médecins cochés. Elle n'est transmise ni au CNPM ni à un fabricant.")
                  : tr("Elle est enregistrée dans votre espace VigiCore (visible de vous seul). Elle n'est transmise ni au CNPM, ni à un fabricant, ni à votre médecin.")}
              </div>
            </div>
            <p className="dw-hint" style={{ marginTop: 8 }}>{tr("En envoyant cette déclaration, vous confirmez l'exactitude des informations fournies. Les données sont traitées de manière confidentielle.")}</p>
          </>
        )}
      </DeclarationWizard>
    </>
  );
}
