import { createContext, useContext, useState, useEffect } from 'react';
import { getPermissionsForRole, getBaseRole } from '../config/permissions';
import { ORGANIZATIONS, isRoleAllowedForOrganization } from '../config/organizations';
import { sessionUserToDashboardUser } from '../lib/sessionUser';
import { enableVigilanceSync, hydrateVigilance, hydrateRecords } from '../data/vigilanceStore';
import { hydrateSettings } from '../data/settingsStore';
import { tr } from '../../i18n/translate.js';

const AuthContext = createContext(null);

// Demo accounts — mirrors the old #loginDemoAccounts list.
//
// ── Role/Organization/Department refactor ────────────────────────
// `role` is now ALWAYS one of the 8 clean, normalized business roles
// (permissions.js's BASE_PERMISSIONS keys) — it never carries an
// organization type inside it any more (no more "hospital-qualite",
// "clinique-admin", etc.). Organization is entirely separate
// (`orgId`/`organizationId` + `orgType`, derived from ORGANIZATIONS),
// and so is department (`departmentId`). See navConfig.js's
// getPortalKey(user) for the one place a (role, orgType) pair still
// gets turned into an internal UI-routing key, to reuse the existing,
// separately-coded CHU/Clinique/Centre Médical dashboards without a
// business role ever encoding which one.
//
// Org-scoped users: a hospital/clinic/centre médical is an
// ORGANIZATION, and several of the accounts below share the same
// orgId with different `role`s — CHU Alger alone has a doctor, a
// pharmacist, a laboratory_staff, a medical_staff, a
// vigilance_responsible, and an administrator, all distinct logins,
// all belonging to the same organization.
//
// 'doctor' / 'pharmacist' / 'laboratory_staff' accounts below reuse
// the exact same professional portals as the standalone accounts of
// the same role — per the "reuse existing components, don't duplicate
// portals" rule — they only additionally belong to an organization.
//
// role/permissions/organizationId/departmentId are NEVER settable
// from the UI post-login — login() below is the only place any of
// them is ever assigned, and it always comes from this fixed table,
// never from user input. The `signup()` function further below still
// exists (kept intact — see its own header) but is no longer wired to
// any public entry point: login is the sole public entry point now
// (there is no public account-creation flow), and every account that
// exists is one of the seats in this file.
//
// ── SEATS vs. DEMO_ACCOUNTS (fixes a real duplicate-id risk) ────────
// A SEAT is one real person/position — one `id`, one `role`, one
// `orgId`. A seat COULD accept more than one login email (an
// `emails` array, not a single `email` string) for cases like a
// legacy URL/bookmark kept working alongside a newer address — same
// seat, same person, just two doors into it. (No seat currently uses
// more than one email — the three that did, the CHU Alger/Clinique El
// Fedjr/Centre Médical Sétif vigilance_responsible "qualité" seats and
// their hopital@/clinique@/centre@ legacy aliases, were removed.) The
// `emails` array shape is kept rather than reverting to a single
// `email` field so a future seat can still declare a legacy alias
// without that class of bug: typing it as two separate top-level
// objects that happen to share a hand-copied `id` string, which is
// exactly the kind of thing that silently drifts (someone edits one
// row's `name` and forgets the other) and reads as an accidental
// duplicate ID rather than an intentional alias.
//
// Below, each SEAT is defined ONCE, with an `emails` array. DEMO_ACCOUNTS
// (the actual login table `login()` searches) is generated FROM the
// seats — one row per accepted email, all sharing that seat's single
// `id` by construction, not by copy-paste. There is no path left for
// an alias row to disagree with its seat: they're the same object
// spread, differing only in `email`.
//
// If a future account is a genuinely different person (not an alias)
// it MUST get its own seat with its own `id` — never add another email
// to an existing seat unless it's really the same person/position.
const SEATS = [
  { id: 'usr-amira-patient', emails: ['amira.patient@demo.dz'], role: 'patient', name: 'Amira Boualem', initials: 'AB' },
  { id: 'usr-docteur', emails: ['docteur@demo.dz'], role: 'doctor', name: 'Dr. Karim Benali', initials: 'KB' },
  { id: 'usr-pharmacien', emails: ['pharmacien@demo.dz'], role: 'pharmacist', name: 'Yasmine Cherif', initials: 'YC' },
  { id: 'usr-labo', emails: ['labo@demo.dz'], role: 'laboratory_staff', name: 'Laboratoire Central', initials: 'LC' },
  // New roles (role/org/department refactor) — standalone, no
  // organization, matching this app's existing pattern for a
  // non-org-affiliated professional account.
  { id: 'usr-auditeur', emails: ['auditeur@demo.dz'], role: 'auditor', name: 'Sonia Rahmani', initials: 'SR' },

  // ── CHU Alger (hospital) — doctor, pharmacist, laboratory_staff,
  //    medical_staff, administrator
  { id: 'usr-chu-medecin', emails: ['chu.medecin@demo.dz'], role: 'doctor', name: 'Dr. Amine Zerrouki', initials: 'AZ', orgId: 'chu-alger' },
  { id: 'usr-chu-pharmacien', emails: ['chu.pharmacien@demo.dz'], role: 'pharmacist', name: 'Nadia Bouzid', initials: 'NB', orgId: 'chu-alger' },
  { id: 'usr-chu-laborantin', emails: ['chu.laborantin@demo.dz'], role: 'laboratory_staff', name: 'Sofiane Meziane', initials: 'SM', orgId: 'chu-alger' },
  // New role (role/org/department refactor) — internal healthcare
  // personnel; jobTitle/departmentId demonstrate the two new fields
  // flowing through a real seat end-to-end (§4 "Medical Staff" example).
  { id: 'usr-chu-infirmier', emails: ['chu.infirmier@demo.dz'], role: 'medical_staff', jobTitle: 'nurse', name: 'Walid Amrani', initials: 'WA', orgId: 'chu-alger', departmentId: 'urgences' },
  { id: 'usr-chu-admin', emails: ['chu.admin@demo.dz'], role: 'administrator', name: 'CHU Alger — Administration', initials: 'CA', orgId: 'chu-alger' },

  // ── Clinique El Fedjr (clinic) — doctor, pharmacist, administrator
  { id: 'usr-clinique-medecin', emails: ['clinique.medecin@demo.dz'], role: 'doctor', name: 'Dr. Sarah Haddad', initials: 'SH', orgId: 'clinique-el-fedjr' },
  { id: 'usr-clinique-pharmacien', emails: ['clinique.pharmacien@demo.dz'], role: 'pharmacist', name: 'Riad Kaced', initials: 'RK', orgId: 'clinique-el-fedjr' },
  { id: 'usr-clinique-admin', emails: ['clinique.admin@demo.dz'], role: 'administrator', name: 'Clinique El Fedjr — Administration', initials: 'CF', orgId: 'clinique-el-fedjr' },

  // ── Centre Médical Sétif (medical_centre) — doctor, administrator only
  // (no pharmacist/laboratory_staff — deliberately smaller role catalog, see
  // organizations.js / requirements doc CRITICAL RULE)
  { id: 'usr-centre-medecin', emails: ['centre.medecin@demo.dz'], role: 'doctor', name: 'Dr. Yacine Ferhat', initials: 'YF', orgId: 'centre-setif' },
  { id: 'usr-centre-admin', emails: ['centre.admin@demo.dz'], role: 'administrator', name: 'Centre Médical Sétif — Administration', initials: 'CM', orgId: 'centre-setif' },
];

