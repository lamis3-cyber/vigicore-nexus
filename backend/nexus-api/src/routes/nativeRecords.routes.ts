/**
 * Enregistrements NATIFS Nexus (modèle `Declaration`) + file de vigilance de l'établissement.
 * Complète /api/declarations (qui, lui, livre à Audit) pour les déclarations qui n'ont PAS vocation à
 * partir chez un fabricant :
 *
 *   INTERNAL_PANNE : panne technique réservée à l'établissement de l'auteur (suivi interne).
 *                    Un impact exposed/injury est REFUSÉ ici (400) : un incident de matériovigilance
 *                    doit être transmis à la vigilance du fabricant (POST /api/declarations), il ne
 *                    peut pas rester un enregistrement interne.
 *   PATIENT        : déclaration d'un patient. Persistée pour le patient, rattachée à
 *                    l'établissement central RÉSERVÉ (Décision 5), donc visible par lui SEUL tant
 *                    qu'aucune intégration autorisée (CNPM) n'existe. Jamais envoyée à Audit.
 *                    Les champs libres sont balisés `patient-identifying` (types/payload.ts) et
 *                    masqués à tout lecteur autre que l'auteur (Décision 9 : défaut protecteur).
 *
 *   POST   /api/records                  créer (idempotent par clientRequestId)
 *   GET    /api/records                  MES enregistrements
 *   GET    /api/records/queue            file de l'établissement (allow VIEW, établissements affiliés)
 *   GET    /api/records/:id              détail (allow VIEW, sinon 404)
 *   POST   /api/records/:id/withdraw     auteur uniquement, SUBMITTED -> WITHDRAWN
 *   POST   /api/records/:id/review       allow REVIEW, SUBMITTED -> UNDER_REVIEW (+ Case)
 *   POST   /api/records/:id/close        allow CLOSE,  UNDER_REVIEW -> CLOSED
 *
 * L'établissement est TOUJOURS décidé par le serveur (affiliation active), jamais par le client.
 */
import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { effectiveDepartmentId, hasEstablishmentWideScope } from '../lib/scope';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { allow, rolePermits } from '../auth';
import type { ActionType, RequesterContext, ScopedRecord } from '../auth';
import express from 'express';
import { parseDeviceAndMalfunction, samePayload, isEscalatedImpact } from '../services/submissions';
import { scheduleCnpmNotification, parseNotifyContext, checkAttachment, deliverAttachment, sendAttachmentToCnpm, cnpmNotifyAddress, ATTACHMENT_MAX_BYTES } from '../services/cnpmNotify';
import type { NotifyContext } from '../services/cnpmNotify';
import { mailConfigured, sendMail } from '../lib/email';
import { isStorageEnabled, storeEncrypted, readDecrypted } from '../services/attachmentStore';
import { syncManufacturer, measuresOf, parseMeasures, addMeasures, signalsFor } from '../services/establishmentFollowUp';
import { acceptedDoctorIds, doctorMayRead } from '../services/careLinks';

// Modèles ajoutés par la migration 20261024100000 : accès via `any` tant que le client Prisma n'est pas régénéré.
const db: any = prisma;

export const nativeRecordsRouter = Router();
nativeRecordsRouter.use(requireAuth);

type Field = { key: string; value: unknown; sensitivity: 'standard' | 'patient-identifying' };

const fail = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const notFuture = (v: string) => v <= new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : undefined);
const has = (v: unknown) => v !== undefined && v !== null && v !== '';

const PRODUCT_TYPE_DOMAIN: Record<string, 'PHARMACOVIGILANCE' | 'MATERIOVIGILANCE' | 'COSMETOVIGILANCE' | 'CHEMOVIGILANCE'> = {
  medicament: 'PHARMACOVIGILANCE', dispositif: 'MATERIOVIGILANCE', reactif: 'MATERIOVIGILANCE',
  cosmetique: 'COSMETOVIGILANCE', chimique: 'CHEMOVIGILANCE',
};

type Parsed =
  | { ok: false; message: string }
  | { ok: true; kind: 'INTERNAL_PANNE' | 'PATIENT' | 'INCIDENT'; domain: keyof typeof DOMAINS; fields: Field[]; clientRequestId?: string; destinations?: Destination[] };
type Destination = 'CNPM' | 'ORG';
const DOMAINS = { PHARMACOVIGILANCE: 1, MATERIOVIGILANCE: 1, COSMETOVIGILANCE: 1, CHEMOVIGILANCE: 1 } as const;

function parseDestinations(v: unknown): { ok: true; value?: Destination[] } | { ok: false; message: string } {
  if (v === undefined) return { ok: true };
  if (!Array.isArray(v) || v.length === 0 || v.length > 2 || !v.every((x) => x === 'CNPM' || x === 'ORG')) return { ok: false, message: 'destinations must be a non-empty list of CNPM / ORG.' };
  return { ok: true, value: Array.from(new Set(v)) as Destination[] };
}
const list = (v: unknown, max: number, n = 20) => (Array.isArray(v) ? v.slice(0, n).map((x) => txt(x, max)).filter((x): x is string => !!x) : []);

