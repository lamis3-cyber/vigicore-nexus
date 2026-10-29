// Modèle fonctionnel des assistants « Incident » et « Panne » (logique PURE : aucun React, aucun appel réseau).
// Sert l'interface (InstitutionalDeclarer) et les tests. Règles : document « Architecture fonctionnelle v3 ».
//   - Identification OBLIGATOIRE : lot (médicament, cosmétique, produit chimique, réactif) ; n° de série ou UDI (dispositif) ;
//     pour une panne, n° de série, n° d'inventaire ou UDI. Il n'existe plus d'option « je ne le connais pas ».
//   - Produit hors catalogue VigiCore (fabricant absent de VigiCore Audit) : la déclaration ne peut être adressée
//     qu'au CNPM, après confirmation explicite de l'utilisateur (offCatalogue).
//   - Les autres informations facultatives non connues restent « Non renseigné ».

export const NOT_FILLED = 'Non renseigné';

export const PRODUCT_TYPES = [
  { id: 'medicament', label: 'Médicament' },
  { id: 'dispositif', label: 'Dispositif médical' },
  { id: 'cosmetique', label: 'Cosmétique' },
  { id: 'chimique', label: 'Produit chimique' },
  { id: 'reactif', label: 'Réactif / test diagnostique' },
];
export const TYPE_LABEL = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.id, t.label]));

// « Appareil défectueux » n'existe plus ici : une panne d'appareil relève du parcours Panne.
export const NATURES = [
  { id: 'anomalie', label: 'Anomalie observée' },
  { id: 'resultat', label: 'Effet indésirable' },
  { id: 'qualite', label: 'Défaut qualité' },
  { id: 'emballage', label: 'Emballage endommagé' },
  { id: 'contamination', label: 'Contamination suspectée' },
];
export const NATURE_LABEL = Object.fromEntries(NATURES.map((p) => [p.id, p.label]));

export const SEVERITIES = [
  { id: 'legere', tone: 'green', label: 'Légère', desc: 'Sans conséquence clinique ni prise en charge particulière.', descNoPerson: 'Défaut sans conséquence pour une personne.' },
  { id: 'moderee', tone: 'amber', label: 'Modérée', desc: 'Prise en charge ou surveillance supplémentaire nécessaire.', descNoPerson: 'Défaut pouvant causer un risque s\'il n\'est pas corrigé.' },
  { id: 'grave', tone: 'red', label: 'Grave', desc: 'Hospitalisation, invalidité, mise en jeu du pronostic vital ou décès.', descNoPerson: 'Défaut présentant un risque grave et immédiat.' },
];

export const PERSON_ANSWERS = [
  { id: 'oui', label: 'Oui' },
  { id: 'non', label: 'Non' },
  { id: 'inconnu', label: 'Je ne sais pas' },
];

export const EVOLUTIONS = [
  { id: 'retabli', label: 'Rétabli / guéri' },
  { id: 'en_cours', label: 'En cours de rétablissement' },
  { id: 'non_retabli', label: 'Non rétabli / persistant' },
  { id: 'sequelles', label: 'Rétabli avec séquelles' },
  { id: 'deces', label: 'Décès' },
  { id: 'inconnue', label: 'Inconnue' },
];
export const LEGACY_EVOLUTIONS = [{ id: 'hospitalisation', label: 'Hospitalisation' }];

// Mesures prises : UN seul champ (fusion de l'ancien « Produit arrêté / retiré » et des mesures immédiates).
export const MEASURES = [
  { id: 'retire', label: 'Produit retiré / mis en quarantaine' },
  { id: 'arrete', label: 'Utilisation arrêtée' },
  { id: 'soins', label: 'Soins ou prise en charge' },
  { id: 'autre', label: 'Autre mesure' },
  { id: 'aucune', label: 'Aucune mesure' },
];

export const DECHALLENGE = [
  { id: 'oui', label: 'Oui, les symptômes ont disparu' },
  { id: 'non', label: 'Non, ils persistent' },
  { id: 'nsp', label: 'Je ne sais pas' },
  { id: 'pas_arrete', label: 'Le produit n\'a pas été arrêté' },
];
export const EXPOSURE_ROUTES = [
  { id: 'peau', label: 'Contact avec la peau' },
  { id: 'yeux', label: 'Contact avec les yeux' },
  { id: 'inhalation', label: 'Inhalation' },
  { id: 'ingestion', label: 'Ingestion' },
  { id: 'autre', label: 'Autre voie' },
];

