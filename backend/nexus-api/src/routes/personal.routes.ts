import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Données personnelles saisies par l'utilisateur dans son tableau de bord.
 *
 *   GET    /api/personal/:kind          -> { items: [{ id, data, createdAt, updatedAt }] }   (les miens)
 *   POST   /api/personal/:kind          { data } -> { item }                                   (listes)
 *   PATCH  /api/personal/:kind/:id      { data } -> { item }   (fusion champ par champ)
 *   DELETE /api/personal/:kind/:id
 *   GET    /api/personal/singleton/:kind -> { item | null }     (fiches uniques : profil…)
 *   PUT    /api/personal/singleton/:kind { data } -> { item }  (crée ou remplace)
 *
 * Portée : TOUJOURS l'utilisateur de la session. Un identifiant reçu n'ouvre jamais la ligne d'un autre
 * (404, sans révéler qu'elle existe). Chaque type a une liste fermée de champs, typés et bornés :
 * un champ inconnu est ignoré, un champ invalide est refusé (400).
 */
export const personalRouter = Router();
personalRouter.use(requireAuth);

type FieldSpec =
  | { type: 'text'; max: number; required?: boolean }
  | { type: 'enum'; values: readonly string[]; required?: boolean }
  | { type: 'date'; required?: boolean } // YYYY-MM-DD
  | { type: 'time'; required?: boolean } // HH:MM
  | { type: 'datetime'; required?: boolean } // ISO 8601
  | { type: 'int'; min: number; max: number; required?: boolean }
  | { type: 'bool' }
  | { type: 'ref'; kind: string; required?: boolean }; // id d'une autre ligne du même utilisateur

interface KindSpec {
  roles?: readonly string[]; // rôles autorisés (absent = tout utilisateur connecté)
  singleton?: boolean;
  maxItems: number;
  fields: Record<string, FieldSpec>;
}

const PATIENT = ['PATIENT'] as const;
const t = (max: number, required = false): FieldSpec => ({ type: 'text', max, required });

export const KINDS: Record<string, KindSpec> = {
  product: {
    roles: PATIENT,
    maxItems: 200,
    fields: {
      name: t(160, true),
      category: { type: 'enum', values: ['medicament', 'dispositif', 'autre'], required: true },
      lot: t(80),
      manufacturer: t(160),
      startedAt: { type: 'date' },
      inUse: { type: 'bool' },
      notes: t(1000),
    },
  },
  treatment: {
    roles: PATIENT,
    maxItems: 100,
    fields: {
      name: t(160, true),
      dosage: t(80),
      dosesPerDay: { type: 'int', min: 1, max: 12 },
      instructions: t(500),
      prescriber: t(160),
      startDate: { type: 'date' },
      endDate: { type: 'date' },
    },
  },
  intake: {
    roles: PATIENT,
    maxItems: 5000,
    fields: {
      treatmentId: { type: 'ref', kind: 'treatment', required: true },
      takenAt: { type: 'datetime', required: true },
    },
  },
  appointment: {
    roles: PATIENT,
    maxItems: 300,
    fields: {
      practitioner: t(160, true),
      reason: t(160, true),
      date: { type: 'date', required: true },
      time: { type: 'time' },
      status: { type: 'enum', values: ['planned', 'done', 'cancelled'] },
      notes: t(500),
    },
  },
  allergy: {
    roles: PATIENT,
    maxItems: 50,
    fields: {
      name: t(120, true),
      reaction: t(300),
      severity: { type: 'enum', values: ['legere', 'moderee', 'severe'], required: true },
    },
  },
  condition: {
    roles: PATIENT,
    maxItems: 50,
    fields: { name: t(160, true), since: { type: 'date' }, notes: t(500) },
  },
  emergency_contact: {
    roles: PATIENT,
    maxItems: 10,
    fields: { name: t(120, true), relation: t(80), phone: t(30, true) },
  },
  health_profile: {
    roles: PATIENT,
    singleton: true,
    maxItems: 1,
    fields: {
      prenom: t(80),
      nom: t(80),
      birthdate: { type: 'date' },
      sexe: { type: 'enum', values: ['', 'F', 'M'] },
      poids: t(10),
      taille: t(10),
      telephone: t(30),
      adresse: t(300),
      pharmacie: t(160),
      cnas: t(40),
      shareDoctor: { type: 'bool' },
      alertesCNPM: { type: 'bool' },
      rappelsPrise: { type: 'bool' },
      analyseIA: { type: 'bool' },
      sharePharmacie: { type: 'bool' },
    },
  },
  lab_profile: {
    roles: ['LABO'],
    singleton: true,
    maxItems: 1,
    fields: { nom: t(160), adresse: t(300), telephone: t(30), agrement: t(80) },
  },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message });