// Fail loud in dev/CI if a future edit accidentally reuses a seat id or
// a login email — this is exactly the class of bug flagged in review
// (two hand-typed rows silently sharing an id), so it's now enforced,
// not just avoided by convention.
{
  const seenIds = new Set();
  const seenEmails = new Set();
  for (const seat of SEATS) {
    if (seenIds.has(seat.id)) {
      throw new Error(`AuthContext: duplicate seat id "${seat.id}" in SEATS.`);
    }
    seenIds.add(seat.id);
    for (const email of seat.emails) {
      if (seenEmails.has(email)) {
        throw new Error(`AuthContext: duplicate login email "${email}" in SEATS.`);
      }
      seenEmails.add(email);
    }
  }
}

// Every account below now carries a stable `id` — the userId that was
// previously missing entirely (see architecture discussion, Concern 2).
// It's a plain deterministic slug here (mock/demo data, not a real
// identity provider), but the SHAPE matters: every relationship this
// app builds going forward (Declaration.authoredByUserId, future
// personnel/audit-log records, etc.) can now key off `id` instead of
// having nothing to key off at all. A real backend will issue its own
// ids later; nothing here assumes this exact slug format survives.
export const DEMO_ACCOUNTS = SEATS.flatMap((seat) => {
  const org = seat.orgId ? ORGANIZATIONS[seat.orgId] : null;
  // `role` IS the clean business role now (role/org/department
  // refactor) — nothing strips a prefix off it any more. `baseRole` is
  // kept, equal to `role`, purely so any external/future code that
  // still reads `.baseRole` (a real backend integration, a not-yet-
  // written page) keeps working unchanged — see permissions.js's
  // getBaseRole header.
  const shared = {
    id: seat.id,
    password: 'demo',
    role: seat.role,
    baseRole: getBaseRole(seat.role),
    jobTitle: seat.jobTitle ?? null,
    name: seat.name,
    initials: seat.initials,
    orgId: seat.orgId ?? null,
    // organizationId is the canonical name used by the Declaration
    // schema (domain/declaration.js) and declarationService.js — kept
    // alongside `orgId` (which some existing UI code already reads)
    // rather than renaming it, to avoid a wider find/replace for no
    // behavioral gain.
    organizationId: seat.orgId ?? null,
    orgType: org?.type ?? null,
    orgName: org?.name ?? null,
    // Department — separate from both role and organization (role/org
    // /department refactor §3). Only ever set for a seat that actually
    // belongs to an organization; null otherwise (see
    // isDepartmentAllowed-style rule applied to seats generally).
    departmentId: seat.orgId ? (seat.departmentId ?? null) : null,
    // Derived from role only — never a field a login form could set.
    permissions: getPermissionsForRole(seat.role),
  };
  // One login row per accepted email, all sharing `shared` by
  // construction — this is what makes an alias login structurally
  // incapable of drifting from its seat (see the SEATS header above).
  return seat.emails.map((email) => ({ ...shared, email }));
});

