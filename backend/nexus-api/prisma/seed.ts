/**
 * Phase 1 seed — creates ONLY the reserved central-queue Establishment
 * (Decision 5). This is the sole piece of reference data Phase 1 requires;
 * no sample users/declarations are seeded here, since populating those is
 * Phase 3 (vertical slice) territory, not foundation-schema scope.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RESERVED_ESTABLISHMENT_NAME = 'VigiCore NEXUS — Central Vigilance Queue';

async function main() {
  const existing = await prisma.establishment.findFirst({
    where: { isSystemReserved: true },
  });

  if (existing) {
    console.log(
      `Reserved central-queue establishment already exists (id=${existing.id}). Skipping.`
    );
    return;
  }

  const created = await prisma.establishment.create({
    data: {
      name: RESERVED_ESTABLISHMENT_NAME,
      type: 'SYSTEM',
      isSystemReserved: true,
    },
  });

  console.log(`Created reserved central-queue establishment: id=${created.id}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