export function parseRecord(body: any, role: string): Parsed {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Body must be a JSON object.' };
  let clientRequestId: string | undefined;
  if (body.clientRequestId !== undefined) {
    clientRequestId = txt(body.clientRequestId, 100);
    if (!clientRequestId) return { ok: false, message: 'clientRequestId is invalid.' };
  }
  const f = (key: string, value: unknown, sensitivity: Field['sensitivity'] = 'standard'): Field => ({ key, value, sensitivity });

  const dest = parseDestinations(body.destinations);
  if (!dest.ok) return dest;

  if (body.kind === 'INTERNAL_PANNE') {
    if (role === 'PATIENT') return { ok: false, message: 'A patient cannot create an internal breakdown record.' };
    const description = txt(body.description, 10_000);
    if (!description) return { ok: false, message: 'description is required (max 10 000 characters).' };
    // Identification obligatoire (n° de série, d'inventaire ou UDI) : « aucun identifiant » n'est plus accepté.
    const dm = parseDeviceAndMalfunction(body, { allowNoIdentifier: false });
    if (!dm.ok) return dm;
    // Ancien appel (sans destinations) : un impact exposed/injury reste refusé. Avec destinations explicites (nouveau parcours),
    // l'enregistrement va au CNPM et/ou à l'organisation ; la transmission au fabricant est un choix distinct (/api/declarations).
    if (dest.value === undefined && isEscalatedImpact(dm.malfunction.impact)) {
      return { ok: false, message: 'An incident with exposure or injury must be sent to the manufacturer\'s vigilance, not kept as an internal record.' };
    }
    const fields: Field[] = [
      f('recordKind', 'INTERNAL_PANNE'), f('description', description),
      ...Object.entries(dm.device).map(([k, v]) => f(`device.${k}`, v)),
      ...Object.entries(dm.malfunction).map(([k, v]) => f(`malfunction.${k}`, v)),
    ];
    if (has(body.service)) { const sv = txt(body.service, 200); if (!sv) return { ok: false, message: 'service is invalid.' }; fields.push(f('service', sv)); }
    for (const [key, max] of [['manufacturerReference', 200], ['catalogueRef', 200]] as const) {
      if (has(body[key])) { const v = txt(body[key], max); if (!v) return { ok: false, message: `${key} is invalid.` }; fields.push(f(key, v)); }
    }
    const names = list(body.attachmentNames, 120, 10);
    if (names.length) fields.push(f('attachmentNames', names));
    if (typeof body.informManufacturer === 'boolean') fields.push(f('informManufacturer', body.informManufacturer));
    return { ok: true, kind: 'INTERNAL_PANNE', domain: 'MATERIOVIGILANCE', fields, clientRequestId, destinations: dest.value };
  }

  if (body.kind === 'INCIDENT') {
    if (role === 'PATIENT') return { ok: false, message: 'A patient must use the patient declaration.' };
    if (!dest.value) return { ok: false, message: 'destinations is required for an incident.' };
    const type = typeof body.productType === 'string' && PRODUCT_TYPE_DOMAIN[body.productType] ? body.productType : null;
    if (!type) return { ok: false, message: 'productType is invalid.' };
    const productName = txt(body.productName, 200);
    if (!productName) return { ok: false, message: 'productName is required.' };
    const nature = txt(body.nature, 50);
    if (!nature) return { ok: false, message: 'nature is required.' };
    if (!realDate(body.onsetDate) || !notFuture(body.onsetDate)) return { ok: false, message: 'onsetDate must be a valid, non-future YYYY-MM-DD date.' };
    const description = txt(body.description, 10_000);
    if (!description) return { ok: false, message: 'description is required (max 10 000 characters).' };
    if (!['legere', 'moderee', 'grave'].includes(body.severity)) return { ok: false, message: 'severity is invalid.' };
    if (!['oui', 'non', 'inconnu'].includes(body.personConcerned)) return { ok: false, message: 'personConcerned is invalid.' };
    const fields: Field[] = [
      f('recordKind', 'INCIDENT'), f('productType', type), f('productName', productName), f('nature', nature),
      f('onsetDate', body.onsetDate), f('description', description), f('severity', body.severity), f('personConcerned', body.personConcerned),
      f('manual', !has(body.productRef)),
    ];
    for (const [key, max] of [['productRef', 200], ['manufacturerName', 200], ['manufacturerReference', 200], ['lot', 100], ['serial', 100], ['udi', 200],
      ['circumstances', 300], ['consequences', 300]] as const) {
      if (has(body[key])) { const v = txt(body[key], max); if (!v) return { ok: false, message: `${key} is invalid.` }; fields.push(f(key, v)); }
    }
    // Identification obligatoire : lot (hors dispositif) ; n° de série ou UDI (dispositif). Pas d'option « inconnu ».
    if (type === 'dispositif') {
      if (!has(body.serial) && !has(body.udi)) return { ok: false, message: 'serial or udi is required for a medical device.' };
    } else if (!has(body.lot)) {
      return { ok: false, message: 'lot is required.' };
    }
    // Produit hors catalogue (fabricant absent de VigiCore Audit) : seul le CNPM peut recevoir la déclaration.
    if (!has(body.productRef) && !(dest.value.length === 1 && dest.value[0] === 'CNPM')) {
      return { ok: false, message: 'A product outside the catalogue can only be declared to the CNPM.' };
    }
    if (has(body.expiryDate)) {
      if (!realDate(body.expiryDate)) return { ok: false, message: 'expiryDate must be a valid YYYY-MM-DD date.' };
      fields.push(f('expiryDate', body.expiryDate));
    }
    const measures = list(body.measures, 50, 10);
    if (measures.length) fields.push(f('measures', measures));
    // La personne concernée n'est enregistrée QUE si « oui » : jamais de donnée de personne pour un incident sans personne.
    if (body.personConcerned === 'oui') {
      // Patient concerné : initiales, âge, sexe et évolution obligatoires (le service reste facultatif).
      const p = body.person && typeof body.person === 'object' && !Array.isArray(body.person) ? body.person : {};
      if (!has(p.label) || String(p.label).trim().length > 10) return { ok: false, message: 'person.label (initials, 10 characters max) is required.' };
      const age = Number(p.age);
      if (!has(p.age) || !Number.isFinite(age) || age < 0 || age > 120) return { ok: false, message: 'person.age (0-120) is required.' };
      if (p.sex !== 'F' && p.sex !== 'M') return { ok: false, message: 'person.sex (F or M) is required.' };
      if (!has(p.evolution)) return { ok: false, message: 'person.evolution is required.' };
    }
    if (body.personConcerned === 'oui' && body.person && typeof body.person === 'object' && !Array.isArray(body.person)) {
      for (const [key, max] of [['label', 100], ['age', 10], ['sex', 10], ['service', 200], ['evolution', 50], ['dechallenge', 50], ['otherProducts', 300],
        ['applicationZone', 200], ['exposureRoute', 50], ['reagentResult', 200], ['instrument', 200]] as const) {
        if (has(body.person[key])) { const v = txt(String(body.person[key]), max); if (!v) return { ok: false, message: `person.${key} is invalid.` }; fields.push(f(`person.${key}`, v, 'patient-identifying')); }
      }
    }
    const names = list(body.attachmentNames, 120, 10);
    if (names.length) fields.push(f('attachmentNames', names));
    if (typeof body.informManufacturer === 'boolean') fields.push(f('informManufacturer', body.informManufacturer));
    return { ok: true, kind: 'INCIDENT', domain: PRODUCT_TYPE_DOMAIN[type], fields, clientRequestId, destinations: dest.value };
  }

  if (body.kind === 'PATIENT') {
    if (role !== 'PATIENT') return { ok: false, message: 'Only a patient account can create a patient declaration.' };
    const type = typeof body.productType === 'string' && PRODUCT_TYPE_DOMAIN[body.productType] ? body.productType : null;
    if (!type) return { ok: false, message: 'productType is invalid.' };
    const productName = txt(body.productName, 200);
    if (!productName) return { ok: false, message: 'productName is required.' };

    const manufacturerName = txt(body.manufacturerName, 200);
    if (!manufacturerName) {
      return { ok: false, message: 'manufacturerName is required.' };
    }
    if (!realDate(body.onsetDate) || !notFuture(body.onsetDate)) return { ok: false, message: 'onsetDate must be a valid, non-future YYYY-MM-DD date.' };
    if (!['legere', 'moderee', 'grave', 'urgence'].includes(body.severity)) return { ok: false, message: 'severity is invalid.' };
    const symptomDesc = txt(body.symptomDesc, 5000);
    const symptoms = Array.isArray(body.symptoms) ? body.symptoms.slice(0, 20).map((x: unknown) => txt(x, 100)).filter(Boolean) : [];
    if (!symptomDesc && symptoms.length === 0) return { ok: false, message: 'Describe the symptoms (symptomDesc or symptoms).' };
    const fields: Field[] = [
      f('recordKind', 'PATIENT'),
      f('productType', type),
      f('productName', productName),
      f('manufacturerName', manufacturerName),
      f('onsetDate', body.onsetDate),
      f('severity', body.severity),
      f('symptoms', symptoms),
    ];
    // Free text may contain identifying details: protected by default (hidden from every non-author reader).
    if (symptomDesc) fields.push(f('symptomDesc', symptomDesc, 'patient-identifying'));
    // `productStopped` = avez-vous arrêté le produit ? ; `dechallenge` = les symptômes ont-ils disparu après l'arrêt ? ; `rechallenge` (ancien) = conservé pour les anciens brouillons.
    for (const [key, max] of [['lotNumber', 100], ['duration', 100], ['productStopped', 50], ['dechallenge', 50], ['rechallenge', 50]] as const) {
      if (has(body[key])) { const v = txt(body[key], max); if (!v) return { ok: false, message: `${key} is invalid.` }; fields.push(f(key, v)); }
    }
    if (has(body.expiryDate)) {
      if (!realDate(body.expiryDate)) return { ok: false, message: 'expiryDate must be a valid YYYY-MM-DD date.' };
      fields.push(f('expiryDate', body.expiryDate));
    }
    return { ok: true, kind: 'PATIENT', domain: PRODUCT_TYPE_DOMAIN[type], fields, clientRequestId };
  }
  return { ok: false, message: 'kind must be INCIDENT, INTERNAL_PANNE or PATIENT.' };
}

