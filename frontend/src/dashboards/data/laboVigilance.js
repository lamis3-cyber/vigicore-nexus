// ═══════════════════════════════════════════════════════════════
// Laboratoire-portal vigilance data — ported 1:1 from the original
// HTML's LAB_DECLARATIONS / LAB_SURVEILLANCE / LAB_REAGENTS globals
// (~L7390-7418) plus the `currentRole === 'labo'` branch of
// submitDeclareWizard() (~L8619-8631).
//
// Unlike Pharmacien (which shares DR_DECLARATIONS with Doctor via
// addDrDeclaration), Laboratoire has its OWN declarations array with
// a different shape (productType/product/lot/manufacturer directly,
// no patientId/domain — a lab reports on a product/lot, not a
// patient record, which lives in its own LIMS). Confirmed by
// reading the original's wizard branch: for currentRole==='labo' it
// pushes straight into LAB_DECLARATIONS, always with status:'sent'
// (never draft/review — no other role's wizard branch does this),
// and (since the reactif-type fix) the SAME PV/MV/CV/CH/RV ref-prefix
// scheme every other role's wizard uses (DECLARE_WIZ_REF_PREFIX_BY_TYPE,
// doctorVigilance.js) rather than a separate RV/MV/CV-only scheme.
//
// DR_ALERTS, PHARM_RECALLS, DR_STATUS_BADGE, DR_DOMAIN_CHIP,
// QR_LOT_DB/verifyPharmLot's data, and LAB_PRODUCT_TYPE_LABEL /
// LAB_PROBLEM_TYPE_LABEL / LAB_SEVERITY_LABEL already live in
// doctorVigilance.js — reused from there rather than duplicated,
// same single-shared-global-array model as the rest of this port.
// ═══════════════════════════════════════════════════════════════

import { demoRows } from './demoMode';
import { track } from './vigilanceStore';
import { getCurrentAuthUser } from '../context/AuthContext';
import { logAudit, LAB_SEVERITY_LABEL, DECLARE_WIZ_REF_PREFIX_BY_TYPE } from './doctorVigilance';
import { localeTag } from '../../i18n/translate.js';