// ── Fail loud on a misconfigured demo roster ────────────────────────
// availableRoles (organizations.js) only ever DESCRIBED which roles are
// legal at an org; nothing previously CHECKED the table above against
// it, so e.g. accidentally giving Centre Médical Sétif a 'pharmacien'
// account (a role it doesn't offer) would have silently "worked" in
// the frontend. Run the same check a real backend would run
// server-side, at module load, so a bad entry breaks immediately in
// dev/CI instead of surfacing as a confusing bug later.
for (const seat of SEATS) {
  if (!seat.orgId) continue;
  const baseRole = getBaseRole(seat.role);
  if (!isRoleAllowedForOrganization(baseRole, seat.orgId)) {
    throw new Error(
      `AuthContext: SEATS misconfigured — role "${baseRole}" (from "${seat.role}") ` +
      `is not in ${seat.orgId}'s availableRoles (seat: ${seat.id}).`
    );
  }
}

// PHASE A addition — module-level mirror of the current user, read by
// declarationService.js (a plain module, not a component, so it can't
// call useAuth()). This is NOT a security mechanism: it's the exact
// same in-memory `user` this context already holds, just exposed
// outside React so the mock service can find "who's logged in" without
// scope being passed into it as a function argument (per the
// architecture decision that service calls stay scope-implicit). A
// real backend will read scope from an authenticated session/token on
// the server, not from a shared module variable — this accessor is
// scaffolding specific to being frontend-only right now (see Phase A
// completion report). It changes no login/logout behavior.
let _currentAuthUser = null;
export function getCurrentAuthUser() {
  return _currentAuthUser;
}