// ── Autorisation ────────────────────────────────────────────────────
type Requester = RequesterContext & { adminMeasureEstablishmentIds?: Set<string> };
async function requesterOf(user: NonNullable<Express.Request['user']>): Promise<Requester> {
  const aff = user.activeEstablishmentId
    ? await prisma.userEstablishment.findFirst({ where: { userId: user.id, establishmentId: user.activeEstablishmentId, status: 'ACTIVE' } })
    : null;
  const grants = await prisma.permissionGrant.findMany({ where: { recipientUserId: user.id } });
  // Établissement SANS responsable vigilance actif : c'est son administrateur qui vérifie l'incident et enregistre
  // les mesures internes (jamais au-delà : ni données du patient, ni action sur l'enquête du fabricant).
  const adminMeasureEstablishmentIds = new Set<string>();
  if (user.role === 'ORG_ADMIN' && user.affiliatedEstablishmentIds.length) {
    const reviewers: any[] = await (prisma as any).userEstablishment.findMany({
      where: { establishmentId: { in: user.affiliatedEstablishmentIds }, status: 'ACTIVE', user: { role: 'VIGILANCE_REVIEWER', deactivatedAt: null } },
    }).catch(() => []);
    const covered = new Set(reviewers.map((r) => r.establishmentId));
    for (const e of user.affiliatedEstablishmentIds) if (!covered.has(e)) adminMeasureEstablishmentIds.add(e);
  }
  return {
    adminMeasureEstablishmentIds,
    userId: user.id,
    role: user.role as RequesterContext['role'],
    activeEstablishmentId: user.activeEstablishmentId,
    affiliatedEstablishmentIds: user.affiliatedEstablishmentIds,
    // Pharmacie et laboratoire (d'un hôpital) servent TOUT l'établissement : jamais rattachés à un service.
    departmentId: effectiveDepartmentId(user.role, aff?.departmentId),
    // Décision 3 : responsable vigilance, administrateur, pharmacie et laboratoire traversent les services DE LEUR établissement (jamais d'un autre).
    hasEstablishmentWideScope: hasEstablishmentWideScope(user.role),
    permissionGrants: grants.map((g: any) => ({
      id: g.id, recipientUserId: g.recipientUserId, action: g.action as ActionType,
      establishmentId: g.establishmentId, departmentId: g.departmentId, resourceId: g.resourceId ?? null, expiresAt: g.expiresAt ?? null,
    })),
  };
}
const scoped = (d: any, assignedReviewerId?: string | null): ScopedRecord => ({
  id: d.id, domain: d.domain, authorUserId: d.authorUserId, establishmentId: d.establishmentId, departmentId: d.departmentId ?? null,
  assignedReviewerId: assignedReviewerId ?? d.case?.assignedReviewerId ?? null,
});

const kindOf = (d: any): string => ((Array.isArray(d.payload) ? d.payload : []).find((x: Field) => x.key === 'recordKind')?.value as string) ?? 'INTERNAL_PANNE';
/**
 * Visibilité par l'ORGANISATION : seul un enregistrement dont la destination « Mon organisation » a été choisie est visible
 * dans l'espace de l'établissement. « CNPM seulement » reste visible de l'auteur seul. Les anciens enregistrements (sans aucune
 * ligne de destination) gardent leur comportement d'origine. Un dossier patient reste hors de ce circuit (établissement réservé).
 */
/** Enregistrement natif (payload = liste de champs balisés). Les fiches du module « vigilance » des tableaux de bord
 *  (payload objet { kind, record }) ont leur propre API (/api/vigilance) : jamais mêlées à la file ni à ses compteurs. */
const isNative = (d: any): boolean => Array.isArray(d?.payload);
/** Qui suit la file de l'établissement (compteur + notifications) : le responsable vigilance et l'administrateur. */
const QUEUE_WATCHERS: ReadonlySet<string> = new Set(['VIGILANCE_REVIEWER', 'ORG_ADMIN']);
const orgVisible = (d: any): boolean => {
  const del: any[] = d.deliveries ?? [];
  return kindOf(d) === 'PATIENT' || del.length === 0 || del.some((x) => x.destination === 'ORG');
};

/**
 * Avertit les responsables vigilance et l'administrateur de l'établissement qu'une déclaration leur est adressée (« Mon organisation »).
 * E-mail SANS donnée patient (produit, gravité, auteur, service seulement) ; jamais bloquant ; ignoré si SMTP absent.
 * La notification dans l'application est assurée par GET /records/queue/summary (compteur + dernière arrivée).
 */
async function notifyEstablishmentReviewers(row: any, author: { displayName?: string | null; email?: string | null }) {
  try {
    if (!mailConfigured()) return;
    const [est, reviewers] = await Promise.all([
      prisma.establishment.findUnique({ where: { id: row.establishmentId } }),
      prisma.userEstablishment.findMany({
        where: { establishmentId: row.establishmentId, status: 'ACTIVE', user: { role: { in: ['VIGILANCE_REVIEWER', 'ORG_ADMIN'] }, deactivatedAt: null } },
        include: { user: { select: { email: true } } },
      }),
    ]);
    if (!est || (est as any).isSystemReserved || !reviewers.length) return;
    const m: Record<string, unknown> = {};
    for (const f of (Array.isArray(row.payload) ? row.payload : []) as Field[]) if (f.sensitivity !== 'patient-identifying') m[f.key] = f.value;
    const product = String(m.productName ?? m['device.name'] ?? 'Produit non précisé');
    const sev: Record<string, string> = { legere: 'Légère', moderee: 'Modérée', grave: 'Grave' };
    const lines = [
      `Une nouvelle déclaration a été adressée à ${est.name}.`, '',
      `Produit : ${product}`,
      m.severity ? `Gravité déclarée : ${sev[String(m.severity)] ?? String(m.severity)}` : null,
      `Déclarant : ${author.displayName || author.email || 'utilisateur de l\'établissement'}`,
      m.service ? `Service : ${String(m.service)}` : null,
      `Référence : ${row.id}`, '',
      'Pour la consulter : VigiCore NEXUS → Déclarations → « File de l\'établissement ».',
      'Les informations du patient ne figurent pas dans cet e-mail.',
    ].filter((x) => x !== null).join('\n');
    for (const r of reviewers) {
      const to = (r as any).user?.email; if (!to) continue;
      await sendMail({ to, subject: `[VigiCore] Nouvelle déclaration à traiter — ${product}`, text: lines }).catch(() => undefined);
    }
  } catch {
    console.warn('[records] notification des responsables vigilance impossible (contenu non journalisé)');
  }
}

