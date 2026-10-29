# Assistant VigiCore AI (panneau de chat)

`POST /api/assistant/chat` `{ message }` → `{ reply, intents, understood }` (session obligatoire, 500 caractères max, 30 questions/min/utilisateur, `ASSISTANT_MAX_PER_MINUTE`).

Les réponses sont calculées depuis la base **pour l'utilisateur de la session uniquement** (la portée ne vient jamais de la question) :
contacts (connexions de messagerie, + prises de contact des annonces pour un fournisseur), messages non lus, déclarations (par statut, domaine, période), dossiers (vigilance), transmissions vers l'audit, annonces/commandes/vues (fournisseur), membres/demandes/invitations (admin d'établissement), « qui suis-je ».

Reconnaissance par mots-clés (sans LLM, sans clé API). Une question non comprise reçoit une aide honnête avec des exemples. Code : `backend/nexus-api/src/services/assistant.ts`.
Limites : pas de langage libre (pas de LLM), pas de données patient/cliniques ; tests avec Prisma simulé (non exécutés sur une vraie base).


## Arabe
Le corps de `POST /api/assistant/chat` accepte `lang` (`fr` | `ar`). Une question écrite en arabe est reconnue (mots-clés arabes) et la réponse est rédigée en arabe ; les chiffres viennent des mêmes requêtes en base. Les formes plurielles arabes sont simplifiées (nombre + nom au pluriel).

## Réponses libres, historique, confidentialité
- Avec `ANTHROPIC_API_KEY`, toute formulation est comprise : le modèle ne reçoit que l'instantané de la session (`assistantContext.ts` : ce compte et, pour les rôles de revue, ses établissements actifs ; sans identité de patient ni texte libre) et la discussion en cours. Sans clé ou en cas d'échec : réponses à règles (avec suites de questions « et à qui ? »).
- Les questions sur d'autres organisations/utilisateurs reçoivent un refus déterministe (sans appel au modèle) ; le modèle a aussi cette consigne.
- Historique : tables `AssistantConversation` / `AssistantMessage` (migration `20261022090000_assistant_conversations`). Routes `GET/DELETE /api/assistant/conversations[/:id]`, `POST /api/assistant/chat { conversationId? }`. Une discussion n'est lisible que par son propriétaire.
- Limites : le comportement du modèle n'a pas été testé avec une vraie clé (tests avec appel simulé) ; requêtes Prisma non exécutées sur une vraie base dans mon environnement (tests avec Prisma simulé).
