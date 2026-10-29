# Design pass — changes

## Brand name
Unified to **VigiCore NEXUS** (was a mix of "VigiCoreDz", "VigiCore", "Vigicore Nexus").
- `src/components/layout/Logo.jsx` (navbar/footer logo)
- `src/components/home/Hero.jsx` (shield text)
- `src/components/home/DashboardSection.jsx` (dashboard mock header)
- `src/i18n/locales/{en,fr,ar}.json` (`features.title` casing)
- CSS comments in `hero-nexus.css`, `polish-final.css`, `solution-nexus.css`
To go back to "VigiCoreDz", revert the three .jsx lines above.

## Hero
Detail card (e.g. "Pharmacovigilance") now has the same width as the title/description,
more room under the buttons, and a thin separator rule. Orbit card sub-text min 11.5px.

## Contrast (dark theme only; light theme untouched)
New file `src/styles/home/refine.css`, imported last in `src/styles/index.css`.
Raised footer text, footnotes, "signals today", metric labels, step details,
video tags and the module pills to >= 4.5:1. Remove that one import line to undo everything.

## Marketplace section (dots only)
`src/components/home/MarketplaceSection.jsx`: the solid illustration that was drawn on top of the
particles (and dimmed them to 30%) is removed. The product is now made only of dots, each dot
keeping the colour of the artwork (white label, coloured body...).
- dots: 3600 -> 9500 on desktop (1800 -> 4200 on mobile), a bit finer (1.0-1.9px)
- denser sampling of the body so the shape stays readable without the solid image
- original file is untouched in git history only if you use git; otherwise change `PTS` at the top to tune density
