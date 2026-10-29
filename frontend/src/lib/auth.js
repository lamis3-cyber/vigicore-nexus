/**
 * auth.js — VigiCore NEXUS
 * Centralized auth API layer.
 *
 * All functions return:  { ok: true, data }   on success
 *                        { ok: false, error }  on failure
 *
 * Your partner's backend must expose these routes:
 *   POST /api/auth/login          { email, password }
 *   POST /api/auth/signup         { name, email, role, password,
 *                                    professionalStatus?, organizationType?,
 *                                    organizationName?, department?, profession? }
 *                                  (the optional fields are only present for
 *                                  professional roles — see Sign-Up form)
 *   POST /api/auth/mfa/verify     { code, sessionToken }
 *   POST /api/auth/logout         (no body)
 *   POST /api/auth/password-reset { email }
 *
 * All responses should return JSON:
 *   Success → { success: true, ...data }
 *   Error   → { success: false, message: "Human-readable error" }
 *
 * For MFA: login should return { success: true, mfaRequired: true, sessionToken }
 * when MFA is needed, or { success: true, mfaRequired: false, token } when not.
 */

import { apiFetch } from './api.js';

/**
 * Login with email + password.
 * Returns { mfaRequired, sessionToken } or { token } depending on backend config.
 */
export async function login(email, password) {
  return apiFetch('POST', '/auth/login', { email, password });
}

/**
 * Register a new account.
 * @param {{ name, email, role, password, professionalStatus?, organizationType?, organizationName?, department?, profession? }} fields
 */
export async function signup(fields) {
  return apiFetch('POST', '/auth/signup', fields);
}

/**
 * Verify MFA code after login.
 * sessionToken comes from the login response when mfaRequired is true.
 */
export async function verifyMfa(code, sessionToken) {
  return apiFetch('POST', '/auth/mfa/verify', { code, sessionToken });
}

/**
 * Send a password-reset email.
 */
export async function requestPasswordReset(email) {
  return apiFetch('POST', '/auth/password-reset', { email });
}

/**
 * Set a new password with the token from the reset e-mail (single use, 30 min).
 */
export async function confirmPasswordReset(token, newPassword) {
  return apiFetch('POST', '/auth/password-reset/confirm', { token, newPassword });
}

/**
 * Logout (clears the server session / invalidates token).
 */
export async function logout() {
  return apiFetch('POST', '/auth/logout', {});
}

/**
 * Get the current session, if any.
 *
 * NOT part of the original contract above — added for pages that need to
 * know "is someone logged in, and as what role/establishment" before
 * rendering (e.g. ManageServicesPage.jsx). No route currently implements
 * this; it's the same gap noted in server/README.md ("session-context
 * endpoint... Phase 2 scope"). Until it exists, callers should treat a
 * failed/unreachable call as "not logged in" rather than erroring loudly.
 *
 * Expected backend route:
 *   GET /api/auth/session   (session cookie only, no body)
 *   Success (logged in):    { success: true, user: { id, displayName, role,
 *                              activeEstablishmentId } }
 *   Success (logged out):   { success: true, user: null }
 *   Failure:                { success: false, message }
 */
export function getSession() {
  return apiFetch('GET', '/auth/session');
}