// ── Panne ───────────────────────────────────────────────────────
export const PANNE_CONTEXTS = [
  { id: 'utilisation', label: "Pendant l'utilisation" },
  { id: 'demarrage', label: 'À la mise en marche' },
  { id: 'nettoyage', label: 'Nettoyage / désinfection' },
  { id: 'maintenance', label: 'Pendant la maintenance' },
  { id: 'transport', label: 'Transport / stockage' },
];
export const PANNE_SYMPTOMS = [
  { id: 'arret', label: 'Arrêt complet' },
  { id: 'alarme', label: 'Alarme / code erreur' },
  { id: 'mesure', label: 'Mesure erronée' },
  { id: 'chauffe', label: 'Fuite / surchauffe' },
  { id: 'bruit', label: 'Bruit ou vibration anormale' },
  { id: 'dommage', label: 'Dommage physique' },
];
// ── Signes AVANT la panne (alimentent la prédiction : délai « premier signe → panne ») ──
// Les identifiants sont le contrat avec nexus-api (services/submissions.ts) et Audit (nexus.structured.js) : ne pas les renommer.
export const PRECURSOR_SIGNS = [
  { id: 'bruit', label: 'Bruit anormal' },
  { id: 'chauffe', label: 'Échauffement' },
  { id: 'alarme_intermittente', label: 'Alarmes intermittentes' },
  { id: 'mesure_derive', label: 'Dérive des mesures' },
  { id: 'redemarrage', label: 'Redémarrages' },
  { id: 'lenteur', label: 'Lenteur' },
  { id: 'fuite', label: 'Fuite' },
  { id: 'vibration', label: 'Vibrations' },
  { id: 'autre', label: 'Autre signe' },
];
// Signes avant un INCIDENT (hors panne d'appareil), propres à chaque type de produit. `autre` est commun.
export const PRECURSOR_SIGNS_BY_TYPE = {
  dispositif: PRECURSOR_SIGNS,
  medicament: [
    { id: 'demangeaisons', label: 'Démangeaisons' },
    { id: 'eruption', label: 'Éruption cutanée' },
    { id: 'gonflement_visage', label: 'Gonflement (visage, lèvres)' },
    { id: 'nausee', label: 'Nausées' },
    { id: 'vomissements', label: 'Vomissements' },
    { id: 'diarrhee', label: 'Diarrhée' },
    { id: 'douleurs_abdominales', label: 'Douleurs abdominales' },
    { id: 'vertiges', label: 'Vertiges' },
    { id: 'maux_tete', label: 'Maux de tête' },
    { id: 'somnolence', label: 'Somnolence' },
    { id: 'troubles_vision', label: 'Troubles de la vision' },
    { id: 'palpitations', label: 'Palpitations' },
    { id: 'gene_respiratoire', label: 'Gêne respiratoire' },
    { id: 'toux', label: 'Toux' },
    { id: 'fievre', label: 'Fièvre' },
    { id: 'malaise', label: 'Malaise / fatigue' },
    { id: 'autre', label: 'Autre signe' },
  ],
  cosmetique: [
    { id: 'demangeaisons', label: 'Démangeaisons' },
    { id: 'rougeur', label: 'Rougeur' },
    { id: 'eruption', label: 'Éruption cutanée' },
    { id: 'brulure', label: 'Sensation de brûlure' },
    { id: 'picotements', label: 'Picotements' },
    { id: 'gonflement', label: 'Gonflement' },
    { id: 'secheresse', label: 'Sécheresse ou peau qui pèle' },
    { id: 'irritation_yeux', label: 'Irritation des yeux' },
    { id: 'chute_cheveux', label: 'Chute de cheveux' },
    { id: 'odeur_texture', label: 'Odeur, couleur ou texture inhabituelle' },
    { id: 'autre', label: 'Autre signe' },
  ],
  chimique: [
    { id: 'odeur', label: 'Odeur inhabituelle' },
    { id: 'fumee', label: 'Fumée ou vapeurs visibles' },
    { id: 'irritation', label: 'Irritation (yeux, peau, gorge)' },
    { id: 'brulure_chimique', label: 'Brûlure (peau, yeux)' },
    { id: 'toux', label: 'Toux' },
    { id: 'gene_respiratoire', label: 'Gêne respiratoire' },
    { id: 'maux_tete', label: 'Maux de tête' },
    { id: 'nausee', label: 'Nausées' },
    { id: 'contenant_abime', label: 'Contenant abîmé' },
    { id: 'fuite', label: 'Fuite' },
    { id: 'etiquette', label: 'Étiquetage illisible ou manquant' },
    { id: 'autre', label: 'Autre signe' },
  ],
  reactif: [
    { id: 'cq_hors_limites', label: 'Contrôle qualité hors limites' },
    { id: 'resultats_incoherents', label: 'Résultats incohérents' },
    { id: 'couleur_anormale', label: 'Couleur anormale' },
    { id: 'derive_calibration', label: 'Dérive de calibration' },
    { id: 'signal_faible', label: 'Signal faible ou absent' },
    { id: 'precipite', label: 'Précipité ou dépôt visible' },
    { id: 'bulles', label: 'Bulles inhabituelles' },
    { id: 'stockage', label: 'Problème de stockage (chaîne du froid)' },
    { id: 'autre', label: 'Autre signe' },
  ],
};
// Tous les signes connus (libellés d'enregistrements déjà envoyés, quel que soit le type). Un même id a toujours le même libellé.
export const ALL_PRECURSOR_SIGNS = [...new Map(Object.values(PRECURSOR_SIGNS_BY_TYPE).flat().concat(PRECURSOR_SIGNS).map((x) => [x.id, x])).values()];

export const PRECURSOR_FIRST_SEEN = [
  { id: 'lt24h', label: 'Moins de 24 h' },
  { id: '1-7j', label: '1 à 7 jours' },
  { id: '1-4sem', label: '1 à 4 semaines' },
  { id: 'gt1mois', label: 'Plus d\'un mois' },
];
export const PRECURSOR_PATTERNS = [
  { id: 'ponctuel', label: 'Une seule fois' },
  { id: 'intermittent', label: 'Par intermittence' },
  { id: 'continu', label: 'En continu' },
  { id: 'aggravation', label: 'De plus en plus fréquent' },
];

// ── Éléments cliniques CODÉS d'un incident médicament (effets associés, terrain, ré-exposition) ──
export const EFFECT_SYSTEMS = [
  { id: 'cutane', label: 'Peau (rougeur, urticaire, démangeaisons)' },
  { id: 'digestif', label: 'Digestif (nausées, vomissements, douleurs)' },
  { id: 'respiratoire', label: 'Respiratoire (toux, gêne, essoufflement)' },
  { id: 'neuro', label: 'Neurologique (vertiges, maux de tête, somnolence)' },
  { id: 'cardiaque', label: 'Cardiaque (palpitations, tension)' },
  { id: 'general', label: 'Général (fièvre, fatigue, malaise)' },
];
export const EFFECT_DELAYS = [
  { id: 'lt1h', label: '< 1 h' },
  { id: '1-24h', label: '1 à 24 h' },
  { id: 'gt1j', label: '> 1 jour' },
];
export const ALLERGY_CLASSES = [
  { id: 'penicilline', label: 'Pénicillines' },
  { id: 'aine', label: 'AINS (ibuprofène, aspirine...)' },
  { id: 'sulfamide', label: 'Sulfamides' },
  { id: 'latex', label: 'Latex' },
  { id: 'autre', label: 'Autre' },
];
export const CONDITIONS = [
  { id: 'renal', label: 'Insuffisance rénale' },
  { id: 'hepatique', label: 'Insuffisance hépatique' },
  { id: 'diabete', label: 'Diabète' },
  { id: 'grossesse', label: 'Grossesse' },
  { id: 'asthme', label: 'Asthme' },
  { id: 'cardiaque', label: 'Maladie cardiaque' },
  { id: 'autre', label: 'Autre' },
];

