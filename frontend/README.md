# VigiCore NEXUS — Frontend

## Run
Frontend (Vite, port 5176):
    npm install   # postinstall copies public/imgly, public/ort, public/models from node_modules
    npm run dev

The API lives in `../backend/nexus-api` (port 4000) — see the root README.
Vite proxies /api -> http://localhost:4000 (override with VITE_API_PROXY_TARGET).

UI tests (isolated deps):
    cd tests-ui && npm install && npm test

## Structure
    src/
      main.jsx            routes; loads styles/index.css once
      App.jsx             the home page
      pages/              one file per route (+ login/, manage/, services/ with that page's own pieces and CSS)
      components/
        layout/           Navbar, Footer, Logo, ShieldMark, PageBackdrop, ThemeIcons, DashboardHeader
        home/             the home-page sections (+ their CSS)
        studio/           product studio: editor, image tools, AI writer, listing score
        shared/           small reusable pieces (CountUp)
      styles/
        index.css         ordered manifest of the global CSS (ORDER MATTERS: later files override earlier ones)
        core/             base, theme, navbar, hero and section styles, numbered in cascade order
        home/             home-page overrides applied on top of core
      effects/            canvas / scroll engines (homeEffects, fitScreen, offscreenPause)
      hooks/              useTheme, useLoginScene (login background animation), ...
      lib/                api.js (the one fetch wrapper), auth.js, services.js, format.js, motion.js, image tools
      i18n/               I18nProvider + locales/{en,fr,ar}.json  (single source of site text)
    dashboards/           role dashboards (separate entry: dashboard/index.html)
    tests-ui/             component tests (vitest + jsdom)
    deploy/Caddyfile      production web server + reverse proxy to the API

Shared helpers live in one place: formatting in `lib/format.js`, API calls through `lib/api.js`,
reduced-motion checks through `lib/motion.js`, image loading in `lib/image.js`.

Translations: add text to all three `src/i18n/locales/*.json` files and read it with
`const { t } = useI18n()` -> `t('some.key')`. English is the fallback for missing keys.

## Checks
    npm run build                # frontend
    cd server && npm test        # 58 tests
    cd server && npx prisma generate && npm run typecheck
