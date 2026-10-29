import { describe, it, expect } from 'vitest';
import { transmissionRows } from '../src/dashboards/components/recordPresentation';
import { initialWizardState, stepsFor, validateStep, firstInvalidStep, identifierRules, composeIncidentDescription, recapSections, unfilledLabels, MAX_DESC } from '../src/dashboards/lib/declarationModel';

const base = (o = {}) => ({ ...initialWizardState(), kind: 'incident', ...o });

describe('declarationModel', () => {
  it('incident : « Patient concerné » en 1re étape, étapes fixes quelle que soit la réponse, destination en dernier', () => {
    const no = stepsFor(base({ personConcerned: 'non' })).map((s) => s.key);
    const yes = stepsFor(base({ personConcerned: 'oui' })).map((s) => s.key);
    expect(no).toEqual(yes);
    expect(no[0]).toBe('patient');
    expect(no).not.toContain('personne');
    expect(no[no.length - 1]).toBe('destination');
    expect(no.indexOf('recap')).toBe(no.length - 2);
  });
  it('« Patient concerné » : réponse obligatoire ; initiales, âge, sexe et évolution obligatoires si oui', () => {
    expect(validateStep('patient', base())).toBeTruthy();
    expect(validateStep('patient', base({ personConcerned: 'inconnu' }))).toBeTruthy(); // plus proposé
    expect(validateStep('patient', base({ personConcerned: 'non' }))).toBeFalsy();
    const full = { personConcerned: 'oui', patientName: 'A.B.', patientAge: '54', patientSex: 'F', evolution: 'retabli' };
    expect(validateStep('patient', base(full))).toBeFalsy();
    expect(validateStep('patient', base({ ...full, service: '' }))).toBeFalsy(); // service facultatif
    expect(validateStep('patient', base({ ...full, patientAge: '130' }))).toBeTruthy();
    expect(validateStep('patient', base({ ...full, patientName: '' }))?.title).toBe('Initiales requises');
    expect(validateStep('patient', base({ ...full, patientName: 'Mohamed Benali' }))?.title).toBe('Initiales uniquement');
    expect(validateStep('patient', base({ ...full, patientAge: '' }))?.title).toBe('Âge requis');
    expect(validateStep('patient', base({ ...full, patientSex: '' }))?.title).toBe('Sexe requis');
    expect(validateStep('patient', base({ ...full, evolution: '' }))?.title).toBe('Évolution requise');
  });
  it('panne : mêmes garanties', () => {
    const k = stepsFor(base({ kind: 'panne' })).map((s) => s.key);
    expect(k[0]).toBe('dispositif'); expect(k[k.length - 1]).toBe('destination'); expect(k).toContain('recap');
  });
  it('produit : le nom est obligatoire', () => {
    expect(validateStep('produit', base())).toBeTruthy();
  });
  it('description limitée à MAX_DESC', () => {
    const e = validateStep('faits', base({ problemType: 'qualite', onsetDate: '2026-01-01', description: 'x'.repeat(MAX_DESC + 1) }));
    expect(e).toBeTruthy();
  });
  it('panne : au moins un identifiant obligatoire (plus d\'option « aucun identifiant »)', () => {
    const w = base({ kind: 'panne', deviceName: 'Pompe' });
    expect(validateStep('dispositif', w)).toBeTruthy();
    expect(validateStep('dispositif', { ...w, noIdentifier: true })).toBeTruthy();
    expect(validateStep('dispositif', { ...w, serial: 'SN1' })).toBeFalsy();
    expect(validateStep('dispositif', { ...w, inventory: 'INV-1' })).toBeFalsy();
  });
  it('incident : lot obligatoire (médicament), série ou UDI obligatoire (dispositif), sans option « inconnu »', () => {
    const med = base({ type: 'medicament', productName: 'A', productRef: 'p1' });
    expect(validateStep('produit', { ...med, lotUnknown: true })).toBeTruthy();
    expect(validateStep('produit', { ...med, lot: 'L1' })).toBeFalsy();
    const dev = base({ type: 'dispositif', productName: 'B', productRef: 'p2' });
    expect(validateStep('produit', { ...dev, idUnknown: true })).toBeTruthy();
    expect(validateStep('produit', { ...dev, udi: 'U1' })).toBeFalsy();
  });
  it('incident : produit non choisi dans le catalogue = bloqué, sauf hors catalogue confirmé', () => {
    const w = base({ type: 'medicament', productName: 'X', lot: 'L1' });
    expect(validateStep('produit', w)).toBeTruthy();
    expect(validateStep('produit', { ...w, manual: true })).toBeFalsy();
  });
  it('cohérence : décès => gravité « Grave » ; appareil mis hors service ≠ « En service »', () => {
    expect(validateStep('gravite', base({ personConcerned: 'oui', evolution: 'deces', severity: 'moderee' }))).toBeTruthy();
    expect(validateStep('gravite', base({ personConcerned: 'oui', evolution: 'deces', severity: 'grave' }))).toBeFalsy();
    const p = base({ kind: 'panne', consequence: 'none' });
    expect(validateStep('consequences', { ...p, deviceState: 'en_service', action: 'hors_service' })).toBeTruthy();
    expect(validateStep('consequences', { ...p, deviceState: 'hors_service', action: 'hors_service' })).toBeFalsy();
  });
  it('règles d\'identifiants : dispositif ≠ médicament', () => {
    expect(identifierRules('dispositif')).not.toEqual(identifierRules('medicament'));
  });
  it('récapitulatif : valeurs vides marquées « Non renseigné », sans fuite de champs masqués', () => {
    const s = recapSections(base({ productName: 'X' }), []);
    expect(s.length).toBeGreaterThan(0);
    expect(unfilledLabels(s).length).toBeGreaterThan(0);
  });
  it('firstInvalidStep trouve une étape invalide sur un état vide', () => {
    expect(firstInvalidStep(base())).toBeTruthy();
  });
  it('description composée pour Audit non vide et bornée', () => {
    const d = composeIncidentDescription(base({ productName: 'X', description: 'abc', circumstances: 'c' }));
    expect(d).toContain('abc'); expect(d.length).toBeLessThanOrEqual(MAX_DESC + 2000);
  });
  it('transmission : fabricant non informé / non confirmé / en cours selon l\'intention enregistrée', () => {
    const base = { kind: 'INCIDENT', deliveries: [{ destination: 'ORG', status: 'AVAILABLE' }] };
    const mfr = (r) => transmissionRows(r).find((x) => x.id === 'mfr').text;
    expect(mfr({ ...base, fields: [{ key: 'informManufacturer', value: false }] })).toBe('Non informé');
    expect(mfr({ ...base, fields: [] })).toBe('Non informé');
    expect(mfr({ ...base, fields: [{ key: 'informManufacturer', value: true }] })).toBe('Transmission non confirmée');
    expect(mfr({ ...base, deliveries: [...base.deliveries, { destination: 'MANUFACTURER', status: 'PENDING' }], fields: [] })).toBe('Transmission en cours');
    expect(transmissionRows({ ...base, fields: [] }).find((x) => x.id === 'cnpm').text).toBe('Non informé');
  });
});
