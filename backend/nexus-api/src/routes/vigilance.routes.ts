import { Router } from 'express';
import type { Response } from 'express';
import type { Domain, DeclarationStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { effectiveDepartmentId } from '../lib/scope';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Déclarations de vigilance saisies dans les tableaux de bord (médecin, pharmacien,
 * laboratoire, personnel médical, vigilance de l'établissement).
 *
 *   GET   /api/vigilance/declarations        ce que la session a le droit de voir
 *   POST  /api/vigilance/declarations        crée (brouillon / transmise)
 *   GET   /api/vigilance/declarations/:id
 *   PATCH /api/vigilance/declarations/:id    { status?, capaStatus?, escalated? }
 *
 * Portée — dérivée UNIQUEMENT de la session, jamais de la requête :
 *  - tout le monde voit ce qu'il a lui-même rédigé ;
 *  - VIGILANCE_REVIEWER, HOSPITAL (vigilance qualité) et ORG_ADMIN voient aussi les
 *    déclarations des établissements dont ils sont membres ACTIFS ;
 *  - médecins, pharmaciens et laborantins ne voient PAS celles de leurs collègues
 *    (elles peuvent contenir des données patient).
 * organizationId / auteur / rôle sont écrits par le serveur ; ceux du client sont ignorés.
 */
export const vigilanceRouter = Router();
vigilanceRouter.use(requireAuth);

const fail = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

const MAX_RECORD_BYTES = 64 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{6,80}$/;

export type UiStatus = 'draft' | 'review' | 'sent' | 'analysis' | 'closed';
const UI_STATUSES: readonly UiStatus[] = ['draft', 'review', 'sent', 'analysis', 'closed'];
const CAPA_STATUSES = ['none', 'proposed', 'validated', 'rejected'] as const;

const DB_STATUS: Record<UiStatus, DeclarationStatus> = {
  draft: 'DRAFT',
  review: 'SUBMITTED',
  sent: 'SUBMITTED',
  analysis: 'UNDER_REVIEW',
  closed: 'CLOSED',
};

const DOMAIN_BY_LABEL: Record<string, Domain> = {
  Pharmacovigilance: 'PHARMACOVIGILANCE',
  Matériovigilance: 'MATERIOVIGILANCE',
  Cosmétovigilance: 'COSMETOVIGILANCE',
  Chemovigilance: 'CHEMOVIGILANCE',
  // Pas de valeur dédiée dans l'enum : les réactifs sont des dispositifs médicaux de DIV.
  Réactovigilance: 'MATERIOVIGILANCE',
};

/** Rôles qui revoient les déclarations de leur établissement. */
// Le personnel médical (HOSPITAL) n'est PAS relecteur : il ne voit que ses propres déclarations, comme un médecin.
const REVIEW_ROLES: ReadonlySet<string> = new Set(['VIGILANCE_REVIEWER', 'ORG_ADMIN']);
const WRITE_ROLES: ReadonlySet<string> = new Set(['PATIENT', 'DOCTOR', 'PHARMACIEN', 'LABO', 'HOSPITAL', 'VIGILANCE_REVIEWER', 'ORG_ADMIN']);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Retire du record client tout ce que le serveur écrit lui-même. */
const SERVER_OWNED = ['id', 'ref', 'date', 'organizationId', 'authoredByUserId', 'authoredByRole', 'status', 'capaStatus', 'escalated', 'vigilanceKind', 'updatedAt', 'createdAt'];

interface StoredPayload {
  kind: 'dr' | 'lab';
  record: Record<string, unknown>;
  status: UiStatus;
  capaStatus: string;
  escalated: boolean;
  ref: string;
  authoredByRole: string;
}

function toDto(row: any) {
  const p = row.payload as StoredPayload;
  const reserved = !!row.establishment?.isSystemReserved;
  return {
    ...p.record,
    id: row.id,
    ref: p.ref,
    vigilanceKind: p.kind, // 'dr' | 'lab' ; `kind` (incident/panne) reste celui du record
    date: new Date(row.createdAt).toLocaleDateString('fr-FR'),
    status: p.status,
    capaStatus: p.capaStatus,
    escalated: p.escalated,
    organizationId: reserved ? null : row.establishmentId,
    authoredByUserId: row.authorUserId,
    authoredByRole: p.authoredByRole,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function roleLabel(role: string): string {
  switch (role) {
    case 'PATIENT': return 'patient';
    case 'DOCTOR': return 'doctor';
    case 'PHARMACIEN': return 'pharmacist';
    case 'LABO': return 'laboratory_staff';
    case 'HOSPITAL': return 'medical_staff';
    case 'VIGILANCE_REVIEWER': return 'vigilance_responsible';
    case 'ORG_ADMIN': return 'administrator';
    default: return role.toLowerCase();
  }
}

type SessionUser = NonNullable<Express.Request['user']>;

export function visibilityWhere(user: SessionUser) {
  const own = { authorUserId: user.id };
  if (REVIEW_ROLES.has(user.role) && user.affiliatedEstablishmentIds.length > 0) {
    return { OR: [own, { establishmentId: { in: user.affiliatedEstablishmentIds } }] };
  }
  return own;
}

async function receivingEstablishmentId(user: SessionUser): Promise<string | null> {
  if (user.activeEstablishmentId) return user.activeEstablishmentId;
  const central = await prisma.establishment.findFirst({ where: { isSystemReserved: true } });
  return central?.id ?? null;
}

async function nextRef(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const since = new Date(year, 0, 1);
  const n = await prisma.declaration.count({ where: { createdAt: { gte: since } } });
  return `#${prefix}-${year}-${String(100 + n + 1).padStart(3, '0')}`;
}

const REF_PREFIXES = new Set(['PV', 'MV', 'CV', 'CH', 'RV']);
const LAB_TYPE_DOMAIN: Record<string, Domain> = {
  medicament: 'PHARMACOVIGILANCE',
  dispositif: 'MATERIOVIGILANCE',
  cosmetique: 'COSMETOVIGILANCE',
  chimique: 'CHEMOVIGILANCE',
  reactif: 'MATERIOVIGILANCE',
};

vigilanceRouter.get('/declarations', asyncHandler(async (req, res) => {
  const user = req.user!;
  const rows = await prisma.declaration.findMany({
    where: visibilityWhere(user),
    include: { establishment: { select: { isSystemReserved: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json({ success: true, declarations: rows.map(toDto) });
}));

vigilanceRouter.get('/declarations/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!ID_RE.test(id)) return fail(res, 404, 'Déclaration introuvable.');
  const row = await prisma.declaration.findFirst({
    where: { id, ...visibilityWhere(req.user!) },
    include: { establishment: { select: { isSystemReserved: true } } },
  });
  // 404 (pas 403) : on ne confirme pas l'existence d'une déclaration hors portée.
  if (!row) return fail(res, 404, 'Déclaration introuvable.');
  res.json({ success: true, declaration: toDto(row) });
}));

vigilanceRouter.post('/declarations', asyncHandler(async (req, res) => {
  const user = req.user!;
  if (!WRITE_ROLES.has(user.role)) return fail(res, 403, "Votre profil ne peut pas créer de déclaration depuis ce tableau de bord.", 'FORBIDDEN');

  const body = req.body;
  if (!isPlainObject(body) || !isPlainObject(body.record)) return fail(res, 400, 'Déclaration invalide.', 'VALIDATION_ERROR');
  const kind = body.kind === 'lab' ? 'lab' : body.kind === 'dr' ? 'dr' : null;
  if (!kind) return fail(res, 400, 'Type de déclaration invalide.', 'VALIDATION_ERROR');

  const record: Record<string, unknown> = { ...body.record };
  for (const k of SERVER_OWNED) delete record[k];
  if (Buffer.byteLength(JSON.stringify(record)) > MAX_RECORD_BYTES) return fail(res, 413, 'Déclaration trop volumineuse.', 'TOO_LARGE');

  const wanted = typeof body.status === 'string' ? (body.status as UiStatus) : 'sent';
  // À la création : brouillon, à valider ou transmise. Analyse / clôture appartiennent à la vigilance.
  if (!['draft', 'review', 'sent'].includes(wanted)) return fail(res, 400, 'Statut initial invalide.', 'VALIDATION_ERROR');

  const severity = record.severity;
  if (severity !== undefined && !['legere', 'moderee', 'grave'].includes(String(severity))) return fail(res, 400, 'Gravité invalide.', 'VALIDATION_ERROR');

  const domain: Domain | undefined =
    kind === 'lab' ? LAB_TYPE_DOMAIN[String(record.productType ?? '')] : DOMAIN_BY_LABEL[String(record.domain ?? '')];
  if (!domain) return fail(res, 400, 'Domaine de vigilance invalide.', 'VALIDATION_ERROR');

  const prefix = REF_PREFIXES.has(String(body.refPrefix)) ? String(body.refPrefix) : 'PV';
  const establishmentId = await receivingEstablishmentId(user);
  if (!establishmentId) return fail(res, 503, "Aucun établissement destinataire n'est configuré.", 'NO_ESTABLISHMENT');

  const ref = await nextRef(prefix);
  const payload: StoredPayload = {
    kind,
    record,
    status: wanted,
    capaStatus: 'none',
    escalated: body.escalated === true,
    ref,
    authoredByRole: roleLabel(user.role),
  };
  const row = await prisma.declaration.create({
    data: {
      domain,
      reporterRole: user.role as Role,
      authorUserId: user.id,
      establishmentId,
      // Service de l'auteur (médecin / personnel médical uniquement) ; null pour pharmacie, laboratoire, vigilance, admin.
      departmentId: establishmentId === user.activeEstablishmentId ? effectiveDepartmentId(user.role, user.activeDepartmentId) : null,
      status: DB_STATUS[wanted],
      payload: payload as any,
    },
    include: { establishment: { select: { isSystemReserved: true } } },
  });
  res.status(201).json({ success: true, declaration: toDto(row) });
}));

vigilanceRouter.patch('/declarations/:id', asyncHandler(async (req, res) => {
  const user = req.user!;
  const id = String(req.params.id);
  if (!ID_RE.test(id)) return fail(res, 404, 'Déclaration introuvable.');
  const row = await prisma.declaration.findFirst({
    where: { id, ...visibilityWhere(user) },
    include: { establishment: { select: { isSystemReserved: true } } },
  });
  if (!row) return fail(res, 404, 'Déclaration introuvable.');

  const body = isPlainObject(req.body) ? req.body : {};
  const p = row.payload as unknown as StoredPayload;
  const isAuthor = row.authorUserId === user.id;
  const isReviewer = REVIEW_ROLES.has(user.role) && user.affiliatedEstablishmentIds.includes(row.establishmentId);

  const next: StoredPayload = { ...p };

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !UI_STATUSES.includes(body.status as UiStatus)) return fail(res, 400, 'Statut invalide.', 'VALIDATION_ERROR');
    const target = body.status as UiStatus;
    if (p.status === 'closed' && target !== 'closed') return fail(res, 409, 'Une déclaration clôturée ne peut pas être rouverte.', 'ALREADY_CLOSED');
    const authorMay = isAuthor && target !== 'analysis';
    if (!isReviewer && !authorMay) return fail(res, 403, "Vous ne pouvez pas modifier ce statut.", 'FORBIDDEN');
    next.status = target;
  }
  if (body.capaStatus !== undefined) {
    if (!isReviewer) return fail(res, 403, 'Seule la vigilance de l’établissement peut modifier le suivi CAPA.', 'FORBIDDEN');
    if (typeof body.capaStatus !== 'string' || !(CAPA_STATUSES as readonly string[]).includes(body.capaStatus)) return fail(res, 400, 'Statut CAPA invalide.', 'VALIDATION_ERROR');
    next.capaStatus = body.capaStatus;
  }
  if (body.escalated !== undefined) {
    if (typeof body.escalated !== 'boolean') return fail(res, 400, 'Valeur invalide.', 'VALIDATION_ERROR');
    if (!isReviewer && !isAuthor) return fail(res, 403, 'Action non autorisée.', 'FORBIDDEN');
    next.escalated = body.escalated;
  }

  const updated = await prisma.declaration.update({
    where: { id },
    data: { status: DB_STATUS[next.status], payload: next as any },
    include: { establishment: { select: { isSystemReserved: true } } },
  });
  res.json({ success: true, declaration: toDto(updated) });
}));
