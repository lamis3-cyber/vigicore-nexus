import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import QrScanner from '../../components/QrScanner';
import EvidenceUpload, { fileKey } from '../../components/EvidenceUpload';
import useDeclarationDraft from '../../lib/useDeclarationDraft';
import DeclarationWizard from '../../components/DeclarationWizard';
import { validateScannedLot } from '../../lib/lotVerification';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { addDrDeclaration } from '../../data/doctorVigilance';
import ProductCatalogueField from '../../components/ProductCatalogueField';
import { submitDeclaration as sendToAudit, createRecord, uploadAttachments, getDestinations, getRecord, resendCnpm } from '../../../lib/declarationsApi';
import { SUBMISSIONS_CHANGED_EVENT } from '../../components/MySubmissions';
import { verifyScannedCode } from '../../lib/scanCatalogue';
import {
  PRODUCT_TYPES, NATURES, SEVERITIES, PERSON_ANSWERS, EVOLUTIONS, MEASURES, DECHALLENGE, EXPOSURE_ROUTES,
  PANNE_CONTEXTS, PANNE_SYMPTOMS, PANNE_ACTIONS, DEVICE_STATES, CONSEQUENCES, EXPOSURES, IMPACT_SEVERITY, IMPACT_LABEL,
  MAX_DESC, todayIso, yesterdayIso, initialWizardState, stepsFor, identifierRules, categoryFields, validateStep, firstInvalidStep,
  composeIncidentDescription, recapSections, unfilledLabels, panneImpact, isEscalated, NATURE_LABEL, TYPE_LABEL,
  PRECURSOR_FIRST_SEEN, PRECURSOR_PATTERNS, EFFECT_SYSTEMS, EFFECT_DELAYS, ALLERGY_CLASSES, CONDITIONS,
  hasClinicalSection, hasPrecursorSection, descriptionWithAddenda, precursorOptions, precursorWording, precursorsPayload, clinicalPayload,
} from '../../lib/declarationModel';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Assistant « Déclarer » — partagé par Médecin / Pharmacien / Laboratoire / Hôpital / Clinique / Centre médical /
// Personnel médical (le portail ne change que `dept` et la page ouverte après l'envoi).
//
// Incident : Patient concerné ? (si oui, ses informations dans la même étape) → Produit → Faits → Gravité
//            → Pièces → Récapitulatif (modifiable) → Destination. Étapes fixes dès le départ ; la réponse adapte
//            la suite (natures proposées, textes de gravité, questions propres à la catégorie dans « Faits »).
// Panne    : Dispositif → Panne → Conséquences → Personne exposée → Pièces → Récapitulatif → Destination.
// Produit hors catalogue VigiCore (son fabricant n'utilise pas VigiCore Audit) : une fenêtre l'explique et propose de
// continuer vers le CNPM uniquement, de corriger le produit ou de quitter. « Catalogue injoignable » n'est JAMAIS
// confondu avec « produit absent » : rien n'est conclu tant que le catalogue n'a pas répondu.
// La DESTINATION est toujours la dernière étape. Seules les destinations réellement disponibles (vérité du serveur)
// sont proposées. Les pièces jointes sont associées à l'enregistrement Nexus ; ce qu'elles deviennent par destination
// est affiché honnêtement. Aucune transmission à VigiCore Audit n'est annoncée sans réponse de réception d'Audit.
// Brouillons : appareil + compte (voir useDeclarationDraft).
// ═══════════════════════════════════════════════════════════════

const DESTINATION_KEYS = { cnpm: ['CNPM'], org: ['ORG'], both: ['CNPM', 'ORG'] };
const NOTIFY_MS = [0, 600, 1200, 2000];

function Chips({ items, value, onPick, multi = false, label }) {
  const on = (id) => (multi ? value.includes(id) : value === id);
  return (
    <div className="dw-chips" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on(it.id)}
          className={`dw-chip${on(it.id) ? ' is-on' : ''}`} onClick={() => onPick(it.id)}>{tr(it.label)}</button>
      ))}
    </div>
  );
}

