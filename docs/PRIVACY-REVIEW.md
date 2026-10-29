# Revue vie privée et données de santé (à faire valider juridiquement)

Ce document décrit ce que le code fait réellement. **Il n'atteste d'aucune conformité** (notamment à la loi n° 18-07 relative à la protection des personnes physiques dans le traitement des données à caractère personnel).

## Flux de données constatés
| Donnée | Où | Prestataire / destinataire | Remarque |
|---|---|---|---|
| Compte (nom, e-mail, rôle, hachage bcrypt) | base PostgreSQL | — | e-mail normalisé |
| Déclarations de vigilance (description, lot, gravité, rôle + nom du déclarant) | base du site, puis Audit | backend Audit (service à service, JWT 60 s) | **données de santé possibles** |
| Messagerie + pièces jointes | base + `STORAGE_DIR` | — | pas de chiffrement applicatif ; sauvegardées |
| Appels | WebRTC, signalisation SSE | STUN/TURN configurés | média hors serveur sauf relais TURN |
| Fiches produits (texte) | — | Anthropic (API) | ne doit contenir aucune donnée patient |
| Images produits | — | Bria (API) | idem |
| Contact | e-mail à `CONTACT_TO` | SMTP du propriétaire | non stocké |
| Journaux | stdout (JSON) | — | méthode, chemin sans query, statut, durée ; aucun corps/en-tête/identité |

## Points à instruire avec un conseil juridique (loi 18-07)
1. Déclaration/autorisation préalable auprès de l'ANPDP pour le traitement de données de santé ; désignation du responsable de traitement et du contact « données personnelles ».
2. Base légale et consentement du patient déclarant ; information des personnes (page `/privacy` : champs « à renseigner » à compléter).
3. **Transfert hors Algérie** : Anthropic, Bria, éventuel prestataire SMTP/hébergeur — autorisation ou information requise selon le cas.
4. Durées de conservation (non définies dans le code) et suppression : la désactivation d'un compte ne supprime ni déclarations ni messages.
5. Hébergement : lieu et sous-traitants des sauvegardes (chiffrées hors site recommandé).

## Minimisation / exposition — constats et actions
- Journaux serveur : pas de corps ni de query string (`requestLog`) ; les erreurs ne journalisent que `name` + `message`. Le message d'une erreur Prisma peut contenir des fragments de requête : surveiller.
- Les pages patient sans données réelles (traitements, produits, alertes, rendez-vous) sont **retirées de la navigation** ; le tableau de bord patient n'affiche que les déclarations réelles de l'utilisateur.
- Le chemin `GET /api/declarations/:id` ne renvoie au déclarant que le statut public côté Audit (ni score IA ni gravité interne).
- Risque résiduel : champs libres envoyés à des IA tierces (fiches produits). Mettre un avertissement dans l'interface et former les utilisateurs.
