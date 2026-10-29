import { PrismaClient } from '@prisma/client';

// Standard singleton pattern — avoids exhausting DB connections from
// hot-reloading during dev (ts-node-dev/tsx restarts the module but not
// the process in some setups).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