export const PANNE_ACTIONS = [
  { id: 'hors_service', label: 'Mis hors service' },
  { id: 'remplace', label: 'Remplacé par un autre appareil' },
  { id: 'maintenance', label: 'Maintenance contactée' },
  { id: 'aucune', label: 'Aucune action' },
];
export const DEVICE_STATES = [
  { id: 'en_service', label: 'En service' },
  { id: 'hors_service', label: 'Hors service' },
  { id: 'quarantaine', label: 'Mis en quarantaine' },
];
// Conséquence SUR LE FONCTIONNEMENT et la prise en charge (sans personne exposée). Valeurs du contrat (« impact »).
export const CONSEQUENCES = [
  { id: 'none', tone: 'green', label: 'Sans conséquence', desc: 'Panne technique : aucune activité perturbée.' },
  { id: 'delay', tone: 'amber', label: 'Retard ou report de prise en charge', desc: 'Un acte a été retardé ou reporté, sans exposition d\'une personne à un risque.' },
];
// Si une personne a été exposée ou blessée (question distincte). Valeurs du contrat (« impact »).
export const EXPOSURES = [
  { id: 'exposed', tone: 'amber', label: 'Exposée à un risque', desc: 'Sans dommage constaté (quasi-accident).' },
  { id: 'injury', tone: 'red', label: 'Blessée', desc: 'Dommage subi par un patient ou un utilisateur.' },
];

export const IMPACT_SEVERITY = { none: 'legere', delay: 'moderee', exposed: 'moderee', injury: 'grave' };
export const IMPACT_LABEL = {
  none: 'Sans conséquence', delay: 'Retard ou report de prise en charge',
  exposed: 'Personne exposée à un risque', injury: 'Personne blessée',
};
export const isEscalated = (impact) => impact === 'exposed' || impact === 'injury';

/** Impact final d'une panne (valeur du contrat) : l'exposition d'une personne l'emporte sur la conséquence technique. */
export function panneImpact(wiz) {
  if (wiz.personExposed === 'oui' && (wiz.exposureKind === 'exposed' || wiz.exposureKind === 'injury')) return wiz.exposureKind;
  if (wiz.consequence === 'none' || wiz.consequence === 'delay') return wiz.consequence;
  return null;
}

// ── Données structurées pour l'IA (pures ; réutilisées par l'envoi, le récapitulatif et les tests) ──
/** Section « éléments cliniques » : médicament ET patient concerné uniquement (jamais de donnée de santé sans personne). */
export const hasClinicalSection = (wiz) => wiz.kind !== 'panne' && wiz.type === 'medicament' && wiz.personConcerned === 'oui';

/** Liste des signes proposés : panne d'appareil -> signes d'appareil ; incident -> signes propres au type de produit. */
export function precursorOptions(wiz) {
  if (wiz.kind === 'panne') return PRECURSOR_SIGNS;
  return PRECURSOR_SIGNS_BY_TYPE[wiz.type] || [];
}

/**
 * Question « signes avant … » posée ? Toujours pour une panne. Pour un incident : un type de produit choisi ; seul le
 * médicament, dont les signes sont ceux d'une personne, exige un patient concerné. Le cosmétique l'est toujours : un défaut
 * (odeur, texture...) se constate sur le produit même sans patient.
 */
export function hasPrecursorSection(wiz) {
  if (wiz.kind === 'panne') return true;
  if (!PRECURSOR_SIGNS_BY_TYPE[wiz.type]) return false;
  return wiz.type !== 'medicament' || wiz.personConcerned === 'oui';
}

/** Vocabulaire de l'écran : « avant la panne » (appareil) ou « avant l'incident » (produit). */
export function precursorWording(wiz) {
  return wiz.kind === 'panne'
    ? { title: 'Signes avant la panne', question: 'Avez-vous remarqué des signes avant la panne ?' }
    : { title: 'Signes avant l\'incident', question: 'Avez-vous remarqué des signes avant l\'incident ?' };
}

/** Signes cochés encore valides pour le type courant (un changement de type ne doit jamais laisser filer les signes d'un autre type). */
export const validPrecursorSigns = (wiz) => wiz.precursorSigns.filter((id) => precursorOptions(wiz).some((o) => o.id === id));

/** `precursors` du contrat, ou undefined (question absente ou sans réponse). Signes et délai seulement si « oui ». */
export function precursorsPayload(wiz) {
  // Seuls « oui » et « non » sont proposés ; une ancienne réponse « inconnu » (brouillon) vaut « pas de réponse ».
  if (!hasPrecursorSection(wiz) || (wiz.noticed !== 'oui' && wiz.noticed !== 'non')) return undefined;
  if (wiz.noticed !== 'oui') return { noticed: 'non' };
  const signs = validPrecursorSigns(wiz);
  return {
    noticed: 'oui',
    ...(signs.length ? { signs } : {}),
    ...(wiz.firstSeen ? { firstSeen: wiz.firstSeen } : {}),
    ...(wiz.precursorPattern ? { pattern: wiz.precursorPattern } : {}),
  };
}

