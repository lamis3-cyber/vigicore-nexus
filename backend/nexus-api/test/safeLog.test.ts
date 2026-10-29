import { describe, it, expect } from 'vitest';
import { describeError } from '../src/lib/safeLog';

describe('describeError — aucun contenu métier dans les journaux', () => {
  it("une erreur Prisma dont le message contient les arguments (texte clinique) n'est PAS journalisée", () => {
    const e: any = new Error('Invalid `prisma.externalSubmission.create()` invocation: data: { payload: { description: "Jean Dupont, éruption" } }');
    e.name = 'PrismaClientValidationError';
    const out = JSON.stringify(describeError(e));
    expect(out).not.toContain('Jean Dupont'); expect(out).not.toContain('éruption');
    expect(out).toContain('PrismaClientValidationError');
  });
  it('un code Prisma connu (P2002) garde le nom, le code et la cible de la contrainte, pas le message', () => {
    const e: any = Object.assign(new Error('Unique constraint failed on {payload: "secret texte"}'), { code: 'P2002', meta: { target: ['authorUserId', 'clientRequestId'] } });
    const d = describeError(e);
    expect(d).toMatchObject({ code: 'P2002', target: ['authorUserId', 'clientRequestId'] });
    expect(JSON.stringify(d)).not.toContain('secret texte');
  });
  it("une erreur ordinaire garde un message tronqué ; une valeur non-Error ne plante pas", () => {
    expect((describeError(new Error('x'.repeat(500))) as any).message).toHaveLength(200);
    expect(describeError(undefined)).toEqual({ name: 'Error', message: '' });
    expect(describeError('chaîne')).toMatchObject({ name: 'Error' });
  });
});
