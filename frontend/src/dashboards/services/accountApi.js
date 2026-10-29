// Account security API (server/src/routes/auth.routes.ts):
//   POST /api/auth/change-password   { currentPassword, newPassword }
//   POST /api/auth/deactivate        { password }
// Same convention as orgApi.js: cookie session, always resolves to
// { ok, data } or { ok: false, error } — never throws. Server messages are
// English, so the ones the UI can hit are translated here.
const FR = [
  [/current password is incorrect/i, 'Le mot de passe actuel est incorrect.'],
  [/password is incorrect/i, 'Mot de passe incorrect.'],
  [/at least 8 characters/i, 'Le mot de passe doit contenir au moins 8 caractères.'],
  [/must be different/i, "Le nouveau mot de passe doit être différent de l'actuel."],
  [/only administrator/i, "Vous êtes le seul administrateur de votre organisation. Nommez d'abord un autre administrateur."],
  [/must be signed in/i, 'Votre session a expiré. Reconnectez-vous.'],
];

function toFrench(message) {
  const hit = FR.find(([re]) => re.test(message || ''));
  return hit ? hit[1] : (message || 'Une erreur est survenue.');
}

async function call(path, body) {
  try {
    const res = await fetch(`/api/auth${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return { ok: false, error: toFrench(json?.message ?? `Erreur serveur (${res.status})`) };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: 'Impossible de joindre le serveur.' };
  }
}

export const accountApi = {
  changePassword: (currentPassword, newPassword) => call('/change-password', { currentPassword, newPassword }),
  deactivate: (password) => call('/deactivate', { password }),
};
