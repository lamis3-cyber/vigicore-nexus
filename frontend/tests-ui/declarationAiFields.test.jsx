import { describe, it, expect } from 'vitest';
import {
  initialWizardState, validateStep, recapSections, composeIncidentDescription,
  precursorsPayload, clinicalPayload, hasClinicalSection, precursorSummary,
  hasPrecursorSection, precursorOptions, precursorWording, descriptionWithAddenda, PRECURSOR_SIGNS_BY_TYPE,
} from '../src/dashboards/lib/declarationModel';

const panne = (o = {}) => ({ ...initialWizardState(), kind: 'panne', onsetDate: '2026-10-20', context: 'utilisation', description: 'Arrêt brutal', ...o });
const med = (o = {}) => ({ ...initialWizardState(), kind: 'incident', type: 'medicament', personConcerned: 'oui', ...o });

describe('signes avant la panne (precursors)', () => {
  it('obligatoire : sans réponse, rien n’est envoyé et l’étape est bloquée', () => {
    expect(precursorsPayload(panne())).toBeUndefined();
    expect(validateStep('panne', panne())?.title).toBe('Réponse requise');
    expect(validateStep('panne', panne({ noticed: 'non' }))).toBeFalsy();
    // une ancienne réponse « inconnu » (brouillon) n'est plus acceptée
    expect(validateStep('panne', panne({ noticed: 'inconnu' }))?.title).toBe('Réponse requise');
  });
  it('« non » : seule la réponse est envoyée (même si des signes restent cochés)', () => {
    expect(precursorsPayload(panne({ noticed: 'non', precursorSigns: ['bruit'], firstSeen: '1-7j' }))).toEqual({ noticed: 'non' });
    // « Je ne sais pas » n'est plus proposé : une ancienne réponse de brouillon équivaut à « pas de réponse »
    expect(precursorsPayload(panne({ noticed: 'inconnu' }))).toBeUndefined();
    expect(precursorSummary(panne({ noticed: 'inconnu' }))).toBe('');
  });
  it('« oui » : exige au moins un signe puis le délai', () => {
    expect(validateStep('panne', panne({ noticed: 'oui' }))?.title).toBe('Signes requis');
    expect(validateStep('panne', panne({ noticed: 'oui', precursorSigns: ['bruit'] }))?.title).toBe('Délai requis');
    expect(validateStep('panne', panne({ noticed: 'oui', precursorSigns: ['bruit'], firstSeen: '1-7j' }))).toBeFalsy();
  });
  it('payload complet conforme au contrat serveur', () => {
    const w = panne({ noticed: 'oui', precursorSigns: ['bruit', 'chauffe'], firstSeen: '1-7j', precursorPattern: 'aggravation' });
    expect(precursorsPayload(w)).toEqual({ noticed: 'oui', signs: ['bruit', 'chauffe'], firstSeen: '1-7j', pattern: 'aggravation' });
  });
  it('récapitulatif : ligne « Signes avant la panne » lisible', () => {
    expect(precursorSummary(panne())).toBe('');
    expect(precursorSummary(panne({ noticed: 'non' }))).toBe('Aucun signe observé');
    const txt = precursorSummary(panne({ noticed: 'oui', precursorSigns: ['bruit'], firstSeen: '1-7j', precursorPattern: 'aggravation' }));
    expect(txt).toContain('Bruit anormal');
    expect(txt).toContain('depuis 1 à 7 jours');
    const rows = recapSections(panne({ noticed: 'oui', precursorSigns: ['bruit'], firstSeen: 'lt24h' })).flatMap((s) => s.rows);
    expect(rows.some(([label]) => label === 'Signes avant la panne')).toBe(true);
  });
});

