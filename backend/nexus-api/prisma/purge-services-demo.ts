/**
 * Supprime les données de test créées par seed-services-demo.ts (id préfixés « demo-svc- »).
 * Ne touche à aucune vraie organisation, aucun vrai produit, aucun vrai compte.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const P = 'demo-svc-';

async function main() {
  const startsWith = { startsWith: P };
  const listings = await prisma.productListing.findMany({ where: { OR: [{ id: startsWith }, { establishmentId: startsWith }] }, select: { id: true } });
  const listingIds = listings.map((l) => l.id);

  const r = await prisma.$transaction([
    prisma.marketRequest.deleteMany({ where: { OR: [{ establishmentId: startsWith }, { requesterUserId: startsWith }] } }),
    prisma.placementOrder.deleteMany({ where: { OR: [{ establishmentId: startsWith }, { listingId: { in: listingIds } }] } }),
    prisma.listingLike.deleteMany({ where: { listingId: { in: listingIds } } }),
    prisma.listingStat.deleteMany({ where: { listingId: { in: listingIds } } }),
    prisma.productListing.deleteMany({ where: { id: { in: listingIds } } }),
    prisma.userEstablishment.deleteMany({ where: { OR: [{ establishmentId: startsWith }, { userId: startsWith }] } }),
    prisma.user.deleteMany({ where: { id: startsWith } }),
    prisma.establishment.deleteMany({ where: { id: startsWith } }),
  ]);
  console.log(`Purge terminée — produits : ${r[4].count}, comptes : ${r[6].count}, organisations : ${r[7].count}.`);
}

main().catch((e) => { console.error('Purge failed:', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