// Liste déroulante à choix multiples (combobox) : le champ lui-même sert à rechercher ; la liste s'ouvre juste dessous, collée au champ.
// Les signes choisis restent visibles en pastilles retirables. Clavier : ↓ ↑ pour parcourir, Entrée pour cocher, Échap pour fermer.
// La liste est dans le flux de la page (pas en superposition) : aucun risque d'être coupée par le cadre défilant du formulaire.
function MultiSelectList({ items, value, onToggle, label, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const uid = useRef(`dwms-${Math.random().toString(36).slice(2, 8)}`).current;
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) { setOpen(false); setQ(''); setActive(-1); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const term = q.trim().toLowerCase();
  const shown = term ? items.filter((it) => tr(it.label).toLowerCase().includes(term)) : items;
  const chosen = items.filter((it) => value.includes(it.id));
  useEffect(() => {
    if (active >= 0) document.getElementById(`${uid}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, uid]);
  const close = () => { setOpen(false); setQ(''); setActive(-1); };
  const pick = (id) => { onToggle(id); setQ(''); setActive(-1); };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { if (open) { e.preventDefault(); close(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === 'Enter' && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active].id); }
  };
  const summary = chosen.length ? `${chosen.length} ${tr(chosen.length > 1 ? 'signes sélectionnés' : 'signe sélectionné')}` : tr(placeholder);
  return (
    <div className={`dw-ms${open ? ' is-open' : ''}`} ref={box}>
      <div className="dw-ms-field">
        <input className="form-input dw-ms-input" type="text" role="combobox" aria-expanded={open} aria-controls={`${uid}-list`} aria-autocomplete="list"
          aria-activedescendant={active >= 0 && shown[active] ? `${uid}-${active}` : undefined} aria-label={label} autoComplete="off"
          value={q} placeholder={open ? tr('Rechercher un signe') : summary}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKeyDown} />
        <span className="dw-ms-caret" aria-hidden="true">▾</span>
      </div>
      {open && (
        <div id={`${uid}-list`} role="listbox" aria-multiselectable="true" aria-label={label} className="dw-ms-list">
          {shown.map((it, i) => {
            const on = value.includes(it.id);
            return (
              <div key={it.id} id={`${uid}-${i}`} role="option" aria-selected={on} className={`dw-ms-opt${on ? ' is-on' : ''}${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(it.id)}>
                <span className="dw-ms-box" aria-hidden="true">{on ? '✓' : ''}</span>{tr(it.label)}
              </div>
            );
          })}
          {shown.length === 0 && <div className="dw-ms-empty">{tr('Aucun résultat')}</div>}
        </div>
      )}
      {chosen.length > 0 && (
        <div className="dw-chips dw-ms-tags">
          {chosen.map((it) => (
            <button key={it.id} type="button" className="dw-chip is-on" aria-label={`${tr('Retirer')} ${tr(it.label)}`} onClick={() => onToggle(it.id)}>
              {tr(it.label)} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Req = () => <i>*</i>;
// Oui / Non seulement (question obligatoire) : « Je ne sais pas » n'apporte rien. Re-cliquer sur le choix actif le désélectionne.
const NOTICED_CHOICES = PERSON_ANSWERS.filter((a) => a.id !== 'inconnu');

// « Avez-vous remarqué des signes avant la panne / l'incident ? » — même bloc pour une panne d'appareil et pour un incident
// (signes propres au type de produit). Réponse obligatoire ; si « Oui », signes et délai sont demandés (voir precursorError du modèle).
function PrecursorFields({ wiz, set, toggleIn }) {
  const w = precursorWording(wiz);
  return (
    <>
      <div className="dw-field" id="dwPrecursors">
        <span className="dw-label">{tr(w.question)} <Req /></span>
        <Chips items={NOTICED_CHOICES} value={wiz.noticed} onPick={(id) => set({ noticed: wiz.noticed === id ? null : id })} label={tr(w.title)} />
      </div>
      {wiz.noticed === 'oui' && (
        <>
          <div className="dw-field">
            <span className="dw-label">{tr("Quels signes ?")} <Req /></span>
            <MultiSelectList items={precursorOptions(wiz)} value={wiz.precursorSigns} onToggle={(id) => toggleIn('precursorSigns', id)} label={tr(w.title)} placeholder="Sélectionner les signes" />
          </div>
          <div className="dw-field">
            <span className="dw-label">{tr("Depuis quand ?")} <Req /></span>
            <Chips items={PRECURSOR_FIRST_SEEN} value={wiz.firstSeen} onPick={(id) => set({ firstSeen: id })} label={tr("Depuis quand")} />
          </div>
          <div className="dw-field">
            <span className="dw-label">{tr("Comment cela se manifestait-il ?")}</span>
            <Chips items={PRECURSOR_PATTERNS} value={wiz.precursorPattern} onPick={(id) => set({ precursorPattern: id })} label={tr("Fréquence des signes")} />
          </div>
        </>
      )}
    </>
  );
}

export default function InstitutionalDeclarer({ dept, targetNavId, onNavigate, productTypes, submitDeclaration }) {
  const save = submitDeclaration || addDrDeclaration;
  const typeOptions = productTypes ? PRODUCT_TYPES.filter((t) => productTypes.includes(t.id)) : PRODUCT_TYPES;
  const toast = useToast();
  const { user } = useAuth();
  const draftKey = `vigicore.declaration-draft.${user?.id || 'anon'}.${dept || 'general'}`;

  const { state: wiz, update: set, savedAt, saveDraft, reset } = useDeclarationDraft(draftKey, initialWizardState, toast);
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState({});
  const [scanOpen, setScanOpen] = useState(false);
  const [dest, setDest] = useState({ loading: true });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [catalogue, setCatalogue] = useState({ state: 'idle', total: 0, selectable: 0 });
  const [offCatalogueAsk, setOffCatalogueAsk] = useState(false);

  const isPanne = wiz.kind === 'panne';
  const steps = stepsFor(wiz);
  const stepIdx = Math.min(wiz.stepIdx, steps.length - 1);
  const currentKey = steps[stepIdx].key;
  const impact = panneImpact(wiz);
  const escalated = isPanne && isEscalated(impact);
  const rules = identifierRules(wiz.type);

  // Destinations réellement disponibles : demandées au serveur à l'ouverture de l'étape finale.
  useEffect(() => {
    if (currentKey !== 'destination' || !dest.loading) return undefined;
    let alive = true;
    getDestinations().then((d) => { if (alive) setDest({ loading: false, ...d }); });
    return () => { alive = false; };
  }, [currentKey, dest.loading]);

  const toggleIn = (field, id) => set((w) => ({ ...w, [field]: w[field].includes(id) ? w[field].filter((x) => x !== id) : [...w[field], id] }));
  const toggleMeasure = (id) => set((w) => {
    if (id === 'aucune') return { ...w, measures: w.measures.includes('aucune') ? [] : ['aucune'] };
    const without = w.measures.filter((x) => x !== 'aucune');
    return { ...w, measures: without.includes(id) ? without.filter((x) => x !== id) : [...without, id] };
  });

  function showError(e) { toast('error', tr(e.title), tr(e.msg), 'ti ti-alert-triangle'); return false; }
  function validate(key) { const e = validateStep(key, wiz); return e ? showError(e) : true; }
  const goToStep = (key) => { const i = steps.findIndex((s) => s.key === key); if (i >= 0) set({ stepIdx: i }); };

  // Produit saisi mais non choisi dans le catalogue : on ne conclut que sur une réponse réelle du catalogue.
  // Renvoie true si l'étape peut continuer.
  function checkCatalogue({ silent = false } = {}) {
    if (isPanne || wiz.productRef || wiz.manual) return true;
    if (!wiz.type || wiz.productName.trim().length < 2) return true; // la validation normale s'en charge
    if (catalogue.state === 'loading') {
      if (!silent) toast('info', tr("Recherche en cours"), tr("Vérification du produit dans le catalogue… réessayez dans un instant."), 'ti ti-loader-2');
      return false;
    }
    if (catalogue.state === 'error') {
      if (!silent) toast('error', tr("Catalogue injoignable"), tr("Le produit ne peut pas être vérifié pour le moment. Réessayez dans un instant ; votre saisie est conservée."), 'ti ti-alert-triangle');
      return false;
    }
    if (catalogue.state === 'empty' || (catalogue.state === 'results' && catalogue.selectable === 0)) {
      setOffCatalogueAsk(true);
      return false;
    }
    return true; // des produits correspondent : la validation demandera de choisir dans la liste
  }

  function next() {
    if (currentKey === 'destination') return;
    if (currentKey === 'produit' && !checkCatalogue()) return;
    if (!validate(currentKey)) return;
    set({ stepIdx: Math.min(steps.length - 1, stepIdx + 1) });
  }
  const prev = () => set({ stepIdx: Math.max(0, stepIdx - 1) });

  const continueOffCatalogue = () => { setOffCatalogueAsk(false); set({ manual: true, productRef: null, productOrg: '', destination: 'cnpm', informManufacturer: false }); };
  const fixProduct = () => { setOffCatalogueAsk(false); setTimeout(() => document.getElementById('dwProduct')?.focus(), 0); };
  const quitDeclaration = () => { setOffCatalogueAsk(false); reset(); onNavigate(targetNavId); };

  // Un identifiant par (canal, contenu) : un double-clic ou un renvoi réseau ne crée jamais deux enregistrements ;
  // si l'utilisateur modifie quoi que ce soit, un nouvel identifiant est généré.
  const ids = useRef({});
  function requestId(channel, payload) {
    const fp = JSON.stringify(payload);
    const cur = ids.current[channel];
    if (cur && cur.fp === fp) return cur.id;
    const id = crypto.randomUUID();
    ids.current[channel] = { id, fp };
    return id;
  }
  const sending = useRef(false);
  const notifySubmissionsChanged = () => { try { window.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT)); } catch { /* ignore */ } };

  // ── Corps des requêtes ────────────────────────────────────────
  const opt = (x) => { const t = String(x ?? '').trim(); return t || undefined; };

  function deviceBody() {
    return {
      name: wiz.deviceName.trim(), brand: opt(wiz.brand), model: opt(wiz.model), serialNumber: opt(wiz.serial),
      inventoryNumber: opt(wiz.inventory), udi: opt(wiz.udi), lastMaintenanceDate: wiz.maintenanceDone ? opt(wiz.lastMaintenance) : undefined,
    };
  }
  function malfunctionBody() {
    return {
      occurredOn: wiz.onsetDate, occurredAt: opt(wiz.onsetTime), context: wiz.context,
      symptoms: wiz.symptoms.length ? wiz.symptoms : undefined, errorCode: opt(wiz.errorCode),
      actionTaken: wiz.action || undefined, maintenanceTicket: wiz.maintenanceDone ? opt(wiz.ticket) : undefined,
      deviceState: wiz.deviceState, impact, precursors: precursorsPayload(wiz),
    };
  }
  function incidentRecordBody() {
    const person = wiz.personConcerned === 'oui' ? {
      label: opt(wiz.patientName), age: opt(wiz.patientAge), sex: wiz.patientSex || undefined, service: opt(wiz.service),
      evolution: wiz.evolution || undefined,
      ...(categoryFields(wiz.type).includes('dechallenge') ? { dechallenge: wiz.dechallenge || undefined, otherProducts: opt(wiz.otherProducts) } : {}),
      ...(categoryFields(wiz.type).includes('applicationZone') ? { applicationZone: opt(wiz.applicationZone) } : {}),
      ...(categoryFields(wiz.type).includes('exposureRoute') ? { exposureRoute: wiz.exposureRoute || undefined } : {}),
      ...(categoryFields(wiz.type).includes('reagentResult') ? { reagentResult: opt(wiz.reagentResult), instrument: opt(wiz.instrument) } : {}),
    } : undefined;
    return {
      kind: 'INCIDENT',
      productType: wiz.type, productName: wiz.productName.trim(), productRef: wiz.manual ? undefined : (wiz.productRef || undefined), manual: wiz.manual,
      manufacturerName: opt(wiz.manufacturer), manufacturerReference: opt(wiz.manufacturerRef),
      lot: opt(wiz.lot), serial: opt(wiz.serial), udi: opt(wiz.udi), expiryDate: opt(wiz.expiry),
      nature: wiz.problemType, onsetDate: wiz.onsetDate, circumstances: opt(wiz.circumstances), description: descriptionWithAddenda(wiz),
      severity: wiz.severity, personConcerned: wiz.personConcerned, consequences: opt(wiz.consequences), measures: wiz.measures,
      person, clinical: clinicalPayload(wiz), precursors: precursorsPayload(wiz), attachmentNames: files.map((f) => f.name),
    };
  }
  function panneRecordBody() {
    return {
      kind: 'INTERNAL_PANNE', description: descriptionWithAddenda(wiz), service: opt(wiz.service),
      attachmentNames: files.map((f) => f.name), device: deviceBody(), malfunction: malfunctionBody(),
      manufacturerReference: opt(wiz.manufacturerRef), catalogueRef: wiz.productRef || undefined,
    };
  }

  // Le fabricant ne peut être informé que si Audit peut router (produit du catalogue) et, pour une panne, si l'appareil est identifié.
  const manufacturerPossible = !!wiz.productRef && !wiz.manual
    && (!isPanne || !!(wiz.serial.trim() || wiz.inventory.trim() || wiz.udi.trim()));
  const manufacturerOffered = manufacturerPossible && dest.ok && dest.manufacturer;

  // Produit hors catalogue (incident) : CNPM uniquement, comme confirmé par l'utilisateur.
  const cnpmOnly = !isPanne && wiz.manual;
  // Destinataires : choix multiple parmi CNPM, établissement et fabricant (seuls ceux réellement disponibles sont activables).
  // État : wiz.destination ('cnpm' | 'org' | 'both' | 'none' | null) + wiz.informManufacturer.
  const cnpmAvail = dest.ok && !!dest.cnpm;
  const orgAvail = !cnpmOnly && dest.ok && !!dest.org;
  const onlyOne = [cnpmAvail, orgAvail, manufacturerOffered].filter(Boolean).length === 1;
  const pickedCnpm = cnpmAvail && (['cnpm', 'both'].includes(wiz.destination) || (wiz.destination == null && onlyOne));
  const pickedOrg = orgAvail && (['org', 'both'].includes(wiz.destination) || (wiz.destination == null && onlyOne));
  const pickedMfr = manufacturerOffered && !!wiz.informManufacturer;
  const effectiveDest = pickedCnpm && pickedOrg ? 'both' : pickedCnpm ? 'cnpm' : pickedOrg ? 'org' : null;
  const noDestination = !dest.loading && dest.ok && !cnpmAvail && !orgAvail && !manufacturerOffered;
  const toggleRecipient = (id) => {
    if (id === 'mfr') { set({ informManufacturer: !pickedMfr }); return; }
    const c = id === 'cnpm' ? !pickedCnpm : pickedCnpm;
    const o = id === 'org' ? !pickedOrg : pickedOrg;
    set({ destination: c && o ? 'both' : c ? 'cnpm' : o ? 'org' : 'none' });
  };
  const recipients = [
    { id: 'cnpm', icon: 'shield-check', eyebrow: 'Autorité nationale', name: 'CNPM',
      desc: 'Notification officielle par e-mail, pièces jointes incluses.',
      avail: cnpmAvail, on: pickedCnpm, why: "Indisponible : l'envoi d'e-mail vers le CNPM n'est pas configuré." },
    { id: 'org', icon: 'building-hospital', eyebrow: 'Mon établissement', name: dest.org?.name || 'Mon établissement',
      desc: 'Visible par les responsables vigilance de votre établissement.',
      avail: orgAvail, on: pickedOrg,
      why: cnpmOnly ? 'Non disponible pour un produit hors catalogue.' : 'Indisponible : aucun rattachement actif à un établissement.' },
    { id: 'mfr', icon: 'building-factory-2', eyebrow: 'Fabricant du produit', name: wiz.productOrg || 'Fabricant',
      desc: 'Via VigiCore Audit, sans données du patient ni pièces jointes.',
      avail: manufacturerOffered, on: pickedMfr,
      why: cnpmOnly ? "Produit hors catalogue : le fabricant n'est pas relié à VigiCore Audit."
        : !wiz.productRef ? 'Produit non rattaché au catalogue VigiCore.'
        : !manufacturerPossible ? "Identifiez l'appareil (n° de série, inventaire ou UDI) pour informer le fabricant."
        : 'Indisponible : la liaison avec VigiCore Audit n\'est pas configurée.' },
  ];
  const pickedNames = recipients.filter((r) => r.avail && r.on).map((r) => r.name);

  async function submitAll() {
    const bad = firstInvalidStep(wiz);
    if (bad) { goToStep(bad.key); showError(bad); return; }
    if (dest.loading || !dest.ok) { toast('error', tr("Destinations indisponibles"), tr("Impossible de vérifier les destinations disponibles : réessayez dans un instant."), 'ti ti-alert-triangle'); return; }
    if (!effectiveDest && !pickedMfr && !noDestination) { toast('error', tr("Destinataire requis"), tr("Sélectionnez au moins un destinataire pour cette déclaration."), 'ti ti-alert-triangle'); return; }
    if (!effectiveDest && !pickedMfr) { toast('error', tr("Aucune destination disponible"), tr("Ni le CNPM ni votre organisation ne peuvent recevoir cette déclaration pour le moment. Elle reste dans votre brouillon."), 'ti ti-alert-triangle'); return; }
    if (sending.current) return;
    sending.current = true; setSubmitting(true);
    const destinations = effectiveDest ? DESTINATION_KEYS[effectiveDest] : [];
    const informManufacturer = pickedMfr;
    try {
      // 1. Enregistrement dans Nexus (maître de la déclaration) — seulement si CNPM ou organisation est choisi.
      let rec = null;
      if (destinations.length) {
        const body = isPanne ? panneRecordBody() : incidentRecordBody();
        const r = await createRecord({ ...body, destinations, informManufacturer, clientRequestId: requestId('record', { body, destinations, informManufacturer }) });
        if (r.outcome !== 'CREATED' && r.outcome !== 'REPLAYED') {
          toast('error', tr("Échec de l'enregistrement"), r.message ? tr(r.message) : tr("La déclaration n'a pas été enregistrée. Vos informations n'ont pas été perdues — réessayez."), 'ti ti-alert-triangle');
          if (r.outcome === 'REJECTED') delete ids.current.record;
          return;
        }
        rec = r.record;
      }
      // 2. Pièces jointes : associées à l'enregistrement (conservation chiffrée si disponible) puis envoyées au CNPM si choisi.
      let att = null;
      if (rec && files.length) {
        try { att = await uploadAttachments(rec.id, files, 'records', notes); }
        catch (e) { console.error('uploadAttachments failed:', e); att = { sent: [], failed: files.map((f) => ({ name: f.name, message: 'Erreur inattendue.' })), results: [] }; }
      }
      // 3. Fabricant (séparé du choix de destination) : VigiCore Audit, sans fichiers ni identité de la personne.
      let audit = null;
      if (informManufacturer) {
        const payload = isPanne ? {
          kind: 'DEVICE_MALFUNCTION', productRef: wiz.productRef, productLabel: opt(wiz.productName),
          description: [descriptionWithAddenda(wiz), wiz.service.trim() ? `\nService / localisation : ${wiz.service.trim()}.` : null].filter(Boolean).join(''),
          declaredSeverity: IMPACT_SEVERITY[impact], device: deviceBody(), malfunction: malfunctionBody(),
        } : {
          productRef: wiz.productRef, productLabel: wiz.productName.trim() || undefined,
          description: composeIncidentDescription(wiz), lotNumber: opt(wiz.lot), manufacturerReference: opt(wiz.manufacturerRef), declaredSeverity: wiz.severity,
          clinical: clinicalPayload(wiz),
        };
        try {
          audit = await sendToAudit({ ...payload, notifyCnpm: false, nexusRecordId: rec?.id, clientRequestId: requestId('audit', payload) });
          if (audit.outcome === 'REJECTED') delete ids.current.audit;
        } catch (e) { console.error('sendToAudit failed:', e); audit = { outcome: 'ERROR', message: 'Erreur inattendue pendant la transmission au fabricant.' }; }
        notifySubmissionsChanged();
      }
      // 4. Mémoire locale de la liste « Mes déclarations » (comportement existant).
      try { save(localRow()); } catch { /* la liste locale n'est qu'un confort d'affichage */ }
      // 5. État réel de chaque destination (le serveur a pu terminer l'envoi après la réponse initiale).
      let fresh = rec;
      if (rec) {
        try {
          for (const ms of NOTIFY_MS) {
            if (ms) await new Promise((r) => setTimeout(r, ms));
            const g = await getRecord(rec.id);
            if (g.ok && g.record) { fresh = g.record; if (!(g.record.deliveries || []).some((d) => d.status === 'PENDING')) break; }
          }
        } catch (e) { console.error('getRecord failed:', e); }
      }
      reset(); ids.current = {};
      setDone({ record: fresh, att, audit, informManufacturer, destinations, fileCount: files.length, ref: wiz.productName || wiz.deviceName });
      setFiles([]); setNotes({});
    } catch (err) {
      console.error('submitAll failed:', err);
      toast('error', tr("Échec de l'envoi"), `${tr("La déclaration n'a pas pu être envoyée. Vos informations n'ont pas été perdues — réessayez.")} (${String(err?.message || err).slice(0, 160)})`, 'ti ti-alert-triangle');
    } finally { sending.current = false; setSubmitting(false); }
  }

  function localRow() {
    if (isPanne) {
      const lotLabel = wiz.serial.trim() ? 'N° série' : wiz.inventory.trim() ? 'N° inventaire' : 'UDI';
      return {
        type: 'dispositif', kind: 'panne', patientId: null, manualPatientName: 'Aucun patient concerné', manualPatientIdNum: null, patientAge: null,
        service: wiz.service.trim() || null, product: `${wiz.deviceName.trim()}${wiz.model.trim() ? ` ${wiz.model.trim()}` : ''}`,
        lot: wiz.serial.trim() || wiz.inventory.trim() || wiz.udi.trim() || 'N/C', lotLabel, manufacturer: wiz.brand.trim() || 'Non précisé',
        problemType: 'appareil', description: wiz.description.trim(), severity: IMPACT_SEVERITY[impact], onsetDate: wiz.onsetDate,
        attachmentNames: files.map((f) => f.name), impact, escalated, refPrefix: escalated ? null : 'PN',
        device: { name: wiz.deviceName.trim(), brand: wiz.brand.trim(), model: wiz.model.trim(), serial: wiz.serial.trim(), inventory: wiz.inventory.trim(), udi: wiz.udi.trim(), lastMaintenance: wiz.lastMaintenance || null },
        panne: { time: wiz.onsetTime || null, context: wiz.context, symptoms: wiz.symptoms, errorCode: wiz.errorCode.trim() || null, action: wiz.action, ticket: wiz.ticket.trim() || null, deviceState: wiz.deviceState, precursors: precursorsPayload(wiz) || null },
        dept,
      };
    }
    const person = wiz.personConcerned === 'oui';
    return {
      type: wiz.type, patientId: null, manualPatientName: person ? (wiz.patientName.trim() || 'Personne concernée') : 'Aucun patient concerné',
      manualPatientIdNum: null, patientAge: person ? wiz.patientAge : null, patientSex: person ? wiz.patientSex : null,
      service: wiz.service.trim() || null, product: wiz.productName.trim(), lot: wiz.lot.trim() || wiz.serial.trim() || wiz.udi.trim() || 'N/C',
      manufacturer: wiz.manufacturer.trim() || 'Non précisé', problemType: wiz.problemType, description: wiz.description.trim(), severity: wiz.severity,
      onsetDate: wiz.onsetDate, outcome: wiz.evolution || null,
      productStopped: wiz.measures.includes('retire') || wiz.measures.includes('arrete') ? 'oui' : (wiz.measures.length ? 'non' : null),
      attachmentNames: files.map((f) => f.name), kind: 'incident', dept,
    };
  }

  // ── Résumé en direct ──────────────────────────────────────────
  const sev = SEVERITIES.find((s) => s.id === wiz.severity);
  const summary = useMemo(() => (isPanne ? [
    { label: 'Dispositif', value: wiz.deviceName.trim() },
    { label: 'Modèle', value: wiz.model.trim() },
    { label: 'N° série', value: wiz.serial.trim() || wiz.inventory.trim(), tone: 'cyan' },
    { label: 'Conséquence', value: impact ? IMPACT_LABEL[impact] : '', tone: impact === 'injury' ? 'red' : impact === 'none' ? 'green' : impact ? 'amber' : undefined },
  ] : [
    { label: 'Produit', value: wiz.productName.trim() },
    { label: 'Catégorie', value: TYPE_LABEL[wiz.type] || '' },
    { label: wiz.type === 'dispositif' ? 'N° série / UDI' : 'Lot', value: wiz.type === 'dispositif' ? (wiz.serial.trim() || wiz.udi.trim()) : wiz.lot.trim(), tone: 'cyan' },
    { label: 'Nature', value: NATURE_LABEL[wiz.problemType] || '' },
    { label: 'Gravité', value: sev?.label || '', tone: sev?.tone },
  ]), [isPanne, wiz.deviceName, wiz.model, wiz.serial, wiz.inventory, impact, wiz.productName, wiz.type, wiz.lot, wiz.udi, wiz.problemType, sev]);

  const sections = useMemo(() => recapSections(wiz, files.map((f) => ({ name: f.name, size: f.size, note: notes[fileKey(f)] }))), [wiz, files, notes]);
  const missing = unfilledLabels(sections);

  // ── Résultat après l'envoi ────────────────────────────────────
  if (done) return <ResultScreen done={done} onFinish={() => onNavigate(targetNavId)} toast={toast} />;

  // ── Premier écran : panne ou incident ? ───────────────────────
  if (!wiz.kind) {
    return (
      <div className="view is-active">
        <div className="dw">
          <div className="dw-head">
            <div>
              <div className="dw-crumb"><button type="button" onClick={() => onNavigate(targetNavId)}>{tr("Déclarations")}</button> {tr("› Nouvelle déclaration")}</div>
              <h1 className="dw-title">{tr("Nouvelle")} <span>{tr("déclaration")}</span></h1>
            </div>
            {savedAt && <div className="dw-pill" role="status"><Icon name="check" />{tr("Brouillon enregistré à")} {savedAt}</div>}
          </div>
          <div className="dw-card">
            <h2 className="dw-card-title">{tr("Que souhaitez-vous signaler ?")}</h2>
            <p className="dw-card-sub">{tr("Une panne n'est pas forcément un incident de vigilance : tout dépend de l'exposition d'une personne à un risque.")}</p>
            <div className="dw-kinds">
              <button type="button" className="dw-kind" onClick={() => set({ kind: 'incident', stepIdx: 0 })}>
                <Icon name="alert-triangle" />
                <div className="dw-kind-name">{tr("Incident / effet indésirable")}</div>
                <div className="dw-kind-desc">{tr("Un produit (médicament, dispositif, cosmétique, réactif…) a provoqué ou pourrait provoquer un effet néfaste, ou présente un défaut.")}</div>
                <div className="dw-kind-when">{tr("Ex. : effet indésirable chez un patient, défaut qualité, emballage endommagé.")}</div>
              </button>
              <button type="button" className="dw-kind" onClick={() => set({ kind: 'panne', stepIdx: 0 })}>
                <Icon name="settings" />
                <div className="dw-kind-name">{tr("Panne / dysfonctionnement d'un dispositif")}</div>
                <div className="dw-kind-desc">{tr("Un appareil s'est arrêté ou a mal fonctionné. Vous précisez ensuite si une personne a été exposée à un risque.")}</div>
                <div className="dw-kind-when">{tr("Ex. : arrêt en cours d'utilisation, mesure erronée, alarme persistante.")}</div>
              </button>
            </div>
            <p className="dw-hint">{tr("Vous pourrez changer de type tant que la déclaration n'est pas envoyée.")}</p>
          </div>
        </div>
      </div>
    );
  }

  const productField = (idForInput, labelText) => (
    <div className="dw-field">
      <label className="dw-label" htmlFor={idForInput}>{tr(labelText)} {!isPanne && <Req />}</label>
      <ProductCatalogueField
        id={idForInput}
        value={wiz.productName}
        selected={wiz.productRef ? { productRef: wiz.productRef, organizationName: wiz.productOrg } : null}
        onChange={(text) => set({ productName: text, productRef: null, productOrg: '', ...(isPanne ? {} : { manual: false }) })}
        onSelect={(p) => set({ productName: p.name, productRef: p.productRef, productOrg: p.organizationName, manual: false })}
        onStatus={(st) => setCatalogue((cur) => (cur.state === st.state && cur.total === st.total && cur.selectable === st.selectable ? cur : st))}
      />
    </div>
  );

  return (
    <>
      <QrScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={async (parsed) => {
          const { lot } = parsed;
          setScanOpen(false);
          set(isPanne || wiz.type === 'dispositif' ? { udi: lot } : { lot });
          toast('success', tr("Code scanné"), tr("Code détecté : {0}", [lot]), 'ti ti-qrcode');
          const v = await verifyScannedCode(parsed);
          if (v.status === 'found') {
            const p = v.product;
            if (!wiz.productRef && p.intakeAvailable) set({ productName: p.name, productRef: p.productRef, productOrg: p.organizationName, manual: false });
            toast('success', tr("Produit reconnu dans la base"), tr("{0} ({1}) correspond à ce code. Vérifiez qu'il s'agit bien du produit concerné ; le lot lui-même n'est pas vérifié par le catalogue.", [p.name, p.organizationName]), 'ti ti-circle-check');
          } else if (v.status === 'notFound') {
            toast('warn', tr("Produit non trouvé dans la base"), tr("Aucun produit du catalogue ne correspond à ce code. Le numéro est conservé : saisissez le nom du produit ou revérifiez l'emballage."), 'ti ti-alert-triangle');
          } else {
            toast('warn', tr("Vérification impossible"), tr("Le catalogue est momentanément injoignable : le code est conservé, rien n'a été vérifié."), 'ti ti-alert-triangle');
          }
        }}
        validate={validateScannedLot}
      />
      {offCatalogueAsk && (
        <div className="dw-modal-backdrop" role="presentation" onClick={fixProduct}>
          <div className="dw-modal" role="alertdialog" aria-modal="true" aria-labelledby="dwOffTitle" aria-describedby="dwOffText" onClick={(e) => e.stopPropagation()}>
            <div className="dw-modal-icon"><Icon name="package" /></div>
            <h2 id="dwOffTitle" className="dw-card-title">{tr("Produit absent de notre catalogue")}</h2>
            <p id="dwOffText" className="dw-card-sub">
              {tr("« {0} » ne figure pas dans le catalogue VigiCore : son fabricant n'utilise pas le logiciel VigiCore Audit. Nous ne pouvons donc pas lui transmettre cette déclaration.", [wiz.productName.trim()])}
            </p>
            <p className="dw-card-sub">{tr("Vous pouvez tout de même la déclarer au CNPM, l'autorité nationale de vigilance, ou quitter la déclaration.")}</p>
            <div className="dw-modal-actions">
              <button type="button" className="btn btn--primary" autoFocus onClick={continueOffCatalogue}><Icon name="shield-check" />{tr("Continuer et déclarer au CNPM")}</button>
              <button type="button" className="btn" onClick={fixProduct}><Icon name="edit" />{tr("Corriger le nom du produit")}</button>
              <button type="button" className="btn btn--danger" onClick={quitDeclaration}><Icon name="x" />{tr("Quitter la déclaration")}</button>
            </div>
          </div>
        </div>
      )}
      <DeclarationWizard
        breadcrumb={['Déclarations', 'Nouvelle déclaration', isPanne ? 'Panne' : 'Incident']}
        titlePrefix={isPanne ? 'Déclarer une' : 'Déclarer un'}
        accent={isPanne ? 'panne' : 'incident'}
        steps={steps}
        stepIdx={stepIdx}
        savedAt={savedAt}
        summary={summary}
        onBreadcrumbClick={() => onNavigate(targetNavId)}
        onChangeKind={() => set({ kind: null, stepIdx: 0 })}
        onPrev={prev}
        onNext={next}
        onSaveDraft={() => { saveDraft(false); onNavigate(targetNavId); }}
        onSubmit={submitAll}
        submitting={submitting}
        submitDisabled={dest.loading || noDestination}
        submitLabel="Envoyer la déclaration"
      >
        {/* ══ INCIDENT 1 · Patient & contexte ═════════════════ */}
        {currentKey === 'patient' && (
          <>
            <h2 className="dw-card-title">{tr("Patient & contexte")}</h2>
            <div className="dw-stack" role="radiogroup" aria-label={tr("Patient concerné")}>
              <button type="button" role="radio" aria-checked={wiz.personConcerned === 'oui'}
                className={`dw-choice${wiz.personConcerned === 'oui' ? ' is-on' : ''}`}
                onClick={() => set({ personConcerned: 'oui' })}>
                <Icon name="user-check" />
                <div>
                  <div className="dw-choice-name">{tr("Patient concerné")}</div>
                  <div className="dw-choice-desc">{tr("Un patient est directement concerné par cet incident.")}</div>
                </div>
              </button>
              <button type="button" role="radio" aria-checked={wiz.personConcerned === 'non'}
                className={`dw-choice${wiz.personConcerned === 'non' ? ' is-on' : ''}`}
                onClick={() => set((w) => ({ ...w, personConcerned: 'non', ...(w.problemType === 'resultat' ? { problemType: null } : {}), stepIdx: Math.max(w.stepIdx, 1) }))}>
                <Icon name="user-off" />
                <div>
                  <div className="dw-choice-name">{tr("Sans patient")}</div>
                  <div className="dw-choice-desc">{tr("Incident matériel ou produit sans lien direct avec un patient (équipement, lot défectueux).")}</div>
                </div>
              </button>
            </div>
            {wiz.personConcerned === 'oui' && (
              <div style={{ marginTop: 18 }}>
                <p className="dw-card-sub">{tr("Informations du patient — les champs marqués * sont obligatoires.")}</p>
                <div className="dw-row">
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwPName">{tr("Nom du patient (initiales)")} <Req /></label>
                    <input id="dwPName" className="form-input" maxLength={10} placeholder={tr("ex. : M.B.")} required aria-required="true" value={wiz.patientName} onChange={(e) => set({ patientName: e.target.value })} />
                  </div>
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwAge">{tr("Âge")} <Req /></label>
                    <input id="dwAge" className="form-input" required aria-required="true" type="number" min="0" max="120" value={wiz.patientAge} onChange={(e) => set({ patientAge: e.target.value })} />
                  </div>
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwSex">{tr("Sexe")} <Req /></label>
                    <select id="dwSex" className="form-input" required aria-required="true" value={wiz.patientSex} onChange={(e) => set({ patientSex: e.target.value })}>
                      <option value="">—</option><option value="F">{tr("Féminin")}</option><option value="M">{tr("Masculin")}</option>
                    </select>
                  </div>
                </div>
                <div className="dw-row dw-row--2">
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwService">{tr("Service / unité")}</label>
                    <input id="dwService" className="form-input" value={wiz.service} onChange={(e) => set({ service: e.target.value })} />
                  </div>
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwEvol">{tr("Évolution")} <Req /></label>
                    <select id="dwEvol" className="form-input" required aria-required="true" value={wiz.evolution} onChange={(e) => set({ evolution: e.target.value })}>
                      <option value="">—</option>
                      {wiz.evolution === 'hospitalisation' && <option value="hospitalisation">{tr('Hospitalisation')}</option>}
                      {EVOLUTIONS.map((e) => <option key={e.id} value={e.id}>{tr(e.label)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ INCIDENT 1 · Produit ═════════════════════════════ */}
        {currentKey === 'produit' && (
          <>
            <h2 className="dw-card-title">{tr("Produit et identification")}</h2>
            <p className="dw-card-sub">{tr("Identifiez le produit à l'origine de l'événement à partir du catalogue VigiCore, puis son numéro d'identification.")}</p>
            <div className="dw-field">
              <span className="dw-label">{tr("Catégorie de produit")} <Req /></span>
              <Chips items={typeOptions} value={wiz.type} onPick={(id) => set({ type: id })} label={tr("Catégorie de produit")} />
            </div>
            {productField('dwProduct', 'Produit')}
            {wiz.manual && (
              <div className="dw-alert is-amber" role="note">
                <Icon name="info-circle" />
                <div>
                  {tr("Produit hors catalogue VigiCore : son fabricant n'utilise pas VigiCore Audit. Cette déclaration sera adressée au CNPM uniquement.")}{' '}
                  <button type="button" className="btn" style={{ marginLeft: 6 }} onClick={() => { set({ manual: false, productName: '', destination: null, informManufacturer: true }); fixProduct(); }}>{tr("Choisir un autre produit")}</button>
                </div>
              </div>
            )}
            <div className="dw-row dw-row--2">
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwManuf">{tr("Nom du fabricant")}</label>
                <input id="dwManuf" className="form-input" value={wiz.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} />
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwManufRef">{tr("Référence du produit chez le fabricant")}</label>
                <input id="dwManufRef" className="form-input" value={wiz.manufacturerRef} onChange={(e) => set({ manufacturerRef: e.target.value })} />
              </div>
            </div>
            {rules.lot !== 'hidden' && (
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwLot">{tr("Numéro de lot")} {rules.lot === 'required' && <Req />}</label>
                <div className="dw-inline">
                  <input id="dwLot" className="form-input" value={wiz.lot} onFocus={() => checkCatalogue({ silent: true })} onChange={(e) => set({ lot: e.target.value })} />
                  <button type="button" className="btn" onClick={() => setScanOpen(true)}><Icon name="scan" />{tr("Scanner")}</button>
                </div>
                <div className="dw-count" style={{ textAlign: 'left' }}>{tr("Le lot est le numéro de fabrication commun à plusieurs unités.")}</div>
              </div>
            )}
            {rules.serialUdi !== 'hidden' && (
              <div className="dw-field">
                <span className="dw-label">{tr("Identifiant de l'unité (n° de série ou UDI)")} <Req /></span>
                <div className="dw-row dw-row--2">
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwSerialI">{tr("N° de série")}</label>
                    <input id="dwSerialI" className="form-input" value={wiz.serial} onFocus={() => checkCatalogue({ silent: true })} onChange={(e) => set({ serial: e.target.value })} />
                  </div>
                  <div className="dw-field">
                    <label className="dw-label" htmlFor="dwUdiI">{tr("UDI")}</label>
                    <div className="dw-inline">
                      <input id="dwUdiI" className="form-input" value={wiz.udi} onFocus={() => checkCatalogue({ silent: true })} onChange={(e) => set({ udi: e.target.value })} />
                      <button type="button" className="btn" onClick={() => setScanOpen(true)}><Icon name="scan" />{tr("Scanner")}</button>
                    </div>
                  </div>
                </div>
                <div className="dw-count" style={{ textAlign: 'left' }}>{tr("Le n° de série identifie une unité précise ; l'UDI est l'identifiant unique du dispositif.")}</div>
              </div>
            )}
            {rules.expiry !== 'hidden' && (
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwExpiry">{tr("Date de péremption (si indiquée sur le produit)")}</label>
                <input id="dwExpiry" className="form-input" type="date" value={wiz.expiry} onChange={(e) => set({ expiry: e.target.value })} />
              </div>
            )}
          </>
        )}

        {/* ══ INCIDENT 2 · Faits ═══════════════════════════════ */}
        {currentKey === 'faits' && (
          <>
            <h2 className="dw-card-title">{tr("Description des faits")}</h2>
            <p className="dw-card-sub">{tr("Décrivez ce qui s'est passé, avec le plus de précision possible.")}</p>
            <div className="dw-field">
              <span className="dw-label">{tr("Nature de l'événement")} <Req /></span>
              <Chips items={wiz.personConcerned === 'non' ? NATURES.filter((n) => n.id !== 'resultat') : NATURES} value={wiz.problemType} onPick={(id) => set({ problemType: id })} label={tr("Nature de l'événement")} />
            </div>
            <div className="dw-row dw-row--2">
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwDate">{tr("Date de survenue ou de découverte")} <Req /></label>
                <input id="dwDate" className="form-input" type="date" max={todayIso()} value={wiz.onsetDate} onChange={(e) => set({ onsetDate: e.target.value })} />
                <div className="dw-inline" style={{ marginTop: 6, gap: 6 }}>
                  <button type="button" className="btn u-btn-sm" onClick={() => set({ onsetDate: todayIso() })}>{tr("Aujourd'hui")}</button>
                  <button type="button" className="btn u-btn-sm" onClick={() => set({ onsetDate: yesterdayIso() })}>{tr("Hier")}</button>
                </div>
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwCirc">{tr("Circonstances")}</label>
                <input id="dwCirc" className="form-input" maxLength={300} value={wiz.circumstances} onChange={(e) => set({ circumstances: e.target.value })} />
              </div>
            </div>
            {hasPrecursorSection(wiz) && <PrecursorFields wiz={wiz} set={set} toggleIn={toggleIn} />}
            <div className="dw-field dw-field--grow">
              <label className="dw-label" htmlFor="dwDesc">{tr("Description détaillée")} <Req /></label>
              <textarea id="dwDesc" className="form-input" rows={6} maxLength={MAX_DESC} value={wiz.description} onChange={(e) => set({ description: e.target.value })} />
              <div className="dw-count">{wiz.description.length} / {MAX_DESC}</div>
            </div>
            {wiz.personConcerned === 'oui' && categoryFields(wiz.type).length > 0 && (
              <>
                <span className="dw-label" style={{ marginTop: 6 }}>{tr("Concernant le patient")}</span>
            {categoryFields(wiz.type).includes('dechallenge') && (
              <>
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwDech">{tr("Si le produit a été arrêté, les symptômes ont-ils disparu ?")}</label>
                  <select id="dwDech" className="form-input" value={wiz.dechallenge} onChange={(e) => set({ dechallenge: e.target.value })}>
                    <option value="">—</option>{DECHALLENGE.map((e) => <option key={e.id} value={e.id}>{tr(e.label)}</option>)}
                  </select>
                </div>
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwOther">{tr("Autres produits pris en même temps")}</label>
                  <input id="dwOther" className="form-input" maxLength={300} value={wiz.otherProducts} onChange={(e) => set({ otherProducts: e.target.value })} />
                </div>
              </>
            )}
            {categoryFields(wiz.type).includes('applicationZone') && (
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwZone">{tr("Zone d'application")}</label>
                <input id="dwZone" className="form-input" maxLength={200} value={wiz.applicationZone} onChange={(e) => set({ applicationZone: e.target.value })} />
              </div>
            )}
            {categoryFields(wiz.type).includes('exposureRoute') && (
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwRoute">{tr("Voie d'exposition")}</label>
                <select id="dwRoute" className="form-input" value={wiz.exposureRoute} onChange={(e) => set({ exposureRoute: e.target.value })}>
                  <option value="">—</option>{EXPOSURE_ROUTES.map((e) => <option key={e.id} value={e.id}>{tr(e.label)}</option>)}
                </select>
              </div>
            )}
            {categoryFields(wiz.type).includes('reagentResult') && (
              <div className="dw-row dw-row--2">
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwRRes">{tr("Résultat concerné")}</label>
                  <input id="dwRRes" className="form-input" maxLength={200} value={wiz.reagentResult} onChange={(e) => set({ reagentResult: e.target.value })} />
                </div>
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwInstr">{tr("Instrument utilisé")}</label>
                  <input id="dwInstr" className="form-input" maxLength={200} value={wiz.instrument} onChange={(e) => set({ instrument: e.target.value })} />
                </div>
              </div>
            )}
            {hasClinicalSection(wiz) && (
              <>
                <span className="dw-label" style={{ marginTop: 10 }}>{tr("Effets associés et terrain du patient")}</span>
                <div className="dw-field">
                  <span className="dw-label">{tr("Autres effets ressentis")}</span>
                  <Chips items={EFFECT_SYSTEMS} value={wiz.effectSystems} multi label={tr("Autres effets ressentis")}
                    onPick={(id) => set((w) => {
                      const on = w.effectSystems.includes(id);
                      const delays = { ...w.effectDelays };
                      if (on) delete delays[id];
                      return { ...w, effectSystems: on ? w.effectSystems.filter((x) => x !== id) : [...w.effectSystems, id], effectDelays: delays };
                    })} />
                </div>
                {wiz.effectSystems.length > 0 && (
                  <div className="dw-field">
                    <span className="dw-label">{tr("Délai d'apparition après la prise")}</span>
                    {wiz.effectSystems.map((id) => (
                      <div key={id} className="dw-inline" style={{ gap: 8, marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ minWidth: 120 }}>{tr(EFFECT_SYSTEMS.find((x) => x.id === id).label.split(' (')[0])}</span>
                        <Chips items={EFFECT_DELAYS} value={wiz.effectDelays[id] || ''} label={tr("Délai d'apparition")}
                          onPick={(d) => set((w) => ({ ...w, effectDelays: { ...w.effectDelays, [id]: w.effectDelays[id] === d ? undefined : d } }))} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="dw-field">
                  <span className="dw-label">{tr("Allergie connue ?")}</span>
                  <Chips items={PERSON_ANSWERS} value={wiz.allergyKnown} label={tr("Allergie connue")}
                    onPick={(id) => set((w) => ({ ...w, allergyKnown: id, allergyClasses: id === 'oui' ? w.allergyClasses : [] }))} />
                </div>
                {wiz.allergyKnown === 'oui' && (
                  <div className="dw-field">
                    <span className="dw-label">{tr("À quoi ?")}</span>
                    <Chips items={ALLERGY_CLASSES} value={wiz.allergyClasses} multi onPick={(id) => toggleIn('allergyClasses', id)} label={tr("Classes d'allergie")} />
                  </div>
                )}
                <div className="dw-field">
                  <span className="dw-label">{tr("Antécédents / terrain")}</span>
                  <Chips items={CONDITIONS} value={wiz.conditions} multi onPick={(id) => toggleIn('conditions', id)} label={tr("Antécédents et terrain")} />
                </div>
                <div className="dw-field">
                  <span className="dw-label">{tr("Le patient avait-il déjà pris ce même produit ?")}</span>
                  <Chips items={PERSON_ANSWERS} value={wiz.sameProductBefore} onPick={(id) => set({ sameProductBefore: id })} label={tr("Déjà exposé au même produit")} />
                </div>
              </>
            )}
              </>
            )}
          </>
        )}

        {/* ══ INCIDENT 3 · Gravité, conséquences, mesures ═════ */}
        {currentKey === 'gravite' && (
          <>
            <h2 className="dw-card-title">{tr("Gravité, conséquences et mesures")}</h2>
            <p className="dw-card-sub">{tr("Évaluez la gravité de l'événement, ses conséquences et les mesures déjà prises.")}</p>
            <div className="dw-field">
              <span className="dw-label">{tr("Gravité")} <Req /></span>
              <div className="dw-sev" role="radiogroup" aria-label={tr("Gravité")}>
                {SEVERITIES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={wiz.severity === s.id}
                    className={`dw-sev-card is-${s.tone}${wiz.severity === s.id ? ' is-on' : ''}`} onClick={() => set({ severity: s.id })}>
                    <div className="dw-sev-name"><span className="dw-sev-dot" />{tr(s.label)}</div>
                    <div className="dw-sev-desc">{tr(wiz.personConcerned === 'oui' ? s.desc : s.descNoPerson)}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="dw-field">
              <label className="dw-label" htmlFor="dwConseq">{tr("Conséquences constatées")}</label>
              <input id="dwConseq" className="form-input" maxLength={300} value={wiz.consequences} onChange={(e) => set({ consequences: e.target.value })} />
            </div>
            <div className="dw-field">
              <span className="dw-label">{tr("Mesures prises")}</span>
              <Chips items={MEASURES} value={wiz.measures} multi onPick={toggleMeasure} label={tr("Mesures prises")} />
            </div>
            {wiz.severity === 'grave' && (
              <div className="dw-alert" role="alert">
                <Icon name="alert-triangle" />
                <div><strong>{tr("Cas grave :")}</strong> {tr("la déclaration sera enregistrée avec la gravité « Grave ».")}</div>
              </div>
            )}
          </>
        )}

        {/* ══ PANNE 1 · Dispositif ═════════════════════════════ */}
        {currentKey === 'dispositif' && (
          <>
            <h2 className="dw-card-title">{tr("Dispositif ou équipement")}</h2>
            <p className="dw-card-sub">{tr("Ces informations permettent de retrouver l'appareil et de suivre la panne.")}</p>
            <div className="dw-field">
              <label className="dw-label" htmlFor="dwDevName">{tr("Dénomination de l'appareil")} <Req /></label>
              <input id="dwDevName" className="form-input" value={wiz.deviceName} onChange={(e) => set({ deviceName: e.target.value })} />
            </div>
            <div className="dw-row dw-row--2">
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwBrand">{tr("Marque / fabricant")}</label>
                <input id="dwBrand" className="form-input" value={wiz.brand} onChange={(e) => set({ brand: e.target.value })} />
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwModel">{tr("Modèle")}</label>
                <input id="dwModel" className="form-input" value={wiz.model} onChange={(e) => set({ model: e.target.value })} />
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwManufRefP">{tr("Référence du produit chez le fabricant")}</label>
                <input id="dwManufRefP" className="form-input" value={wiz.manufacturerRef} onChange={(e) => set({ manufacturerRef: e.target.value })} />
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwLoc">{tr("Service / localisation")}</label>
                <input id="dwLoc" className="form-input" value={wiz.service} onChange={(e) => set({ service: e.target.value })} />
              </div>
            </div>
            <div className="dw-field">
              <span className="dw-label">{tr("Identification de l'unité (n° de série, d'inventaire ou UDI)")} <Req /></span>
              <div className="dw-row dw-row--2">
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwSerial">{tr("N° de série")}</label>
                  <input id="dwSerial" className="form-input" value={wiz.serial} onChange={(e) => set({ serial: e.target.value })} />
                </div>
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwInventory">{tr("N° d'inventaire (interne)")}</label>
                  <input id="dwInventory" className="form-input" value={wiz.inventory} onChange={(e) => set({ inventory: e.target.value })} />
                </div>
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwUdi">{tr("UDI")}</label>
                  <div className="dw-inline">
                    <input id="dwUdi" className="form-input" value={wiz.udi} onChange={(e) => set({ udi: e.target.value })} />
                    <button type="button" className="btn" onClick={() => setScanOpen(true)}><Icon name="scan" />{tr("Scanner")}</button>
                  </div>
                </div>
              </div>
              <div className="dw-count" style={{ textAlign: 'left' }}>{tr("Au moins un des trois est obligatoire. Si la plaque est illisible, utilisez le n° d'inventaire de votre établissement.")}</div>
            </div>
          </>
        )}

        {/* ══ PANNE 2 · Panne ══════════════════════════════════ */}
        {currentKey === 'panne' && (
          <>
            <h2 className="dw-card-title">{tr("Description de la panne")}</h2>
            <p className="dw-card-sub">{tr("Circonstances d'utilisation et symptômes techniques.")}</p>
            <div className="dw-row">
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwPDate">{tr("Date de la panne")} <Req /></label>
                <input id="dwPDate" className="form-input" type="date" max={todayIso()} value={wiz.onsetDate} onChange={(e) => set({ onsetDate: e.target.value })} />
                <div className="dw-inline" style={{ marginTop: 6, gap: 6 }}>
                  <button type="button" className="btn u-btn-sm" onClick={() => set({ onsetDate: todayIso() })}>{tr("Aujourd'hui")}</button>
                  <button type="button" className="btn u-btn-sm" onClick={() => set({ onsetDate: yesterdayIso() })}>{tr("Hier")}</button>
                </div>
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwPTime">{tr("Heure")}</label>
                <input id="dwPTime" className="form-input" type="time" value={wiz.onsetTime} onChange={(e) => set({ onsetTime: e.target.value })} />
              </div>
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwErr">{tr("Code erreur affiché")}</label>
                <input id="dwErr" className="form-input" value={wiz.errorCode} onChange={(e) => set({ errorCode: e.target.value })} />
              </div>
            </div>
            <div className="dw-field">
              <span className="dw-label">{tr("Circonstances d'utilisation")} <Req /></span>
              <Chips items={PANNE_CONTEXTS} value={wiz.context} onPick={(id) => set({ context: id })} label={tr("Circonstances d'utilisation")} />
            </div>
            <div className="dw-field">
              <span className="dw-label">{tr("Symptômes observés")}</span>
              <Chips items={PANNE_SYMPTOMS} value={wiz.symptoms} multi onPick={(id) => toggleIn('symptoms', id)} label={tr("Symptômes observés")} />
            </div>
            {/* Signes AVANT la panne : facultatif, mais c'est la donnée qui permet d'anticiper les pannes suivantes. */}
            <PrecursorFields wiz={wiz} set={set} toggleIn={toggleIn} />
            <div className="dw-field dw-field--grow">
              <label className="dw-label" htmlFor="dwPDesc">{tr("Description détaillée")} <Req /></label>
              <textarea id="dwPDesc" className="form-input" rows={5} maxLength={MAX_DESC} value={wiz.description} onChange={(e) => set({ description: e.target.value })} />
              <div className="dw-count">{wiz.description.length} / {MAX_DESC}</div>
            </div>
          </>
        )}

        {/* ══ PANNE 3 · Conséquences, état, mesures ════════════ */}
        {currentKey === 'consequences' && (
          <>
            <h2 className="dw-card-title">{tr("Conséquences, état et mesures")}</h2>
            <p className="dw-card-sub">{tr("Effet de la panne sur le fonctionnement et la prise en charge, état actuel de l'appareil, mesures prises.")}</p>
            <div className="dw-field">
              <span className="dw-label">{tr("Conséquence sur le fonctionnement et la prise en charge")} <Req /></span>
              <div className="dw-sev dw-sev--2 dw-sev--roomy" role="radiogroup" aria-label={tr("Conséquence")}>
                {CONSEQUENCES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={wiz.consequence === s.id}
                    className={`dw-sev-card is-${s.tone}${wiz.consequence === s.id ? ' is-on' : ''}`} onClick={() => set({ consequence: s.id })}>
                    <div className="dw-sev-name"><span className="dw-sev-dot" />{tr(s.label)}</div>
                    <div className="dw-sev-desc">{tr(s.desc)}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="dw-row dw-row--2">
              <div className="dw-field">
                <label className="dw-label" htmlFor="dwState">{tr("État actuel de l'appareil")} <Req /></label>
                <select id="dwState" className="form-input" value={wiz.deviceState} onChange={(e) => set({ deviceState: e.target.value })}>
                  <option value="">—</option>
                  {DEVICE_STATES.map((e) => <option key={e.id} value={e.id}>{tr(e.label)}</option>)}
                </select>
              </div>
              <div className="dw-field">
                <span className="dw-label">{tr("Mesure prise")}</span>
                <Chips items={PANNE_ACTIONS} value={wiz.action} onPick={(id) => set({ action: wiz.action === id ? null : id })} label={tr("Mesure prise")} />
              </div>
            </div>
            <label className="dw-check"><input type="checkbox" checked={wiz.maintenanceDone} onChange={(e) => set({ maintenanceDone: e.target.checked })} />{tr("Une intervention de maintenance a eu lieu ou a été demandée")}</label>
            {wiz.maintenanceDone && (
              <div className="dw-row dw-row--2">
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwTicket">{tr("N° de demande de maintenance")}</label>
                  <input id="dwTicket" className="form-input" value={wiz.ticket} onChange={(e) => set({ ticket: e.target.value })} />
                </div>
                <div className="dw-field">
                  <label className="dw-label" htmlFor="dwMaint">{tr("Dernière maintenance")}</label>
                  <input id="dwMaint" className="form-input" type="date" max={todayIso()} value={wiz.lastMaintenance} onChange={(e) => set({ lastMaintenance: e.target.value })} />
                </div>
              </div>
            )}
            {productField('dwDevCatalogue', 'Dispositif du catalogue (facultatif — permet d\'informer le fabricant)')}
            <div className="dw-count" style={{ textAlign: 'left' }}>{tr("Sans dispositif du catalogue, la panne ne peut pas être transmise à un fabricant ; elle reste adressée au CNPM et/ou à votre organisation.")}</div>
          </>
        )}

        {/* ══ PANNE 4 · Personne exposée ═══════════════════════ */}
        {currentKey === 'exposition' && (
          <>
            <h2 className="dw-card-title">{tr("Personne exposée ou blessée")}</h2>
            <p className="dw-card-sub">{tr("Une personne a-t-elle été exposée à un risque ou blessée à cause de cette panne ?")}</p>
            <div className="dw-field">
              <Chips items={PERSON_ANSWERS} value={wiz.personExposed} onPick={(id) => set({ personExposed: id, ...(id !== 'oui' ? { exposureKind: null } : {}) })} label={tr("Personne exposée ou blessée")} />
            </div>
            {wiz.personExposed === 'oui' && (
              <>
                <div className="dw-field">
                  <span className="dw-label">{tr("Précisez")} <Req /></span>
                  <div className="dw-sev dw-sev--2 dw-sev--roomy" role="radiogroup" aria-label={tr("Précisez")}>
                    {EXPOSURES.map((s) => (
                      <button key={s.id} type="button" role="radio" aria-checked={wiz.exposureKind === s.id}
                        className={`dw-sev-card is-${s.tone}${wiz.exposureKind === s.id ? ' is-on' : ''}`} onClick={() => set({ exposureKind: s.id })}>
                        <div className="dw-sev-name"><span className="dw-sev-dot" />{tr(s.label)}</div>
                        <div className="dw-sev-desc">{tr(s.desc)}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dw-alert is-amber" role="alert">
                  <Icon name="alert-triangle" />
                  <div>
                    <strong>{tr("Cet événement relève aussi d'un incident impliquant une personne.")}</strong>{' '}
                    {tr("Vous pouvez déclarer cette panne seule, ou poursuivre vers une déclaration d'incident préremplie. Rien n'est créé tant que vous n'avez pas envoyé.")}
                    <div style={{ marginTop: 10 }}>
                      <button type="button" className="btn" onClick={() => set({
                        kind: 'incident', stepIdx: 0, type: 'dispositif', manual: false, destination: null, personConcerned: 'oui',
                        problemType: wiz.problemType || 'anomalie', severity: wiz.exposureKind === 'injury' ? 'grave' : 'moderee',
                        manufacturer: wiz.manufacturer || wiz.brand, serial: wiz.serial, udi: wiz.udi,
                        productName: wiz.productName || [wiz.deviceName, wiz.model].filter(Boolean).join(' '),
                      })}>{tr("Poursuivre vers une déclaration d'incident")}</button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ══ Pièces justificatives ════════════════════════════ */}
        {currentKey === 'preuves' && (
          <>
            <h2 className="dw-card-title">{tr("Pièces justificatives")}</h2>
            <p className="dw-card-sub">{isPanne ? tr("Plaque signalétique, écran d'erreur, rapport d'intervention… (facultatif).") : tr("Photos, rapports ou résultats utiles (facultatif).")}</p>
            <EvidenceUpload files={files} onChange={setFiles} notes={notes} onNoteChange={(k, t) => setNotes((n) => ({ ...n, [k]: t }))} />
            <p className="dw-card-sub" role="note">{tr("Les fichiers sont associés à votre déclaration dans Nexus lorsque la conservation est activée, et joints à l'e-mail du CNPM si vous choisissez le CNPM à la dernière étape. Ils ne sont jamais envoyés à VigiCore Audit ni au fabricant.")}</p>
          </>
        )}

        {/* ══ Récapitulatif modifiable ═════════════════════════ */}
        {currentKey === 'recap' && (
          <>
            <h2 className="dw-card-title">{tr("Récapitulatif")}</h2>
            <p className="dw-card-sub">{tr("Vérifiez vos réponses. « Modifier » rouvre l'étape concernée ; rien n'est envoyé depuis cet écran.")}</p>
            {sections.map((s) => (
              <div className="dw-recap-block" key={s.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>{tr(s.title)}</strong>
                  <button type="button" className="btn" onClick={() => goToStep(s.step)}>{tr("Modifier")}</button>
                </div>
                <div className="dw-recap">
                  {s.rows.map(([l, val]) => (
                    <div className="dw-recap-item" key={`${s.id}-${l}`}>
                      <div className="dw-recap-label">{tr(l)}</div>
                      <div className="dw-recap-value" style={val === 'Non renseigné' ? { opacity: 0.6, fontStyle: 'italic' } : undefined}>{tr(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {missing.length > 0 && (
              <div className="dw-alert is-amber" role="note">
                <Icon name="info-circle" />
                <div>{tr("Informations non renseignées :")} {missing.map((m) => tr(m)).join(', ')}. {tr("Ce n'est pas bloquant : vous pouvez les compléter ou les laisser ainsi.")}</div>
              </div>
            )}
          </>
        )}

        {/* ══ Destinataires (dernière étape) ═══════════════════ */}
        {currentKey === 'destination' && (
          <>
            <h2 className="dw-card-title">{tr("Destinataires de la déclaration")}</h2>
            <p className="dw-card-sub dw-card-sub--keep">{tr("Sélectionnez un ou plusieurs destinataires.")}</p>
            {dest.loading && <p className="dw-card-sub" role="status">{tr("Vérification des destinataires disponibles…")}</p>}
            {!dest.loading && !dest.ok && (
              <div className="dw-alert" role="alert">
                <Icon name="alert-triangle" />
                <div>{tr("Impossible de vérifier les destinataires disponibles (serveur injoignable).")} <button type="button" className="btn" onClick={() => setDest({ loading: true })}>{tr("Réessayer")}</button></div>
              </div>
            )}
            {!dest.loading && dest.ok && !noDestination && (
              <>
                <div className="dw-stack" role="group" aria-label={tr("Destinataires")}>
                  {recipients.map((r) => (
                    <button key={r.id} type="button" role="checkbox" aria-checked={r.avail && r.on} disabled={!r.avail}
                      className={`dw-recipient${r.avail && r.on ? ' is-on' : ''}${r.avail ? '' : ' is-off'}`}
                      onClick={() => toggleRecipient(r.id)}>
                      <span className="dw-recipient-icon"><Icon name={r.icon} /></span>
                      <span className="dw-recipient-body">
                        <span className="dw-recipient-eyebrow">{tr(r.eyebrow)}</span>
                        <span className="dw-recipient-name">{tr(r.name)}</span>
                        <span className="dw-recipient-desc">{tr(r.avail ? r.desc : r.why)}</span>
                      </span>
                      <span className="dw-recipient-box" aria-hidden="true">{r.avail && r.on && <Icon name="check" />}</span>
                    </button>
                  ))}
                </div>
                <div className={`dw-recipient-summary${pickedNames.length ? '' : ' is-empty'}`} role="status">
                  <Icon name={pickedNames.length ? 'send' : 'info-circle'} />
                  <span>{pickedNames.length
                    ? <>{tr("Envoi à :")} <strong>{pickedNames.map((n) => tr(n)).join(' · ')}</strong></>
                    : tr("Aucun destinataire sélectionné.")}</span>
                </div>
                {files.length > 0 && (pickedCnpm || pickedOrg) && (
                  <p className="dw-count" style={{ textAlign: 'left' }}>
                    {tr("Pièces jointes ({0}) : transmises au CNPM et conservées pour l'établissement selon votre choix ; jamais au fabricant.", [files.length])}
                    {!dest.storage && ` ${tr("La conservation des pièces dans Nexus n'est pas activée : elles ne seront pas retrouvables après l'envoi.")}`}
                  </p>
                )}
              </>
            )}
            {noDestination && (
              <div className="dw-alert" role="alert">
                <Icon name="alert-triangle" />
                <div>{cnpmOnly
                  ? tr("Le CNPM ne peut pas recevoir de déclaration pour le moment (envoi d'e-mail non configuré). Enregistrez un brouillon et réessayez plus tard.")
                  : tr("Aucun destinataire n'est disponible pour le moment. Enregistrez un brouillon et réessayez plus tard.")}</div>
              </div>
            )}
          </>
        )}
      </DeclarationWizard>
    </>
  );
}

// ── Écran de résultat : l'état RÉEL de chaque destination, sans rien annoncer de non établi ──────────
const CNPM_TEXT = {
  SENT: ['ok', "Notification e-mail envoyée — réception par le CNPM non confirmée.", 'E-mail envoyé'],
  PENDING: ['warn', "Notification en cours d'envoi.", 'En cours'],
  FAILED: ['err', "L'e-mail n'a pas pu être envoyé.", 'Échec'],
  NOT_CONFIGURED: ['err', "L'envoi d'e-mail n'est pas configuré : le CNPM n'a rien reçu.", 'Non envoyé'],
};
function ResultScreen({ done, onFinish, toast }) {
  const [rec, setRec] = useState(done.record);
  const [busy, setBusy] = useState(false);
  const del = (name) => (rec?.deliveries || []).find((d) => d.destination === name);
  const cnpm = del('CNPM'); const org = del('ORG');
  const att = done.att; const attOk = att ? att.results.filter((r) => r.ok).length : 0;
  const attStored = att ? att.results.filter((r) => r.stored).length : 0;
  const a = done.audit;
  async function retry() {
    if (!rec) return;
    setBusy(true);
    const r = await resendCnpm(rec.id);
    const g = await getRecord(rec.id);
    if (g.ok && g.record) setRec(g.record);
    setBusy(false);
    toast(r.ok ? 'success' : 'error', tr(r.ok ? "Notification renvoyée" : "Renvoi impossible"), r.message ? tr(r.message) : '', r.ok ? 'ti ti-circle-check' : 'ti ti-alert-triangle');
  }
  const Row = ({ icon, tone = 'ok', title, badge, text, action }) => (
    <li className={`dw-result-row is-${tone}`}>
      <span className="dw-result-icon"><Icon name={icon} /></span>
      <div className="dw-result-body">
        <div className="dw-result-title">{tr(title)}</div>
        <div className="dw-result-text">{text}</div>
        {action}
      </div>
      <span className="dw-result-badge">{tr(badge)}</span>
    </li>
  );
  const aTone = a ? (a.outcome === 'RECEIVED' ? 'ok' : a.outcome === 'PENDING' ? 'warn' : 'err') : 'err';
  const attTone = att && attOk === done.fileCount ? 'ok' : 'warn';
  return (
    <div className="view is-active">
      <div className="dw"><div className="dw-card dw-result">
        <div className="dw-result-head">
          <span className="dw-result-mark"><Icon name="circle-check" /></span>
          <div>
            <h2 className="dw-card-title">{tr("Déclaration enregistrée")}</h2>
            <p className="dw-result-sub">{done.ref ? <><strong>{done.ref}</strong> · </> : null}{tr("Voici l'état réel de chaque destinataire.")}</p>
          </div>
        </div>
        <ul className="dw-result-list">
          <Row icon="shield-lock" title="VigiCore NEXUS" badge="Enregistrée" text={tr("Enregistrée dans Nexus.")} />
          {cnpm && <Row icon="shield-check" tone={CNPM_TEXT[cnpm.status]?.[0] || 'warn'} title="CNPM" badge={CNPM_TEXT[cnpm.status]?.[2] || cnpm.status}
            text={tr(CNPM_TEXT[cnpm.status]?.[1] || cnpm.status)}
            action={(cnpm.status === 'FAILED' || cnpm.status === 'NOT_CONFIGURED') && <button type="button" className="btn dw-result-action" disabled={busy} onClick={retry}><Icon name="rotate-clockwise" />{tr("Renvoyer")}</button>} />}
          {org && <Row icon="building-hospital" title="Mon établissement" badge="Disponible"
            text={tr("Visible par les responsables vigilance de votre établissement dans VigiCore NEXUS.")} />}
          {done.informManufacturer && a && <Row icon="building-factory-2" tone={aTone} title="Fabricant"
            badge={aTone === 'ok' ? 'Reçue' : aTone === 'warn' ? 'En attente' : 'Non reçue'}
            text={a.outcome === 'RECEIVED' ? tr("Reçue par la vigilance du fabricant via VigiCore Audit.")
              : a.outcome === 'PENDING' ? tr("Enregistrée, pas encore reçue par la vigilance : nouvel envoi automatique en cours.")
              : a.outcome === 'NOT_ROUTABLE' ? tr("Aucune organisation ne peut recevoir cette déclaration pour le moment. Le fabricant n'a rien reçu.")
              : tr(a.message || "Le fabricant n'a pas reçu cette déclaration.")} />}
          {done.fileCount > 0 && (
            <Row icon="paperclip" tone={attTone} title="Pièces jointes" badge={attTone === 'ok' ? 'Transmises' : 'Incomplet'}
              text={att
                ? tr("{0} sur {1} acceptées par le serveur · conservées dans Nexus : {2} sur {1}.", [attOk, done.fileCount, attStored]) + (att.failed.length ? ` ${tr("Non transmises :")} ${att.failed.map((x) => `${x.name} (${x.message})`).join(' ; ')}` : '')
                : tr("Aucun enregistrement Nexus n'a été créé : les pièces n'ont pas été envoyées (elles ne vont jamais au fabricant).")} />
          )}
        </ul>
        <div className="dw-result-foot"><button type="button" className="btn btn--primary" onClick={onFinish}>{tr("Terminer")}</button></div>
      </div></div>
    </div>
  );
}
