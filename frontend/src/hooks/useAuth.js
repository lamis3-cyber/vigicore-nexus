/**
 * useAuth.js — VigiCore NEXUS
 * React hook that wraps auth.js and exposes loading + error state.
 *
 * Usage in LoginPage.jsx:
 *   const { loading, error, doLogin, doSignup, doMfa, doReset } = useAuth();
 */

import { useState } from 'react';
import { login, signup, verifyMfa, requestPasswordReset } from '../lib/auth.js';

export function useAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // Holds the sessionToken returned by login when MFA is required
  const [sessionToken, setSessionToken] = useState(null);

  /** Clear any previous error */
  const clearError = () => setError(null);

  /**
   * Login → on success either redirects or triggers MFA view.
   * @param {string} email
   * @param {string} password
   * @param {function} onMfaRequired  - called with no args when MFA is needed
   * @param {function} onSuccess      - called with no args when login is complete
   */
  async function doLogin(email, password, { onMfaRequired, onSuccess }) {
    clearError();
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (result.data.mfaRequired) {
      setSessionToken(result.data.sessionToken);
      onMfaRequired?.();
    } else {
      onSuccess?.();
    }
  }

  /**
   * Verify MFA code.
   * @param {string}   code
   * @param {function} onSuccess
   */
  async function doMfa(code, { onSuccess }) {
    clearError();
    setLoading(true);
    const result = await verifyMfa(code, sessionToken);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess?.();
  }

  /**
   * Register a new account.
   * @param {{ name, email, role, password, professionalStatus?, organizationType?, organizationName?, department?, profession? }} fields
   * @param {function} onSuccess
   */
  async function doSignup(fields, { onSuccess }) {
    clearError();
    setLoading(true);
    const result = await signup(fields);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // result.data : { joinRequested, joinRequestError? } — l'inscription a réussi même si l'établissement n'a pas été trouvé.
    onSuccess?.(result.data);
  }

  /**
   * Request a password-reset email.
   * @param {string}   email
   * @param {function} onSuccess
   */
  async function doReset(email, { onSuccess }) {
    clearError();
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess?.();
  }

  return { loading, error, clearError, doLogin, doSignup, doMfa, doReset };
}