class InvalidField extends Error {}

function validDate(s: string) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Valide `input` selon le type ; `partial` = PATCH (les champs obligatoires absents sont permis). */
async function clean(kind: string, spec: KindSpec, input: unknown, userId: string, partial: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InvalidField('Contenu invalide.');
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [name, f] of Object.entries(spec.fields)) {
    const has = Object.prototype.hasOwnProperty.call(src, name) && src[name] !== undefined && src[name] !== null;
    const raw = has ? src[name] : undefined;
    const required = 'required' in f && f.required;
    if (!has || (typeof raw === 'string' && raw.trim() === '' && f.type !== 'enum')) {
      if (required && !partial) throw new InvalidField(`Champ obligatoire : ${name}.`);
      if (has && required) throw new InvalidField(`Champ obligatoire : ${name}.`);
      if (has && f.type !== 'bool') out[name] = ''; // effacement explicite d'un champ facultatif
      continue;
    }
    switch (f.type) {
      case 'text': {
        if (typeof raw !== 'string') throw new InvalidField(`${name} : texte attendu.`);
        const v = raw.trim();
        if (v.length > f.max) throw new InvalidField(`${name} : ${f.max} caractères maximum.`);
        out[name] = v;
        break;
      }
      case 'enum':
        if (typeof raw !== 'string' || !f.values.includes(raw)) throw new InvalidField(`${name} : valeur non autorisée.`);
        out[name] = raw;
        break;
      case 'date':
        if (typeof raw !== 'string' || !validDate(raw)) throw new InvalidField(`${name} : date AAAA-MM-JJ attendue.`);
        out[name] = raw;
        break;
      case 'time':
        if (typeof raw !== 'string' || !TIME_RE.test(raw)) throw new InvalidField(`${name} : heure HH:MM attendue.`);
        out[name] = raw;
        break;
      case 'datetime': {
        const d = typeof raw === 'string' ? new Date(raw) : null;
        if (!d || Number.isNaN(d.getTime())) throw new InvalidField(`${name} : date et heure ISO attendues.`);
        out[name] = d.toISOString();
        break;
      }
      case 'int': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isInteger(n) || n < f.min || n > f.max) throw new InvalidField(`${name} : entier entre ${f.min} et ${f.max}.`);
        out[name] = n;
        break;
      }
      case 'bool':
        if (typeof raw !== 'boolean') throw new InvalidField(`${name} : vrai/faux attendu.`);
        out[name] = raw;
        break;
      case 'ref': {
        if (typeof raw !== 'string' || !ID_RE.test(raw)) throw new InvalidField(`${name} : identifiant invalide.`);
        const ref = await prisma.personalRecord.findFirst({ where: { id: raw, userId, kind: f.kind } });
        if (!ref) throw new InvalidField(`${name} : élément introuvable.`);
        out[name] = raw;
        break;
      }
    }
  }
  if (kind === 'treatment' || kind === 'appointment') {
    const s = (out.startDate ?? src.startDate) as string | undefined;
    const e = (out.endDate ?? src.endDate) as string | undefined;
    if (s && e && validDate(s) && validDate(e) && e < s) throw new InvalidField('La date de fin précède la date de début.');
  }
  return out;
}

const view = (r: any) => ({ id: r.id, data: r.data, createdAt: r.createdAt, updatedAt: r.updatedAt });

function resolveKind(req: any, res: Response, wantSingleton: boolean): KindSpec | null {
  const spec = KINDS[String(req.params.kind)];
  if (!spec || Boolean(spec.singleton) !== wantSingleton) {
    fail(res, 404, 'Type de donnée inconnu.');
    return null;
  }
  if (spec.roles && !spec.roles.includes(req.user!.role)) {
    fail(res, 403, "Ce type de donnée n'est pas disponible pour votre profil.");
    return null;
  }
  return spec;
}