/** `clinical` du contrat, ou undefined (section absente, ou rien de renseigné). Les classes d'allergie exigent « allergie : oui ». */
export function clinicalPayload(wiz) {
  if (!hasClinicalSection(wiz)) return undefined;
  const out = {};
  if (wiz.effectSystems.length) {
    out.otherEffects = wiz.effectSystems.map((system) => ({ system, ...(wiz.effectDelays?.[system] ? { onsetDelay: wiz.effectDelays[system] } : {}) }));
  }
  if (wiz.allergyKnown) out.allergyKnown = wiz.allergyKnown;
  if (wiz.allergyKnown === 'oui' && wiz.allergyClasses.length) out.allergyClasses = wiz.allergyClasses;
  if (wiz.conditions.length) out.conditions = wiz.conditions;
  if (wiz.sameProductBefore) out.sameProductBefore = wiz.sameProductBefore;
  return Object.keys(out).length ? out : undefined;
}

const PRECURSOR_SUMMARY_PATTERN = Object.fromEntries(PRECURSOR_PATTERNS.map((p) => [p.id, p.label.toLowerCase()]));
/** Texte lisible des signes avant la panne (récapitulatif et description transmise). Vide si la question n'a pas de réponse. */
export function precursorSummary(wiz) {
  if (!hasPrecursorSection(wiz) || (wiz.noticed !== 'oui' && wiz.noticed !== 'non')) return '';
  if (wiz.noticed === 'non') return 'Aucun signe observé';
  const signs = validPrecursorSigns(wiz).map((id) => labelOf(ALL_PRECURSOR_SIGNS, id)).filter(Boolean).join(', ') || 'signes non précisés';
  const since = wiz.firstSeen ? ` · depuis ${labelOf(PRECURSOR_FIRST_SEEN, wiz.firstSeen).toLowerCase()}` : '';
  const pat = wiz.precursorPattern ? ` · ${PRECURSOR_SUMMARY_PATTERN[wiz.precursorPattern]}` : '';
  return `${signs}${since}${pat}`;
}

const yn = (id) => labelOf(PERSON_ANSWERS, id);
/** Lignes lisibles des éléments cliniques (récapitulatif) : [[libellé, valeur]]. Toutes « Non renseigné » si vides. */
export function clinicalRows(wiz) {
  const effects = wiz.effectSystems.map((id) => {
    const base = labelOf(EFFECT_SYSTEMS, id).split(' (')[0];
    const d = wiz.effectDelays?.[id];
    return d ? `${base} (${labelOf(EFFECT_DELAYS, d)})` : base;
  }).join(', ');
  const allergy = wiz.allergyKnown
    ? `${yn(wiz.allergyKnown)}${wiz.allergyKnown === 'oui' && wiz.allergyClasses.length ? ` — ${wiz.allergyClasses.map((id) => labelOf(ALLERGY_CLASSES, id).split(' (')[0]).join(', ')}` : ''}`
    : '';
  return [
    ['Autres effets associés', effects],
    ['Allergie connue', allergy],
    ['Antécédents / terrain', wiz.conditions.map((id) => labelOf(CONDITIONS, id)).join(', ')],
    ['Déjà exposé au même produit', wiz.sameProductBefore ? yn(wiz.sameProductBefore) : ''],
  ];
}

/** Texte lisible d'un `precursors` DÉJÀ enregistré (forme du contrat) : fiches, détail, « Mes déclarations ». */
export function precursorsText(p) {
  if (!p || typeof p !== 'object') return '';
  if (p.noticed === 'non') return 'Aucun signe observé';
  if (p.noticed === 'inconnu') return 'Je ne sais pas';
  const signs = (p.signs || []).map((id) => labelOf(ALL_PRECURSOR_SIGNS, id) || id).join(', ') || 'signes non précisés';
  return `${signs}${p.firstSeen ? ` · depuis ${labelOf(PRECURSOR_FIRST_SEEN, p.firstSeen).toLowerCase()}` : ''}${p.pattern ? ` · ${labelOf(PRECURSOR_PATTERNS, p.pattern).toLowerCase()}` : ''}`;
}

/** Texte lisible d'un `clinical` DÉJÀ enregistré (forme du contrat). */
export function clinicalText(c) {
  if (!c || typeof c !== 'object') return '';
  const short = (list, id) => labelOf(list, id).split(' (')[0];
  const parts = [];
  if (c.otherEffects?.length) parts.push(`Autres effets : ${c.otherEffects.map((e) => `${short(EFFECT_SYSTEMS, e.system)}${e.onsetDelay ? ` (${labelOf(EFFECT_DELAYS, e.onsetDelay)})` : ''}`).join(', ')}`);
  if (c.allergyKnown) parts.push(`Allergie : ${labelOf(PERSON_ANSWERS, c.allergyKnown)}${c.allergyClasses?.length ? ` — ${c.allergyClasses.map((id) => short(ALLERGY_CLASSES, id)).join(', ')}` : ''}`);
  if (c.conditions?.length) parts.push(`Terrain : ${c.conditions.map((id) => labelOf(CONDITIONS, id)).join(', ')}`);
  if (c.sameProductBefore) parts.push(`Déjà exposé au produit : ${labelOf(PERSON_ANSWERS, c.sameProductBefore)}`);
  return parts.join(' ; ');
}

/**
 * Description envoyée avec l'enregistrement : le texte du déclarant + lignes lisibles (signes avant, éléments cliniques).
 * Ainsi l'information arrive aux destinataires (organisation, CNPM, fabricant) même sans champ dédié côté serveur.
 */
export function descriptionWithAddenda(wiz) {
  const base = wiz.description.trim();
  const extra = [];
  const pre = precursorSummary(wiz);
  if (pre) extra.push(`${precursorWording(wiz).title} : ${pre}.`);
  if (clinicalPayload(wiz)) clinicalRows(wiz).filter(([, val]) => val).forEach(([label, val]) => extra.push(`${label} : ${val}.`));
  return extra.length ? `${base}\n\n${extra.join('\n')}` : base;
}

// ── Limites ─────────────────────────────────────────────────────
export const MAX_DESC = 5000; // < 10 000 côté serveur, même avec les lignes ajoutées au texte transmis

