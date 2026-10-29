/**
 * Relie une fiche du Site à un produit d'Audit (pour tester une commande de bout en bout) :
 *
 *   npm run listing:link                                   -> liste les produits d'Audit (ref) et les fiches du fabricant
 *   npm run listing:link -- "<id ou titre de la fiche>" "<ref produit Audit>"
 *   npm run listing:link -- "<id ou titre>" "<ref>" --retitle   -> donne aussi à la fiche le nom du produit d'Audit
 *   npm run listing:link -- "<id ou titre>" --unlink
 *
 * Mêmes règles que l'écran fabricant : produit du fabricant lié à l'établissement, pas deux fiches actives sur le même produit.
 * Écrit directement en base (sans repasser par la revue VigiCore) : réservé aux tests locaux.
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { auditConfigured, callAudit } from '../lib/auditClient';
import { checkProductRef, findLinkConflict, productsOfManufacturer } from '../services/listingProductLink';

const die = (m: string): never => { console.error(`❌ ${m}`); process.exit(1); };
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
  const db: any = prisma;

  if (!auditConfigured()) die('Audit non configuré (AUDIT_BASE_URL / NEXUS_SERVICE_JWT_SECRET).');
  const r = await callAudit({ method: 'GET', path: '/nexus/v1/catalogue/offers', scope: 'orders:read', reporterRef: 'listing-link' });
  if (r.kind !== 'http' || r.status !== 200) die(`Audit injoignable (${r.kind === 'network' ? r.error : `HTTP ${r.status}`}).`);
  const offers: any[] = (r as any).data?.offers ?? [];

  if (args.length === 0) {
    console.log('\nProduits publiés dans Audit (ref = à copier) :');
    for (const o of offers) console.log(`  ${o.ref}  ${o.name}  [${o.reference}]  ${o.unitPrice} DA  — fabricant ${o.manufacturer?.name} (${o.manufacturer?.ref})`);
    const rows: any[] = await db.productListing.findMany({
      where: { status: 'PUBLISHED', reviewStatus: 'APPROVED', sellerKind: { not: 'DISTRIBUTOR' } },
      select: { id: true, title: true, auditProductRef: true, establishment: { select: { name: true, auditManufacturerRef: true } } },
      orderBy: { title: 'asc' },
    });
    console.log(`\nFiches publiées de fabricants (${rows.length}) :`);
    for (const l of rows) console.log(`  ${l.id}  « ${l.title} »  [${l.establishment.name}]  ${l.auditProductRef ? `→ lié à ${l.auditProductRef}` : 'non liée'}`);
    return;
  }

  const [key, ref] = args;
  const all: any[] = await db.productListing.findMany({
    where: { sellerKind: { not: 'DISTRIBUTOR' } },
    select: { id: true, title: true, status: true, sellerKind: true, establishmentId: true, auditProductRef: true, establishment: { select: { id: true, name: true, auditManufacturerRef: true } } },
  });
  const matches = all.filter((l) => l.id === key || norm(l.title) === norm(key));
  if (matches.length === 0) die(`Aucune fiche de fabricant « ${key} ».`);
  if (matches.length > 1) die(`Plusieurs fiches pour « ${key} » : utilisez l'id.`);
  const listing = matches[0];

  if (flags.has('--unlink')) {
    await db.productListing.update({ where: { id: listing.id }, data: { auditProductRef: null } });
    console.log(`✅ Lien retiré de « ${listing.title} ».`);
    return;
  }
  if (!ref) die('Indiquez la ref du produit Audit (voir : npm run listing:link).');

  const check = checkProductRef(ref, { sellerKind: listing.sellerKind, manufacturerRef: listing.establishment.auditManufacturerRef, offers });
  if (!check.ok) die(`${check.message}${check.code === 'MANUFACTURER_NOT_LINKED' ? ' (npm run market:link)' : ''}`);
  const conflict = await findLinkConflict(db, listing.establishmentId, ref, listing.id);
  if (conflict) die(`Ce produit est déjà lié à la fiche « ${conflict.title} » (${conflict.id}) : retirez ce lien d'abord (--unlink).`);

  const product = productsOfManufacturer(offers, listing.establishment.auditManufacturerRef).find((p) => p.ref === ref);
  await db.productListing.update({ where: { id: listing.id }, data: { auditProductRef: ref, ...(flags.has('--retitle') && product ? { title: product.name } : {}) } });
  console.log(`✅ « ${flags.has('--retitle') && product ? product.name : listing.title} » est liée au produit d'Audit « ${product?.name ?? ref} ».`);
  console.log('   Contrôle : npm run market:check');
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => (prisma as any).$disconnect?.());
