import type { NextFunction, Request, Response } from 'express';

/**
 * VigiCore staff = users whose email is in PLATFORM_ADMIN_EMAILS (comma
 * separated). Deliberately NOT a Role enum value: adding a role is a locked
 * architecture decision (see Role in schema.prisma), and an env allow-list
 * keeps "who can mark an order as paid" out of the database and out of
 * reach of self-service signup.
 */
export function isPlatformAdmin(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!email) return false;
  const allowed = (env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, message: 'You must be signed in.' });
  if (!isPlatformAdmin(req.user.email)) {
    return res.status(403).json({ success: false, message: 'This area is for VigiCore staff only.' });
  }
  next();
}