/** Date du jour LOCALE (YYYY-MM-DD) — pas UTC : en Algérie (UTC+1), entre minuit et 1 h, l'UTC donnerait la veille. */
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => localIso(new Date());
export const yesterdayIso = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localIso(d); };
export const frDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const labelOf = (list, id) => list.find((x) => x.id === id)?.label || '';

export function initialWizardState() {
  return {
    kind: null, // 'incident' | 'panne'
    stepIdx: 0,
    // partagé
    service: '',
    onsetDate: '',
    description: '',
    // incident — produit
    type: null,
    productName: '',
    productRef: null,
    productOrg: '',
    manual: false, // produit hors catalogue CONFIRMÉ par l'utilisateur : déclaration au CNPM uniquement
    manufacturer: '', // NOM du fabricant (texte)
    manufacturerRef: '', // RÉFÉRENCE fabricant (code produit), distincte du nom et du lot
    lot: '',
    serial: '',
    udi: '',
    expiry: '',
    // incident — faits, gravité, personne
    problemType: null,
    circumstances: '',
    personConcerned: null, // 'oui' | 'non' | 'inconnu'
    severity: null,
    consequences: '',
    measures: [],
    patientName: '', // initiales ou identifiant pseudonymisé
    patientAge: '',
    patientSex: '',
    evolution: '',
    dechallenge: '',
    otherProducts: '',
    applicationZone: '',
    exposureRoute: '',
    reagentResult: '',
    instrument: '',
    // panne
    deviceName: '',
    brand: '',
    model: '',
    inventory: '',
    onsetTime: '',
    context: null,
    symptoms: [],
    errorCode: '',
    consequence: null, // 'none' | 'delay'
    deviceState: '',
    action: null,
    maintenanceDone: false,
    ticket: '',
    lastMaintenance: '',
    personExposed: null, // 'oui' | 'non' | 'inconnu'
    exposureKind: null, // 'exposed' | 'injury'
    // panne — signes observés AVANT la panne (facultatif ; sert à prédire les pannes futures)
    noticed: null, // 'oui' | 'non' | 'inconnu'
    precursorSigns: [],
    firstSeen: '', // id de PRECURSOR_FIRST_SEEN
    precursorPattern: '',
    // incident médicament + patient concerné — éléments cliniques codés (facultatif ; sert à détecter des signaux)
    effectSystems: [],
    effectDelays: {}, // système -> délai d'apparition
    allergyKnown: null, // 'oui' | 'non' | 'inconnu'
    allergyClasses: [],
    conditions: [],
    sameProductBefore: null, // 'oui' | 'non' | 'inconnu'
    // destination (étape finale)
    destination: null, // 'cnpm' | 'org' | 'both'
    informManufacturer: true, // bloc « Fabricant du produit » : présélectionné comme le comportement historique
  };
}

// ── Étapes ──────────────────────────────────────────────────────
const STEP = {
  produit: { key: 'produit', label: 'Produit' },
  faits: { key: 'faits', label: 'Faits' },
  gravite: { key: 'gravite', label: 'Gravité' },
  patient: { key: 'patient', label: 'Patient & contexte' },
  dispositif: { key: 'dispositif', label: 'Dispositif' },
  panne: { key: 'panne', label: 'Panne' },
  consequences: { key: 'consequences', label: 'Conséquences' },
  exposition: { key: 'exposition', label: 'Personne exposée' },
  preuves: { key: 'preuves', label: 'Pièces' },
  recap: { key: 'recap', label: 'Récapitulatif' },
  destination: { key: 'destination', label: 'Destination' },
};

/**
 * Étapes du parcours (toujours les mêmes, connues dès le départ).
 * Incident : 1re étape « Patient concerné ? » ; si oui, les informations de la personne se saisissent dans cette
 * même étape (jamais de champs médicaux sans objet), sinon on passe directement au produit.
 */
export function stepsFor(wiz) {
  if (wiz.kind === 'panne') {
    return [STEP.dispositif, STEP.panne, STEP.consequences, STEP.exposition, STEP.preuves, STEP.recap, STEP.destination];
  }
  return [STEP.patient, STEP.produit, STEP.faits, STEP.gravite, STEP.preuves, STEP.recap, STEP.destination];
}

// ── Identifiants : qui doit renseigner quoi, avec issue « inconnu » ─
/**
 * lot       : obligatoire pour médicament / réactif / cosmétique / chimique ; facultatif pour un dispositif.
 * série/UDI : dispositif — l'un des deux est obligatoire.   péremption : tout sauf dispositif, facultative.
 */
export function identifierRules(type) {
  const device = type === 'dispositif';
  return {
    lot: device ? 'optional' : type ? 'required' : 'hidden',
    serialUdi: device ? 'required' : 'hidden',
    expiry: type && !device ? 'optional' : 'hidden',
  };
}

/** Champs spécifiques à la catégorie, demandés seulement si une personne est concernée. */
export function categoryFields(type) {
  switch (type) {
    case 'medicament': return ['dechallenge', 'otherProducts'];
    case 'cosmetique': return ['applicationZone'];
    case 'chimique': return ['exposureRoute'];
    case 'reactif': return ['reagentResult', 'instrument'];
    default: return [];
  }
}

// ── Validation (pure) : renvoie null ou { title, msg } ──────────
const bad = (title, msg) => ({ title, msg });

/** « Signes avant … » : réponse OBLIGATOIRE (oui / non) ; « oui » exige au moins un signe valide pour le type, puis le délai. */
function precursorError(wiz) {
  if (!hasPrecursorSection(wiz)) return null;
  const when = wiz.kind === 'panne' ? 'la panne' : 'l\'incident';
  if (wiz.noticed !== 'oui' && wiz.noticed !== 'non') return bad('Réponse requise', `Indiquez si vous avez remarqué des signes avant ${when}.`);
  if (wiz.noticed !== 'oui') return null;
  if (!validPrecursorSigns(wiz).length) return bad('Signes requis', `Indiquez quels signes vous avez remarqués avant ${when} (ou répondez « Non »).`);
  if (!wiz.firstSeen) return bad('Délai requis', `Indiquez depuis quand vous aviez remarqué ces signes avant ${when}.`);
  return null;
}

