/**
 * /api/auth/2fa/* — gestion du 2FA TOTP (opt-in par utilisateur). Toutes les routes exigent une session.
 * Écritures sensibles (activation, désactivation, régénération des codes) : AuditEntry dans la MÊME transaction
 * (refType 'user'), sans secret ni code. Réponses contenant un secret/des codes : Cache-Control: no-store.
 */
import { Router } from 'express';
import type { Response } from 'express';
import QRCode from 'qrcode';
import { generateSecret, generateURI } from 'otplib';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { encryptSecret, generateRecoveryCodes, hashRecovery, normalizeRecovery, parseMfaKey } from '../lib/mfaCrypto';
import { MFA_ISSUER, checkPasswordAndCode, mfaConfig } from '../services/mfa';
import { describeError } from '../lib/safeLog';
import { asyncHandler } from '../lib/asyncHandler';

export const mfaRouter = Router();
const db = prisma as any;
const noStore = (res: Response) => res.set('Cache-Control', 'no-store');
const RECOVERY_COUNT = 10;

// Disponibilité de la fonction (même désactivée) : permet à l'interface de masquer la section.
mfaRouter.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const cfg = mfaConfig();
  if (!cfg.enabled) return res.json({ success: true, available: false, enabled: false, pending: false, recoveryCodesRemaining: 0 });
  const row = await db.userMfa.findUnique({ where: { userId: req.user!.id }, select: { enabledAt: true } });
  const remaining = row?.enabledAt ? await db.userMfaRecoveryCode.count({ where: { userId: req.user!.id, usedAt: null } }) : 0;
  return res.json({ success: true, available: cfg.available, enabled: !!row?.enabledAt, pending: !!row && !row.enabledAt, recoveryCodesRemaining: remaining });
}));

mfaRouter.use((_req, res, next) => {
  if (!mfaConfig().enabled) return res.status(404).json({ success: false, code: 'MFA_DISABLED', message: 'Two-factor authentication is not enabled on this server.' });
  next();
});

const auditData = (user: { id: string; displayName: string }, action: string) => ({
  actorUserId: user.id, actorName: user.displayName, establishmentId: null, refType: 'user', refId: user.id, action,
});

async function newRecoverySet(tx: any, userId: string, key: Buffer): Promise<string[]> {
  await tx.userMfaRecoveryCode.deleteMany({ where: { userId } });
  const codes = generateRecoveryCodes(RECOVERY_COUNT);
  for (const c of codes) await tx.userMfaRecoveryCode.create({ data: { userId, codeHash: hashRecovery(normalizeRecovery(c)!, key) } });
  return codes;
}

/** Génère un secret, le stocke CHIFFRÉ « en attente » ; n'active rien. Renvoie l'URI otpauth et le QR (une seule fois). */
mfaRouter.post('/setup', requireAuth, asyncHandler(async (req, res) => {
  const key = parseMfaKey();
  if (!key) return res.status(503).json({ success: false, code: 'MFA_KEY_MISSING', message: 'Two-factor authentication is not configured on this server.' });
  const me = req.user!;
  const existing = await db.userMfa.findUnique({ where: { userId: me.id }, select: { enabledAt: true } });
  if (existing?.enabledAt) return res.status(409).json({ success: false, code: 'ALREADY_ENABLED', message: 'Two-factor authentication is already enabled. Disable it first to set it up again.' });
  const secret = generateSecret();
  const secretEnc = encryptSecret(secret, me.id, key);
  await db.userMfa.upsert({
    where: { userId: me.id },
    create: { userId: me.id, secretEnc },
    update: { secretEnc, enabledAt: null, lastUsedStep: null, failedAttempts: 0, lockedUntil: null },
  });
  const otpauthUrl = generateURI({ issuer: MFA_ISSUER, label: me.email, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
  noStore(res);
  return res.json({ success: true, otpauthUrl, qrDataUrl, manualKey: secret });
}));

/**
 * Confirme avec un code TOTP valide ET le mot de passe, active, renvoie 10 codes de récupération (UNE SEULE FOIS).
 * Le mot de passe est exigé ici (écart justifié par rapport à « requireAuth seul ») : avec un simple cookie volé, un
 * attaquant pourrait sinon activer SON application d'authentification et enfermer le propriétaire hors de son compte.
 */
mfaRouter.post('/enable', requireAuth, asyncHandler(async (req, res) => {
  const key = parseMfaKey();
  if (!key) return res.status(503).json({ success: false, code: 'MFA_KEY_MISSING', message: 'Two-factor authentication is not configured on this server.' });
  const row = await db.userMfa.findUnique({ where: { userId: req.user!.id }, select: { enabledAt: true } });
  if (!row || row.enabledAt) return res.status(409).json({ success: false, code: 'NOT_PENDING', message: 'No pending two-factor setup. Start the setup first.' });
  const user = await db.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ success: false, message: 'Not signed in.' });
  const gate = await checkPasswordAndCode(db, user, req.body?.password, req.body?.code, { allowPending: true, allowRecovery: false });
  if (!gate.ok) return res.status(gate.status).json({ success: false, code: gate.code, message: gate.message });
  const codes = await db.$transaction(async (tx: any) => {
    await tx.userMfa.update({ where: { userId: user.id }, data: { enabledAt: new Date() } });
    const set = await newRecoverySet(tx, user.id, key);
    await tx.auditEntry.create({ data: auditData(user, 'Authentification à deux facteurs activée') });
    return set;
  });
  noStore(res);
  return res.json({ success: true, recoveryCodes: codes });
}));

