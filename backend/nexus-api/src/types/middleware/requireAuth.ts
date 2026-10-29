import type { NextFunction, Request, Response } from 'express';
import type { UserEstablishment } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { SESSION_COOKIE_NAME, verifySessionToken } from '../lib/jwt';
import { effectiveDepartmentId } from '../lib/scope';

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  affiliatedEstablishmentIds: string[];
  activeEstablishmentId: string | null;
  /** Service (department) of the active membership. Always null for pharmacy / laboratory / vigilance / admin accounts: they work for the whole establishment (see lib/scope.ts). */
  activeDepartmentId?: string | null;
  activeDepartmentName?: string | null;
  /** Establishments where this user is an org-level ADMIN (memberRole = ADMIN, status = ACTIVE). */
  adminEstablishmentIds: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser | null;
    }
  }
}

/**
 * Resolves the session cookie (if any) into req.user. Never rejects the
 * request itself — routes that require auth check req.user and respond
 * 401 themselves, matching the { success: false, message } contract every
 * route in this API follows. Public routes (e.g. GET /services) read
 * req.user only to decide what to include, never to gate access outright.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = null;
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return next();

  const payload = verifySessionToken(token);
  if (!payload) return next();

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { affiliations: { include: { department: { select: { name: true } } } } },
  });
  // A deactivated account has no session any more, even with a still-valid cookie.
  if (!user || user.deactivatedAt) return next();
  // A password change/reset ends every session issued before it.
  if (user.passwordChangedAt && (payload.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)) return next();

  // Only APPROVED memberships give any access. A PENDING join request (or a
  // REJECTED one) must never widen what the user can see or do.
  const memberships = user.affiliations.filter((a: UserEstablishment) => a.status === 'ACTIVE');
  const active = memberships.find((a: UserEstablishment) => a.isActiveContext) ?? memberships[0];

  const activeDepartmentId = effectiveDepartmentId(user.role, active?.departmentId);

  req.user = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    affiliatedEstablishmentIds: memberships.map((a: UserEstablishment) => a.establishmentId),
    activeEstablishmentId: active?.establishmentId ?? null,
    activeDepartmentId,
    activeDepartmentName: activeDepartmentId ? ((active as any)?.department?.name ?? null) : null,
    adminEstablishmentIds: memberships
      .filter((a: UserEstablishment) => a.memberRole === 'ADMIN')
      .map((a: UserEstablishment) => a.establishmentId),
  };
  next();
}

/** Route guard: 401s if attachUser didn't find a valid session. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'You must be signed in.' });
  }
  next();
}