export function validateStep(key, wiz) {
  if (key === 'patient') {
    if (wiz.personConcerned !== 'oui' && wiz.personConcerned !== 'non') {
      return bad('Choix requis', 'Indiquez si l\'incident concerne un patient : « Patient concerné » ou « Sans patient ».');
    }
    if (wiz.personConcerned === 'oui') {
      // Informations minimales obligatoires pour un patient concerné (le service reste facultatif).
      const name = String(wiz.patientName ?? '').trim();
      if (!name) return bad('Initiales requises', 'Indiquez les initiales du patient (ex. : M.B.).');
      if (name.length > 10) return bad('Initiales uniquement', 'Saisissez seulement les initiales du patient (10 caractères au plus), jamais son nom complet.');
      const age = String(wiz.patientAge ?? '').trim();
      if (!age) return bad('Âge requis', 'Indiquez l\'âge du patient.');
      if (!(Number(age) >= 0 && Number(age) <= 120)) return bad('Âge invalide', 'L\'âge doit être compris entre 0 et 120.');
      if (wiz.patientSex !== 'F' && wiz.patientSex !== 'M') return bad('Sexe requis', 'Indiquez le sexe du patient.');
      if (!wiz.evolution) return bad('Évolution requise', 'Indiquez l\'évolution de l\'état du patient (choisissez « Inconnue » si elle n\'est pas encore connue).');
    }
  }
  if (key === 'produit') {
    if (!wiz.type) return bad('Catégorie requise', 'Sélectionnez la catégorie du produit avant de continuer.');
    if (!wiz.productName.trim()) return bad('Produit requis', 'Indiquez le produit concerné avant de continuer.');
    if (!wiz.manual && !wiz.productRef) {
      return bad('Produit du catalogue requis', 'Choisissez le produit dans la liste du catalogue.');
    }
    const r = identifierRules(wiz.type);
    if (r.lot === 'required' && !wiz.lot.trim()) return bad('Lot requis', 'Saisissez le numéro de lot indiqué sur l\'emballage (ou scannez-le).');
    if (r.serialUdi === 'required' && !wiz.serial.trim() && !wiz.udi.trim()) {
      return bad('Identification requise', 'Saisissez le n° de série ou l\'UDI du dispositif (ou scannez-le).');
    }
    if (wiz.expiry && wiz.expiry < '2000-01-01') return bad('Date invalide', 'Vérifiez la date de péremption.');
  }
  if (key === 'faits') {
    if (!wiz.problemType) return bad('Nature requise', 'Sélectionnez la nature de l\'événement.');
    if (!wiz.onsetDate) return bad('Date requise', 'Indiquez la date de survenue ou de découverte.');
    if (wiz.onsetDate > todayIso()) return bad('Date invalide', 'L\'événement ne peut pas avoir lieu dans le futur : indiquez le jour où il s\'est produit ou a été découvert.');
    if (!wiz.description.trim()) return bad('Description requise', 'Décrivez l\'événement avant de continuer.');
    if (wiz.description.length > MAX_DESC) return bad('Description trop longue', `La description ne peut pas dépasser ${MAX_DESC} caractères.`);
    const preInc = precursorError(wiz);
    if (preInc) return preInc;
    if (hasClinicalSection(wiz) && wiz.allergyClasses.length && wiz.allergyKnown !== 'oui') {
      return bad('Incohérence', 'Des classes d\'allergie sont cochées : répondez « Oui » à « Allergie connue », ou décochez-les.');
    }
    if (wiz.problemType === 'resultat' && wiz.personConcerned === 'non') {
      return bad('Incohérence', 'Un effet indésirable concerne une personne : choisissez une autre nature, ou « Patient concerné » à l\'étape « Patient & contexte ».');
    }
  }
  if (key === 'gravite') {
    if (!wiz.severity) return bad('Gravité requise', 'Sélectionnez la gravité.');
    if (wiz.personConcerned === 'oui' && wiz.evolution === 'deces' && wiz.severity !== 'grave') {
      return bad('Incohérence', 'Le patient est décédé (étape « Patient & contexte ») : la gravité doit être « Grave ».');
    }
  }
  if (key === 'dispositif') {
    if (!wiz.deviceName.trim()) return bad('Dispositif requis', 'Indiquez la dénomination de l\'appareil.');
    if (!wiz.serial.trim() && !wiz.inventory.trim() && !wiz.udi.trim()) {
      return bad('Identification requise', 'Indiquez le n° de série, le n° d\'inventaire ou l\'UDI de l\'appareil.');
    }
  }
  if (key === 'panne') {
    if (!wiz.onsetDate) return bad('Date requise', 'Indiquez la date de la panne.');
    if (wiz.onsetDate > todayIso()) return bad('Date invalide', 'La panne ne peut pas avoir lieu dans le futur : indiquez le jour où elle s\'est produite.');
    if (!wiz.context) return bad('Circonstances requises', 'Précisez dans quelles circonstances la panne est survenue.');
    if (!wiz.description.trim()) return bad('Description requise', 'Décrivez la panne avant de continuer.');
    if (wiz.description.length > MAX_DESC) return bad('Description trop longue', `La description ne peut pas dépasser ${MAX_DESC} caractères.`);
    // Signes avant la panne : facultatif, mais cohérent. « Oui » sans signe ni délai ne servirait à rien à la prédiction.
    const pre = precursorError(wiz);
    if (pre) return pre;
  }
  if (key === 'consequences') {
    if (!wiz.consequence) return bad('Conséquence requise', 'Indiquez la conséquence de la panne sur le fonctionnement et la prise en charge.');
    if (!wiz.deviceState) return bad('État requis', 'Indiquez l\'état actuel de l\'appareil.');
    if (wiz.action === 'hors_service' && wiz.deviceState === 'en_service') {
      return bad('Incohérence', 'L\'appareil a été mis hors service : son état actuel ne peut pas être « En service ».');
    }
    if (wiz.maintenanceDone && wiz.lastMaintenance && wiz.lastMaintenance > todayIso()) return bad('Date invalide', 'La date de maintenance ne peut pas être dans le futur.');
  }
  if (key === 'exposition') {
    if (!wiz.personExposed) return bad('Question requise', 'Indiquez si une personne a été exposée ou blessée.');
    if (wiz.personExposed === 'oui' && !wiz.exposureKind) return bad('Précision requise', 'Indiquez si la personne a été exposée à un risque ou blessée.');
  }
  return null;
}

