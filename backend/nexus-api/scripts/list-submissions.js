/**
 * Declarations envoyees depuis le site vers Audit et leur etat (lecture seule).
 *   node scripts/list-submissions.js
 * RECEIVED = recue par la vigilance | PENDING = enregistree, renvoi automatique |
 * FAILED = Audit injoignable | NOT_ROUTABLE = aucune organisation destinataire | REJECTED = refusee
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.externalSubmission.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  console.log(`\n=== DECLARATIONS (${rows.length} dernieres) ===`);
  if (!rows.length) console.log('Aucune declaration enregistree : la requete n\'est jamais arrivee jusqu\'a la base du site.');
  for (const r of rows) {
    const p = r.payload || {};
    console.log(`\n${r.createdAt.toISOString()}  ${r.status}  produit=${p.productRef || '?'}  tentatives=${r.attempts}`);
    if (r.failureReason) console.log(`   raison : ${r.failureReason}`);
    if (r.lastError) console.log(`   derniere erreur : ${String(r.lastError).slice(0, 200)}`);
    if (r.auditDeclarationId) console.log(`   reçue par Audit : ${r.auditDeclarationId}`);
  }
  console.log();
})().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
