import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password';
import { mailConfigured, sendMail } from '../lib/email';
import { normalizeEmail } from '../lib/email-address';

export const RESET_TTL_MS = 30 * 60_000;
export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** True when reset links can actually be delivered (SMTP + public base URL). */
export function resetAvailable(env: NodeJS.ProcessEnv = process.env) {
  return mailConfigured(env) && Boolean(env.APP_BASE_URL);
}

/**
 * Creates a single-use token for an existing, active account and e-mails the link.
 * Resolves silently (same observable behaviour) when the account does not exist.
 * Rejects only when delivery fails for an existing account — the caller must NOT turn that
 * into a different HTTP response (it would reveal the account exists), only log it.
 */
export async function requestPasswordReset(db: PrismaClient, emailRaw: unknown, now = new Date()) {
  const email = normalizeEmail(emailRaw);
  const user = email ? await db.user.findFirst({ where: { email } }) : null;
  if (!user || user.deactivatedAt) return { sent: false };

  const token = crypto.randomBytes(32).toString('base64url');
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }), // only the newest link works
    db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) } }),
  ]);

  const base = process.env.APP_BASE_URL!.replace(/\/+$/, '');
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: 'VigiCore NEXUS — réinitialisation du mot de passe',
    text:
      `Bonjour ${user.displayName},\n\n` +
      `Une réinitialisation du mot de passe a été demandée pour votre compte.\n` +
      `Ce lien est valable 30 minutes et ne peut être utilisé qu'une seule fois :\n\n${link}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n`,
  });
  return { sent: true };
}

export type ConfirmResult = { ok: true } | { ok: false; reason: 'INVALID_OR_EXPIRED' };

/** Validates the token, then sets the password. Atomic + single-use; ends all existing sessions. */
export async function confirmPasswordReset(db: PrismaClient, token: unknown, newPassword: string, now = new Date()): Promise<ConfirmResult> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return { ok: false, reason: 'INVALID_OR_EXPIRED' };
  const rec = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!rec || rec.usedAt || rec.expiresAt <= now || rec.user.deactivatedAt) return { ok: false, reason: 'INVALID_OR_EXPIRED' };

  const passwordHash = await hashPassword(newPassword);
  const consumed = await db.$transaction(async (tx) => {
    // Compare-and-set: of two concurrent requests with the same token only one gets count === 1.
    const r = await tx.passwordResetToken.updateMany({ where: { id: rec.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (r.count !== 1) return false;
    await tx.user.update({ where: { id: rec.userId }, data: { passwordHash, passwordChangedAt: now } });
    await tx.passwordResetToken.deleteMany({ where: { userId: rec.userId, id: { not: rec.id } } });
    return true;
  });
  return consumed ? { ok: true } : { ok: false, reason: 'INVALID_OR_EXPIRED' };
}
