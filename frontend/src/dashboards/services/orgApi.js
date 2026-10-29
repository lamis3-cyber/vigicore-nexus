// Organization membership API (server/src/routes/orgs.routes.ts).
// Same convention as the rest of the dashboards' session code: cookie session,
// always resolves to { ok, data } or { ok: false, error } — never throws.
async function call(method, path, body) {
  try {
    const res = await fetch(`/api/orgs${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return { ok: false, error: json?.message ?? `Erreur serveur (${res.status})` };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: 'Impossible de joindre le serveur.' };
  }
}

export const orgApi = {
  // worker side
  search: (q) => call('GET', `/search?q=${encodeURIComponent(q)}`),
  mine: () => call('GET', '/mine'),
  requestJoin: (orgId) => call('POST', `/${orgId}/join-requests`),
  cancelRequest: (orgId) => call('DELETE', `/${orgId}/join-requests`),
  leave: (orgId) => call('POST', `/${orgId}/leave`),
  acceptInvitation: (invId) => call('POST', `/invitations/${invId}/accept`),
  declineInvitation: (invId) => call('POST', `/invitations/${invId}/decline`),
  // any ACTIVE member: colleagues (names and roles only)
  members: (orgId) => call('GET', `/${orgId}/members`),
  // org admin side
  overview: (orgId) => call('GET', `/${orgId}/overview`),
  // departmentId optionnel : service attribué à l'approbation (médecin / personnel médical uniquement).
  approve: (orgId, membershipId, departmentId) =>
    call('POST', `/${orgId}/requests/${membershipId}/approve`, departmentId !== undefined ? { departmentId } : undefined),
  createDepartment: (orgId, name) => call('POST', `/${orgId}/departments`, { name }),
  // departmentId = null : retire le membre de son service. Refusé pour pharmacie / laboratoire (tout l'établissement).
  setMemberDepartment: (orgId, membershipId, departmentId) => call('PATCH', `/${orgId}/members/${membershipId}/department`, { departmentId }),
  reject: (orgId, membershipId) => call('POST', `/${orgId}/requests/${membershipId}/reject`),
  invite: (orgId, email) => call('POST', `/${orgId}/invitations`, { email }),
  revokeInvitation: (orgId, invId) => call('DELETE', `/${orgId}/invitations/${invId}`),
  removeMember: (orgId, membershipId) => call('DELETE', `/${orgId}/members/${membershipId}`),
};
