/**
 * Suivi d'une déclaration par l'ÉTABLISSEMENT (l'enquête appartient au fabricant, via VigiCore Audit) :
 *  - mesures internes prises par l'établissement (quarantaine, mise hors service, information des équipes…) ;
 *  - état RÉEL de la transmission au fabricant et de son enquête (Reçue → En cours → Clôturée) ;
 *  - signal : autres déclarations du même produit / du même lot dans l'établissement.
 * Aucune donnée n'est envoyée au fabricant par ce module : il ne fait que LIRE l'état exposé par Audit.
 */
import { prisma } from '../lib/prisma';
import { callAudit, auditConfigured } from '../lib/auditClient';

type Field = { key: string; value: unknown; sensitivity?: string };
const db = prisma as any;

// ── Mesures internes ───────────────────────────────────────────────────────────
export const MEASURE_IDS = ['quarantaine', 'hors_service', 'retrait_stock', 'equipes_informees', 'remplace', 'aucune'] as const;
export type MeasureId = (typeof MEASURE_IDS)[number];
export const MEASURE_NOTE_MAX = 500;

export function parseMeasures(body: any): { ok: true; measures: MeasureId[]; note: string | null } | { ok: false; message: string } {
  const raw = Array.isArray(body?.measures) ? body.measures : null;
  if (!raw || raw.length === 0 || raw.length > MEASURE_IDS.length) return { ok: false, message: 'measures must be a non-empty list.' };
  const measures = [...new Set(raw)] as MeasureId[];
  if (!measures.every((m) => (MEASURE_IDS as readonly string[]).includes(m as string))) return { ok: false, message: 'measures contains an unknown value.' };
  if (measures.includes('aucune') && measures.length > 1) return { ok: false, message: '« aucune » cannot be combined with another measure.' };
  let note: string | null = null;
  if (body?.note !== undefined && body?.note !== null && body?.note !== '') {
    if (typeof body.note !== 'string' || body.note.trim().length > MEASURE_NOTE_MAX) return { ok: false, message: `note must be at most ${MEASURE_NOTE_MAX} characters.` };
    note = body.note.trim() || null;
  }
  return { ok: true, measures, note };
}

export type MeasureEntry = { type: 'MEASURES'; measures: MeasureId[]; note: string | null; byUserId: string; byName: string; at: string };

export function measuresOf(row: any): Omit<MeasureEntry, 'byUserId' | 'type'>[] {
  const notes = Array.isArray(row?.case?.notes) ? row.case.notes : [];
  return notes
    .filter((n: any) => n && n.type === 'MEASURES' && Array.isArray(n.measures))
    .map((n: any) => ({ measures: n.measures, note: n.note ?? null, byName: String(n.byName ?? ''), at: String(n.at) }));
}

/** Ajoute une entrée « mesures » au suivi (Case.notes) — crée le suivi si besoin. Le statut de la déclaration n'est pas modifié. */
export async function addMeasures(row: any, entry: MeasureEntry) {
  const existing = await db.case.findUnique({ where: { declarationId: row.id } });
  if (existing) {
    const notes = Array.isArray(existing.notes) ? existing.notes : [];
    await db.case.update({ where: { declarationId: row.id }, data: { notes: [...notes, entry] } });
  } else {
    await db.case.create({ data: {
      declarationId: row.id, status: 'OPENED', establishmentId: row.establishmentId, departmentId: row.departmentId ?? null, notes: [entry],
    } });
  }
}

// ── Transmission au fabricant et enquête ───────────────────────────────────────
/** États d'une ligne MANUFACTURER : ceux de l'envoi tant qu'il n'est pas reçu, puis ceux de l'enquête côté fabricant. */
export const INVESTIGATION_STATES = new Set(['RECEIVED', 'UNDER_REVIEW', 'WAITING_INFO', 'CLOSED']);
const LINK_WINDOW_MS = 10 * 60 * 1000;
const AUDIT_REFRESH_MS = 60 * 1000;
const AUDIT_BATCH = 10;

const payloadOf = (r: any): Field[] => (Array.isArray(r?.payload) ? r.payload : []);
const fieldOf = (r: any, k: string) => payloadOf(r).find((f) => f.key === k)?.value as string | undefined;

