import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { normalizeEmail, isValidEmail } from '../lib/email-address';
import { authLimiter, resetLimiter } from '../lib/security';
import { requestPasswordReset, confirmPasswordReset, resetAvailable } from '../services/passwordReset';
import { requireAuth } from '../middleware/requireAuth';
import { isPlatformAdmin } from '../middleware/requirePlatformAdmin';
import { linkPatientAccount } from '../services/careLinks';
import { hashPassword, verifyPassword } from '../lib/password';
import { sessionCookieOptions, SESSION_COOKIE_NAME, signSessionToken } from '../lib/jwt';
import { signMfaChallenge, verifyMfaChallenge } from '../lib/mfaCrypto';
import { mfaConfig, verifySecondFactor } from '../services/mfa';
import { mfaRouter } from './mfa.routes';
import type { EstablishmentType } from '@prisma/client';
import {
  HEALTHCARE_REGISTRATION_TYPES,
  JOINABLE_ESTABLISHMENT_TYPES,
  mapFrontendOrgType,
  mapFrontendRole,
} from '../lib/roleMapping';
import { WORKER_ROLES, isOrgTypeAllowedForRole, parseProfessionalDetails } from '../lib/membershipRules';
import { parseSupplierProfile, type SupplierProfile } from '../lib/supplierRules';

export const authRouter = Router();

// Brute-force / enumeration brake on credential endpoints (per client IP, see TRUST_PROXY).
authRouter.use(['/login', '/signup', '/mfa/verify'], authLimiter);
// 2FA : mêmes freins sur les écritures (mot de passe + code), lecture du statut libre ; montage des routes /2fa/*.
authRouter.use('/2fa', (req, res, next) => (req.method === 'GET' ? next() : authLimiter(req, res, next)));
authRouter.use('/2fa', mfaRouter);

/**
 * POST /api/auth/signup
 * Body: { name, email, role, password, professionalStatus?, organizationType?,
 *         organizationName?, department?, profession? }
 * Matches src/lib/auth.js's documented contract exactly.
 *
 * FOUR kinds of sign-up, each with its own identity, rules and dashboard:
 *
 * 1) role === 'org_admin'  (RegisterOrganizationPage, "healthcare" mode)
 *    First administrator of a HOSPITAL / CLINIQUE / CENTRE_MEDICAL.
 *      - organizationName + organizationType (one of the healthcare types) required
 *      - a new Establishment is created; the user becomes its ACTIVE ADMIN member
 *      - an existing name is rejected (nobody becomes a 2nd admin of an existing
 *        org by typing its name — the admin must invite them instead)
 *
 * 2) role === 'establishment_admin'  (RegisterOrganizationPage, "provider" mode)
 *    A manufacturer / supplier that lists products on /services.
 *      - organizationName required; the Establishment type is ALWAYS SUPPLIER
 *        (never HOSPITAL by default — that was the old bug)
 *
 * 3) role === 'fournisseur'  ("Vendeur > Fournisseur" path)
 *    A distributor / wholesale supplier that BUYS from manufacturers.
 *      - company sheet required: organizationName, rcNumber, nifNumber, phone, address
 *        (declaredApprovalNumber optional) — validated by lib/supplierRules.ts
 *      - a new SUPPLIER Establishment is created with buyerCategory DISTRIBUTOR and status DECLARED:
 *        the account exists and can sign in at once, but cannot place an order until VigiCore staff
 *        VERIFIES the category (same circuit as AdminBuyersPage)
 *      - an existing organization name is rejected, as for the two other organization accounts
 *
 * 4) every other role (patient / doctor / pharmacist / laboratory_staff /
 *    medical_staff): plain self-registration. The account starts with NO
 *    establishment and NO organisation rights. If the person said they work
 *    inside an organization and typed its name, that only creates a PENDING
 *    join request — it grants nothing until an org admin approves it. A name
 *    match proves nothing about who the person is.
 *      - the organization is looked up by name AND by the type the person chose
 *        (a pharmacist who picked « Hôpital » never matches a pharmacy of the same name);
 *      - the role / organization-type pair is validated here (see lib/membershipRules.ts);
 *      - `profession` is saved on the account, `department` on the join request
 *        (shown to the org admin, who attaches the real service on approval).
 */
