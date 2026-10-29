// Tiny in-memory Prisma stand-in for auth tests (users + password reset tokens).
export function makeAuthDb() {
  let seq = 0;
  const state = { users: [] as any[], tokens: [] as any[] };
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('gt' in v) return row[k] > v.gt;
        if ('not' in v) return row[k] !== v.not;
        return true;
      }
      return row[k] === v;
    });
  const prisma: any = {
    user: {
      findFirst: async ({ where }: any = {}) => state.users.find((r) => match(r, where)) ?? null,
      findUnique: async ({ where, include }: any) => {
        const u = state.users.find((r) => match(r, where));
        return u && include?.affiliations ? { ...u, affiliations: [] } : u ?? null;
      },
      create: async ({ data }: any) => {
        if (state.users.some((u) => u.email === data.email)) throw Object.assign(new Error('Unique'), { code: 'P2002' });
        const r = { id: `u${++seq}`, deactivatedAt: null, passwordChangedAt: null, ...data };
        state.users.push(r);
        return r;
      },
      update: async ({ where, data }: any) => Object.assign(state.users.find((r) => match(r, where)), data),
    },
    establishment: { findFirst: async () => null, create: async () => ({ id: 'e1' }) },
    userEstablishment: { create: async () => ({}) },
    passwordResetToken: {
      create: async ({ data }: any) => { const r = { id: `t${++seq}`, usedAt: null, createdAt: new Date(), ...data }; state.tokens.push(r); return r; },
      deleteMany: async ({ where }: any) => { const keep = state.tokens.filter((t) => !match(t, where)); const n = state.tokens.length - keep.length; state.tokens.splice(0, state.tokens.length, ...keep); return { count: n }; },
      findUnique: async ({ where }: any) => { const t = state.tokens.find((r) => match(r, where)); return t ? { ...t, user: state.users.find((u) => u.id === t.userId) } : null; },
      updateMany: async ({ where, data }: any) => { const hits = state.tokens.filter((r) => match(r, where) && (where.usedAt !== null || r.usedAt === null)); hits.forEach((h) => Object.assign(h, data)); return { count: hits.length }; },
    },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
  };
  return { prisma, state };
}