function toRecordDto(d: any, ctx: RequesterContext) {
  const own = d.authorUserId === ctx.userId;
  const payload: Field[] = Array.isArray(d.payload) ? d.payload : [];
  const kind = kindOf(d);
  const deliveries = (d.deliveries ?? []).map((x: any) => ({
    destination: x.destination, status: x.status,
    ...(x.destination === 'MANUFACTURER' && x.updatedAt && new Date(x.updatedAt).getTime() > 0 ? { updatedAt: x.updatedAt } : {}),
    ...(own && x.lastError ? { lastError: String(x.lastError).slice(0, 200) } : {}),
  }));
  return {
    id: d.id,
    kind,
    domain: d.domain,
    status: d.status as 'SUBMITTED' | 'UNDER_REVIEW' | 'CLOSED' | 'WITHDRAWN' | 'DRAFT',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    own,
    // Vérité sur la destination : un enregistrement natif n'est JAMAIS transmis à Audit (l'e-mail CNPM d'une panne interne est une notification, pas une transmission).
    transmitted: false,
    destination: kind === 'PATIENT' ? 'PATIENT_SPACE_ONLY' : (deliveries.length && !deliveries.some((x: any) => x.destination === 'ORG') ? 'AUTHOR_ONLY' : 'ESTABLISHMENT_INTERNAL'),
    deliveries,
    caseStatus: d.case?.status ?? null,
    // Qui a déclaré et depuis quel service (affichage interne à l'établissement ; jamais une donnée du patient).
    authorName: d.author?.displayName ?? null,
    departmentName: d.department?.name ?? null,
    handledBy: d.case?.assignedReviewer?.displayName ?? null,
    // Suivi par l'établissement : mesures internes prises (l'enquête, elle, appartient au fabricant).
    measures: measuresOf(d),
    // Autres déclarations du même produit / lot dans l'établissement (calculé par la route quand c'est utile).
    ...(d.__signal ? { signal: d.__signal } : {}),
    // Masquage par défaut des champs identifiants pour tout lecteur autre que l'auteur.
    fields: payload.filter((x) => own || d.__sharedWithMe || x.sensitivity !== 'patient-identifying').map(({ key, value }) => ({ key, value })),
    ...(d.__sharedWithMe ? { sharedWithMe: true } : {}),
    permissions: {
      withdraw: own && d.status === 'SUBMITTED',
      review: d.status === 'SUBMITTED' && orgVisible(d) && allow(ctx, 'REVIEW', scoped(d)),
      close: d.status === 'UNDER_REVIEW' && orgVisible(d) && allow(ctx, 'CLOSE', scoped(d)),
      measures: d.status !== 'WITHDRAWN' && d.status !== 'DRAFT' && kind !== 'PATIENT' && orgVisible(d) && (d.deliveries ?? []).some((x: any) => x.destination === 'ORG')
        && (allow(ctx, 'REVIEW', scoped(d)) || (!!(ctx as Requester).adminMeasureEstablishmentIds?.has(d.establishmentId) && allow(ctx, 'VIEW', scoped(d)))),
    },
  };
}

async function systemEstablishmentId(): Promise<string> {
  const existing = await prisma.establishment.findFirst({ where: { isSystemReserved: true }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing.id;
  const created = await prisma.establishment.create({ data: { name: 'Central queue', type: 'SYSTEM', isSystemReserved: true } });
  return created.id;
}

// Tolérance à une base/un client Prisma pas encore mis à jour (migration 20261024100000 non appliquée) : sans la table des
// destinations, on n'ajoute pas `deliveries` aux requêtes (les anciennes fonctions continuent de marcher) ; seules les
// créations qui EXIGENT des destinations sont refusées, avec un message clair.
let deliveriesOk = true;
let probedAt = 0;
async function probeDeliveries() {
  if (Date.now() - probedAt < 30_000) return;
  probedAt = Date.now();
  try { await db.declarationDelivery.count(); deliveriesOk = true; } catch { deliveriesOk = false; }
}
nativeRecordsRouter.use(asyncHandler(async (_req, _res, next) => { await probeDeliveries(); next(); }));
const INCLUDE = {
  case: { include: { assignedReviewer: { select: { displayName: true } } } }, author: { select: { displayName: true } }, department: { select: { name: true } },
  get deliveries() { return deliveriesOk ? true : undefined; },
} as any;

// ── Notification CNPM construite à partir de l'enregistrement STOCKÉ (jamais d'un contexte fourni par le client) ──
const L = {
  type: { medicament: 'Médicament', dispositif: 'Dispositif médical', cosmetique: 'Cosmétique', chimique: 'Produit chimique', reactif: 'Réactif / test diagnostique' } as Record<string, string>,
  nature: { anomalie: 'Anomalie observée', resultat: 'Effet indésirable', qualite: 'Défaut qualité', emballage: 'Emballage endommagé', contamination: 'Contamination suspectée' } as Record<string, string>,
  evolution: { retabli: 'Rétabli / guéri', en_cours: 'En cours de rétablissement', non_retabli: 'Non rétabli / persistant', sequelles: 'Rétabli avec séquelles', deces: 'Décès', inconnue: 'Inconnue', hospitalisation: 'Hospitalisation' } as Record<string, string>,
  measure: { retire: 'Produit retiré / mis en quarantaine', arrete: 'Utilisation arrêtée', soins: 'Soins ou prise en charge', autre: 'Autre mesure', aucune: 'Aucune mesure' } as Record<string, string>,
  dechallenge: { oui: 'Oui, les symptômes ont disparu', non: 'Non, ils persistent', nsp: 'Je ne sais pas', pas_arrete: "Le produit n'a pas été arrêté" } as Record<string, string>,
  route: { peau: 'Contact avec la peau', yeux: 'Contact avec les yeux', inhalation: 'Inhalation', ingestion: 'Ingestion', autre: 'Autre voie' } as Record<string, string>,
};
const lbl = (m: Record<string, string>, v: unknown) => (typeof v === 'string' ? m[v] ?? v : undefined);
const fmap = (fields: Field[]) => Object.fromEntries(fields.map((x) => [x.key, x.value])) as Record<string, any>;
const sub = (m: Record<string, any>, prefix: string) => Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));

