// Moteur de traduction partagé (site public + tableaux de bord). Langues : français, arabe et anglais.
//
//  - t(clé)      clés explicites de locales/fr.json / ar.json (page d'accueil, connexion…).
//  - tr(texte)   le texte SOURCE (français, ou anglais pour quelques pages) sert de clé :
//                locales/phrases.json donne sa traduction. Un texte absent du dictionnaire est
//                renvoyé tel quel : rien ne casse, on voit simplement la langue d'origine.
//  tr() accepte aussi des valeurs non textuelles (nombre, élément React…) et les renvoie inchangées,
//  ce qui permet de l'appliquer sans risque à n'importe quelle expression affichée.
import fr from './locales/fr.json'
import ar from './locales/ar.json'
import en from './locales/en.json'
import generated from './locales/phrases.json'
import extra from './locales/phrases.extra.json'

// phrases.json est produit par scripts/i18n (extraction automatique) ; phrases.extra.json est tenu à la main.
const phrases = { ...generated, ...extra }

export const LANGUAGES = [
  { code: 'fr', label: 'FR', name: 'Français', dir: 'ltr', locale: 'fr-FR' },
  { code: 'ar', label: 'AR', name: 'العربية', dir: 'rtl', locale: 'ar-DZ' },
  { code: 'en', label: 'EN', name: 'English', dir: 'ltr', locale: 'en-GB' },
]
const DICTS = { fr, ar, en }
export const STORAGE_KEY = 'vg-lang' // même clé qu'avant : le choix déjà enregistré est conservé

function readSaved() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'ar' || v === 'en' ? v : 'fr' // anciennes valeurs (tz…) -> français
  } catch {
    return 'fr'
  }
}

let current = readSaved()
export const getLang = () => current
export const isRtl = () => current === 'ar'
export const localeTag = () => (current === 'ar' ? 'ar-DZ' : current === 'en' ? 'en-GB' : 'fr-FR')

export function setCurrentLang(next) {
  if (next !== 'fr' && next !== 'ar' && next !== 'en') return false
  current = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* navigation privée */ }
  return true
}

function fill(text, vars) {
  if (vars == null) return text
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))
}

/** Traduit un texte source. `vars` : tableau (positions {0}, {1}…) ou objet ({nom}). */
export function tr(text, vars) {
  if (typeof text !== 'string' || text === '') return text
  const hit = phrases[text]?.[current]
  return fill(hit !== undefined ? hit : text, vars) // '' est une traduction valide (mot absorbé par le suivant en arabe)
}

/** Clé explicite -> texte ; sinon traite la clé comme un texte source. */
export function translateKey(key, fallbackOrVars) {
  const dict = DICTS[current]
  const hit = dict[key] ?? (current === 'ar' ? undefined : fr[key])
  if (hit !== undefined) return fill(hit, typeof fallbackOrVars === 'object' ? fallbackOrVars : undefined)
  const viaPhrase = phrases[key]?.[current]
  if (viaPhrase !== undefined) return fill(viaPhrase, typeof fallbackOrVars === 'object' ? fallbackOrVars : undefined)
  const fb = typeof fallbackOrVars === 'string' ? fallbackOrVars : undefined
  return fb ?? fr[key] ?? key
}

/** Traduction exacte d'un texte affiché (utilisée par domTranslate) ; undefined si le dictionnaire ne le connaît pas. */
export function lookupPhrase(text) {
  const hit = phrases[text]?.[current]
  return typeof hit === 'string' && hit !== '' && hit !== text ? hit : undefined
}
