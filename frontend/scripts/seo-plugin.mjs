// SEO + CSP helper for `vite build`.
//  - SITE_URL (e.g. https://nexus.example.org) set  -> canonical + og:url injected, sitemap.xml written,
//    robots.txt gets a Sitemap line. SITE_URL unset -> NOTHING is invented: no canonical, no sitemap.
//  - Always writes csp-script-hashes.txt (sha256 of every inline <script> in the built HTML) so the
//    reverse proxy can allow exactly those scripts without 'unsafe-inline'.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PUBLIC_PATHS = ['/', '/about', '/services', '/login', '/privacy', '/terms', '/legal']

export default function seoPlugin() {
  const site = (process.env.SITE_URL || '').replace(/\/+$/, '')
  return {
    name: 'vigicore-seo',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (!site || (ctx.path && ctx.path.includes('dashboard'))) return html
      const tags = `<link rel="canonical" href="${site}/" />\n    <meta property="og:url" content="${site}/" />`
      // Social previews (Facebook, WhatsApp, LinkedIn, X) need ABSOLUTE image URLs.
      return html
        .replace(/(<meta (?:property="og:image"|name="twitter:image") content=")\/(?!\/)/g, `$1${site}/`)
        .replace('</head>', `    ${tags}\n  </head>`)
    },
    closeBundle() {
      const out = 'dist'
      if (!existsSync(out)) return
      if (site) {
        const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')
        writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
        const robots = join(out, 'robots.txt')
        const base = existsSync(robots) ? readFileSync(robots, 'utf8').trimEnd() : 'User-agent: *\nAllow: /'
        writeFileSync(robots, `${base}\n\nSitemap: ${site}/sitemap.xml\n`)
      }
      const hashes = new Set()
      const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = join(d, e.name)
        if (e.isDirectory()) return e.name === 'imgly' || e.name === 'ort' || e.name === 'models' ? null : walk(p)
        if (!e.name.endsWith('.html')) return
        for (const m of readFileSync(p, 'utf8').matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
          if (m[1].trim()) hashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
        }
      })
      walk(out)
      writeFileSync(join(out, 'csp-script-hashes.txt'), [...hashes].join(' ') + '\n')
    },
  }
}