// organizationId: null (explicit) on every seed row below — same
// "never guessed" legacy treatment as doctorVigilance.js's seed data
// (see that file's header for the full rationale). Only ONE lab
// organization exists in the current demo roster (CHU Alger's
// chu.laborantin@), so this gap isn't demonstrable as a live
// cross-tenant leak today — but the field now exists so a second lab
// org can be added later without silently reintroducing one (audit §5).
export const LAB_DECLARATIONS = demoRows([
  { id: 'lab-dec-1', ref: '#RV-2026-003', productType: 'dispositif', product: 'Kit de dosage HbA1c Réactif Bio-X', lot: 'BIO-20260220-D', manufacturer: 'Bio-X Diagnostics', problemType: 'resultat', description: 'Résultats discordants avec le suivi clinique sur plusieurs échantillons du même lot.', severity: 'moderee', status: 'draft', date: '29/06/2026', capaStatus: 'none', organizationId: null, authoredByUserId: null },
  { id: 'lab-dec-2', ref: '#RV-2026-002', productType: 'medicament', product: 'Metformine 850mg (Glucophage®)', lot: 'MET-20260502-A', manufacturer: 'Sanofi Algérie', problemType: 'resultat', description: "Hyperglycémie marquée associée à une suspicion de réaction d'hypersensibilité chez plusieurs patients sous traitement.", severity: 'grave', status: 'sent', date: '27/06/2026', capaStatus: 'none', organizationId: null, authoredByUserId: null },
  { id: 'lab-dec-3', ref: '#MV-2026-041', productType: 'dispositif', product: 'Inhalateur doseur AeroFlow®', lot: 'AER-20250811-C', manufacturer: 'Biomedical Devices Algérie', problemType: 'appareil', description: "Sous-dosage confirmé par mesure objective, cohérent avec l'alerte matériovigilance active sur ce lot.", severity: 'moderee', status: 'closed', date: '22/06/2026', capaStatus: 'validated', organizationId: null, authoredByUserId: null },
  { id: 'lab-dec-4', ref: '#CV-2026-009', productType: 'cosmetique', product: 'Crème apaisante DermaSoft®', lot: 'DSF-20260115-A', manufacturer: 'Laboratoires Saidal', problemType: 'anomalie', description: 'Dermite de contact confirmée par patch-test, cohérente avec la déclaration cosmétovigilance en cours.', severity: 'legere', status: 'closed', date: '15/06/2026', capaStatus: 'validated', organizationId: null, authoredByUserId: null },
  { id: 'lab-dec-5', ref: '#RV-2026-001', productType: 'medicament', product: 'Atorvastatine 20mg (Tahor®)', lot: 'ATO-20260510-B', manufacturer: 'Pfizer Algérie', problemType: 'qualite', description: 'Variabilité de dissolution observée lors du contrôle qualité de routine.', severity: 'legere', status: 'review', date: '10/06/2026', capaStatus: 'proposed', organizationId: null, authoredByUserId: null },
  // F6 addition (Demo Data & Functional Coverage audit) — organization
  // -scoped declarations for CHU Alger's laboratory_staff seat
  // (chu.laborantin@demo.dz). Same record shape as lab-dec-1..5 above,
  // consumed unchanged by LabDeclarations.jsx / LabDashboard.jsx.
  { id: 'lab-dec-chu-1', ref: '#MV-2026-108', productType: 'dispositif', product: 'Agrafeuse chirurgicale EndoStap®', lot: 'EST-20260305-B', manufacturer: 'Biomedical Devices Algérie', problemType: 'appareil', description: 'Défaut de fermeture confirmé à l’analyse technique — reprise chirurgicale nécessaire.', severity: 'grave', status: 'sent', date: '24/06/2026', capaStatus: 'proposed', organizationId: 'chu-alger', authoredByUserId: 'usr-chu-laborantin' },
  { id: 'lab-dec-chu-2', ref: '#RV-2026-102', productType: 'medicament', product: 'Clopidogrel 75mg (Plavix®)', lot: 'CLP-20260410-A', manufacturer: 'Sanofi Algérie', problemType: 'resultat', description: 'Résultats de coagulation discordants avec la clinique chez plusieurs patients sous traitement.', severity: 'moderee', status: 'draft', date: '26/06/2026', capaStatus: 'none', organizationId: 'chu-alger', authoredByUserId: 'usr-chu-laborantin' },
]);

// labDeclCounter in the original — module-private running counter
// shared by every caller, same pattern as doctorVigilance.js's
// module-private drDeclCounter.
let labDeclCounter = LAB_DECLARATIONS.length;

export const LAB_SURVEILLANCE = demoRows([
  { id: 'surv-1', product: 'Kit de dosage HbA1c Réactif Bio-X', manufacturer: 'Bio-X Diagnostics', signalements: 18, niveau: 'critique' },
  { id: 'surv-2', product: 'Inhalateur doseur AeroFlow®', manufacturer: 'Biomedical Devices Algérie', signalements: 11, niveau: 'critique' },
  { id: 'surv-3', product: 'Crème apaisante DermaSoft®', manufacturer: 'Laboratoires Saidal', signalements: 7, niveau: 'moyen' },
  { id: 'surv-4', product: 'Dexamethasone 4mg/2ml injectable', manufacturer: 'Saidal', signalements: 6, niveau: 'moyen' },
  { id: 'surv-5', product: 'Atorvastatine 20mg (Tahor®)', manufacturer: 'Pfizer Algérie', signalements: 2, niveau: 'faible' },
]);