/** Première étape (dans l'ordre) dont la validation échoue, ou null. Sert avant l'envoi. */
export function firstInvalidStep(wiz) {
  const keys = stepsFor(wiz).map((s) => s.key).filter((k) => !['preuves', 'recap', 'destination'].includes(k));
  for (const k of keys) { const e = validateStep(k, wiz); if (e) return { key: k, ...e }; }
  return null;
}

// ── Textes transmis (Audit n'a pas de champ dédié : rien n'est perdu, tout part dans le texte) ──
const list = (arr, items) => arr.map((id) => labelOf(items, id)).filter(Boolean).join(', ');
const evoLabel = (id) => labelOf([...EVOLUTIONS, ...LEGACY_EVOLUTIONS], id);

/** Description envoyée à Audit pour un incident. Jamais d'identité de personne. */
export function composeIncidentDescription(wiz) {
  const ids = [
    wiz.lot.trim() ? `Lot : ${wiz.lot.trim()}.` : null,
    wiz.serial.trim() ? `N° de série : ${wiz.serial.trim()}.` : null,
    wiz.udi.trim() ? `UDI : ${wiz.udi.trim()}.` : null,
    wiz.expiry ? `Date de péremption : ${frDate(wiz.expiry)}.` : null,
    wiz.manufacturer.trim() ? `Fabricant : ${wiz.manufacturer.trim()}.` : null,
  ];
  const person = wiz.personConcerned === 'oui' ? [
    'Personne concernée : oui.',
    wiz.patientAge ? `Âge : ${String(wiz.patientAge).trim()} ans.` : null,
    wiz.patientSex ? `Sexe : ${wiz.patientSex === 'F' ? 'féminin' : 'masculin'}.` : null,
    wiz.evolution ? `Évolution : ${evoLabel(wiz.evolution)}.` : null,
    wiz.dechallenge ? `Arrêt du produit : ${labelOf(DECHALLENGE, wiz.dechallenge)}.` : null,
    wiz.otherProducts.trim() ? `Autres produits pris : ${wiz.otherProducts.trim()}.` : null,
    wiz.applicationZone.trim() ? `Zone d'application : ${wiz.applicationZone.trim()}.` : null,
    wiz.exposureRoute ? `Voie d'exposition : ${labelOf(EXPOSURE_ROUTES, wiz.exposureRoute)}.` : null,
    wiz.reagentResult.trim() ? `Résultat concerné : ${wiz.reagentResult.trim()}.` : null,
    wiz.instrument.trim() ? `Instrument : ${wiz.instrument.trim()}.` : null,
  ] : [wiz.personConcerned === 'non' ? 'Personne concernée : non.' : 'Personne concernée : inconnue.'];
  return [
    wiz.description.trim(),
    wiz.circumstances.trim() ? `\nCirconstances : ${wiz.circumstances.trim()}` : null,
    '',
    `Date de survenue ou de découverte : ${frDate(wiz.onsetDate)}.`,
    wiz.problemType ? `Nature : ${NATURE_LABEL[wiz.problemType]}.` : null,
    wiz.type ? `Catégorie de produit : ${TYPE_LABEL[wiz.type]}.` : null,
    ...ids,
    wiz.manual ? 'Produit hors catalogue VigiCore (fabricant non relié à VigiCore Audit).' : null,
    wiz.consequences.trim() ? `Conséquences : ${wiz.consequences.trim()}` : null,
    wiz.measures.length ? `Mesures prises : ${list(wiz.measures, MEASURES)}.` : null,
    ...person,
    precursorSummary(wiz) ? `Signes avant l'incident : ${precursorSummary(wiz)}.` : null,
    ...(clinicalPayload(wiz) ? clinicalRows(wiz).filter(([, val]) => val).map(([label, val]) => `${label} : ${val}.`) : []),
  ].filter((l) => l !== null).join('\n');
}

/** Libellés « Non renseigné » du récapitulatif. */
const v = (x) => { const t = String(x ?? '').trim(); return t || NOT_FILLED; };

/**
 * Récapitulatif par blocs modifiables : [{ id, title, step, rows: [[label, value]] }].
 * `step` = clé de l'étape à rouvrir par « Modifier ». Les informations vides sont affichées « Non renseigné ».
 */
