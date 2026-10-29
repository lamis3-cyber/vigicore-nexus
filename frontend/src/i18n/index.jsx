import React, { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LANGUAGES, getLang, setCurrentLang, translateKey } from './translate.js'
import { startDomTranslate, stopDomTranslate } from './domTranslate.js'

export { LANGUAGES, tr, getLang, isRtl, localeTag } from './translate.js'

// Source unique des traductions du site : français et arabe uniquement.
// Changer de langue remonte l'arbre (key={lang}) : tous les textes, y compris ceux traduits par tr()
// au moment du rendu, sont recalculés sans rechargement de page.

const I18nContext = createContext(null)
const apply = (lang) => {
  const root = document.documentElement
  const meta = LANGUAGES.find((l) => l.code === lang)
  root.setAttribute('lang', lang)
  root.setAttribute('dir', meta?.dir ?? 'ltr') // l'arabe est affiché de droite à gauche
}

// remount=false : les enfants gèrent eux-mêmes leur rafraîchissement (tableaux de bord : la page et la session sont conservées).
export function I18nProvider({ children, remount = true }) {
  const [lang, setLangState] = useState(getLang)

  // Appliqué avant la première peinture pour éviter un flash dans la mauvaise direction.
  useEffect(() => { apply(lang) }, [lang])

  // Site public (remount=true) : filet de sécurité qui traduit après rendu les textes encore non branchés sur tr().
  useEffect(() => {
    if (!remount) return undefined
    startDomTranslate()
    return () => stopDomTranslate()
  }, [remount])

  const setLang = useCallback((next) => {
    if (!setCurrentLang(next)) return
    apply(next)
    setLangState(next)
  }, [])

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key, fallbackOrVars) => translateKey(key, fallbackOrVars),
    languages: LANGUAGES,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
  }), [lang, setLang])

  return (
    <I18nContext.Provider value={value}>
      {remount ? <Fragment key={lang}>{children}</Fragment> : children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
