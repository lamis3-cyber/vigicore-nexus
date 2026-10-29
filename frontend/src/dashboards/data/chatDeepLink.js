// Ouvre la messagerie directement sur une personne (ex. "Contacter" depuis la fiche d'un patient).
// La page qui demande dépose l'identifiant, la page Messages le consomme une seule fois à son ouverture.
let pendingUserId = null;
export const requestOpenChat = (userId) => { pendingUserId = userId || null; };
export function consumeOpenChat() { const id = pendingUserId; pendingUserId = null; return id; }
