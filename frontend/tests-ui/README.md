# Tests de composants du Site (jsdom)

`npm install && npm test` — 47 tests (liste/détail/renvoi/messagerie « Mes envois », file d'établissement, wizard
incident/panne, déclaration patient). L'API est **simulée** : ils prouvent ce que l'interface affiche et appelle.
Dossier isolé pour ne pas ajouter de dépendance au projet. Ne pas livrer `node_modules/`.