export function recapSections(wiz, files = []) {
  const filesRow = files.length
    ? files.map((f) => `${f.name} (${f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(f.size / 1024))} Ko`})${f.note ? ` — ${f.note}` : ''}`)
    : [];
  const attachments = { id: 'preuves', title: 'Pièces jointes', step: 'preuves', rows: [['Fichiers', files.length ? filesRow.join(' · ') : 'Aucune pièce jointe']] };

  if (wiz.kind === 'panne') {
    const impact = panneImpact(wiz);
    return [
      { id: 'dispositif', title: 'Dispositif', step: 'dispositif', rows: [
        ['Dénomination', v(`${wiz.deviceName}${wiz.model.trim() ? ` · ${wiz.model.trim()}` : ''}`)],
        ['Marque / fabricant', v(wiz.brand)],
        ['Référence fabricant', v(wiz.manufacturerRef)],
        ['N° de série', v(wiz.serial)], ['N° d\'inventaire', v(wiz.inventory)], ['UDI', v(wiz.udi)],
        ['Service / localisation', v(wiz.service)],
      ] },
      { id: 'panne', title: 'Panne', step: 'panne', rows: [
        ['Date', `${frDate(wiz.onsetDate) || NOT_FILLED}${wiz.onsetTime ? ` à ${wiz.onsetTime}` : ''}`],
        ['Circonstances', v(labelOf(PANNE_CONTEXTS, wiz.context))],
        ['Symptômes', v(list(wiz.symptoms, PANNE_SYMPTOMS))],
        ['Signes avant la panne', v(precursorSummary(wiz))],
        ['Code d\'erreur', v(wiz.errorCode)],
        ['Description', v(wiz.description)],
      ] },
      { id: 'consequences', title: 'Conséquences et mesures', step: 'consequences', rows: [
        ['Conséquence', v(labelOf(CONSEQUENCES, wiz.consequence))],
        ['État actuel', v(labelOf(DEVICE_STATES, wiz.deviceState))],
        ['Action prise', v(labelOf(PANNE_ACTIONS, wiz.action))],
        ...(wiz.maintenanceDone ? [['Maintenance', `Ticket : ${v(wiz.ticket)} · Dernière : ${wiz.lastMaintenance ? frDate(wiz.lastMaintenance) : NOT_FILLED}`]] : []),
        ['Dispositif du catalogue', wiz.productRef ? `${wiz.productName} (${wiz.productOrg || 'catalogue'})` : 'Non rattaché au catalogue'],
      ] },
      { id: 'exposition', title: 'Personne exposée ou blessée', step: 'exposition', rows: [
        ['Personne exposée ou blessée', wiz.personExposed === 'oui' ? labelOf(EXPOSURES, wiz.exposureKind) || NOT_FILLED : labelOf(PERSON_ANSWERS, wiz.personExposed) || NOT_FILLED],
        ['Traitement', impact ? (isEscalated(impact) ? 'Incident de matériovigilance' : 'Panne technique') : NOT_FILLED],
      ] },
      attachments,
    ];
  }

  const rules = identifierRules(wiz.type);
  return [
    { id: 'patient', title: 'Patient & contexte', step: 'patient', rows: [
      ['Patient', wiz.personConcerned === 'oui' ? 'Patient concerné' : wiz.personConcerned === 'non' ? 'Sans patient' : NOT_FILLED],
      ...(wiz.personConcerned === 'oui' ? [
        ['Nom (initiales)', v(wiz.patientName)],
        ['Âge', wiz.patientAge ? `${String(wiz.patientAge).trim()} ans` : NOT_FILLED],
        ['Sexe', wiz.patientSex === 'F' ? 'Féminin' : wiz.patientSex === 'M' ? 'Masculin' : NOT_FILLED],
        ['Service', v(wiz.service)],
        ['Évolution', v(evoLabel(wiz.evolution))],
      ] : []),
    ] },
    { id: 'produit', title: 'Produit', step: 'produit', rows: [
      ['Catégorie', v(TYPE_LABEL[wiz.type])],
      ['Produit', v(wiz.productName)],
      ['Rattachement', wiz.manual ? 'Hors catalogue — fabricant absent de VigiCore Audit (CNPM uniquement)' : wiz.productRef ? `Catalogue (${wiz.productOrg || 'organisation du produit'})` : NOT_FILLED],
      ['Fabricant', v(wiz.manufacturer)],
      ['Référence fabricant', v(wiz.manufacturerRef)],
      ...(rules.lot !== 'hidden' ? [['Lot', v(wiz.lot)]] : []),
      ...(rules.serialUdi !== 'hidden' ? [['N° de série', v(wiz.serial)], ['UDI', v(wiz.udi)]] : []),
      ...(rules.expiry !== 'hidden' ? [['Date de péremption', wiz.expiry ? frDate(wiz.expiry) : NOT_FILLED]] : []),
    ] },
    { id: 'faits', title: 'Faits', step: 'faits', rows: [
      ['Nature', v(NATURE_LABEL[wiz.problemType])],
      ['Date de survenue ou de découverte', frDate(wiz.onsetDate) || NOT_FILLED],
      ['Circonstances', v(wiz.circumstances)],
      ['Description', v(wiz.description)],
      ...(hasPrecursorSection(wiz) ? [['Signes avant l\'incident', v(precursorSummary(wiz))]] : []),
      ...(wiz.personConcerned === 'oui' ? categoryFields(wiz.type).map((f) => ({
        dechallenge: ['Arrêt du produit', v(labelOf(DECHALLENGE, wiz.dechallenge))],
        otherProducts: ['Autres produits pris', v(wiz.otherProducts)],
        applicationZone: ['Zone d\'application', v(wiz.applicationZone)],
        exposureRoute: ['Voie d\'exposition', v(labelOf(EXPOSURE_ROUTES, wiz.exposureRoute))],
        reagentResult: ['Résultat concerné', v(wiz.reagentResult)],
        instrument: ['Instrument', v(wiz.instrument)],
      }[f])) : []),
      ...(hasClinicalSection(wiz) ? clinicalRows(wiz).map(([label, val]) => [label, v(val)]) : []),
    ] },
    { id: 'gravite', title: 'Gravité, conséquences et mesures', step: 'gravite', rows: [
      ['Gravité', v(labelOf(SEVERITIES, wiz.severity))],
      ['Conséquences', v(wiz.consequences)],
      ['Mesures prises', v(list(wiz.measures, MEASURES))],
    ] },
    attachments,
  ];
}

/** Libellés des cases du récapitulatif de la liste des informations non renseignées. */
export function unfilledLabels(sections) {
  const out = [];
  for (const s of sections) for (const [label, value] of s.rows) if (value === NOT_FILLED && label !== 'Fichiers') out.push(label);
  return out;
}
