# Sécurité — état et rotation des secrets

## Secrets à considérer comme exposés (rotation requise)
Les archives transmises contenaient des fichiers `.env` avec des valeurs renseignées. Aucune valeur n'est reproduite ici. À renouveler **avant toute mise en production** :

| Fichier (archive) | Variables | Action |
|---|---|---|
| `materiovigilace/backend/.env` | `JWT_SECRET`, `JWT_REFRESH_SECRET` (valeurs de 28 et 32 car. : sous le minimum de 32 pour la première), `GOOGLE_CLIENT_SECRET`, `SMTP_PASS`, `STRIPE_SECRET_KEY`, mot de passe dans `DATABASE_URL` | régénérer / révoquer chez le fournisseur ; invalider les sessions existantes |
| `materiovigilace/ai-service/.env` | `ANTHROPIC_API_KEY`, `BOT_SERVICE_TOKEN`, mot de passe dans `DATABASE_URL` | révoquer la clé dans la console Anthropic, en émettre une nouvelle |
| `backend/nexus-api/.env` | `JWT_SECRET` = valeur d'exemple (placeholder) | générer une vraie valeur (`openssl rand -hex 32`) |
| `docker-compose.yml`, `backup.sh` (materiovigilance) | mot de passe PostgreSQL en clair (`materio_password`) | changer le mot de passe, lire depuis l'environnement |
Les secrets ont transité par une conversation et des archives : la rotation est la seule remédiation fiable. Un `NEXUS_SERVICE_JWT_SECRET` neuf doit être posé **des deux côtés**.
Données sensibles aussi présentes dans l'archive du site : `backend/nexus-api/prisma/dev.db`, `dev.db.bak`, `e2e.db` (comptes réels, dont une adresse e-mail personnelle) et `backend/nexus-api/storage/chat` — à ne jamais livrer ni commiter (désormais exclus par `.gitignore` et `.dockerignore`).

## Ce qui a été mis en place
Validation de configuration au démarrage (échec en production) ; `helmet` (CSP `default-src 'none'` pour l'API, CORP same-site, HSTS en production) ; limiteurs de débit
(auth 20/15 min, reset 5/h, contact 5/h, API 600/min par IP) ; `trust proxy` explicite ; redirection HTTPS en production ; cookie de session `httpOnly`, `secure` en production, `sameSite=lax` ;
e-mails normalisés (trim + minuscules) et unicité en base (index unique + erreur P2002 → 409) ; réinitialisation du mot de passe (jeton 256 bits, haché SHA-256, usage unique, 30 min, réponse identique
que le compte existe ou non, fin de toutes les sessions antérieures) ; erreurs async centralisées (`lib/asyncErrors.ts`) ; erreurs 400/413 correctes ; journaux sans corps/requête/identité.
Côté Audit (`materiovigilace/backend`) : validation d'environnement, limiteur dédié aux endpoints d'authentification, `trust proxy` configurable.

## Décisions et limites
- **Vérification d'e-mail à l'inscription : non implémentée** — la conception existante connecte immédiatement après l'inscription. À décider (impact : un compte peut être créé avec l'adresse d'un tiers).
- **MFA** : `/api/auth/mfa/verify` répond 501 et le serveur ne renvoie jamais `mfaRequired: true`, l'écran MFA est donc inaccessible ; aucune page blanche n'est atteignable. Aucun changement.
- Les cookies de session existants avant l'ajout de `passwordChangedAt` restent valides (colonne nulle).
- Anti-spam du formulaire de contact : honeypot + limite de débit ; pas de CAPTCHA (nécessite un compte fournisseur : à ajouter si le spam apparaît).
- Mots de passe : longueur 8–200 uniquement (politique existante conservée).
- Le backend Audit : le flux `forgot-password`/`reset-password` propre à `materiovigilace` n'a **pas** été audité dans cette passe.