export function buildCnpmMail(row: any): { payload: any; ctx: NotifyContext } | null {
  const fields: Field[] = Array.isArray(row.payload) ? row.payload : [];
  const m = fmap(fields);
  const names: string[] = Array.isArray(m.attachmentNames) ? m.attachmentNames : [];
  if (m.recordKind === 'INTERNAL_PANNE') {
    const device = sub(m, 'device.'); const malfunction = sub(m, 'malfunction.');
    const sev = ({ none: 'legere', delay: 'moderee', exposed: 'moderee', injury: 'grave' } as Record<string, string>)[malfunction.impact] ?? 'moderee';
    return {
      payload: { kind: 'DEVICE_MALFUNCTION', productRef: m.catalogueRef ?? 'hors-catalogue', productLabel: device.name, manufacturerReference: m.manufacturerReference, description: m.description, declaredSeverity: sev, device, malfunction },
      ctx: { patient: null, service: m.service, attachments: names },
    };
  }
  if (m.recordKind === 'INCIDENT') {
    const p = sub(m, 'person.'); const person = m.personConcerned === 'oui';
    const extra: (string | null)[] = [
      m.circumstances ? `Circonstances : ${m.circumstances}` : null,
      m.consequences ? `Conséquences constatées : ${m.consequences}` : null,
      Array.isArray(m.measures) && m.measures.length ? `Mesures prises : ${m.measures.map((x: string) => lbl(L.measure, x)).join(', ')}` : null,
      m.serial ? `N° de série : ${m.serial}` : null, m.udi ? `UDI : ${m.udi}` : null, m.idUnknown ? "Identifiant de l'unité : inconnu du déclarant" : null,
      m.lotUnknown ? 'Lot : inconnu du déclarant' : null, m.expiryDate ? `Date de péremption : ${String(m.expiryDate).split('-').reverse().join('/')}` : null,
      m.manual ? 'Produit saisi manuellement (hors catalogue).' : null,
      person && p.dechallenge ? `Arrêt du produit — symptômes disparus : ${lbl(L.dechallenge, p.dechallenge)}` : null,
      person && p.otherProducts ? `Autres produits pris : ${p.otherProducts}` : null,
      person && p.applicationZone ? `Zone d'application : ${p.applicationZone}` : null,
      person && p.exposureRoute ? `Voie d'exposition : ${lbl(L.route, p.exposureRoute)}` : null,
      person && p.reagentResult ? `Résultat concerné : ${p.reagentResult}` : null,
      person && p.instrument ? `Instrument : ${p.instrument}` : null,
    ];
    return {
      payload: { productRef: m.productRef ?? 'hors-catalogue', productLabel: m.productName, description: m.description, lotNumber: m.lot, manufacturerReference: m.manufacturerReference, declaredSeverity: m.severity },
      ctx: {
        patient: person && (p.label || p.age || p.sex) ? { name: p.label, age: p.age, sex: p.sex } : null,
        service: p.service, onsetDate: m.onsetDate, problem: lbl(L.nature, m.nature), productType: lbl(L.type, m.productType), manufacturer: m.manufacturerName,
        evolution: lbl(L.evolution, p.evolution), stopped: Array.isArray(m.measures) ? (m.measures.some((x: string) => x === 'retire' || x === 'arrete') ? 'Oui' : 'Non') : undefined,
        attachments: names, extraLines: extra.filter((x): x is string => !!x),
      },
    };
  }
  return null;
}

async function setDelivery(declarationId: string, destination: Destination, status: string, lastError: string | null) {
  try {
    await db.declarationDelivery.updateMany({ where: { declarationId, destination }, data: { status, lastError, attempts: { increment: 1 } } });
  } catch { console.warn('[records] état de livraison non mis à jour'); }
}
const MAIL_STATUS: Record<string, [string, string | null]> = {
  sent: ['SENT', null], skipped: ['NOT_CONFIGURED', 'CNPM_NOTIFY_EMAIL ou SMTP non configuré'], failed: ['FAILED', "L'e-mail n'a pas pu être envoyé"],
};
/** Lance l'e-mail CNPM d'un enregistrement ; l'état de la ligne de livraison suit le résultat RÉEL de l'envoi. */
function startCnpm(row: any, role: string, held: boolean) {
  const built = buildCnpmMail(row);
  if (!built) return;
  const done = (r: 'sent' | 'skipped' | 'failed') => { const [st, err] = MAIL_STATUS[r]; void setDelivery(row.id, 'CNPM', st, err); };
  void Promise.resolve(scheduleCnpmNotification(built.payload, role, row.id, held ? built.ctx : { ...built.ctx, attachments: [] }, done)).catch(() => done('failed'));
}