/** Désactive : exige le mot de passe ET un code TOTP ou un code de récupération. */
mfaRouter.post('/disable', requireAuth, asyncHandler(async (req, res) => {
  const row = await db.userMfa.findUnique({ where: { userId: req.user!.id }, select: { enabledAt: true } });
  if (!row?.enabledAt) return res.status(409).json({ success: false, code: 'NOT_ENABLED', message: 'Two-factor authentication is not enabled.' });
  const user = await db.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ success: false, message: 'Not signed in.' });
  const gate = await checkPasswordAndCode(db, user, req.body?.password, req.body?.code, { allowRecovery: true });
  if (!gate.ok) return res.status(gate.status).json({ success: false, code: gate.code, message: gate.message });
  await db.$transaction(async (tx: any) => {
    await tx.userMfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.userMfa.delete({ where: { userId: user.id } });
    await tx.auditEntry.create({ data: auditData(user, 'Authentification à deux facteurs désactivée') });
  });
  return res.json({ success: true });
}));

/** Nouveaux codes de récupération (les anciens deviennent invalides) : mot de passe + code TOTP exigés. */
mfaRouter.post('/recovery-codes/regenerate', requireAuth, asyncHandler(async (req, res) => {
  const key = parseMfaKey();
  if (!key) return res.status(503).json({ success: false, code: 'MFA_KEY_MISSING', message: 'Two-factor authentication is not configured on this server.' });
  const row = await db.userMfa.findUnique({ where: { userId: req.user!.id }, select: { enabledAt: true } });
  if (!row?.enabledAt) return res.status(409).json({ success: false, code: 'NOT_ENABLED', message: 'Two-factor authentication is not enabled.' });
  const user = await db.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ success: false, message: 'Not signed in.' });
  const gate = await checkPasswordAndCode(db, user, req.body?.password, req.body?.code, { allowRecovery: false });
  if (!gate.ok) return res.status(gate.status).json({ success: false, code: gate.code, message: gate.message });
  const codes = await db.$transaction(async (tx: any) => {
    const set = await newRecoverySet(tx, user.id, key);
    await tx.auditEntry.create({ data: auditData(user, 'Authentification à deux facteurs : codes de récupération régénérés') });
    return set;
  });
  noStore(res);
  return res.json({ success: true, recoveryCodes: codes });
}));

// Évite qu'une erreur inattendue d'une route 2FA ne divulgue quoi que ce soit : journal sans contenu, 500 générique.
mfaRouter.use((err: unknown, _req: any, res: Response, _next: any) => {
  console.error('[mfa] request failed:', describeError(err));
  res.status(500).json({ success: false, message: 'Could not complete the request.' });
});
