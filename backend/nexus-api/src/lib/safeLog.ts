/**
 * Journalisation d'erreurs SANS contenu métier. Les erreurs Prisma (validation, écriture) embarquent
 * les arguments de la requête dans leur message : la description d'une déclaration, un nom, etc.
 * On n'en garde donc que le nom, le code et la cible de la contrainte. Pour une erreur non-Prisma,
 * le message est conservé, tronqué.
 */
export function describeError(err: unknown): Record<string, unknown> {
  const e = err as any;
  const name = typeof e?.name === 'string' ? e.name : 'Error';
  const code = typeof e?.code === 'string' ? e.code : undefined;
  const prismaLike = name.startsWith('PrismaClient') || (code !== undefined && /^P\d{4}$/.test(code));
  return {
    name,
    ...(code ? { code } : {}),
    ...(e?.meta?.target ? { target: e.meta.target } : {}),
    ...(typeof e?.status === 'number' ? { status: e.status } : {}),
    ...(prismaLike ? {} : { message: String(e?.message ?? '').slice(0, 200) }),
  };
}