authRouter.post('/signup', async (req, res) => {
  const { name, role, password, organizationType, organizationName, professionalStatus } = req.body ?? {};
  const email = normalizeEmail(req.body?.email);

  if (!name || !email || !role || typeof password !== 'string' || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'name, email, role and password are required.' });
  }

  const schemaRole = mapFrontendRole(role);
  if (!schemaRole) {
    return res.status(400).json({ success: false, message: `Unknown role "${role}".` });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }

  if (password.length < 8 || password.length > 200) {
    return res
      .status(400)
      .json({ success: false, message: 'Password must be between 8 and 200 characters.' });
  }

  // ── Professional details (doctor / pharmacist / laboratory / medical staff only) ──
  // Validated BEFORE anything is created: whatever the form shows, the API can be called directly.
  let worker: {
    orgType: EstablishmentType | null;
    orgName: string;
    profession: string | null;
    requestedDepartment: string | null;
  } | null = null;
  if (WORKER_ROLES.has(schemaRole)) {
    if (professionalStatus !== undefined && professionalStatus !== 'independent' && professionalStatus !== 'organization') {
      return res.status(400).json({ success: false, message: 'professionalStatus must be "independent" or "organization".' });
    }
    let orgType: EstablishmentType | null = null;
    let orgName = '';
    if (professionalStatus === 'organization') {
      orgType = mapFrontendOrgType(organizationType);
      if (!orgType || !JOINABLE_ESTABLISHMENT_TYPES.includes(orgType)) {
        return res.status(400).json({ success: false, message: 'organizationType is required and must be a workplace type.' });
      }
      if (!isOrgTypeAllowedForRole(schemaRole, orgType)) {
        return res.status(400).json({ success: false, message: 'This role cannot belong to this kind of organization.' });
      }
      orgName = typeof organizationName === 'string' ? organizationName.trim() : '';
      if (!orgName) {
        return res.status(400).json({ success: false, message: 'organizationName is required.' });
      }
    }
    const parsed = parseProfessionalDetails(schemaRole, orgType, {
      profession: req.body?.profession,
      department: req.body?.department,
    });
    if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
    worker = { orgType, orgName, profession: parsed.profession, requestedDepartment: parsed.requestedDepartment };
  }

  // ── Company sheet (distributor / wholesale supplier only) ──
  // Validated BEFORE anything is created, for the same reason as the professional details above.
  let supplier: SupplierProfile | null = null;
  // Employé (role 'fournisseur_staff') : pas de fiche société, il attend l'invitation de l'administrateur de son entreprise.
  if (schemaRole === 'FOURNISSEUR' && role !== 'fournisseur_staff') {
    const parsedSupplier = parseSupplierProfile(req.body);
    if (!parsedSupplier.ok) return res.status(400).json({ success: false, message: parsedSupplier.message });
    supplier = parsedSupplier.profile;
  }

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  let joinRequested = false;
  let joinRequestError: 'ORG_NOT_FOUND' | null = null;

  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.user.create({
        data: { email, displayName: name, role: schemaRole, passwordHash, profession: worker?.profession ?? null },
      });

      if (supplier) {
        const alreadyTaken = await tx.establishment.findFirst({ where: { name: supplier.organizationName } });
        if (alreadyTaken) {
          throw new HttpError(
            409,
            'An organization with this name is already registered. Ask its admin to invite you instead.'
          );
        }
        // Distributor: SUPPLIER type, buyer category DECLARED (never VERIFIED here — only VigiCore staff verifies).
        const establishment = await tx.establishment.create({
          data: {
            name: supplier.organizationName,
            type: 'SUPPLIER',
            rcNumber: supplier.rcNumber,
            nifNumber: supplier.nifNumber,
            declaredApprovalNumber: supplier.declaredApprovalNumber,
            phone: supplier.phone,
            address: supplier.address,
            buyerCategory: 'DISTRIBUTOR',
            buyerCategoryStatus: 'DECLARED',
            buyerCategoryDeclaredAt: new Date(),
            buyerCategoryDeclaredBy: created.id,
          },
        });
        await tx.userEstablishment.create({
          data: {
            userId: created.id,
            establishmentId: establishment.id,
            isActiveContext: true,
            status: 'ACTIVE',
            memberRole: 'ADMIN',
            initiatedBy: 'USER',
          },
        });
      } else if (schemaRole === 'ORG_ADMIN' || schemaRole === 'ESTABLISHMENT_ADMIN') {
        const orgName = typeof organizationName === 'string' ? organizationName.trim() : '';
        if (!orgName) {
          throw new HttpError(400, 'organizationName is required to register an organization.');
        }

        let type: EstablishmentType;
        if (schemaRole === 'ORG_ADMIN') {
          const mapped = mapFrontendOrgType(organizationType);
          if (!mapped || !HEALTHCARE_REGISTRATION_TYPES.includes(mapped)) {
            throw new HttpError(
              400,
              'organizationType must be hospital, clinic or medical_centre to register a healthcare organization.'
            );
          }
          type = mapped;
        } else {
          // Product provider: the type is decided by the account kind, not by the client.
          type = 'SUPPLIER';
        }

        const alreadyTaken = await tx.establishment.findFirst({ where: { name: orgName } });
        if (alreadyTaken) {
          throw new HttpError(
            409,
            'An organization with this name is already registered. Ask its admin to invite you instead.'
          );
        }
        const establishment = await tx.establishment.create({ data: { name: orgName, type } });
        await tx.userEstablishment.create({
          data: {
            userId: created.id,
            establishmentId: establishment.id,
            isActiveContext: true,
            status: 'ACTIVE',
            memberRole: 'ADMIN',
            initiatedBy: 'USER',
          },
        });
      } else if (worker?.orgType) {
        // Same name AND the type the person chose: a pharmacy never answers to « Hôpital ».
        const establishment = await tx.establishment.findFirst({
          where: { name: worker.orgName, type: worker.orgType, isSystemReserved: false },
        });
        if (establishment) {
          // A REQUEST, not a membership: nothing is granted until an org admin approves it.
          await tx.userEstablishment.create({
            data: {
              userId: created.id,
              establishmentId: establishment.id,
              isActiveContext: false,
              status: 'PENDING',
              memberRole: 'MEMBER',
              initiatedBy: 'USER',
              requestedDepartment: worker.requestedDepartment,
            },
          });
          joinRequested = true;
        } else {
          joinRequestError = 'ORG_NOT_FOUND';
        }
      }

      return created;
    });

    // Patient : les dossiers déjà créés par ses médecins avec cet e-mail sont liés à son compte (demandes de contact à accepter).
    if (schemaRole === 'PATIENT') await linkPatientAccount(user.id, email).catch(() => 0);
    setSessionCookie(res, user.id);
    return res.status(201).json({ success: true, joinRequested, ...(joinRequestError ? { joinRequestError } : {}) });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    // Database-level uniqueness (two concurrent signups with the same email).
    if ((err as { code?: string })?.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    console.error('signup failed', (err as Error)?.message);
    return res.status(500).json({ success: false, message: 'Could not create the account.' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * 2FA TOTP is OPT-IN (MFA_ENABLED=true + account enabled it). Without it — and always when the feature is off —
 * the response and the session cookie are exactly as before (mfaRequired: false).
 * With 2FA on: NO session cookie; { success, mfaRequired: true, sessionToken } where sessionToken is a short-lived
 * (5 min), single-use challenge (purpose 'mfa', own audience and key) accepted ONLY by POST /mfa/verify.
 */
authRouter.post('/login', async (req, res) => {
  const { password } = req.body ?? {};
  const email = normalizeEmail(req.body?.email);
  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required.' });
  }

  // `in [normalized, raw]`: accounts created before normalization may still be stored with their original casing.
  const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : email;
  const user = await prisma.user.findFirst({ where: { email: { in: [email, rawEmail] } } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Incorrect email or password.' });
  }
  if (user.deactivatedAt) {
    return res.status(403).json({
      success: false,
      message: 'This account has been deactivated. Contact an administrator to reactivate it.',
    });
  }

  const mfa = mfaConfig();
  if (mfa.enabled) {
    const row = await prisma.userMfa.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });
    if (row?.enabledAt) {
      // Fail closed : jamais de contournement du 2FA si la clé de chiffrement est absente.
      if (!mfa.keyOk) return res.status(503).json({ success: false, message: 'Two-factor authentication is temporarily unavailable.' });
      return res.json({ success: true, mfaRequired: true, sessionToken: signMfaChallenge(user.id) });
    }
  }

  // Comptes patients antérieurs au lien automatique : rattrapage à la connexion (sans effet si tout est déjà lié).
  if (user.role === 'PATIENT') await linkPatientAccount(user.id, user.email).catch(() => 0);
  setSessionCookie(res, user.id);
  return res.json({ success: true, mfaRequired: false });
});

/**
 * POST /api/auth/mfa/verify
 * Body: { code, sessionToken } — code = TOTP 6 chiffres OU code de récupération (usage unique).
 * Feature désactivée (MFA_ENABLED≠true) : réponse 501 d'origine, inchangée.
 * Succès : rattrapage patient puis cookie de session, comme /login.
 */
authRouter.post('/mfa/verify', async (req, res) => {
  const cfg = mfaConfig();
  if (!cfg.enabled) return res.status(501).json({ success: false, message: 'MFA is not available yet.' });
  const { code, sessionToken } = req.body ?? {};
  if (typeof code !== 'string' || typeof sessionToken !== 'string' || !code || !sessionToken) {
    return res.status(400).json({ success: false, message: 'code and sessionToken are required.' });
  }
  const expired = () => res.status(401).json({ success: false, code: 'CHALLENGE_INVALID', message: 'Invalid or expired verification session. Please sign in again.' });
  const challenge = verifyMfaChallenge(sessionToken);
  if (!challenge) return expired();
  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user) return expired();
  if (user.deactivatedAt) {
    return res.status(403).json({ success: false, message: 'This account has been deactivated. Contact an administrator to reactivate it.' });
  }
  // A password change/reset ends every session issued before it — and every pending challenge too.
  if (user.passwordChangedAt && challenge.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) return expired();
  if (await prisma.mfaChallengeUse.findUnique({ where: { jti: challenge.jti } })) return expired(); // déjà consommé
  if (!cfg.keyOk) return res.status(503).json({ success: false, message: 'Two-factor authentication is temporarily unavailable.' });

  const now = new Date();
  const sf = await verifySecondFactor(prisma, user.id, code, { now, allowRecovery: true, actor: { id: user.id, displayName: user.displayName } });
  if (!sf.ok) {
    if (sf.reason === 'locked') return res.status(429).json({ success: false, code: 'MFA_LOCKED', message: 'Too many attempts. Try again later.' });
    if (sf.reason === 'unavailable') return res.status(503).json({ success: false, message: 'Two-factor authentication is temporarily unavailable.' });
    return res.status(401).json({ success: false, code: 'INVALID_CODE', message: 'Invalid code.' });
  }
  // Usage unique du défi : la clé primaire (jti) départage deux vérifications simultanées.
  try {
    await prisma.mfaChallengeUse.create({ data: { jti: challenge.jti, userId: user.id, expiresAt: new Date(challenge.exp * 1000) } });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') return expired();
    throw err;
  }
  void prisma.mfaChallengeUse.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => 0); // purge opportuniste
  if (sf.method === 'recovery') {
    // Meilleur effort ; la trace ne contient jamais le code.
    await prisma.auditEntry.create({ data: { actorUserId: user.id, actorName: user.displayName, establishmentId: null, refType: 'user', refId: user.id, action: 'Authentification à deux facteurs : connexion avec un code de récupération' } }).catch(() => 0);
  }
  if (user.role === 'PATIENT') await linkPatientAccount(user.id, user.email).catch(() => 0);
  setSessionCookie(res, user.id);
  return res.json({ success: true });
});

