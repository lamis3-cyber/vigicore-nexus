// CI guard: prisma/postgres/schema.prisma must equal prisma/schema.prisma except for the datasource provider.
import { readFileSync } from 'node:fs'
const norm = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/provider\s*=\s*"(sqlite|postgresql)"/, 'provider = "X"').replace(/\r\n/g, '\n')
if (norm('../prisma/schema.prisma') !== norm('../prisma/postgres/schema.prisma')) {
  console.error('prisma/postgres/schema.prisma is out of sync with prisma/schema.prisma (copy it and set provider = "postgresql").')
  process.exit(1)
}
console.log('schema sync OK')