nativeRecordsRouter.post('/', asyncHandler(async (req, res) => {
  const user = req.user!;
  if (!rolePermits(user.role as any, 'CREATE')) return fail(res, 403, 'Your role cannot create declarations.');
  const parsed = parseRecord(req.body, user.role);
  if (!parsed.ok) return fail(res, 400, parsed.message, 'VALIDATION_ERROR');
  // Déclaration patient partagée avec ses médecins : uniquement ceux qu'il a ACCEPTÉS (consentement), jamais d'autres comptes.
  if (parsed.kind === 'PATIENT' && req.body?.shareWithDoctorIds !== undefined) {
    const raw = req.body.shareWithDoctorIds;
    if (!Array.isArray(raw) || raw.length > 10 || !raw.every((x: unknown) => typeof x === 'string')) return fail(res, 400, 'shareWithDoctorIds is invalid.', 'VALIDATION_ERROR');
    const wanted = [...new Set(raw as string[])];
    if (wanted.length) {
      const ok = await acceptedDoctorIds(user.id);
      if (!wanted.every((id) => ok.has(id))) return fail(res, 400, 'Vous ne pouvez partager qu’avec un médecin que vous avez accepté.', 'VALIDATION_ERROR');
      parsed.fields.push({ key: 'sharedWithDoctors', value: wanted, sensitivity: 'standard' });
    }
  }

  if (parsed.destinations && !deliveriesOk) {
    return fail(res, 503, "La base de données n'est pas à jour (migration « declaration_delivery_attachments » non appliquée) : lancez `npx prisma migrate deploy` puis `npx prisma generate` et redémarrez le serveur.", 'MIGRATION_REQUIRED');
  }
  let establishmentId: string; let departmentId: string | null = null;
  // CNPM seul : aucun rattachement à l'établissement de l'auteur (réservé), donc invisible de toute file d'organisation.
  const orgWanted = parsed.kind !== 'PATIENT' && (parsed.destinations === undefined || parsed.destinations.includes('ORG'));
  if (parsed.kind === 'PATIENT' || !orgWanted) {
    establishmentId = await systemEstablishmentId();
  } else {
    if (!user.activeEstablishmentId) {
      return fail(res, 409, "Vous n'êtes rattaché à aucun établissement actif : le suivi interne est impossible.", 'NO_ACTIVE_ESTABLISHMENT');
    }
    establishmentId = user.activeEstablishmentId;
    const aff = await prisma.userEstablishment.findFirst({ where: { userId: user.id, establishmentId, status: 'ACTIVE' } });
    departmentId = effectiveDepartmentId(user.role, aff?.departmentId);
  }

  const replay = (row: any) =>
    samePayload(row.payload, parsed.fields)
      ? res.status(200).json({ success: true, replayed: true, record: toRecordDto(row, ctxLite(user)) })
      : fail(res, 409, 'This request id was already used with different content.', 'IDEMPOTENCY_CONFLICT');

  if (parsed.clientRequestId) {
    const existing = await prisma.declaration.findUnique({
      where: { authorUserId_clientRequestId: { authorUserId: user.id, clientRequestId: parsed.clientRequestId } },
      include: INCLUDE,
    });
    if (existing) return replay(existing);
  }
  try {
    const row = await prisma.declaration.create({
      data: {
        domain: parsed.domain, reporterRole: user.role as any, authorUserId: user.id,
        subjectPatientId: parsed.kind === 'PATIENT' ? user.id : null,
        establishmentId, departmentId, status: 'SUBMITTED',
        clientRequestId: parsed.clientRequestId ?? null, payload: parsed.fields as any,
      },
      include: INCLUDE,
    });
    // Destinations choisies (nouveau parcours) : une ligne par destination, avec son état RÉEL.
    if (parsed.destinations) {
      const cnpmReady = !!cnpmNotifyAddress() && mailConfigured();
      row.deliveries = [];
      for (const dst of parsed.destinations) {
        row.deliveries.push(await db.declarationDelivery.create({ data: {
          declarationId: row.id, destination: dst,
          status: dst === 'ORG' ? 'AVAILABLE' : (cnpmReady ? 'PENDING' : 'NOT_CONFIGURED'),
          lastError: dst === 'CNPM' && !cnpmReady ? 'CNPM_NOTIFY_EMAIL ou SMTP non configuré' : null,
        } }));
      }
      if (parsed.destinations.includes('CNPM') && cnpmReady) startCnpm(row, user.role, true);
    }
    // « Mon organisation » choisie : les responsables vigilance de l'établissement sont avertis (e-mail, sans donnée patient).
    if (orgWanted && parsed.kind !== 'PATIENT') void notifyEstablishmentReviewers(row, user as any);
    // Panne interne dont l'auteur a choisi le CNPM comme destinataire : e-mail de notification (même gabarit que pour
    // les déclarations transmises). Ce n'est PAS un envoi à Audit ; l'enregistrement reste interne à l'établissement.
    if (parsed.kind === 'INTERNAL_PANNE' && !parsed.destinations && req.body?.notifyCnpm === true) {
      const dm = parseDeviceAndMalfunction(req.body);
      if (dm.ok) {
        const sev = ({ none: 'legere', delay: 'moderee', exposed: 'moderee', injury: 'grave' } as const)[dm.malfunction.impact];
        void Promise.resolve(scheduleCnpmNotification(
          { kind: 'DEVICE_MALFUNCTION', productRef: 'hors-catalogue', productLabel: dm.device.name, description: String(req.body.description).trim(), declaredSeverity: sev, device: dm.device, malfunction: dm.malfunction } as any,
          user.role, row.id, parseNotifyContext(req.body?.notifyContext),
        )).catch(() => undefined);
      }
    }
    return res.status(201).json({ success: true, record: toRecordDto(row, await requesterOf(user)) });
  } catch (err: any) {
    if (err?.code === 'P2002' && parsed.clientRequestId) {
      const winner = await prisma.declaration.findUnique({
        where: { authorUserId_clientRequestId: { authorUserId: user.id, clientRequestId: parsed.clientRequestId } }, include: INCLUDE,
      });
      if (winner) return replay(winner);
    }
    throw err;
  }
}));
// Pièces jointes d'un enregistrement (auteur seul pour l'envoi). Deux effets RÉELS et indépendants :
//   1. conservation chiffrée dans Nexus (si ATTACHMENT_ENC_KEY est configurée) ;
//   2. jointure à l'e-mail du CNPM (si la destination CNPM a été choisie).
// Jamais envoyées à VigiCore Audit ni au fabricant. La réponse dit exactement ce qui s'est passé.
const MAX_FILES = 10;
nativeRecordsRouter.post('/:id/attachments', express.raw({ type: () => true, limit: ATTACHMENT_MAX_BYTES + 1024 }), asyncHandler(async (req, res) => {
  const user = req.user!;
  const row = await db.declaration.findFirst({ where: { id: String(req.params.id), authorUserId: user.id }, include: INCLUDE });
  if (!row) return fail(res, 404, 'Not found.');
  let name = '';
  try { name = decodeURIComponent(String(req.header('x-file-name') ?? '')); } catch { /* refusé ci-dessous */ }
  let note: string | null = null;
  try { const n = decodeURIComponent(String(req.header('x-file-note') ?? '')).trim(); note = n ? n.slice(0, 200) : null; } catch { /* note ignorée */ }
  const chk = checkAttachment(name, req.body);
  if (!chk.ok) return fail(res, chk.status, chk.message, 'ATTACHMENT_REFUSED');
  const deliveries: any[] = row.deliveries ?? [];
  // Un dossier PATIENT n'est JAMAIS envoyé par e-mail (aucun consentement/cadre n'existe) : conservation seule.
  const isPatientRec = kindOf(row) === 'PATIENT';
  const wantsMail = !isPatientRec && (deliveries.length === 0 || deliveries.some((x: any) => x.destination === 'CNPM'));

  let stored = false;
  if (isStorageEnabled()) {
    const count = await db.attachment.count({ where: { declarationId: row.id } });
    if (count >= MAX_FILES) return fail(res, 400, `Maximum ${MAX_FILES} pièces par déclaration.`, 'ATTACHMENT_REFUSED');
    try {
      const f = await storeEncrypted(chk.data);
      await db.attachment.create({ data: { declarationId: row.id, fileName: chk.name, mimeType: chk.mime, storagePath: f.storagePath, sizeBytes: f.sizeBytes, sha256: f.sha256, note } });
      stored = true;
    } catch { console.warn('[records] conservation de la pièce impossible'); }
  }

  let mail: 'queued' | 'sent' | 'skipped' | 'failed' | null = null; let batch = false;
  if (wantsMail) {
    const p = fmap(Array.isArray(row.payload) ? row.payload : []);
    const r = await deliverAttachment(row.id, String(p.productName ?? p['device.name'] ?? '—'), { name: chk.name, mime: chk.mime, data: chk.data });
    mail = r.status; batch = r.batch;
  }
  const mailOk = mail === 'sent' || mail === 'queued';
  if (stored || mailOk) return res.json({ success: true, stored, mail, name: chk.name, status: mail ?? (stored ? 'stored' : null) });
  const msg = !wantsMail
    ? "La conservation des pièces n'est pas activée sur ce serveur et le CNPM n'a pas été choisi : la pièce n'a PAS été conservée."
    : mail === 'skipped' ? "L'envoi par e-mail au CNPM n'est pas configuré et la conservation n'est pas activée : la pièce n'a PAS été transmise."
    : "L'e-mail n'a pas pu être envoyé et la conservation n'est pas activée : la pièce n'a PAS été transmise.";
  return res.status(mail === 'failed' ? 502 : 503).json({ success: false, stored, mail, name: chk.name, batch, message: msg });
}));

// Contexte minimal pour un rejeu (l'auteur relit sa propre ligne : aucune permission d'examen à calculer).
const ctxLite = (user: NonNullable<Express.Request['user']>): RequesterContext => ({
  userId: user.id, role: user.role as any, activeEstablishmentId: user.activeEstablishmentId,
  affiliatedEstablishmentIds: user.affiliatedEstablishmentIds, departmentId: null, hasEstablishmentWideScope: false, permissionGrants: [],
});

nativeRecordsRouter.get('/', asyncHandler(async (req, res) => {
  const ctx = await requesterOf(req.user!);
  const rows = await prisma.declaration.findMany({ where: { authorUserId: ctx.userId }, orderBy: { createdAt: 'desc' }, take: 100, include: INCLUDE });
  await syncManufacturer(rows);
  res.json({ success: true, records: rows.map((r: any) => toRecordDto(r, ctx)) });
}));

// ⚠ déclaré AVANT '/:id' — médecin : déclarations que ses patients ont choisi de lui partager (consentement toujours actif).
nativeRecordsRouter.get('/from-patients', asyncHandler(async (req, res) => {
  const ctx = await requesterOf(req.user!);
  if (ctx.role !== 'DOCTOR') return res.json({ success: true, records: [] });
  const rows = await prisma.declaration.findMany({
    where: { reporterRole: 'PATIENT', status: { notIn: ['DRAFT', 'WITHDRAWN'] } }, orderBy: { createdAt: 'desc' }, take: 500, include: INCLUDE,
  });
  const out: any[] = [];
  for (const r of rows as any[]) {
    if (isNative(r) && await doctorMayRead(r, ctx.userId)) { r.__sharedWithMe = true; out.push(r); }
  }
  res.json({ success: true, records: out.map((r) => toRecordDto(r, ctx)) });
}));