/**
 * POST /api/auth/password-reset   Body: { email }
 * Always answers the same 200 for an unknown or known address (no account enumeration).
 * The only distinguishable answer is 503 when the server cannot send e-mail at all —
 * that does not depend on the address, so it reveals nothing and never lies about delivery.
 * A delivery failure for an existing account is logged (no address/token) and not surfaced.
 */
authRouter.post('/password-reset', resetLimiter, async (req, res) => {
  if (!resetAvailable()) {
    return res.status(503).json({ success: false, code: 'EMAIL_NOT_CONFIGURED', message: 'Password reset by email is not available yet. Contact an administrator.' });
  }
  // Not awaited: response time must not depend on whether the account exists / SMTP latency.
  void requestPasswordReset(prisma, req.body?.email).catch((e: Error) =>
    console.error('[password-reset] delivery or storage failed:', e.message)
  );
  return res.json({ success: true });
});

/** POST /api/auth/password-reset/confirm   Body: { token, newPassword } */
authRouter.post('/password-reset/confirm', resetLimiter, async (req, res) => {
  const { token, newPassword } = req.body ?? {};
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
    return res.status(400).json({ success: false, message: 'Password must be between 8 and 200 characters.' });
  }
  const r = await confirmPasswordReset(prisma, token, newPassword);
  if (!r.ok) {
    return res.status(400).json({ success: false, code: r.reason, message: 'This reset link is invalid or has expired. Request a new one.' });
  }
  return res.json({ success: true });
});

