/**
 * MODE DÉMO des commandes (MARKET_DEMO_OFFERS=true) — jamais actif par défaut.
 *
 * VigiCore Audit n'est pas toujours disponible en local (et l'Audit de ce dépôt ne publie pas encore
 * /nexus/v1/catalogue/offers). Ce transport remplace Audit UNIQUEMENT pour les routes « commandes / intérêts » :
 *   GET  /nexus/v1/catalogue/offers      -> une offre par fiche publiée dont l'établissement est lié à un fabricant « demo-… »
 *   POST /nexus/v1/orders | /interests   -> accepte et renvoie une référence DEMO-…
 *   GET  /nexus/v1/orders|interests/:ref -> statut inchangé
 * Tout le reste (déclarations, support…) continue d'aller vers le vrai Audit via `real`.
 * Les demandes sont quand même écrites dans MarketRequest, exactement comme en production.
 *
 * GARDE-FOU (2026-10-29) : le mode démo ne simule QUE les offres « demo-offer-… ». Une commande ou une demande d'intérêt
 * portant sur un vrai produit d'Audit est TOUJOURS transmise au vrai Audit, et le catalogue des offres affiche les
 * vraies offres en plus des offres de démo. Avant, un MARKET_DEMO_OFFERS=true oublié faisait « confirmer » (DEMO-ORD-…)
 * des commandes qui n'arrivaient jamais chez l'organisation.
 */
import { randomUUID } from 'node:crypto';
import type { AuditTransport } from './auditClient';

export const DEMO_MANUFACTURER_PREFIX = 'demo-';
const ORDERABLE_BY = ['DISTRIBUTOR', 'PUBLIC_INSTITUTION', 'EXPORT'];

/** Prix indicatif stable (DA) calculé depuis l'id de la fiche : toujours le même pour une même fiche. */
function demoPrice(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 250 + (h % 96) * 50;
}

export const DEMO_OFFER_PREFIX = 'demo-offer-';

/** true = la requête POST /orders ou /interests ne vise que des offres de démonstration (donc simulable). */
export function isDemoOrderBody(body: any): boolean {
  const refs: unknown[] = Array.isArray(body?.lines) ? body.lines.map((l: any) => l?.productRef) : [body?.productRef];
  return refs.length > 0 && refs.every((r) => typeof r === 'string' && r.startsWith(DEMO_OFFER_PREFIX));
}

export const demoMarketEnabled = (env: Record<string, string | undefined> = process.env) => env.MARKET_DEMO_OFFERS === 'true';

export function makeMarketAudit(db: any, real: AuditTransport, enabled = demoMarketEnabled()): AuditTransport {
  if (!enabled) return real;
  return async (req) => {
    if (!req.path.startsWith('/nexus/v1/catalogue/offers') && !/^\/nexus\/v1\/(orders|interests)(\/|$)/.test(req.path)) {
      return real(req);
    }
    if (req.method === 'GET' && req.path.startsWith('/nexus/v1/catalogue/offers')) {
      const q = (new URL(req.path, 'http://x').searchParams.get('q') ?? '').trim().toLowerCase();
      const rows = await db.productListing.findMany({
        where: {
          status: 'PUBLISHED',
          reviewStatus: 'APPROVED',
          establishment: { auditManufacturerRef: { startsWith: DEMO_MANUFACTURER_PREFIX } },
        },
        select: { id: true, title: true, establishment: { select: { name: true, auditManufacturerRef: true } } },
        orderBy: { title: 'asc' },
      });
      const demoOffers = rows
        .filter((l: any) => !q || String(l.title ?? '').toLowerCase().includes(q))
        .map((l: any) => ({
          ref: `${DEMO_OFFER_PREFIX}${l.id}`,
          name: l.title,
          reference: `REF-${String(l.id).replace(/^demo-svc-lst-/, '').toUpperCase()}`,
          unitPrice: demoPrice(l.id),
          orderableBy: ORDERABLE_BY,
          manufacturer: { ref: l.establishment.auditManufacturerRef, name: l.establishment.name },
        }));
      // Vraies offres d'Audit en plus (si Audit répond) : le mode démo ne doit jamais cacher le vrai catalogue.
      const realRes = await real(req).catch(() => null);
      const realOffers = realRes && realRes.kind === 'http' && realRes.status === 200 && Array.isArray(realRes.data?.offers) ? realRes.data.offers : [];
      return { kind: 'http', status: 200, data: { offers: [...realOffers, ...demoOffers] } };
    }
    // Commande / intérêt sur un vrai produit d'Audit : jamais simulé.
    if (req.method === 'POST' && !isDemoOrderBody(req.body)) return real(req);
    if (req.method === 'POST') {
      const isOrder = req.path.startsWith('/nexus/v1/orders');
      const ref = `${isOrder ? 'DEMO-ORD' : 'DEMO-INT'}-${randomUUID().slice(0, 8).toUpperCase()}`;
      return { kind: 'http', status: 201, data: isOrder ? { orderRef: ref, status: 'PENDING' } : { interestRef: ref, status: 'NEW' } };
    }
    // Suivi d'une demande : une référence DEMO-… est simulée ; toute autre est une vraie demande, relue chez Audit.
    if (!/\/(DEMO-)/.test(req.path)) return real(req);
    return { kind: 'http', status: 200, data: { status: req.path.startsWith('/nexus/v1/orders') ? 'PENDING' : 'NEW' } };
  };
}
