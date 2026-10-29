/**
 * Vérifie que chaque commande passée sur /services arrive chez le vendeur :
 *
 *   npm run market:check
 *
 * Lit les fiches publiées et approuvées, interroge le VRAI Audit (jamais le mode démo) et affiche, pour chaque
 * maillon manquant, quoi corriger. Code de sortie 1 s'il reste une erreur bloquante. Ne modifie rien.
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { auditConfigured, callAudit } from '../lib/auditClient';
import { mailConfigured } from '../lib/email';
import { demoMarketEnabled } from '../lib/demoAudit';
import { checkMarketChain, type CheckInput } from '../services/marketCheck';

const ICON = { ok: '✅', warn: '⚠️ ', error: '❌' } as const;

async function main() {
  const listings: any[] = await (prisma as any).productListing.findMany({
    where: { status: 'PUBLISHED', reviewStatus: 'APPROVED' },
    select: {
      id: true, title: true, category: true, sellerKind: true, auditProductRef: true,
      unitPrice: true, priceUnit: true, minOrderQty: true, inStock: true, stockQty: true,
      establishment: { select: { id: true, name: true, auditManufacturerRef: true, buyerCategory: true, buyerCategoryStatus: true } },
    },
    orderBy: { title: 'asc' },
  });

  let audit: CheckInput['audit'] = null;
  if (auditConfigured()) {
    const r = await callAudit({ method: 'GET', path: '/nexus/v1/catalogue/offers', scope: 'orders:read', reporterRef: 'market-check' });
    audit = r.kind === 'http' && r.status === 200
      ? { ok: true, offers: (r.data?.offers ?? []) as any[] }
      : { ok: false, error: r.kind === 'network' ? r.error : `HTTP ${r.status}${r.data?.error ? ` ${r.data.error}` : ''}` };
  }

  const items = checkMarketChain({ demoMode: demoMarketEnabled(), auditConfigured: auditConfigured(), audit, mailConfigured: mailConfigured(), listings });
  console.log(`\nChaîne des commandes — ${listings.length} fiche(s) publiée(s)\n`);
  for (const it of items) {
    console.log(`${ICON[it.level]} ${it.where} : ${it.message}`);
    if (it.fix && it.level !== 'ok') console.log(`     → ${it.fix}`);
  }
  const errors = items.filter((i) => i.level === 'error').length;
  const warns = items.filter((i) => i.level === 'warn').length;
  console.log(errors || warns
    ? `\n${errors} erreur(s) bloquante(s), ${warns} avertissement(s). Corrigez puis relancez : npm run market:check\n`
    : '\nTout est prêt : chaque commande arrive chez le vendeur.\n');
  if (errors) process.exitCode = 1;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
