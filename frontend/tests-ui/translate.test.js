import { describe, it, expect, beforeEach } from 'vitest';
import { tr, setCurrentLang, getLang, isRtl, localeTag } from '../src/i18n/translate.js';

describe('tr()', () => {
  beforeEach(() => setCurrentLang('fr'));
  it('laisse le français inchangé et gère l\'interpolation', () => {
    expect(tr('Bonjour {0} —', ['Sara'])).toBe('Bonjour Sara —');
  });
  it('traduit en arabe, passe le texte inconnu et les non-chaînes tels quels', () => {
    setCurrentLang('ar');
    expect(tr('Nouvelle discussion')).toBe('محادثة جديدة');
    expect(tr('Texte jamais traduit xyz')).toBe('Texte jamais traduit xyz');
    expect(tr(42)).toBe(42);
    expect(tr(undefined)).toBe(undefined);
  });
  it('accepte une traduction vide (« Mes » absorbé en arabe)', () => {
    setCurrentLang('ar');
    expect(tr('Mes')).toBe('');
  });
  it('langue / sens / locale', () => {
    setCurrentLang('ar');
    expect([getLang(), isRtl(), localeTag()]).toEqual(['ar', true, 'ar-DZ']);
    expect(setCurrentLang('tz')).toBe(false); // langue non prise en charge : refusée, la langue courante ne change pas
    expect(setCurrentLang('xx')).toBe(false);
    expect(getLang()).toBe('ar');
    setCurrentLang('fr');
    expect([getLang(), isRtl(), localeTag()]).toEqual(['fr', false, 'fr-FR']);
  });
});
