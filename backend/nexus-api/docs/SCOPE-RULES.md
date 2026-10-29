# Qui voit quoi : rôle, organisation, service

| Rôle | Rattaché à un service ? | Portée dans son établissement |
|---|---|---|
| Médecin (`DOCTOR`) | Oui, UN service | Son service (+ enregistrements sans service) |
| Personnel médical (`HOSPITAL`) | Oui, UN service | Son service (+ enregistrements sans service). **N'est pas relecteur.** |
| Pharmacien (`PHARMACIEN`) | **Jamais** (refusé par le serveur) | Tous les services de SON établissement |
| Laboratoire (`LABO`) | **Jamais** (refusé par le serveur) | Tous les services de SON établissement |
| Responsable vigilance (`VIGILANCE_REVIEWER`) | Non | Tous les services, peut traiter / clôturer |
| Administrateur (`ORG_ADMIN`) | Non | Tous les services en lecture seule + gestion des membres et des services |
| Patient / Fournisseur | Non | Aucune file d'établissement |

Règles communes
- Seules les affiliations `ACTIVE` comptent ; une demande `PENDING` n'ouvre aucun droit.
- Aucun rôle ne traverse un AUTRE établissement (sauf `PermissionGrant` explicite).
- `GET /api/records/queue` (file de l'établissement) : responsable vigilance et administrateur seulement.
- Un service stocké sur l'affiliation d'un pharmacien / laboratoire (données anciennes ou seed) est ignoré (`lib/scope.ts → effectiveDepartmentId`).

API
- `POST  /api/orgs/:id/departments` `{ name }` — créer un service (admin de l'organisation).
- `PATCH /api/orgs/:id/members/:membershipId/department` `{ departmentId | null }` — attribuer / retirer un service.
- `POST  /api/orgs/:id/requests/:membershipId/approve` `{ departmentId? }` — approuver et attribuer le service.
- `GET /api/auth/session` renvoie `activeDepartmentId` / `activeDepartmentName` (null = tout l'établissement).

Inscription / demande d'adhésion : ce que le serveur vérifie (indépendamment du formulaire)
- L'établissement est cherché par **nom ET type choisi** : un pharmacien qui choisit « Hôpital » ne tombe jamais sur une officine du même nom. Aucun établissement trouvé → le compte est créé, `joinRequested: false` et `joinRequestError: "ORG_NOT_FOUND"` (aucune demande créée).
- Couples rôle / type refusés en 400 (`lib/membershipRules.ts`) : médecin et personnel médical → hôpital, clinique, centre ; pharmacien → officine + ces trois ; laboratoire → laboratoire + ces trois.
- `profession` doit appartenir à la liste du rôle ; « chef de service » est refusé pour un indépendant. Elle est enregistrée sur le compte (`User.profession`).
- `department` : obligatoire pour médecin / personnel médical / laboratoire en hôpital, clinique ou centre ; ignoré (jamais enregistré) pour un pharmacien (officine ou pharmacie d'hôpital) et pour une officine ou un laboratoire. Il est enregistré sur la demande (`UserEstablishment.requestedDepartment`), informatif seulement.
- À l'approbation, si l'administrateur ne choisit pas de service et que le service déclaré existe déjà (même nom, sans tenir compte de la casse), il est attribué au médecin / personnel médical. Sinon l'administrateur le choisit lui-même.
- `POST /api/orgs/:id/join-requests` et l'acceptation d'une invitation appliquent la même règle rôle / type.
