// Filet de sécurité du SITE PUBLIC : les textes affichés tels quels (encore en anglais ou en français dans
// des composants qui n'appellent pas tr()) sont traduits après rendu si le dictionnaire les connaît EXACTEMENT.
// Rien n'est deviné : un texte inconnu reste inchangé. Les champs de saisie et le contenu saisi par les
// utilisateurs ne sont jamais touchés (seuls les nœuds texte et les attributs placeholder/aria-label/title/alt).
import { lookupPhrase } from './translate.js'

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'])
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt']

function translateText(node) {
  const raw = node.nodeValue
  if (!raw || !raw.trim()) return
  const lead = raw.match(/^\s*/)[0]
  const trail = raw.match(/\s*$/)[0]
  const hit = lookupPhrase(raw.trim())
  if (hit !== undefined) node.nodeValue = lead + hit + trail
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute && el.getAttribute(a)
    if (!v) continue
    const hit = lookupPhrase(v.trim())
    if (hit !== undefined) el.setAttribute(a, hit)
  }
}

function walk(root) {
  if (root.nodeType === 3) {
    if (!SKIP.has(root.parentNode?.tagName) && !root.parentNode?.closest?.('[data-no-translate]')) translateText(root)
    return
  }
  if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest?.('[data-no-translate]')) return
  translateAttrs(root)
  for (const child of root.childNodes) walk(child)
  if (root.querySelectorAll) for (const el of root.querySelectorAll('[placeholder],[aria-label],[title],[alt]')) translateAttrs(el)
}

let observer = null
let queued = new Set()
let raf = 0

function flush() {
  raf = 0
  const nodes = [...queued]
  queued = new Set()
  observer?.disconnect() // nos propres modifications ne relancent pas l'observateur
  for (const n of nodes) if (n.isConnected !== false) walk(n)
  observe()
}

function observe() {
  if (!observer || typeof document === 'undefined') return
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}

export function startDomTranslate() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || observer) return
  walk(document.body)
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => queued.add(n))
      else queued.add(m.target)
    }
    if (!raf) raf = requestAnimationFrame(flush)
  })
  observe()
}

export function stopDomTranslate() {
  observer?.disconnect()
  observer = null
  queued = new Set()
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}