// Réactifs de laboratoire — a vigilance registry, not a LIMS stock
// module. Tracks only what matters for reporting: which reagent
// lots are in use and whether they're currently flagged (quality
// notice, recall, active surveillance). Quantities, expiry
// management and ordering stay in the lab's own LIMS.
export const LAB_REAGENTS = demoRows([
  { id: 'reag-1', product: 'Kit de dosage HbA1c Réactif Bio-X', fournisseur: 'Bio-X Diagnostics', lots: ['BIO-20260220-D', 'BIO-20260118-A'], vigilanceStatus: 'active', note: 'Notification qualité ANPP/DIV/2026-012 — double contrôle recommandé.', lastCheck: '29/06/2026' },
  { id: 'reag-2', product: 'Réactif de coagulation PT/INR', fournisseur: 'Diamed Algérie', lots: ['DIA-20260305-C'], vigilanceStatus: 'clear', note: 'Aucune anomalie signalée.', lastCheck: '20/06/2026' },
  { id: 'reag-3', product: 'Kit sérologie hépatite B', fournisseur: 'Bio-X Diagnostics', lots: ['BIO-20260212-B'], vigilanceStatus: 'clear', note: 'Aucune anomalie signalée.', lastCheck: '18/06/2026' },
  { id: 'reag-4', product: 'Réactif glycémie enzymatique', fournisseur: 'Saidal Diagnostics', lots: ['SLD-20260410-A'], vigilanceStatus: 'active', note: 'Variabilité de résultats rapportée par un autre laboratoire du réseau — surveillance renforcée.', lastCheck: '26/06/2026' },
  { id: 'reag-5', product: 'Milieu de culture bactériologique standard', fournisseur: 'Pasteur Algérie', lots: ['PAS-20260301-E'], vigilanceStatus: 'clear', note: 'Aucune anomalie signalée.', lastCheck: '12/06/2026' },
]);

/**
 * Mirrors the `currentRole === 'labo'` branch of the original's
 * submitDeclareWizard() (~L8619-8631) exactly: type-based ref prefix
 * (dispositif→MV, cosmetique→CV, everything else incl.
 * medicament/chimique→RV), status always 'sent', capaStatus always
 * 'none', unshifted onto LAB_DECLARATIONS.
 */
export function addLabDeclaration({ type, product, lot, manufacturer, problemType, description, severity, manualPatientName, patientAge, patientSex, service, onsetDate, outcome, productStopped, attachmentNames, kind, refPrefix, lotLabel, device, panne, impact, escalated }) {
  labDeclCounter += 1;
  // Ref prefix: reuse the same shared PV/MV/CV/CH/RV table every other
  // role's wizard uses (doctorVigilance.js), instead of a locally
  // duplicated dispositif→MV/cosmetique→CV/else→RV fallback. Falls
  // back to 'RV' only for a genuinely unrecognized type, which should
  // no longer happen now that 'reactif' is an explicit selectable
  // card in this wizard.
  const prefix = refPrefix || DECLARE_WIZ_REF_PREFIX_BY_TYPE[type] || 'RV';
  // Blocker 1 fix — same organization/author stamping as
  // doctorVigilance.js's addDrDeclaration, from the real logged-in
  // session (getCurrentAuthUser()), never guessed.
  const user = getCurrentAuthUser();
  const record = {
    id: 'lab-dec-' + Date.now(),
    ref: `#${prefix}-2026-${String(100 + labDeclCounter).padStart(3, '0')}`,
    productType: type,
    product,
    lot,
    lotLabel: lotLabel || 'Lot',
    manufacturer,
    problemType: problemType || 'anomalie',
    description,
    severity: severity || 'legere',
    status: 'sent',
    date: new Date().toLocaleDateString(localeTag()),
    capaStatus: 'none',
    // Optional context captured by the 5-step declaration wizard.
    patientName: manualPatientName ?? null,
    patientAge: patientAge ?? null,
    patientSex: patientSex ?? null,
    service: service ?? null,
    onsetDate: onsetDate ?? null,
    outcome: outcome ?? null,
    productStopped: productStopped ?? null,
    attachmentNames: attachmentNames ?? [],
    kind: kind ?? 'incident',
    device: device ?? null,
    panne: panne ?? null,
    impact: impact ?? null,
    escalated: escalated ?? false,
    organizationId: user?.organizationId ?? null,
    authoredByUserId: user?.id ?? null,
  };
  const tracked = track(record, 'lab', prefix);
  LAB_DECLARATIONS.unshift(tracked);
  logAudit('declaration', record.id, `Déclaration ${record.ref} créée (gravité : ${LAB_SEVERITY_LABEL[record.severity]?.[1] || record.severity})`, user?.name ?? null, user?.organizationId ?? null);
  return tracked;
}