/**
 * POST /api/auth/change-password   (signed in)
 * Body: { currentPassword, newPassword }
 * The current password is re-checked server-side, so a stolen/left-open session
 * alone can't change it.
 */
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ success: false, message: 'The new password must be different from the current one.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'The current password is incorrect.' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
  // Every other session (cookies issued before now) stops working; keep this one signed in.
  setSessionCookie(res, user.id);
  return res.json({ success: true });
});

/**
 * POST /api/auth/deactivate   (signed in)
 * Body: { password }
 * Soft deactivation: the account can no longer sign in, but the user row and all
 * the vigilance history attached to it (declarations, cases, audit trail) are
 * KEPT, as the traceability of a declaration must outlive its author's account.
 * An administrator can reactivate it by clearing User.deactivatedAt.
 *
 * Refused while the user is the ONLY active administrator of an organization,
 * otherwise that organization would be left with nobody able to manage it.
 */
authRouter.post('/deactivate', requireAuth, async (req, res) => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'password is required.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'The password is incorrect.' });
  }

  const adminSeats = await prisma.userEstablishment.findMany({
    where: { userId: user.id, memberRole: 'ADMIN', status: 'ACTIVE' },
    select: { establishmentId: true },
  });
  for (const seat of adminSeats) {
    const otherAdmins = await prisma.userEstablishment.count({
      where: {
        establishmentId: seat.establishmentId,
        memberRole: 'ADMIN',
        status: 'ACTIVE',
        userId: { not: user.id },
        user: { deactivatedAt: null },
      },
    });
    if (otherAdmins === 0) {
      return res.status(409).json({
        success: false,
        message: 'You are the only administrator of your organization. Appoint another administrator first.',
      });
    }
  }

  await prisma.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return res.json({ success: true });
});

