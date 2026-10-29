/**
 * Activation d'une organisation sur le Site par CODE (handshake Audit <-> Site) — 2026-10-29.
 *
 * Problème résolu : l'id de l'organisation dans Audit n'est plus recopié à la main. L'administrateur de l'organisation :
 *   1. génère dans Audit un code d'activation (usage unique, 48 h, lié à SON organisation) ;
 *   2. le saisit sur le Site, dans SON établissement ;
 *   3. nexus-api le présente à Audit, qui répond avec l'identité de l'organisation (ref + nom) ;
 *   4. le Site enregistre ce lien (Establishment.auditManufacturerRef). Toutes les fiches de l'établissement en héritent.
 * Double preuve : le code prouve la propriété de l'organisation Audit, la session prouve l'administration de l'établissement Site.
 * Aucun id n'est saisi ni deviné : une faute de frappe ou une usurpation est impossible.
 *
 * Contrat attendu d'Audit — voir docs/audit-site-link-contract.md :
 *   POST /nexus/v1/site-link/redeem  (scope link:write)  body { code, siteEstablishmentId, siteEstablishmentName }
 *   200 { manufacturer: { ref, name } } | 404 CODE_UNKNOWN | 410 CODE_EXPIRED | 409 CODE_USED
 */
import type { AuditTransport } from '../lib/auditClient';
import { linkManufacturer, ManufacturerAlreadyLinkedError } from './market';

export const SITE_LINK_PATH = '/nexus/v1/site-link/redeem';

/** Code tapé à la main : majuscules, sans espaces ; tirets conservés (ex. NUM-7KQ2-X9). */
export function normalizeLinkCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{5,31}$/.test(code) ? code : null;
}

export type SiteLinkErrorCode =
  | 'INVALID_CODE_FORMAT' | 'ESTABLISHMENT_NOT_FOUND' | 'ALREADY_LINKED'
  | 'CODE_UNKNOWN' | 'CODE_EXPIRED' | 'CODE_USED'
  | 'AUDIT_UNAVAILABLE' | 'AUDIT_REFUSED' | 'AUDIT_BAD_RESPONSE' | 'MANUFACTURER_ALREADY_LINKED';

export class SiteLinkError extends Error {
  constructor(public readonly code: SiteLinkErrorCode, public readonly status: number, message: string) { super(message); }
}

export const SITE_LINK_MESSAGE: Record<string, string> = {
  CODE_UNKNOWN: "Ce code d'activation n'existe pas. Vérifiez-le ou générez-en un nouveau dans VigiCore Audit.",
  CODE_EXPIRED: "Ce code d'activation a expiré. Générez-en un nouveau dans VigiCore Audit.",
  CODE_USED: "Ce code d'activation a déjà été utilisé. Générez-en un nouveau dans VigiCore Audit.",
  AUDIT_UNAVAILABLE: 'VigiCore Audit est momentanément injoignable. Réessayez dans quelques minutes.',
  AUDIT_REFUSED: "VigiCore Audit a refusé la demande d'activation. Contactez le support VigiCore.",
  AUDIT_BAD_RESPONSE: "Réponse inattendue de VigiCore Audit. Contactez le support VigiCore.",
};

export interface SiteLinkDeps { db: any; audit: AuditTransport }
export interface RedeemInput { establishmentId: string; code: unknown; userId: string; by: string }

export async function redeemSiteLinkCode(deps: SiteLinkDeps, input: RedeemInput) {
  const code = normalizeLinkCode(input.code);
  if (!code) throw new SiteLinkError('INVALID_CODE_FORMAT', 400, "Code d'activation invalide : 6 à 32 caractères (lettres, chiffres, tirets).");

  const est: any = await deps.db.establishment.findFirst({
    where: { id: input.establishmentId, isSystemReserved: false },
    select: { id: true, name: true, auditManufacturerRef: true },
  });
  if (!est) throw new SiteLinkError('ESTABLISHMENT_NOT_FOUND', 404, 'Établissement introuvable.');
  // Un lien réel ne se remplace pas en libre-service (changement d'organisation = décision du staff VigiCore). Une référence de démo, si.
  if (est.auditManufacturerRef && !est.auditManufacturerRef.startsWith('demo-')) {
    throw new SiteLinkError('ALREADY_LINKED', 409, "Cet établissement est déjà lié à une organisation d'Audit. Pour le changer, contactez le support VigiCore.");
  }

  const r = await deps.audit({
    method: 'POST', path: SITE_LINK_PATH, scope: 'link:write', reporterRef: input.userId,
    body: { code, siteEstablishmentId: est.id, siteEstablishmentName: est.name },
    idempotencyKey: `site-link:${est.id}:${code}`,
  });
  if (r.kind === 'network') throw new SiteLinkError('AUDIT_UNAVAILABLE', 502, SITE_LINK_MESSAGE.AUDIT_UNAVAILABLE);
  if (r.status === 404) throw new SiteLinkError('CODE_UNKNOWN', 422, SITE_LINK_MESSAGE.CODE_UNKNOWN);
  if (r.status === 410) throw new SiteLinkError('CODE_EXPIRED', 422, SITE_LINK_MESSAGE.CODE_EXPIRED);
  if (r.status === 409) throw new SiteLinkError('CODE_USED', 422, SITE_LINK_MESSAGE.CODE_USED);
  if (r.status === 401 || r.status === 403) throw new SiteLinkError('AUDIT_REFUSED', 502, SITE_LINK_MESSAGE.AUDIT_REFUSED);
  const m = r.data?.manufacturer;
  if (r.status !== 200 || typeof m?.ref !== 'string' || !m.ref.trim() || m.ref.length > 100) {
    throw new SiteLinkError('AUDIT_BAD_RESPONSE', 502, SITE_LINK_MESSAGE.AUDIT_BAD_RESPONSE);
  }

  try {
    const updated = await linkManufacturer(deps.db, { establishmentId: est.id, manufacturerRef: m.ref.trim(), by: input.by });
    return { establishment: updated, manufacturer: { ref: m.ref.trim() as string, name: typeof m.name === 'string' ? m.name : null } };
  } catch (err) {
    if (err instanceof ManufacturerAlreadyLinkedError) {
      throw new SiteLinkError('MANUFACTURER_ALREADY_LINKED', 409, err.establishmentName ? `Cette organisation est déjà liée à « ${err.establishmentName} ». Contactez le support VigiCore.` : 'Cette organisation est déjà liée à un autre établissement. Contactez le support VigiCore.');
    }
    throw err;
  }
}

/** État du lien, sans jamais exposer l'id Audit à un simple membre. */
export function siteLinkStatus(est: { auditManufacturerRef: string | null; auditManufacturerLinkedAt: Date | null }) {
  const ref = est.auditManufacturerRef;
  return { linked: !!ref && !ref.startsWith('demo-'), demo: !!ref && ref.startsWith('demo-'), linkedAt: est.auditManufacturerLinkedAt ?? null };
}
