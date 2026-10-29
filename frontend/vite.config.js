import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import seoPlugin from './scripts/seo-plugin.mjs'

// The role dashboards are a second page of the same project (dashboard/index.html),
// not a route of the marketing SPA: their global stylesheet (theme.css) must never
// be mixed with the site's. Bare "/dashboard" is sent to "/dashboard/".
const dashboardSlash = () => {
  const redirect = (req, res, next) => {
    if (req.url === '/dashboard' || req.url.startsWith('/dashboard?')) {
      res.statusCode = 301
      res.setHeader('Location', '/dashboard/' + req.url.slice('/dashboard'.length))
      return res.end()
    }
    next()
  }
  return {
    name: 'dashboard-trailing-slash',
    configureServer: (server) => { server.middlewares.use(redirect) },
    configurePreviewServer: (server) => { server.middlewares.use(redirect) },
  }
}

// `vite preview` serves the built site: allow exactly its inline scripts (same hashes as Caddy in production).
const builtScriptHashes = () => {
  const f = fileURLToPath(new URL('./dist/csp-script-hashes.txt', import.meta.url))
  return existsSync(f) ? ' ' + readFileSync(f, 'utf8').trim() : ''
}

export default defineConfig({
  plugins: [react(), dashboardSlash(), seoPlugin()],

  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        dashboard: fileURLToPath(new URL('./dashboard/index.html', import.meta.url)),
      },
    },
  },

  server: {
    // Port fixe du Site : 5173 est celui de l'interface du logiciel VigiCore Audit.
    port: 5176,
    // Forwards /api/* to the Express backend (server/, default :4000) so
    // the browser sees everything as same-origin (:5176). This is what
    // makes src/lib/auth.js and src/lib/services.js work with their
    // default API_BASE ('/api') out of the box, and it's why the session
    // cookie works without any cross-origin SameSite/CORS juggling in dev.
    // In production, do the equivalent at the reverse proxy / load
    // balancer instead of here.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
        // /api/call/stream is a long-lived Server-Sent Events connection (call signaling):
        // never time it out at the proxy.
        timeout: 0,
        proxyTimeout: 0,
      },
    },
    // Security headers injected on every response during dev
    headers: {
      // Prevent the page from being embedded in iframes (clickjacking)
      // Cross-origin isolation: lets the on-device AI cutout (onnxruntime-web) use SharedArrayBuffer
      // and run MULTI-threaded wasm instead of 1 thread (several times faster). 'credentialless'
      // (unlike 'require-corp') keeps Google Fonts / other no-cors resources working.
      // In production, send the same two headers from the reverse proxy.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'X-Frame-Options': 'DENY',
      // Stop browsers from MIME-sniffing responses away from the declared type
      'X-Content-Type-Options': 'nosniff',
      // Force HTTPS even if the user navigates to HTTP (1 year, include subdomains)
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      // Basic referrer policy — don't leak the full URL to third parties
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Permissions policy — disable features the app doesn't need
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()', // camera+microphone: needed by Messenger audio/video calls
      // Content Security Policy
      // Adjust script-src / connect-src when you know your API domain
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",   // unsafe-inline needed for Vite HMR; unsafe-eval needed by the AI cutout (ndarray uses new Function); blob: needed for the AI cutout's threaded-wasm worker, which loads part of itself via importScripts(blobURL) - that's governed by script-src, not worker-src
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' blob: data: https://formspree.io",
        "worker-src 'self' blob:", // contact form endpoint — update if you use a different service/domain
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  },

  // Same headers are applied during `vite preview` (production preview build)
  preview: {
    headers: {
      // Cross-origin isolation: lets the on-device AI cutout (onnxruntime-web) use SharedArrayBuffer
      // and run MULTI-threaded wasm instead of 1 thread (several times faster). 'credentialless'
      // (unlike 'require-corp') keeps Google Fonts / other no-cors resources working.
      // In production, send the same two headers from the reverse proxy.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()', // camera+microphone: needed by Messenger audio/video calls
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:" + builtScriptHashes(),     // no unsafe-inline in production build; unsafe-eval needed by the AI cutout; blob: needed for its threaded-wasm worker (importScripts is governed by script-src, not worker-src)
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' blob: data: https://formspree.io",
        "worker-src 'self' blob:", // contact form endpoint — update if you use a different service/domain
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  },
})