// ⚠ déclaré AVANT '/:id'
nativeRecordsRouter.get('/queue', asyncHandler(async (req, res) => {
  const ctx = await requesterOf(req.user!);
  // La file de l'établissement n'est destinée qu'à ceux qui la suivent (responsable vigilance, administrateur).
  // Les autres rôles lisent leurs propres déclarations (GET /records) ou une fiche précise (GET /records/:id).
  if (!QUEUE_WATCHERS.has(ctx.role)) return res.json({ success: true, records: [] });
  if (ctx.affiliatedEstablishmentIds.length === 0) return res.json({ success: true, records: [] });
  const rows = await prisma.declaration.findMany({
    where: { establishmentId: { in: ctx.affiliatedEstablishmentIds }, status: { not: 'DRAFT' } },
    orderBy: { createdAt: 'desc' }, take: 200, include: INCLUDE,
  });
  const visible = rows.filter((r: any) => isNative(r) && orgVisible(r) && allow(ctx, 'VIEW', scoped(r)));
  await syncManufacturer(visible);
  const sig = signalsFor(visible, visible);
  for (const r of visible as any[]) r.__signal = sig.get(r.id);
  res.json({ success: true, records: visible.map((r: any) => toRecordDto(r, ctx)) });
}));

// Notifications dans l'application : déclarations reçues sans mesure interne encore enregistrée, et dernières enquêtes
// clôturées par le fabricant. Relance aussi, en arrière-plan, la lecture de l'état des enquêtes chez Audit.
nativeRecordsRouter.get('/queue/summary', asyncHandler(async (req, res) => {
  const ctx = await requesterOf(req.user!);
  if (ctx.affiliatedEstablishmentIds.length === 0 || !QUEUE_WATCHERS.has(ctx.role)) return res.json({ success: true, pending: 0, unread: 0, latest: null, closed: null });
  const rows = await prisma.declaration.findMany({
    where: { establishmentId: { in: ctx.affiliatedEstablishmentIds }, status: { notIn: ['DRAFT', 'WITHDRAWN'] } },
    orderBy: { createdAt: 'desc' }, take: 200, include: INCLUDE,
  });
  const visible = rows.filter((r: any) => isNative(r) && orgVisible(r) && allow(ctx, 'VIEW', scoped(r)));
  await syncManufacturer(visible);
  const label = (r: any) => (((r.payload as Field[]) || []).find((f) => f.key === 'productName' || f.key === 'device.name')?.value ?? null);
  const fresh = visible.filter((r: any) => r.authorUserId !== ctx.userId && r.status === 'SUBMITTED' && measuresOf(r).length === 0);
  const closures = visible
    .flatMap((r: any) => (r.deliveries ?? []).filter((x: any) => x.destination === 'MANUFACTURER' && x.status === 'CLOSED').map((x: any) => ({ r, at: x.updatedAt })))
    .sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const top: any = fresh[0]; const c: any = closures[0];
  // « Non lu » : événements (déclaration reçue, enquête clôturée) postérieurs à ce que l'utilisateur a déjà vu.
  const seen = await readSeen(ctx.userId);
  const isUnread = (id: string, at: unknown) => {
    const t = new Date(at as any).getTime();
    return t > seen.allAt && t > (seen.ids[id] ?? 0);
  };
  const unread = visible.filter((r: any) => r.authorUserId !== ctx.userId && isUnread(r.id, r.createdAt)).length
    + closures.filter((x: any) => isUnread(x.r.id, x.at)).length;
  res.json({
    success: true, pending: fresh.length, unread,
    latest: top ? { id: top.id, label: label(top), createdAt: top.createdAt } : null,
    closed: c ? { id: c.r.id, label: label(c.r), at: c.at, count: closures.length } : null,
  });
}));

// ── Lu / non lu (par utilisateur) : la pastille disparaît dès que l'utilisateur a vu la liste ou ouvert la déclaration ──
const SEEN_ALL = 'queueSeenAt';
const SEEN_IDS = 'queueSeen';
const SEEN_MAX = 15; // reste sous la limite de 500 caractères d'une valeur de préférence
async function readSeen(userId: string): Promise<{ allAt: number; ids: Record<string, number>; data: Record<string, string> }> {
  const row: any = await (prisma as any).userPreference?.findUnique({ where: { userId } }).catch(() => null);
  const data = row?.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {};
  let ids: Record<string, number> = {};
  try { ids = JSON.parse(String(data[SEEN_IDS] ?? '{}')) || {}; } catch { ids = {}; }
  return { allAt: new Date(data[SEEN_ALL] ?? 0).getTime() || 0, ids, data };
}
nativeRecordsRouter.post('/queue/seen', asyncHandler(async (req, res) => {
  const user = req.user!;
  const id = typeof req.body?.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(req.body.id) ? req.body.id : null;
  const cur = await readSeen(user.id);
  const next: Record<string, string> = { ...cur.data };
  if (id) {
    const ids = (Object.entries({ ...cur.ids, [id]: Date.now() }) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, SEEN_MAX);
    next[SEEN_IDS] = JSON.stringify(Object.fromEntries(ids));
  } else {
    next[SEEN_ALL] = new Date().toISOString();
    delete next[SEEN_IDS];
  }
  try {
    await (prisma as any).userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, data: next }, update: { data: next } });
  } catch { return fail(res, 503, 'État de lecture momentanément indisponible.'); }
  res.json({ success: true });
}));

async function loadVisible(req: any, res: Response) {
  const ctx = await requesterOf(req.user!);
  const row = await prisma.declaration.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
  // 404 identique pour « n'existe pas » et « pas le droit de la voir » : pas d'énumération.
  if (row && isNative(row) && row.authorUserId !== ctx.userId && ctx.role === 'DOCTOR' && await doctorMayRead(row, ctx.userId)) {
    (row as any).__sharedWithMe = true; // déclaration qu'un patient a choisi de partager avec ce médecin
    return { ctx, row };
  }
  if (!row || !isNative(row) || !allow(ctx, 'VIEW', scoped(row)) || (row.authorUserId !== ctx.userId && !orgVisible(row))) { fail(res, 404, 'Not found.'); return null; }
  return { ctx, row };
}

nativeRecordsRouter.get('/:id', asyncHandler(async (req, res) => {
  const v = await loadVisible(req, res); if (!v) return;
  await syncManufacturer([v.row], { waitAudit: true });
  if (v.row.authorUserId !== v.ctx.userId || orgVisible(v.row)) {
    const pool = await prisma.declaration.findMany({
      where: { establishmentId: v.row.establishmentId, status: { notIn: ['DRAFT', 'WITHDRAWN'] } }, orderBy: { createdAt: 'desc' }, take: 500, include: INCLUDE,
    });
    const seen = pool.filter((r: any) => isNative(r) && orgVisible(r) && allow(v.ctx, 'VIEW', scoped(r)));
    (v.row as any).__signal = signalsFor([v.row], seen.some((r: any) => r.id === v.row.id) ? seen : [...seen, v.row]).get(v.row.id);
  }
  res.json({ success: true, record: toRecordDto(v.row, v.ctx) });
}));