function investigationFrom(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  if (data.status === 'CLOSED') return 'CLOSED';
  if (data.awaitingReporterInformation === true) return 'WAITING_INFO';
  if (data.status === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (data.status === 'RECEIVED') return 'RECEIVED';
  return null;
}

async function setDeliveryStatus(d: any, status: string) {
  if (d.status === status) return;
  d.status = status; d.updatedAt = new Date();
  try { await db.declarationDelivery.updateMany({ where: { id: d.id }, data: { status } }); } catch { /* affichage seulement */ }
}

async function refreshFromAudit(d: any, sub: any) {
  const r = await callAudit({
    method: 'GET', path: `/nexus/v1/declarations/${encodeURIComponent(sub.auditDeclarationId)}`,
    scope: 'intake:read', reporterRef: sub.authorUserId, timeoutMs: 4000,
  });
  const st = r.kind === 'http' && r.status === 200 ? investigationFrom(r.data) : null;
  if (st) await setDeliveryStatus(d, st);
}

/**
 * Relit l'état de chaque transmission au fabricant.
 *  1. lien explicite (ligne MANUFACTURER dont l'id = id de l'envoi) ; sinon, pour une déclaration antérieure au lien,
 *     l'envoi du MÊME auteur sur le MÊME produit du catalogue dans les 10 minutes (le lien est alors enregistré) ;
 *  2. tant que l'envoi n'est pas reçu : état de l'envoi ; ensuite : état de l'enquête lu chez Audit.
 * `waitAudit` : attend la lecture chez Audit (détail d'une déclaration) ; sinon elle se fait en arrière-plan (listes).
 */
export async function syncManufacturer<T extends any[]>(rows: T, opts: { waitAudit?: boolean } = {}): Promise<T> {
  try {
    // 1. Lien de rattrapage
    const unlinked = (rows as any[]).filter((r) => r && fieldOf(r, 'productRef') && !(r.deliveries ?? []).some((x: any) => x.destination === 'MANUFACTURER'));
    if (unlinked.length) {
      const from = new Date(Math.min(...unlinked.map((r) => new Date(r.createdAt).getTime())) - 60_000);
      const subs = await db.externalSubmission.findMany({
        where: { authorUserId: { in: [...new Set(unlinked.map((r) => r.authorUserId))] }, createdAt: { gte: from } },
        select: { id: true, payload: true, createdAt: true, authorUserId: true },
      });
      const used = new Set<string>();
      for (const r of unlinked) {
        const t = new Date(r.createdAt).getTime();
        const match = subs
          .filter((x: any) => !used.has(x.id) && x.authorUserId === r.authorUserId && x.payload?.productRef === fieldOf(r, 'productRef'))
          .map((x: any) => ({ x, d: new Date(x.createdAt).getTime() - t }))
          .filter((m: any) => m.d >= -60_000 && m.d <= LINK_WINDOW_MS)
          .sort((a: any, b: any) => Math.abs(a.d) - Math.abs(b.d))[0];
        if (!match) continue;
        used.add(match.x.id);
        const d = { id: match.x.id, declarationId: r.id, destination: 'MANUFACTURER', status: 'PENDING', updatedAt: new Date(0) };
        r.deliveries = [...(r.deliveries ?? []), d];
        try { await db.declarationDelivery.create({ data: { id: d.id, declarationId: r.id, destination: 'MANUFACTURER', status: 'PENDING' } }); } catch { /* déjà lié */ }
      }
    }

    // 2. État de l'envoi, puis de l'enquête
    const links = (rows as any[]).flatMap((r) => (r?.deliveries ?? []).filter((x: any) => x.destination === 'MANUFACTURER'));
    if (!links.length) return rows;
    const subs = await db.externalSubmission.findMany({
      where: { id: { in: links.map((d: any) => d.id) } },
      select: { id: true, status: true, auditDeclarationId: true, authorUserId: true },
    });
    const byId = new Map<string, any>(subs.map((s: any) => [s.id, s]));
    const toRefresh: { d: any; sub: any }[] = [];
    for (const d of links) {
      const sub = byId.get(d.id);
      if (!sub) continue;
      if (sub.status !== 'RECEIVED') { await setDeliveryStatus(d, sub.status); continue; }
      if (!INVESTIGATION_STATES.has(d.status)) await setDeliveryStatus(d, 'RECEIVED');
      const stale = Date.now() - new Date(d.updatedAt ?? 0).getTime() > AUDIT_REFRESH_MS;
      if (d.status !== 'CLOSED' && sub.auditDeclarationId && auditConfigured() && (stale || opts.waitAudit)) toRefresh.push({ d, sub });
    }
    const batch = toRefresh.slice(0, AUDIT_BATCH).map(({ d, sub }) => refreshFromAudit(d, sub).catch(() => undefined));
    if (opts.waitAudit) await Promise.all(batch);
  } catch { /* lecture impossible : les lignes gardent leur dernier état connu */ }
  return rows;
}

// ── Signal : même produit / même lot dans l'établissement ──────────────────────
const SIGNAL_WINDOW_MS = 90 * 24 * 3600 * 1000;
const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const productKey = (r: any) => norm(fieldOf(r, 'productRef')) || norm(fieldOf(r, 'productName')) || norm(fieldOf(r, 'device.name'));
const lotKey = (r: any) => norm(fieldOf(r, 'lot')) || norm(fieldOf(r, 'device.serialNumber'));

/** Pour chaque ligne : nombre de déclarations (elle comprise) du même produit / lot, sur 90 jours, parmi `pool`. */
export function signalsFor(rows: any[], pool: any[]): Map<string, { sameProduct: number; sameLot: number; lot: string | null }> {
  const out = new Map();
  for (const r of rows) {
    const p = productKey(r); const l = lotKey(r); const t = new Date(r.createdAt).getTime();
    const near = pool.filter((x) => x.establishmentId === r.establishmentId && Math.abs(new Date(x.createdAt).getTime() - t) <= SIGNAL_WINDOW_MS);
    const sameProduct = p ? near.filter((x) => productKey(x) === p).length : 0;
    const sameLot = p && l ? near.filter((x) => productKey(x) === p && lotKey(x) === l).length : 0;
    out.set(r.id, { sameProduct, sameLot, lot: l ? (fieldOf(r, 'lot') ?? fieldOf(r, 'device.serialNumber') ?? null) : null });
  }
  return out;
}