async function guard(res: Response, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof InvalidField) return fail(res, 400, e.message);
    throw e;
  }
}

// ---- Fiches uniques (profil) ----
personalRouter.get('/singleton/:kind', asyncHandler(async (req, res) => {
  if (!resolveKind(req, res, true)) return;
  const row = await prisma.personalRecord.findFirst({ where: { userId: req.user!.id, kind: String(req.params.kind) } });
  res.json({ success: true, item: row ? view(row) : null });
}));

personalRouter.put('/singleton/:kind', asyncHandler(async (req, res) => {
  const spec = resolveKind(req, res, true);
  if (!spec) return;
  const kind = String(req.params.kind);
  const userId = req.user!.id;
  await guard(res, async () => {
    const data = await clean(kind, spec, req.body?.data, userId, false);
    const existing = await prisma.personalRecord.findFirst({ where: { userId, kind } });
    const row = existing
      ? await prisma.personalRecord.update({ where: { id: existing.id }, data: { data: data as any } })
      : await prisma.personalRecord.create({ data: { userId, kind, data: data as any } });
    res.json({ success: true, item: view(row) });
  });
}));

// ---- Listes ----
personalRouter.get('/:kind', asyncHandler(async (req, res) => {
  const spec = resolveKind(req, res, false);
  if (!spec) return;
  const rows = await prisma.personalRecord.findMany({
    where: { userId: req.user!.id, kind: String(req.params.kind) },
    orderBy: { createdAt: 'desc' },
    take: spec.maxItems,
  });
  res.json({ success: true, items: rows.map(view) });
}));

personalRouter.post('/:kind', asyncHandler(async (req, res) => {
  const spec = resolveKind(req, res, false);
  if (!spec) return;
  const kind = String(req.params.kind);
  const userId = req.user!.id;
  await guard(res, async () => {
    const data = await clean(kind, spec, req.body?.data, userId, false);
    const count = await prisma.personalRecord.count({ where: { userId, kind } });
    if (count >= spec.maxItems) return fail(res, 409, `Limite atteinte (${spec.maxItems} éléments).`);
    const row = await prisma.personalRecord.create({ data: { userId, kind, data: data as any } });
    res.status(201).json({ success: true, item: view(row) });
  });
}));

personalRouter.patch('/:kind/:id', asyncHandler(async (req, res) => {
  const spec = resolveKind(req, res, false);
  if (!spec) return;
  const kind = String(req.params.kind);
  const id = String(req.params.id);
  const userId = req.user!.id;
  if (!ID_RE.test(id)) return fail(res, 404, 'Élément introuvable.');
  const existing = await prisma.personalRecord.findFirst({ where: { id, userId, kind } });
  if (!existing) return fail(res, 404, 'Élément introuvable.');
  await guard(res, async () => {
    const patch = await clean(kind, spec, req.body?.data, userId, true);
    const merged = { ...(existing.data as Record<string, unknown>), ...patch };
    // Les champs obligatoires doivent rester présents après fusion.
    await clean(kind, spec, merged, userId, false);
    const row = await prisma.personalRecord.update({ where: { id }, data: { data: merged as any } });
    res.json({ success: true, item: view(row) });
  });
}));

personalRouter.delete('/:kind/:id', asyncHandler(async (req, res) => {
  const spec = resolveKind(req, res, false);
  if (!spec) return;
  const kind = String(req.params.kind);
  const id = String(req.params.id);
  const userId = req.user!.id;
  const { count } = await prisma.personalRecord.deleteMany({ where: { id, userId, kind } });
  if (!count) return fail(res, 404, 'Élément introuvable.');
  // Supprimer un traitement supprime aussi l'historique de ses prises.
  if (kind === 'treatment') {
    const intakes = await prisma.personalRecord.findMany({ where: { userId, kind: 'intake' } });
    const orphanIds = intakes.filter((r: any) => (r.data as any)?.treatmentId === id).map((r: any) => r.id);
    if (orphanIds.length) await prisma.personalRecord.deleteMany({ where: { id: { in: orphanIds }, userId } });
  }
  res.json({ success: true });
}));
