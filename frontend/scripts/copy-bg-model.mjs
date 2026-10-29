// Copies the background-removal model + WASM runtime out of node_modules into
// public/imgly/ so the browser loads them from YOUR server (the site's CSP
// only allows 'self'). Runs automatically after `npm install`.
// Only the SMALL model (the one the app uses: src/lib/aiCutoutClassic.js, model: 'small') and the CPU (non-jsep, non-training)
// wasm files are kept. The medium model (~88 MB) was never loaded; set KEEP_MEDIUM_MODEL=1 to copy it anyway.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const src = path.join(root, 'node_modules/@imgly/background-removal-data/dist')
const dst = path.join(root, 'public/imgly')

if (!fs.existsSync(src)) { console.warn('[imgly] data package not installed yet - skipping'); process.exit(0) }
const resources = JSON.parse(fs.readFileSync(path.join(src, 'resources.json'), 'utf8'))
const wanted = Object.keys(resources).filter((k) => k === '/models/small' || (process.env.KEEP_MEDIUM_MODEL === '1' && k === '/models/medium') || (k.startsWith('/onnxruntime-web/') && !k.includes('jsep') && !k.includes('training')))
fs.mkdirSync(dst, { recursive: true })
const kept = {}
let n = 0
for (const k of wanted) {
  kept[k] = resources[k]
  for (const c of resources[k].chunks) {
    const to = path.join(dst, c.hash)
    if (!fs.existsSync(to)) { fs.copyFileSync(path.join(src, c.hash), to); n++ }
  }
}
// Remove chunks left over from resources that are no longer kept (hash-named files only).
const keep = new Set(Object.values(kept).flatMap((r) => r.chunks.map((c) => c.hash)))
let removed = 0
for (const f of fs.readdirSync(dst)) {
  if (/^[0-9a-f]{64}$/.test(f) && !keep.has(f)) { fs.rmSync(path.join(dst, f)); removed++ }
}
fs.writeFileSync(path.join(dst, 'resources.json'), JSON.stringify(kept))
console.log(`[imgly] ready: ${wanted.length} resources, ${n} new chunks copied, ${removed} unused removed (public/imgly)`)

