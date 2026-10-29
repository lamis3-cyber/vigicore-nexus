// Codemod i18n : enveloppe les textes affichés dans tr(...) (src/i18n/translate.js).
// Le texte source sert de clé ; un texte absent du dictionnaire est affiché tel quel,
// donc la transformation ne change RIEN au rendu tant qu'on reste en français.
//
//   node scripts/i18n/codemod.mjs [--write] <fichiers ou dossiers…>
//
// Sans --write : simple comptage. Les clés trouvées sont écrites dans scripts/i18n/.sources.json.
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
const traverse = traverseModule.default ?? traverseModule

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const targets = args.filter((a) => !a.startsWith('--'))
const SRC = path.resolve('src')
const TRANSLATE = path.join(SRC, 'i18n', 'translate.js')

const SKIP_DIRS = new Set(['i18n', 'three', 'effects', 'hooks', 'node_modules'])
function listFiles(p, out = []) {
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(p))) return out
    for (const e of fs.readdirSync(p)) listFiles(path.join(p, e), out)
  } else if (/\.(jsx|js)$/.test(p) && !/\.test\./.test(p)) out.push(p)
  return out
}

const HAS_LETTER = /[A-Za-zÀ-ÿ؀-ۿ]/
const LETTERS2 = /[A-Za-zÀ-ÿ]{2,}/
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'aria-description'])
const NAMES = new Set(['label', 'title', 'text', 'desc', 'description', 'sub', 'subtitle', 'name', 'note', 'msg', 'message', 'error', 'info',
  'status', 'statusLabel', 'kind', 'category', 'hint', 'heading', 'header', 'badge', 'tag', 'reason', 'summary', 'detail', 'action',
  'cta', 'unit', 'period', 'severity', 'level', 'domain', 'dept', 'feedback', 'tooltip', 'caption', 'empty', 'emptyText', 'cardTitle',
  'sublabel', 'helper', 'content', 'body', 'intro', 'subtitle2', 'lbl', 'txt', 'tagline', 'warning', 'success'])
const TOAST_NAMES = /^(toast|notify|showToast|addToast)$/
const SETTERS = /^set(Error|Err|Msg|Message|Notice|Feedback|Banner|Warning|Success)\w*$/ // uniquement des états affichés tels quels (jamais un code comparé ailleurs)

const sources = new Set()
let total = 0
const rel = (from) => {
  let r = path.relative(path.dirname(from), TRANSLATE).split(path.sep).join('/')
  if (!r.startsWith('.')) r = './' + r
  return r
}
const key = (s) => s.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()