/** POST /api/auth/logout */
authRouter.post('/logout', async (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return res.json({ success: true });
});

/**
 * GET /api/auth/session
 * Relies on attachUser having already run (mounted globally in app.ts).
 */
authRouter.get('/session', async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, user: null });
  }
  // The dashboard header shows which organization the user is acting for.
  const establishment = req.user.activeEstablishmentId
    ? await prisma.establishment.findUnique({
        where: { id: req.user.activeEstablishmentId },
        select: { name: true, type: true, buyerCategory: true, buyerCategoryStatus: true, buyerCategoryNote: true },
      })
    : null;
  // 2FA (additif) : false sans requête quand la fonction est désactivée.
  const twoFactorEnabled = mfaConfig().enabled
    ? !!(await prisma.userMfa.findUnique({ where: { userId: req.user.id }, select: { enabledAt: true } }))?.enabledAt
    : false;
  return res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      role: req.user.role,
      activeEstablishmentId: req.user.activeEstablishmentId,
      activeEstablishmentName: establishment?.name ?? null,
      // ADMIN member of the active establishment (false for an employee). Display only (hides admin-only menu entries): every API checks it again.
      isEstablishmentAdmin: !!req.user.activeEstablishmentId && (req.user.adminEstablishmentIds ?? []).includes(req.user.activeEstablishmentId),
      activeEstablishmentType: establishment?.type ?? null,
      // Vérification VigiCore de la catégorie d'acheteur (fournisseur / distributeur) : { category, status, note } ou null.
      // status : DECLARED (en attente de vérification) | VERIFIED | REJECTED. Sert au bandeau « en attente de vérification ».
      organizationVerification: establishment?.buyerCategory
        ? { category: establishment.buyerCategory, status: establishment.buyerCategoryStatus ?? null, note: establishment.buyerCategoryNote ?? null }
        : null,
      // Service of the active membership (doctors / medical staff only). null = works for the whole establishment.
      activeDepartmentId: req.user.activeDepartmentId ?? null,
      activeDepartmentName: req.user.activeDepartmentName ?? null,
      // VigiCore staff = email listed in PLATFORM_ADMIN_EMAILS (not a Role). Only used to show the Staff link;
      // every staff API still checks the list itself.
      isPlatformAdmin: isPlatformAdmin(req.user.email),
      twoFactorEnabled,
    },
  });
});

function setSessionCookie(res: import('express').Response, userId: string) {
  const token = signSessionToken({ userId });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
