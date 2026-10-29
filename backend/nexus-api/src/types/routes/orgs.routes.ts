import { Router } from 'express';
import { notifyTeamInvitation } from '../services/supplierNotify';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { HEALTHCARE_REGISTRATION_TYPES, JOINABLE_ESTABLISHMENT_TYPES } from '../lib/roleMapping';
import { canHaveDepartment } from '../lib/scope';
import { WORKER_ROLES as WORKER_ROLE_SET, isOrgTypeAllowedForRole, parseProfessionalDetails } from '../lib/membershipRules';

/**
 * Organization membership — "Self-registration + Join Organization + Invitation".
 *
 *   A person registers alone (POST /api/auth/signup) and gets NO organization
 *   rights. They become a member of an organization in exactly two ways, and
 *   both end with a UserEstablishment row whose status is ACTIVE:
 *
 *     1. JOIN REQUEST  — the person searches an organization and asks to join
 *                        (row created as PENDING, initiatedBy USER); an admin of
 *                        that organization approves or rejects it.
 *     2. INVITATION    — an admin of the organization invites an e-mail address
 *                        (OrganizationInvitation); the signed-in person with that
 *                        e-mail accepts it.
 *
 *   Searching an organization by name never proves belonging. Only ACTIVE rows
 *   count anywhere else in the API (see attachUser). One account can be an ACTIVE
 *   member of several organizations (UserEstablishment is many-to-many).
 *
 *   "Org admin" = memberRole ADMIN on an ACTIVE membership of that organization,
 *   and the user's global role must be ORG_ADMIN. Product-provider accounts
 *   (ESTABLISHMENT_ADMIN) never manage members here.
 */
export const orgsRouter = Router();

orgsRouter.use(requireAuth);

const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, message });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPLIER_TEAM_MAX = 25;

/** Roles that may ask to join an organization / accept an invitation as a worker. */
const WORKER_ROLES = [...WORKER_ROLE_SET];

/** Route guard: caller must be an org-level admin of :id (ORG_ADMIN + ACTIVE ADMIN membership). */
function requireOrgAdmin(req: Request, res: Response, next: NextFunction) {
  const me = req.user!;
  // ORG_ADMIN = administrateur d'un établissement de santé ; FOURNISSEUR (membre ADMIN) = administrateur de SA société
  // (il invite et retire ses employés). Dans les deux cas : seulement pour l'organisation dont il est administrateur ACTIF.
  if ((me.role !== 'ORG_ADMIN' && me.role !== 'FOURNISSEUR') || !me.adminEstablishmentIds.includes(req.params.id)) {
    return fail(res, 403, 'Only an administrator of this organization can do that.');
  }
  next();
}

// ---------------------------------------------------------------------------
// Worker side
// ---------------------------------------------------------------------------

/**
 * GET /api/orgs/search?q=
 * Public-safe directory: id, name, type only. Never returns members or e-mails.
 */
const TYPE_WORDS: Record<string, string[]> = {
  HOSPITAL: ['hopital', 'hospital', 'chu', 'مستشفى'],
  CLINIQUE: ['clinique', 'clinic'],
  CENTRE_MEDICAL: ['centre medical', 'centre', 'medical centre', 'medical center'],
  OFFICINE: ['pharmacie', 'officine', 'pharmacy'],
  LABORATOIRE: ['laboratoire', 'laboratory', 'labo'],
};

orgsRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 1) return res.json({ success: true, organizations: [] });
    // On cherche dans le nom, et aussi par type (« hôpital », « clinique », « laboratoire »… en français ou anglais).
    const flat = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const byType = Object.entries(TYPE_WORDS)
      .filter(([, words]) => flat.length >= 3 && words.some((w) => w.startsWith(flat)))
      .map(([type]) => type)
      .filter((t) => (JOINABLE_ESTABLISHMENT_TYPES as string[]).includes(t)) as typeof JOINABLE_ESTABLISHMENT_TYPES;
    const rows = await prisma.establishment.findMany({
      where: {
        isSystemReserved: false,
        type: { in: JOINABLE_ESTABLISHMENT_TYPES },
        OR: [{ name: { contains: q } }, ...(byType.length ? [{ type: { in: byType } }] : [])],
      },
      orderBy: { name: 'asc' },
      take: 10,
      select: { id: true, name: true, type: true },
    });
    res.json({ success: true, organizations: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orgs/mine
 * My memberships (every status) + the invitations addressed to my e-mail.
 */
orgsRouter.get('/mine', async (req, res, next) => {
  try {
    const me = req.user!;
    const [memberships, invitations] = await Promise.all([
      prisma.userEstablishment.findMany({
        where: { userId: me.id, establishment: { isSystemReserved: false } },
        orderBy: { createdAt: 'asc' },
        include: { establishment: { select: { id: true, name: true, type: true } } },
      }),
      prisma.organizationInvitation.findMany({
        where: { email: me.email.toLowerCase(), status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: { establishment: { select: { id: true, name: true, type: true } } },
      }),
    ]);
    res.json({
      success: true,
      memberships: memberships.map((m) => ({
        id: m.id,
        status: m.status,
        memberRole: m.memberRole,
        isActiveContext: m.isActiveContext,
        organization: m.establishment,
      })),
      invitations: invitations.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        organization: i.establishment,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/orgs/:id/join-requests — ask to join (becomes PENDING until an admin decides). */
orgsRouter.post('/:id/join-requests', async (req, res, next) => {
  try {
    const me = req.user!;
    if (!WORKER_ROLES.includes(me.role)) {
      return fail(res, 403, 'Only healthcare professionals can ask to join an organization.');
    }
    const org = await prisma.establishment.findUnique({ where: { id: req.params.id } });
    if (!org || org.isSystemReserved || !JOINABLE_ESTABLISHMENT_TYPES.includes(org.type)) {
      return fail(res, 404, 'Organization not found.');
    }

    // A pharmacist can join a pharmacy or a care establishment, a doctor never a pharmacy, etc.
    if (!isOrgTypeAllowedForRole(me.role, org.type)) {
      return fail(res, 403, 'This account type cannot work in this kind of organization.');
    }
    // Optional { profession, department } (department = what the person says; the admin attaches the real service).
    // From the "Mon organisation" search the department is optional (set on approval), an invalid profession is not.
    const details = parseProfessionalDetails(
      me.role,
      org.type,
      { profession: req.body?.profession, department: req.body?.department },
      { requireDepartment: false }
    );
    if (!details.ok) return fail(res, 400, details.message);
    const { requestedDepartment, profession } = details;

    const existing = await prisma.userEstablishment.findUnique({
      where: { userId_establishmentId: { userId: me.id, establishmentId: org.id } },
    });
    if (existing?.status === 'ACTIVE') return fail(res, 409, 'You are already a member of this organization.');
    if (existing?.status === 'PENDING') return fail(res, 409, 'Your request is already waiting for approval.');

    if (profession) await prisma.user.update({ where: { id: me.id }, data: { profession } });

    // A REJECTED request may be re-submitted: the same row goes back to PENDING.
    if (existing) {
      await prisma.userEstablishment.update({
        where: { id: existing.id },
        data: { status: 'PENDING', initiatedBy: 'USER', decidedAt: null, requestedDepartment },
      });
    } else {
      await prisma.userEstablishment.create({
        data: {
          userId: me.id,
          establishmentId: org.id,
          status: 'PENDING',
          memberRole: 'MEMBER',
          initiatedBy: 'USER',
          isActiveContext: false,
          requestedDepartment,
        },
      });
    }
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/orgs/:id/join-requests — cancel my own pending request. */
orgsRouter.delete('/:id/join-requests', async (req, res, next) => {
  try {
    const me = req.user!;
    const row = await prisma.userEstablishment.findUnique({
      where: { userId_establishmentId: { userId: me.id, establishmentId: req.params.id } },
    });
    if (!row || row.status !== 'PENDING') return fail(res, 404, 'No pending request found.');
    await prisma.userEstablishment.delete({ where: { id: row.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/orgs/:id/leave — leave an organization I am an ACTIVE member of. */
orgsRouter.post('/:id/leave', async (req, res, next) => {
  try {
    const me = req.user!;
    const row = await prisma.userEstablishment.findUnique({
      where: { userId_establishmentId: { userId: me.id, establishmentId: req.params.id } },
    });
    if (!row || row.status !== 'ACTIVE') return fail(res, 404, 'You are not a member of this organization.');
    if (row.memberRole === 'ADMIN' && (await countActiveAdmins(row.establishmentId)) <= 1) {
      return fail(res, 409, 'You are the only administrator. Appoint another one before leaving.');
    }
    await prisma.userEstablishment.delete({ where: { id: row.id } });
    await ensureActiveContext(me.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/orgs/invitations/:invId/accept — only the signed-in owner of the invited e-mail. */
orgsRouter.post('/invitations/:invId/accept', async (req, res, next) => {
  try {
    const me = req.user!;
    const inv = await prisma.organizationInvitation.findUnique({ where: { id: req.params.invId } });
    if (!inv || inv.status !== 'PENDING' || inv.email !== me.email.toLowerCase()) {
      return fail(res, 404, 'Invitation not found.');
    }
    const isSupplierAccount = me.role === 'FOURNISSEUR';
    if (!WORKER_ROLES.includes(me.role) && !isSupplierAccount) {
      return fail(res, 403, 'This account type cannot join an organization as staff.');
    }
    const invOrg = await prisma.establishment.findUnique({ where: { id: inv.establishmentId }, select: { type: true } });
    // Un employé de fournisseur ne rejoint qu'une société fournisseur (et inversement : un médecin ne rejoint jamais un fournisseur).
    const typeOk = isSupplierAccount ? invOrg?.type === 'SUPPLIER' : !!invOrg && isOrgTypeAllowedForRole(me.role, invOrg.type);
    if (!invOrg || !typeOk) {
      return fail(res, 403, 'This account type cannot work in this kind of organization.');
    }
    // Le dirigeant d'une société fournisseur n'est pas l'employé d'une autre (pas de mélange des rôles).
    if (isSupplierAccount && me.adminEstablishmentIds.length > 0) {
      return fail(res, 403, 'An account that manages its own company cannot join another one as staff.');
    }
    await prisma.$transaction(async (tx) => {
      const existing = await tx.userEstablishment.findUnique({
        where: { userId_establishmentId: { userId: me.id, establishmentId: inv.establishmentId } },
      });
      if (existing) {
        await tx.userEstablishment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', decidedAt: new Date(), initiatedBy: existing.status === 'ACTIVE' ? existing.initiatedBy : 'ORG' },
        });
      } else {
        await tx.userEstablishment.create({
          data: {
            userId: me.id,
            establishmentId: inv.establishmentId,
            status: 'ACTIVE',
            memberRole: 'MEMBER',
            initiatedBy: 'ORG',
            decidedAt: new Date(),
            isActiveContext: false,
          },
        });
      }
      await tx.organizationInvitation.update({
        where: { id: inv.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
    });
    await ensureActiveContext(me.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/orgs/invitations/:invId/decline */
orgsRouter.post('/invitations/:invId/decline', async (req, res, next) => {
  try {
    const me = req.user!;
    const inv = await prisma.organizationInvitation.findUnique({ where: { id: req.params.invId } });
    if (!inv || inv.status !== 'PENDING' || inv.email !== me.email.toLowerCase()) {
      return fail(res, 404, 'Invitation not found.');
    }
    await prisma.organizationInvitation.update({
      where: { id: inv.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Org admin side
// ---------------------------------------------------------------------------

/** GET /api/orgs/:id/overview — members, pending join requests, pending invitations. */
/**
 * GET /api/orgs/:id/members — colleagues of an organization I am an ACTIVE member of.
 * Names, professional role and org-level role only: never e-mails or pending requests.
 */
orgsRouter.get('/:id/members', async (req, res, next) => {
  try {
    const me = req.user!;
    const id = req.params.id;
    if (!me.affiliatedEstablishmentIds.includes(id)) {
      return fail(res, 403, 'You are not a member of this organization.');
    }
    const rows = await prisma.userEstablishment.findMany({
      where: { establishmentId: id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, displayName: true, role: true, deactivatedAt: true } } },
    });
    res.json({
      success: true,
      members: rows
        .filter((m) => !m.user.deactivatedAt)
        .map((m) => ({
          userId: m.user.id,
          displayName: m.user.displayName,
          role: m.user.role,
          memberRole: m.memberRole,
          since: m.createdAt,
        })),
    });
  } catch (err) {
    next(err);
  }
});

orgsRouter.get('/:id/overview', requireOrgAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;
    const [org, rows, invitations, departments] = await Promise.all([
      prisma.establishment.findUnique({ where: { id }, select: { id: true, name: true, type: true } }),
      prisma.userEstablishment.findMany({
        where: { establishmentId: id, status: { in: ['ACTIVE', 'PENDING'] } },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, displayName: true, email: true, role: true, profession: true } }, department: { select: { id: true, name: true } } },
      }),
      prisma.organizationInvitation.findMany({
        where: { establishmentId: id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }),
      // Services de l'établissement (tableau de bord et page Personnel de l'administrateur).
      Promise.resolve((prisma as any).department?.findMany?.({ where: { establishmentId: id }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) ?? []).catch(() => []),
    ]);
    if (!org) return fail(res, 404, 'Organization not found.');

    const card = (m: (typeof rows)[number]) => ({
      membershipId: m.id,
      userId: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.user.role,
      memberRole: m.memberRole,
      initiatedBy: m.initiatedBy,
      since: m.createdAt,
      // What the person declared at sign-up / in the join request (informative; the admin decides the real service).
      profession: (m.user as any).profession ?? null,
      requestedDepartment: canHaveDepartment(m.user.role) || m.user.role === 'PHARMACIEN' || m.user.role === 'LABO' ? (m as any).requestedDepartment ?? null : null,
      // A stale service on a pharmacy / laboratory / vigilance membership is never shown: they serve the whole establishment.
      departmentId: canHaveDepartment(m.user.role) ? (m as any).department?.id ?? null : null,
      departmentName: canHaveDepartment(m.user.role) ? (m as any).department?.name ?? null : null,
    });
    res.json({
      success: true,
      organization: org,
      members: rows.filter((m) => m.status === 'ACTIVE').map(card),
      requests: rows.filter((m) => m.status === 'PENDING').map(card),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, createdAt: i.createdAt })),
      departments: (departments as any[]).map((d) => ({
        id: d.id, name: d.name,
        members: rows.filter((m) => m.status === 'ACTIVE' && canHaveDepartment(m.user.role) && (m as any).department?.id === d.id).length,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Services (departments) and who belongs to them.
 *  - Only doctors and medical staff are attached to ONE service.
 *  - Pharmacy and laboratory staff (and vigilance managers / admins) work for the WHOLE establishment:
 *    the server refuses to attach them to a service (see lib/scope.ts).
 */
async function checkDepartment(
  orgId: string,
  userRole: string,
  departmentId: unknown
): Promise<{ ok: true; id: string | null } | { ok: false; message: string }> {
  if (departmentId === null || departmentId === undefined || departmentId === '') return { ok: true, id: null };
  if (typeof departmentId !== 'string') return { ok: false, message: 'departmentId is invalid.' };
  if (!canHaveDepartment(userRole)) {
    return {
      ok: false,
      message:
        'Pharmacy, laboratory and vigilance accounts work for the whole establishment: they cannot be attached to a service.',
    };
  }
  const dep = await prisma.department.findFirst({ where: { id: departmentId, establishmentId: orgId } });
  if (!dep) return { ok: false, message: 'Unknown service for this organization.' };
  return { ok: true, id: dep.id };
}

/** POST /api/orgs/:id/departments   Body: { name } — creates a service (hospital / clinic / medical centre only). */
orgsRouter.post('/:id/departments', requireOrgAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 80) {
      return fail(res, 400, 'The service name must be between 2 and 80 characters.');
    }
    const org = await prisma.establishment.findUnique({ where: { id }, select: { type: true } });
    if (!org) return fail(res, 404, 'Organization not found.');
    if (!HEALTHCARE_REGISTRATION_TYPES.includes(org.type)) {
      return fail(res, 400, 'Only hospitals, clinics and medical centres have services.');
    }
    const existing = await prisma.department.findMany({ where: { establishmentId: id }, select: { name: true } });
    if (existing.some((d: { name: string }) => d.name.toLowerCase() === name.toLowerCase())) {
      return fail(res, 409, 'A service with this name already exists.');
    }
    const dep = await prisma.department.create({ data: { name, establishmentId: id } });
    res.status(201).json({ success: true, department: { id: dep.id, name: dep.name } });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/orgs/:id/members/:membershipId/department   Body: { departmentId: string | null } */
orgsRouter.patch('/:id/members/:membershipId/department', requireOrgAdmin, async (req, res, next) => {
  try {
    const row = await prisma.userEstablishment.findUnique({ where: { id: req.params.membershipId } });
    if (!row || row.establishmentId !== req.params.id || row.status !== 'ACTIVE') {
      return fail(res, 404, 'Member not found.');
    }
    const member = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!member) return fail(res, 404, 'Member not found.');
    const check = await checkDepartment(req.params.id, member.role, req.body?.departmentId);
    if (!check.ok) return fail(res, 400, check.message);
    await prisma.userEstablishment.update({ where: { id: row.id }, data: { departmentId: check.id } });
    res.json({ success: true, departmentId: check.id });
  } catch (err) {
    next(err);
  }
});

/** POST /api/orgs/:id/requests/:membershipId/approve   Body (optional): { departmentId } */
orgsRouter.post('/:id/requests/:membershipId/approve', requireOrgAdmin, async (req, res, next) => {
  try {
    const row = await prisma.userEstablishment.findUnique({ where: { id: req.params.membershipId } });
    if (!row || row.establishmentId !== req.params.id || row.status !== 'PENDING') {
      return fail(res, 404, 'Request not found.');
    }
    const data: { status: string; decidedAt: Date; departmentId?: string | null } = { status: 'ACTIVE', decidedAt: new Date() };
    if (req.body && 'departmentId' in req.body) {
      const applicant = await prisma.user.findUnique({ where: { id: row.userId } });
      if (!applicant) return fail(res, 404, 'Request not found.');
      const check = await checkDepartment(req.params.id, applicant.role, req.body.departmentId);
      if (!check.ok) return fail(res, 400, check.message);
      data.departmentId = check.id;
    } else if ((row as any).requestedDepartment) {
      // No explicit choice by the admin: if the service the person declared already exists, attach it.
      const applicant = await prisma.user.findUnique({ where: { id: row.userId } });
      if (applicant && canHaveDepartment(applicant.role)) {
        const wanted = String((row as any).requestedDepartment).trim().toLowerCase();
        const deps = await prisma.department.findMany({ where: { establishmentId: req.params.id } });
        const hit = deps.find((d: { name: string }) => d.name.trim().toLowerCase() === wanted);
        if (hit) data.departmentId = hit.id;
      }
    }
    await prisma.userEstablishment.update({ where: { id: row.id }, data });
    await ensureActiveContext(row.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/orgs/:id/requests/:membershipId/reject */
orgsRouter.post('/:id/requests/:membershipId/reject', requireOrgAdmin, async (req, res, next) => {
  try {
    const row = await prisma.userEstablishment.findUnique({ where: { id: req.params.membershipId } });
    if (!row || row.establishmentId !== req.params.id || row.status !== 'PENDING') {
      return fail(res, 404, 'Request not found.');
    }
    await prisma.userEstablishment.update({
      where: { id: row.id },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/orgs/:id/invitations  { email } */
orgsRouter.post('/:id/invitations', requireOrgAdmin, async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'Enter a valid e-mail address.');

    // Already a member (or already asked to join)? Nothing to invite.
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const m = await prisma.userEstablishment.findUnique({
        where: { userId_establishmentId: { userId: user.id, establishmentId: req.params.id } },
      });
      if (m?.status === 'ACTIVE') return fail(res, 409, 'This person is already a member.');
      if (m?.status === 'PENDING') {
        return fail(res, 409, 'This person already asked to join — approve their request instead.');
      }
    }
    const dup = await prisma.organizationInvitation.findFirst({
      where: { establishmentId: req.params.id, email, status: 'PENDING' },
    });
    if (dup) return fail(res, 409, 'An invitation is already pending for this e-mail.');

    // Une société fournisseur reste de taille raisonnable (membres actifs + invitations en attente).
    if (req.user!.role === 'FOURNISSEUR') {
      const [members, pending] = await Promise.all([
        prisma.userEstablishment.count({ where: { establishmentId: req.params.id, status: 'ACTIVE' } }),
        prisma.organizationInvitation.count({ where: { establishmentId: req.params.id, status: 'PENDING' } }),
      ]);
      if (members + pending >= SUPPLIER_TEAM_MAX) return fail(res, 409, `The team is limited to ${SUPPLIER_TEAM_MAX} people (members + pending invitations).`);
    }
    const inv = await prisma.organizationInvitation.create({
      data: { establishmentId: req.params.id, email, invitedByUserId: req.user!.id },
    });
    if (req.user!.role === 'FOURNISSEUR') {
      // Best-effort : l'invitation existe déjà, un e-mail raté ne la défait pas.
      const org = await prisma.establishment.findUnique({ where: { id: req.params.id }, select: { name: true } });
      void notifyTeamInvitation(email, org?.name ?? 'votre entreprise', req.user!.displayName);
    }
    res.status(201).json({ success: true, id: inv.id });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/orgs/:id/invitations/:invId — revoke. */
orgsRouter.delete('/:id/invitations/:invId', requireOrgAdmin, async (req, res, next) => {
  try {
    const inv = await prisma.organizationInvitation.findUnique({ where: { id: req.params.invId } });
    if (!inv || inv.establishmentId !== req.params.id || inv.status !== 'PENDING') {
      return fail(res, 404, 'Invitation not found.');
    }
    await prisma.organizationInvitation.update({
      where: { id: inv.id },
      data: { status: 'REVOKED', respondedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/orgs/:id/members/:membershipId — remove a member (never the last admin). */
orgsRouter.delete('/:id/members/:membershipId', requireOrgAdmin, async (req, res, next) => {
  try {
    const row = await prisma.userEstablishment.findUnique({ where: { id: req.params.membershipId } });
    if (!row || row.establishmentId !== req.params.id || row.status !== 'ACTIVE') {
      return fail(res, 404, 'Member not found.');
    }
    if (row.memberRole === 'ADMIN') {
      return fail(res, 409, 'An administrator cannot be removed from here.');
    }
    await prisma.userEstablishment.delete({ where: { id: row.id } });
    await ensureActiveContext(row.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function countActiveAdmins(establishmentId: string) {
  return prisma.userEstablishment.count({
    where: { establishmentId, status: 'ACTIVE', memberRole: 'ADMIN' },
  });
}

/** Keep exactly one ACTIVE membership flagged as the user's default context. */
async function ensureActiveContext(userId: string) {
  const active = await prisma.userEstablishment.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (active.length === 0 || active.some((a) => a.isActiveContext)) return;
  await prisma.userEstablishment.update({
    where: { id: active[0].id },
    data: { isActiveContext: true },
  });
}
