/**
 * Produits des fiches de la page /services du site, par etablissement (lecture seule).
 *   node scripts/list-listings.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.productListing.findMany({ include: { establishment: { select: { name: true, type: true } } }, orderBy: [{ establishmentId: 'asc' }, { title: 'asc' }] });
  console.log(`\n=== FICHES PRODUITS DU SITE (${rows.length}) ===`);
  if (!rows.length) console.log('Aucune fiche : elles se creent depuis le tableau de bord d\'un compte fournisseur (/dashboard/services).');
  let last = null;
  for (const r of rows) {
    const h = `${r.establishment.name} (${r.establishment.type})`;
    if (h !== last) { console.log(`\n[${h}]`); last = h; }
    console.log(`  - ${r.title} | ${r.category || 'sans categorie'} | ${r.status}`);
  }
  console.log();
})().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