function processFile(file) {
  const code = fs.readFileSync(file, 'utf8')
  if (/from\s+['"][^'"]*i18n\/translate/.test(code) && /\btr\(/.test(code) && !args.includes('--force')) return null
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false })
  } catch (e) {
    console.error('PARSE FAIL', file, e.message)
    return null
  }
  const edits = []
  const done = new Set()
  let usesLocale = false
  const slice = (n) => code.slice(n.start, n.end)
  const addKey = (k) => { sources.add(k); total++ }

  // Retourne le code de remplacement d'une expression « affichable », ou null si elle n'est pas concernée.
  function wrapExpr(n, force) {
    if (!n || done.has(n)) return null
    switch (n.type) {
      case 'StringLiteral': {
        if (!HAS_LETTER.test(n.value)) return null
        if (!LETTERS2.test(n.value) && !force) return null
        const k = key(n.value); if (!k) return null
        done.add(n); addKey(k)
        return `tr(${JSON.stringify(k)})`
      }
      case 'TemplateLiteral': {
        const raw = n.quasis.map((q) => q.value.cooked ?? q.value.raw)
        if (!raw.some((r) => LETTERS2.test(r))) return null
        const k = key(raw.map((r, i) => (i < n.expressions.length ? r + `{${i}}` : r)).join(''))
        done.add(n); addKey(k)
        return n.expressions.length
          ? `tr(${JSON.stringify(k)}, [${n.expressions.map(slice).join(', ')}])`
          : `tr(${JSON.stringify(k)})`
      }
      case 'ConditionalExpression': {
        const a = wrapExpr(n.consequent, force), b = wrapExpr(n.alternate, force)
        if (a == null && b == null) return null
        done.add(n)
        return `${slice(n.test)} ? ${a ?? slice(n.consequent)} : ${b ?? slice(n.alternate)}`
      }
      case 'LogicalExpression': {
        if (n.operator === '&&') {
          const r = wrapExpr(n.right, force)
          if (r == null) return null
          done.add(n); return `${slice(n.left)} && ${r}`
        }
        const l = n.left.type === 'StringLiteral' ? wrapExpr(n.left, force) : null
        const r = wrapExpr(n.right, force)
        if (l == null && r == null) return null
        done.add(n); return `${l ?? slice(n.left)} ${n.operator} ${r ?? slice(n.right)}`
      }
      case 'Identifier':
        return NAMES.has(n.name) ? (done.add(n), `tr(${n.name})`) : null
      case 'MemberExpression': {
        const p = n.computed ? null : n.property.name
        if (p && NAMES.has(p)) { done.add(n); return `tr(${slice(n)})` }
        return null
      }
      default:
        return null
    }
  }

  const replaceNode = (n, text) => edits.push([n.start, n.end, text])

  const handled = new Set()
  // Règle de blanc de JSX (identique à React) pour un morceau de texte.
  function jsxText(value) {
    const lines = value.split(/\r\n|\n|\r/)
    let last = 0
    lines.forEach((l, i) => { if (/[^ \t]/.test(l)) last = i })
    let out = ''
    lines.forEach((l, i) => {
      let t = l.replace(/\t/g, ' ')
      if (i !== 0) t = t.replace(/^[ ]+/, '')
      if (i !== lines.length - 1) t = t.replace(/[ ]+$/, '')
      if (t) { if (i !== last) t += ' '; out += t }
    })
    return out
  }
  const SIMPLE = new Set(['Identifier', 'MemberExpression', 'OptionalMemberExpression', 'CallExpression', 'OptionalCallExpression',
    'ConditionalExpression', 'BinaryExpression', 'TemplateLiteral', 'NumericLiteral', 'LogicalExpression', 'UnaryExpression'])

  traverse(ast, {
    'JSXElement|JSXFragment'(p) {
      const kids = p.node.children
      if (p.node.type === 'JSXElement') {
        const nm = p.node.openingElement.name.name
        if (nm === 'style' || nm === 'script' || nm === 'code' || nm === 'pre') return
      }
      if (kids.some((c) => c.type === 'JSXElement' || c.type === 'JSXFragment' || c.type === 'JSXSpreadChild')) return
      const meaningful = []
      kids.forEach((c, i) => {
        if (c.type === 'JSXText' ? HAS_LETTER.test(c.value) : c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression') meaningful.push(i)
      })
      const containers = kids.filter((c) => c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression')
      const texts = kids.filter((c) => c.type === 'JSXText' && HAS_LETTER.test(c.value))
      if (!containers.length || !texts.length) return
      if (!containers.every((c) => SIMPLE.has(c.expression.type) && !/<[A-Za-z]/.test(slice(c.expression)))) return
      if (kids.some((c) => c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression')) return
      const first = kids[0], lastK = kids[kids.length - 1]
      const range = kids
      let k = ''
      const exprs = []
      range.forEach((c) => {
        if (c.type === 'JSXText') k += jsxText(c.value)
        else if (c.type === 'JSXExpressionContainer') { k += `{${exprs.length}}`; exprs.push(slice(c.expression)) }
        range.forEach(() => {})
      })
      k = k.replace(/\s+/g, ' ').trim()
      if (!LETTERS2.test(k.replace(/\{\d+\}/g, ''))) return
      range.forEach((c) => handled.add(c))
      addKey(k)
      edits.push([first.start, lastK.end, `{tr(${JSON.stringify(k)}, [${exprs.join(', ')}])}`])
    },
    JSXText(p) {
      if (handled.has(p.node)) return
      const parent = p.parent
      if (parent.type === 'JSXElement') {
        const nm = parent.openingElement.name.name
        if (nm === 'style' || nm === 'script' || nm === 'code' || nm === 'pre') return
      }
      const raw = code.slice(p.node.start, p.node.end)
      const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/)
      if (!m || !m[2] || !HAS_LETTER.test(p.node.value)) return
      const k = key(p.node.value)
      if (!k || !LETTERS2.test(k) && !/^[A-Za-zÀ-ÿ]$/.test(k)) return
      if (/^[A-Z0-9_]{2,}$/.test(k) && k.length < 3) return
      addKey(k)
      edits.push([p.node.start + m[1].length, p.node.end - m[3].length, `{tr(${JSON.stringify(k)})}`])
    },
    JSXExpressionContainer(p) {
      if (handled.has(p.node)) return
      if (p.parent.type === 'JSXAttribute') return // géré plus bas
      if (p.parent.type === 'JSXElement' && ['style', 'script', 'code', 'pre'].includes(p.parent.openingElement.name.name)) return
      const out = wrapExpr(p.node.expression, false)
      if (out != null) replaceNode(p.node.expression, out)
    },
    JSXAttribute(p) {
      const nameNode = p.node.name
      if (nameNode.type !== 'JSXIdentifier') return
      const opening = p.parent
      const tag = opening.name.type === 'JSXIdentifier' ? opening.name.name : ''
      if (!/^[a-z]/.test(tag)) return // composants personnalisés : traduits à l'intérieur, là où le texte est affiché
      if (!ATTRS.has(nameNode.name) && !(tag === 'option' && nameNode.name === 'label')) return
      const v = p.node.value
      if (!v) return
      if (v.type === 'StringLiteral') {
        const out = wrapExpr(v, false)
        if (out != null) edits.push([v.start, v.end, `{${out}}`])
      } else if (v.type === 'JSXExpressionContainer') {
        const out = wrapExpr(v.expression, false)
        if (out != null) replaceNode(v.expression, out)
      }
    },
    CallExpression(p) {
      const c = p.node.callee
      const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : ''
      if (TOAST_NAMES.test(name)) {
        p.node.arguments.slice(1, 3).forEach((a) => { const out = wrapExpr(a, true); if (out != null) replaceNode(a, out) })
      } else if (SETTERS.test(name)) {
        p.node.arguments.slice(0, 1).forEach((a) => { const out = wrapExpr(a, true); if (out != null) replaceNode(a, out) })
      }
    },
    StringLiteral(p) {
      if (/^fr-(FR|DZ)$/.test(p.node.value) && p.parent.type !== 'ImportDeclaration' && p.parent.type !== 'ObjectProperty') {
        usesLocale = true
        replaceNode(p.node, 'localeTag()')
      }
    },
  })

  if (!edits.length) return { file, count: 0 }
  // Applique de la fin vers le début ; ignore les modifications imbriquées dans une plus grande.
  edits.sort((a, b) => b[0] - a[0] || b[1] - a[1])
  let out = code
  let lastStart = Infinity
  for (const [s, e, t] of edits) {
    if (e > lastStart) continue
    out = out.slice(0, s) + t + out.slice(e)
    lastStart = s
  }
  const needs = ['tr']
  if (usesLocale) needs.push('localeTag')
  const imp = `import { ${needs.join(', ')} } from '${rel(file)}';\n`
  // Insère l'import après le dernier import existant.
  const importEnds = []
  traverse(ast, { ImportDeclaration(p) { importEnds.push(p.node.end) } })
  const at = importEnds.length ? Math.max(...importEnds) : 0
  const nl = at ? out.indexOf('\n', at - 0) : -1
  // les positions d'import précèdent toutes les modifications (imports en tête de fichier)
  const insertAt = importEnds.length ? at + (out[at] === '\n' ? 1 : 0) : 0
  out = out.slice(0, insertAt) + (importEnds.length && out[at] !== '\n' ? '\n' : '') + imp + out.slice(insertAt)
  return { file, count: edits.length, out }
}

const files = targets.flatMap((t) => listFiles(path.resolve(t)))
let changed = 0
for (const f of files) {
  const r = processFile(f)
  if (r && r.count) {
    changed++
    if (WRITE) fs.writeFileSync(f, r.out)
  }
}
fs.writeFileSync(path.resolve('scripts/i18n/.sources.json'), JSON.stringify([...sources].sort(), null, 1))
console.log(`${files.length} fichiers examinés, ${changed} modifiés, ${total} textes, ${sources.size} clés uniques${WRITE ? '' : ' (simulation)'}`)