describe('éléments cliniques (clinical)', () => {
  const full = {
    effectSystems: ['cutane', 'digestif'], effectDelays: { cutane: 'lt1h' }, allergyKnown: 'oui', allergyClasses: ['aine'],
    conditions: ['renal'], sameProductBefore: 'non',
  };
  it('section présente seulement pour médicament + patient concerné', () => {
    expect(hasClinicalSection(med())).toBe(true);
    expect(hasClinicalSection(med({ personConcerned: 'non' }))).toBe(false);
    expect(hasClinicalSection(med({ type: 'dispositif' }))).toBe(false);
    expect(hasClinicalSection(panne())).toBe(false);
  });
  it('rien de renseigné -> undefined ; hors section -> undefined même si l’état contient des restes', () => {
    expect(clinicalPayload(med())).toBeUndefined();
    expect(clinicalPayload(med({ ...full, personConcerned: 'non' }))).toBeUndefined();
    expect(clinicalPayload(med({ ...full, type: 'cosmetique' }))).toBeUndefined();
  });
  it('payload codé conforme au contrat (délai seulement pour les systèmes cochés)', () => {
    expect(clinicalPayload(med({ ...full, effectDelays: { cutane: 'lt1h', neuro: 'gt1j' } }))).toEqual({
      otherEffects: [{ system: 'cutane', onsetDelay: 'lt1h' }, { system: 'digestif' }],
      allergyKnown: 'oui', allergyClasses: ['aine'], conditions: ['renal'], sameProductBefore: 'non',
    });
  });
  it('classes d’allergie ignorées si allergie ≠ oui, et refus de continuer en cas d’incohérence', () => {
    expect(clinicalPayload(med({ ...full, allergyKnown: 'non' })).allergyClasses).toBeUndefined();
    expect(validateStep('faits', med({ ...full, noticed: 'non', allergyKnown: 'non', problemType: 'anomalie', onsetDate: '2026-10-20', description: 'x' }))?.title).toBe('Incohérence');
  });
  it('récapitulatif et description transmise reprennent les éléments cliniques', () => {
    const w = med({ ...full, productName: 'Amox', problemType: 'resultat', onsetDate: '2026-10-20', description: 'Rash' });
    const labels = recapSections(w).flatMap((s) => s.rows).map(([l]) => l);
    expect(labels).toEqual(expect.arrayContaining(['Autres effets associés', 'Allergie connue', 'Antécédents / terrain']));
    const desc = composeIncidentDescription(w);
    expect(desc).toContain('Allergie connue : Oui — AINS');
    expect(desc).toContain('Antécédents / terrain : Insuffisance rénale');
  });
  it('sans éléments cliniques, la description transmise est inchangée', () => {
    expect(composeIncidentDescription(med({ productName: 'Amox', problemType: 'resultat', onsetDate: '2026-10-20', description: 'Rash' }))).not.toContain('Allergie connue');
  });
});

import { precursorsText, clinicalText } from '../src/dashboards/lib/declarationModel';
import { fieldValue } from '../src/dashboards/components/MySubmissions';
import { detailSections } from '../src/dashboards/components/recordPresentation';

describe('affichage des champs structurés (jamais « [object Object] »)', () => {
  const p = { noticed: 'oui', signs: ['bruit', 'fuite'], firstSeen: '1-7j', pattern: 'continu' };
  const c = { otherEffects: [{ system: 'cutane', onsetDelay: 'lt1h' }], allergyKnown: 'oui', allergyClasses: ['aine'], conditions: ['asthme'], sameProductBefore: 'non' };
  it('textes lisibles', () => {
    expect(precursorsText(p)).toBe('Bruit anormal, Fuite · depuis 1 à 7 jours · en continu');
    expect(precursorsText({ noticed: 'non' })).toBe('Aucun signe observé');
    expect(clinicalText(c)).toContain('Allergie : Oui — AINS');
    expect(clinicalText(undefined)).toBe('');
  });
  it('fieldValue et détail d’un enregistrement', () => {
    expect(fieldValue('malfunction.precursors', p)).not.toContain('object');
    expect(fieldValue('clinical', c)).toContain('Terrain : Asthme');
    const secs = detailSections({ fields: [{ key: 'malfunction.precursors', value: p }, { key: 'clinical', value: c }] });
    const all = secs.flatMap((s) => s.rows);
    expect(all.find((r) => r.key === 'malfunction.precursors').label).toBe('Signes avant la panne');
    expect(JSON.stringify(all)).not.toContain('[object Object]');
  });
});