nativeRecordsRouter.get('/:id/attachments', asyncHandler(async (req, res) => {
  const v = await loadVisible(req, res); if (!v) return;
  const rows = await db.attachment.findMany({ where: { declarationId: v.row.id }, orderBy: { uploadedAt: 'asc' } });
  res.json({ success: true, attachments: rows.map((a: any) => ({ id: a.id, name: a.fileName, mime: a.mimeType, size: a.sizeBytes, note: a.note ?? null })) });
}));

nativeRecordsRouter.get('/:id/attachments/:attId', asyncHandler(async (req, res) => {
  const v = await loadVisible(req, res); if (!v) return;
  const a = await db.attachment.findFirst({ where: { id: String(req.params.attId), declarationId: v.row.id } });
  if (!a) return fail(res, 404, 'Not found.');
  try {
    const data = await readDecrypted(a.storagePath);
    res.setHeader('Content-Type', a.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.fileName)}`);
    res.send(data);
  } catch { fail(res, 500, "La pièce est illisible (clé de chiffrement absente ou fichier manquant)."); }
}));

// Renvoi de la notification CNPM (auteur seul) : reconstruit l'e-mail depuis l'enregistrement et ses pièces conservées.
nativeRecordsRouter.post('/:id/resend-cnpm', asyncHandler(async (req, res) => {
  const user = req.user!;
  const row = await db.declaration.findFirst({ where: { id: String(req.params.id), authorUserId: user.id }, include: INCLUDE });
  if (!row) return fail(res, 404, 'Not found.');
  const cnpm = (row.deliveries ?? []).find((x: any) => x.destination === 'CNPM');
  if (!cnpm) return fail(res, 409, "Cette déclaration n'a pas été adressée au CNPM.", 'NOT_ADDRESSED');
  if (cnpm.status !== 'FAILED' && cnpm.status !== 'NOT_CONFIGURED') return fail(res, 409, 'La notification est déjà envoyée ou en cours.', 'INVALID_STATE');
  if (!cnpmNotifyAddress() || !mailConfigured()) return fail(res, 503, "L'envoi d'e-mail au CNPM n'est toujours pas configuré.", 'NOT_CONFIGURED');
  const built = buildCnpmMail(row);
  if (!built) return fail(res, 409, 'Type de déclaration non notifiable.');
  const files: { name: string; mime: string; data: Buffer }[] = [];
  const declared = built.ctx.attachments ?? [];
  if (isStorageEnabled()) {
    for (const a of await db.attachment.findMany({ where: { declarationId: row.id }, orderBy: { uploadedAt: 'asc' } })) {
      try { files.push({ name: a.fileName, mime: a.mimeType, data: await readDecrypted(a.storagePath) }); } catch { /* signalé « non reçue » dans le message */ }
    }
  }
  const { notifyCnpm } = await import('../services/cnpmNotify');
  const r = await notifyCnpm(built.payload, user.role, row.id, { ...built.ctx, attachments: declared }, files);
  const [st, err] = MAIL_STATUS[r];
  await setDelivery(row.id, 'CNPM', st, err);
  if (r !== 'sent') return res.status(r === 'skipped' ? 503 : 502).json({ success: false, status: st, message: "L'e-mail n'a pas pu être envoyé." });
  res.json({ success: true, status: st });
}));

nativeRecordsRouter.post('/:id/withdraw', asyncHandler(async (req, res) => {
  const v = await loadVisible(req, res); if (!v) return;
  // allow(WITHDRAW) passe aussi par le chemin « établissement » : on exige en plus d'être l'AUTEUR.
  if (v.row.authorUserId !== v.ctx.userId || !allow(v.ctx, 'WITHDRAW', scoped(v.row))) return fail(res, 403, 'Only the author can withdraw a declaration.');
  const n = await prisma.declaration.updateMany({ where: { id: v.row.id, status: 'SUBMITTED' }, data: { status: 'WITHDRAWN' } });
  if (n.count !== 1) return fail(res, 409, 'Only a submitted declaration can be withdrawn.', 'INVALID_TRANSITION');
  const row = await prisma.declaration.findUnique({ where: { id: v.row.id }, include: INCLUDE });
  res.json({ success: true, record: toRecordDto(row, v.ctx) });
}));

// Mesures internes de l'établissement (responsable vigilance). Ne modifie ni la déclaration ni l'enquête du fabricant.
nativeRecordsRouter.post('/:id/measures', asyncHandler(async (req, res) => {
  const v = await loadVisible(req, res); if (!v) return;
  const dto = toRecordDto(v.row, v.ctx);
  if (!dto.permissions.measures) return fail(res, 403, "Vous n'avez pas le droit d'enregistrer des mesures pour cette déclaration.");
  const m = parseMeasures(req.body);
  if (!m.ok) return fail(res, 400, m.message, 'VALIDATION_ERROR');
  const me = await prisma.user.findUnique({ where: { id: v.ctx.userId } });
  await addMeasures(v.row, { type: 'MEASURES', measures: m.measures, note: m.note, byUserId: v.ctx.userId, byName: (me as any)?.displayName ?? '', at: new Date().toISOString() });
  const row = await prisma.declaration.findUnique({ where: { id: v.row.id }, include: INCLUDE });
  await syncManufacturer([row]);
  res.json({ success: true, record: toRecordDto(row, v.ctx) });
}));

nativeRecordsRouter.post('/:id/review', asyncHandler(async (req, res) => {
  const v = await loadVisible(req, res); if (!v) return;
  if (!allow(v.ctx, 'REVIEW', scoped(v.row))) return fail(res, 403, 'You are not allowed to review this declaration.');
  const row = await prisma.$transaction(async (tx: any) => {
    const n = await tx.declaration.updateMany({ where: { id: v.row.id, status: 'SUBMITTED' }, data: { status: 'UNDER_REVIEW' } });
    if (n.count !== 1) return null;
    await tx.case.create({ data: { declarationId: v.row.id, status: 'INVESTIGATING', assignedReviewerId: v.ctx.userId, establishmentId: v.row.establishmentId, departmentId: v.row.departmentId ?? null } });
    return tx.declaration.findUnique({ where: { id: v.row.id }, include: INCLUDE });
  });
  if (!row) return fail(res, 409, 'Only a submitted declaration can be taken for review.', 'INVALID_TRANSITION');
  res.json({ success: true, record: toRecordDto(row, v.ctx) });
}));

nativeRecordsRouter.post('/:id/close', asyncHandler(async (req, res) => {
  const v = await loadVisible(req, res); if (!v) return;
  if (!allow(v.ctx, 'CLOSE', scoped(v.row))) return fail(res, 403, 'You are not allowed to close this declaration.');
  const row = await prisma.$transaction(async (tx: any) => {
    const n = await tx.declaration.updateMany({ where: { id: v.row.id, status: 'UNDER_REVIEW' }, data: { status: 'CLOSED' } });
    if (n.count !== 1) return null;
    await tx.case.updateMany({ where: { declarationId: v.row.id }, data: { status: 'CLOSED' } });
    return tx.declaration.findUnique({ where: { id: v.row.id }, include: INCLUDE });
  });
  if (!row) return fail(res, 409, 'Only a declaration under review can be closed.', 'INVALID_TRANSITION');
  res.json({ success: true, record: toRecordDto(row, v.ctx) });
}));