// ── Where the user comes from ────────────────────────────────────
// source="demo"    (default, used by the unit tests): the in-memory demo seats
//                  above + the dashboards' own login screen.
// source="session" (what the site uses): the user is whoever signed in on the
//                  site's /login page. The session cookie is read from
//                  GET /api/auth/session; nobody signed in -> back to /login.
//                  There is no second login screen.
export function AuthProvider({ children, source = 'demo' }) {
  const [user, setUser] = useState(null); // { id, email, role, baseRole, organizationId, name, initials, ... }
  const [error, setError] = useState('');
  // 'loading' only while the session is being fetched; always 'ready' in demo mode.
  const [status, setStatus] = useState(source === 'session' ? 'loading' : 'ready');

  useEffect(() => {
    if (source !== 'session') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success || !json.user) {
          window.location.replace('/login');
          return;
        }
        // A PRODUCT-PROVIDER account (created from "List your products") has no
        // role dashboard: its home is the services / products page. A healthcare
        // organization admin (ORG_ADMIN) is different: it gets the 'administrator'
        // dashboard below. Covers every
        // way of landing on /dashboard/ (login, navbar link, bookmark, typed URL).
        if (json.user.role === 'ESTABLISHMENT_ADMIN') {
          window.location.replace('/dashboard/services');
          return;
        }
        // VigiCore staff whose account has no real role dashboard (plain PATIENT seat): its home is the
        // staff area. `?own=1` lets a staff member who really is a patient still open the patient dashboard.
        if (json.user.isPlatformAdmin && json.user.role === 'PATIENT' && !/[?&]own=1/.test(window.location.search)) {
          window.location.replace('/admin');
          return;
        }
        const mapped = sessionUserToDashboardUser(json.user);
        if (!mapped) {
          setError(tr("Rôle « {0} » non pris en charge par les tableaux de bord.", [json.user.role]));
          setStatus("error");
          return;
        }
        // Les déclarations viennent de la base : on les charge AVANT le premier rendu des pages.
        enableVigilanceSync(true);
        await Promise.all([hydrateVigilance(), hydrateRecords(), hydrateSettings().catch(() => null)]);
        if (cancelled) return;
        setUser(mapped);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setError(tr("Impossible de joindre le serveur. Vérifiez votre connexion."));
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  // theme.css's login-gate rules (`body:not(.is-authenticated) .app-shell`,
  // `body.is-authenticated #loginScreen`) still key off this class on <body> —
  // that's how the original app hid/showed the shell vs. the login screen.
  // The React port switched to conditional rendering but never re-added this
  // toggle, so .app-shell stayed `display:none` even after a successful login.
  useEffect(() => {
    document.body.classList.toggle('is-authenticated', !!user);
  }, [user]);

  // Keep the module-level mirror in sync with React state. Read-only
  // from the outside (getCurrentAuthUser above); nothing but this
  // effect ever assigns to _currentAuthUser.
  useEffect(() => {
    _currentAuthUser = user;
  }, [user]);

  function login(email, password) {
    const account = DEMO_ACCOUNTS.find((a) => a.email === email && a.password === password);
    if (!account) {
      setError(tr("Identifiants incorrects. Veuillez réessayer."));
      return false;
    }
    setError('');
    setUser(account);
    return true;
  }

  // Role/org/department refactor §5 — signup() was originally written
  // for a public signup flow. That flow has since been removed (login
  // is now the sole public entry point — see LoginPage.jsx); this
  // function is kept, unused, rather than deleted, since it's core
  // AuthContext behavior, not signup-UI-specific, and removing it
  // would touch the authentication architecture beyond what that
  // change asked for. Mock/demo only, same as every other write in
  // this frontend (declarationService.js etc.): there is no backend
  // yet, so this does NOT persist a new row into DEMO_ACCOUNTS or
  // anywhere else — it builds one session-only account with exactly
  // the same SHAPE login() produces (role, permissions, orgId/
  // organizationId/orgType/orgName, departmentId, jobTitle) and logs
  // straight into it. Reloading the page loses it, same as every
  // other in-memory mutation in this app. A real backend would
  // replace this function entirely; nothing here should be read as a
  // real account-creation contract.
  //
  // role/permissions/organizationId/departmentId are derived here the
  // exact same way login() derives them for an existing seat — never
  // freely provided by a caller beyond a role + (optionally) an
  // organization + department; this function re-derives permissions
  // from `role` regardless, so a caller bug could never grant
  // permissions the role doesn't actually have.
  function signup({ role, email, name, organizationId, departmentId, jobTitle }) {
    const org = organizationId ? ORGANIZATIONS[organizationId] : null;
    const initials = (name || '')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '??';
    const account = {
      id: `usr-signup-${Date.now()}`,
      email,
      password: 'demo',
      role,
      baseRole: getBaseRole(role),
      jobTitle: jobTitle ?? null,
      name,
      initials,
      orgId: organizationId ?? null,
      organizationId: organizationId ?? null,
      orgType: org?.type ?? null,
      orgName: org?.name ?? null,
      departmentId: organizationId ? (departmentId ?? null) : null,
      permissions: getPermissionsForRole(role),
    };
    setError('');
    setUser(account);
    return account;
  }

  function logout() {
    if (source === 'session') {
      // End the real server session, then go back to the site's login page.
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .catch(() => {})
        .finally(() => { window.location.assign('/login'); });
      return;
    }
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, error, status }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