describe('signes avant l’incident : tous les types de produit', () => {
  const inc = (type, o = {}) => ({ ...initialWizardState(), kind: 'incident', type, personConcerned: 'oui', problemType: 'anomalie', onsetDate: '2026-10-20', description: 'Souci', ...o });

  it('chaque type propose ses propres signes, et « autre » existe partout', () => {
    for (const type of ['dispositif', 'medicament', 'cosmetique', 'chimique', 'reactif']) {
      const ids = precursorOptions(inc(type)).map((o) => o.id);
      expect(ids.length).toBeGreaterThan(3);
      expect(ids).toContain('autre');
    }
    expect(precursorOptions(inc('medicament')).map((o) => o.id)).toContain('vertiges');
    expect(precursorOptions(inc('reactif')).map((o) => o.id)).toContain('cq_hors_limites');
    expect(precursorOptions(panne()).map((o) => o.id)).toContain('chauffe');
  });
  it('un même id garde toujours le même libellé (sinon l’affichage des anciens enregistrements serait faux)', () => {
    const seen = {};
    for (const list of Object.values(PRECURSOR_SIGNS_BY_TYPE)) for (const o of list) { expect(seen[o.id] ?? o.label).toBe(o.label); seen[o.id] = o.label; }
  });
  it('question présente selon le type ; seul le médicament exige un patient concerné', () => {
    expect(hasPrecursorSection(inc('dispositif', { personConcerned: 'non' }))).toBe(true);
    expect(hasPrecursorSection(inc('chimique', { personConcerned: 'non' }))).toBe(true);
    expect(hasPrecursorSection(inc('reactif', { personConcerned: 'non' }))).toBe(true);
    expect(hasPrecursorSection(inc('medicament', { personConcerned: 'non' }))).toBe(false);
    expect(hasPrecursorSection(inc('cosmetique', { personConcerned: 'non' }))).toBe(true);
    expect(hasPrecursorSection(inc('medicament'))).toBe(true);
    expect(hasPrecursorSection(inc(null))).toBe(false);
    expect(hasPrecursorSection(panne())).toBe(true);
  });
  it('vocabulaire : « avant l’incident » vs « avant la panne »', () => {
    expect(precursorWording(inc('medicament')).title).toBe('Signes avant l\'incident');
    expect(precursorWording(panne()).title).toBe('Signes avant la panne');
  });
  it('étape « Faits » : réponse obligatoire ; « oui » exige signes puis délai', () => {
    expect(validateStep('faits', inc('medicament'))?.title).toBe('Réponse requise');
    expect(validateStep('faits', inc('medicament', { noticed: 'non' }))).toBeFalsy();
    // pas de question (médicament sans patient) : rien d'obligatoire
    expect(validateStep('faits', inc('medicament', { personConcerned: 'non' }))).toBeFalsy();
    expect(validateStep('faits', inc('medicament', { noticed: 'oui' }))?.title).toBe('Signes requis');
    expect(validateStep('faits', inc('medicament', { noticed: 'oui', precursorSigns: ['vertiges'] }))?.title).toBe('Délai requis');
    expect(validateStep('faits', inc('medicament', { noticed: 'oui', precursorSigns: ['vertiges'], firstSeen: 'lt24h' }))).toBeFalsy();
  });
  it('changer de type ne laisse pas fuiter les signes d’un autre type', () => {
    const w = inc('cosmetique', { noticed: 'oui', precursorSigns: ['vertiges', 'rougeur'], firstSeen: '1-7j' });
    expect(precursorsPayload(w).signs).toEqual(['rougeur']);
    // tous les signes cochés appartiennent à l'ancien type : « oui » devient invalide au lieu d'envoyer des signes étrangers
    expect(validateStep('faits', inc('reactif', { noticed: 'oui', precursorSigns: ['vertiges'], firstSeen: '1-7j' }))?.title).toBe('Signes requis');
  });
  it('section absente (médicament sans patient) : rien n’est envoyé même si l’état contient des restes', () => {
    expect(precursorsPayload(inc('medicament', { personConcerned: 'non', noticed: 'oui', precursorSigns: ['vertiges'], firstSeen: 'lt24h' }))).toBeUndefined();
    expect(precursorSummary(inc('medicament', { personConcerned: 'non', noticed: 'oui' }))).toBe('');
  });
  it('récapitulatif de l’incident : ligne « Signes avant l’incident »', () => {
    const w = inc('chimique', { productName: 'Javel', noticed: 'oui', precursorSigns: ['odeur'], firstSeen: 'lt24h' });
    const rows = recapSections(w).flatMap((s) => s.rows);
    expect(rows.find(([l]) => l === 'Signes avant l\'incident')[1]).toContain('Odeur inhabituelle');
  });
  it('la description envoyée porte l’information (aucune perte même sans champ serveur dédié)', () => {
    const w = inc('medicament', { noticed: 'oui', precursorSigns: ['nausee'], firstSeen: '1-7j', allergyKnown: 'oui', allergyClasses: ['aine'] });
    const d = descriptionWithAddenda(w);
    expect(d.startsWith('Souci')).toBe(true);
    expect(d).toContain('Signes avant l\'incident : Nausées · depuis 1 à 7 jours');
    expect(d).toContain('Allergie connue : Oui — AINS');
    expect(descriptionWithAddenda(panne({ noticed: 'oui', precursorSigns: ['bruit'], firstSeen: 'lt24h' }))).toContain('Signes avant la panne : Bruit anormal');
    expect(descriptionWithAddenda(inc('dispositif'))).toBe('Souci');
    expect(composeIncidentDescription(inc('medicament', { productName: 'X', noticed: 'oui', precursorSigns: ['nausee'], firstSeen: 'lt24h' }))).toContain('Signes avant l\'incident : Nausées');
  });
});
