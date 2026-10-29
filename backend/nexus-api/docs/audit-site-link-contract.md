# Contrat Audit ⇄ Site : activation d'une organisation par code

Objectif : l'id de l'organisation dans Audit n'est **jamais recopié à la main**. Audit le donne au Site contre un code.
Le Site (nexus-api) est déjà prêt ; il reste à implémenter la moitié **Audit** décrite ici.

## Parcours
1. Admin d'organisation, dans Audit : **« Activer la présence sur le Site »** → Audit affiche un code (ex. `NUM-7KQ2-X9`).
2. Admin d'établissement, sur le Site : saisit le code (`POST /api/market/establishments/:id/audit-link { code }`).
3. nexus-api présente le code à Audit (endpoint ci-dessous). Audit répond avec l'identité de l'organisation.
4. Le Site enregistre `Establishment.auditManufacturerRef`. Toutes les fiches de l'établissement en héritent.

## Côté Audit à créer
### Génération du code (écran admin d'organisation)
- Aléatoire cryptographique, 10 caractères sans ambiguïté (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), affiché `XXX-XXXX-XX`.
- Stocké **haché** (SHA-256), lié à l'organisation, `expiresAt = now + 48 h`, usage unique. Un nouveau code annule l'ancien.
- Réservé à l'admin de l'organisation ; journalisé.

### `POST /nexus/v1/site-link/redeem`
JWT service habituel (`iss=vigicore-nexus`, `aud=vigicore-audit`), **nouveau scope `link:write`** à autoriser pour cette seule route.

Requête : `{ "code": "NUM-7KQ2-X9", "siteEstablishmentId": "<id Site>", "siteEstablishmentName": "Numidia Pharma" }`
Idempotence : en-tête `Idempotency-Key: site-link:<siteEstablishmentId>:<code>`.

| Cas | Statut | Corps |
|---|---|---|
| Code valide | `200` | `{ "manufacturer": { "ref": "<id org Audit>", "name": "Numidia Pharma" } }` |
| Code inconnu | `404` | `{ "error": "CODE_UNKNOWN" }` |
| Code expiré | `410` | `{ "error": "CODE_EXPIRED" }` |
| Code déjà utilisé par un AUTRE établissement | `409` | `{ "error": "CODE_USED" }` |

Règles : au 1er succès, Audit **lie le code à `siteEstablishmentId`** et le consomme. Rejouer le même code avec le **même** établissement
renvoie encore `200` (idempotent, ex. coupure réseau après succès) ; avec un autre établissement → `409`.
Limiter les essais par IP/service et ne jamais distinguer « inconnu » de « mauvaise organisation » plus que ci-dessus.
`manufacturer.ref` = l'id que `GET /nexus/v1/catalogue/offers` met déjà dans `manufacturer.ref`.

## Prérequis indépendant (hors handshake)
Une organisation n'apparaît dans `catalogue/offers` que si ses produits sont **publiables** (prix fixé) et « Offre en ligne » est activé.
