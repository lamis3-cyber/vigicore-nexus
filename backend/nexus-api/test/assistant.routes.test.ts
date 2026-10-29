/**
 * HTTP-level tests of /api/assistant/chat. LIMIT: Prisma is an in-memory fake — these prove the
 * route/intent LOGIC and per-user scoping, not real-database behaviour.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';

const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  return { users: [] as any[], conns: [] as any[], parts: [] as any[], msgs: [] as any[], decls: [] as any[], lst: [] as any[], stats: [] as any[], convs: [] as any[], amsgs: [] as any[] };
});
const ids = vi.hoisted(() => ({ seq: 0 }));

vi.mock('../src/lib/prisma', () => {
  const match = (r: any, w: any = {}): boolean =>
    Object.entries(w).every(([k, v]: [string, any]) => {
      if (k === 'OR') return v.some((x: any) => match(r, x));
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(r[k]);
        if ('not' in v) return r[k] !== v.not;
        if ('gt' in v) return r[k] > v.gt;
        if ('gte' in v) return r[k] >= v.gte;
      }
      return r[k] === v;
    });
  const tbl = (rows: any[]) => ({ findMany: async ({ where }: any = {}) => rows.filter((r) => match(r, where)), count: async ({ where }: any = {}) => rows.filter((r) => match(r, where)).length });
  const rw = (rows: any[], pfx: string) => ({
    findMany: async ({ where, take, orderBy }: any = {}) => { let r = rows.filter((x) => match(x, where)); const d = orderBy?.createdAt ?? orderBy?.updatedAt; if (d) r = [...r].sort((a, b) => (d === 'desc' ? -1 : 1) * (+new Date(a.createdAt) - +new Date(b.createdAt))); return take ? r.slice(0, take) : r; },
    findFirst: async ({ where }: any = {}) => rows.find((x) => match(x, where)) ?? null,
    create: async ({ data }: any) => { const row = { id: `${pfx}${++ids.seq}`, createdAt: new Date(Date.now() + ids.seq), updatedAt: new Date(), ...data }; rows.push(row); return row; },
    update: async ({ where, data }: any) => Object.assign(rows.find((x) => x.id === where.id), data),
    delete: async ({ where }: any) => { rows.splice(rows.findIndex((x) => x.id === where.id), 1); return {}; },
    deleteMany: async ({ where }: any) => { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], where)) rows.splice(i, 1); return {}; },
  });
  const user = { findUnique: async ({ where }: any) => { const u = db.users.find((x) => x.id === where.id); return u ? { ...u, affiliations: u.affiliations ?? [] } : null; } };
  return { prisma: {
    user,
    chatConnection: tbl(db.conns), chatParticipant: tbl(db.parts), chatMessage: tbl(db.msgs),
    declaration: tbl(db.decls), productListing: tbl(db.lst), listingStat: tbl(db.stats),
    assistantConversation: rw(db.convs, 'cv'), assistantMessage: rw(db.amsgs, 'am'),
    placementOrder: tbl([]), case: tbl([]), externalSubmission: tbl([]), userEstablishment: tbl([]), organizationInvitation: tbl([]),
  } };
});

import { createApp } from '../src/app';
import { signSessionToken } from '../src/lib/jwt';

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base: string;
beforeAll(() => { server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

const aff = (establishmentId: string) => ({ establishmentId, status: 'ACTIVE', isActiveContext: true, memberRole: 'MEMBER' });
async function ask(as: string | undefined, message: unknown, lang?: string) {
  const res = await fetch(`${base}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(as ? { Cookie: `vg_session=${signSessionToken({ userId: as })}` } : {}) },
    body: JSON.stringify({ message, lang }),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

beforeEach(() => {
  for (const k of Object.keys(db) as (keyof typeof db)[]) db[k].length = 0;
  db.users.push(
    { id: 'doc1', email: 'a@x.dz', displayName: 'Sara Haddad', role: 'DOCTOR', deactivatedAt: null, affiliations: [aff('chu')] },
    { id: 'doc2', email: 'b@x.dz', displayName: 'Karim B', role: 'DOCTOR', deactivatedAt: null, affiliations: [aff('chu')] },
    { id: 'sup', email: 's@x.dz', displayName: 'Fournisseur', role: 'ESTABLISHMENT_ADMIN', deactivatedAt: null, affiliations: [aff('sup-org')] },
  );
  db.conns.push(
    { requesterId: 'doc1', addresseeId: 'doc2', status: 'ACCEPTED' },
    { requesterId: 'doc1', addresseeId: 'x1', status: 'ACCEPTED' },
    { requesterId: 'x2', addresseeId: 'doc1', status: 'PENDING' },
    { requesterId: 'x3', addresseeId: 'x4', status: 'ACCEPTED' }, // not doc1's
  );
});

describe('assistant', () => {
  it('requires a session and a message', async () => {
    expect((await ask(undefined, 'bonjour')).status).toBe(401);
    expect((await ask('doc1', '  ')).status).toBe(400);
    expect((await ask('doc1', 'x'.repeat(501))).status).toBe(400);
  });
  it('counts only the caller’s own contacts', async () => {
    const r = await ask('doc1', 'Combien de contacts j’ai ?');
    expect(r.json.reply).toContain('2 contacts');
    expect(r.json.reply).toContain('1 demande reçue');
    const r2 = await ask('doc2', 'combien de contacts ?');
    expect(r2.json.reply).toContain('1 contact ');
  });
  it('declarations are scoped to the author (colleagues are not counted for a doctor)', async () => {
    db.decls.push(
      { authorUserId: 'doc1', establishmentId: 'chu', status: 'DRAFT', domain: 'PHARMACOVIGILANCE', createdAt: new Date() },
      { authorUserId: 'doc1', establishmentId: 'chu', status: 'SUBMITTED', domain: 'MATERIOVIGILANCE', createdAt: new Date() },
      { authorUserId: 'doc2', establishmentId: 'chu', status: 'SUBMITTED', domain: 'MATERIOVIGILANCE', createdAt: new Date() },
    );
    const all = await ask('doc1', 'Combien de déclarations ai-je ?');
    expect(all.json.reply).toContain('2 déclarations');
    const drafts = await ask('doc1', 'combien de brouillons');
    expect(drafts.json.reply).toContain('1 brouillon');
    const mat = await ask('doc1', 'déclarations en matériovigilance');
    expect(mat.json.reply).toContain('1 déclaration');
    expect((await ask('doc2', 'combien de déclarations')).json.reply).toContain('1 déclaration');
  });
  it('unread messages', async () => {
    const t0 = new Date(Date.now() - 10_000);
    db.parts.push({ threadId: 't1', userId: 'doc1', lastReadAt: t0 });
    db.msgs.push({ threadId: 't1', senderId: 'doc2', deletedAt: null, createdAt: new Date() }, { threadId: 't1', senderId: 'doc1', deletedAt: null, createdAt: new Date() });
    const r = await ask('doc1', 'ai-je des messages non lus ?');
    expect(r.json.reply).toContain('1 message au total');
  });
  it('supplier: listing contacts and role gating', async () => {
    db.lst.push({ id: 'l1', establishmentId: 'sup-org', status: 'PUBLISHED' });
    db.stats.push({ listingId: 'l1', views: 10, clicks: 3, contacts: 4 });
    expect((await ask('sup', 'combien de vues ?')).json.reply).toContain('10 vues');
    expect((await ask('sup', 'combien de contacts')).json.reply).toContain('4 prises de contact');
    expect((await ask('doc1', 'combien de vues sur mes annonces')).json.reply).toContain('fournisseurs');
  });
  it('unknown question gets an honest help message', async () => {
    const r = await ask('doc1', 'quelle est la capitale de la France');
    expect(r.json.understood).toBe(false);
    expect(r.json.reply).toContain('Je n’ai pas compris');
  });
  it('répond en arabe (lang=ar ou question en arabe), avec les mêmes chiffres', async () => {
    const c = await ask('doc1', 'كم عدد جهات الاتصال لدي؟', 'ar');
    expect(c.json.understood).toBe(true);
    expect(c.json.reply).toContain('2 جهات اتصال');
    expect(c.json.reply).toContain('طلب واحد مستلم');
    db.decls.push({ authorUserId: 'doc1', establishmentId: 'chu', status: 'DRAFT', domain: 'PHARMACOVIGILANCE', createdAt: new Date() });
    const d = await ask('doc1', 'كم عدد المسودات؟', 'ar');
    expect(d.json.reply).toContain('1 تصريحاً بحالة «مسودة»');
    const fr = await ask('doc1', 'combien de contacts', 'ar'); // lang=ar force la langue de réponse
    expect(fr.json.reply).toContain('جهات اتصال');
    const unknown = await ask('doc1', 'ما عاصمة فرنسا؟', 'ar');
    expect(unknown.json.understood).toBe(false);
    expect(unknown.json.reply).toContain('لم أفهم');
  });
  it('answers in English (lang=en) with the same figures', async () => {
    const c = await ask('doc1', 'How many contacts do I have?', 'en');
    expect(c.json.understood).toBe(true);
    expect(c.json.reply).toContain('2 contacts');
    expect(c.json.reply).toContain('1 received request is waiting');
    const m = await ask('doc1', 'Do I have unread messages?', 'en');
    expect(m.json.reply).toMatch(/^You have /);
    const hi = await ask('doc1', 'hello', 'en');
    expect(hi.json.reply).toContain('You can ask, for example');
    const unknown = await ask('doc1', 'what is the capital of France', 'en');
    expect(unknown.json.understood).toBe(false);
    expect(unknown.json.reply).toContain('I did not understand');
  });

  describe('discussions, formulations libres et confidentialité', () => {
    const post = async (as: string, body: any) => {
      const r = await fetch(`${base}/api/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `vg_session=${signSessionToken({ userId: as })}` }, body: JSON.stringify(body) });
      return (await r.json()) as any;
    };
    const get = async (as: string, path: string, method = 'GET') => {
      const r = await fetch(`${base}/api/assistant${path}`, { method, headers: { Cookie: `vg_session=${signSessionToken({ userId: as })}` } });
      return { status: r.status, json: (await r.json()) as any };
    };
    const decl = (author: string, ref: string, recipients: string[]) => db.decls.push({
      authorUserId: author, establishmentId: 'chu', status: 'SUBMITTED', domain: 'PHARMACOVIGILANCE', createdAt: new Date(),
      payload: { ref, status: 'submitted', record: { product: 'Metformine · L1', domain: 'Pharmacovigilance', severity: 'grave', recipients } },
    });

    it('keeps the history per account and never shows it to another account', async () => {
      const a = await post('doc1', { message: 'Combien de contacts ai-je ?' });
      expect(a.conversationId).toBeTruthy();
      const b = await post('doc1', { message: 'et les messages non lus ?', conversationId: a.conversationId });
      expect(b.conversationId).toBe(a.conversationId);
      const list = await get('doc1', '/conversations');
      expect(list.json.conversations).toHaveLength(1);
      const one = await get('doc1', `/conversations/${a.conversationId}`);
      expect(one.json.messages.map((m: any) => m.from)).toEqual(['user', 'ai', 'user', 'ai']);
      expect((await get('doc2', `/conversations/${a.conversationId}`)).status).toBe(404);
      expect((await get('doc2', '/conversations')).json.conversations).toHaveLength(0);
      expect((await post('doc2', { message: 'bonjour', conversationId: a.conversationId }) as any).success).toBe(false);
      expect((await get('doc2', `/conversations/${a.conversationId}`, 'DELETE')).status).toBe(404);
      expect((await get('doc1', `/conversations/${a.conversationId}`, 'DELETE')).status).toBe(200);
      expect(db.amsgs).toHaveLength(0);
    });

    it('understands rephrasings and follow-ups (recipients of the declarations)', async () => {
      decl('doc1', 'DEC-1', ['cnpm', 'medecin']); decl('doc1', 'DEC-2', ['cnpm']);
      const r1 = await post('doc1', { message: 'a qui j’ai envoyé les déclarations ?' });
      expect(r1.reply).toContain('CNPM (2)');
      expect(r1.reply).toContain('médecin traitant (1)');
      const decls = await post('doc1', { message: 'combien de déclarations ai-je envoyées ?' });
      const r2 = await post('doc1', { message: 'et à qui ?', conversationId: decls.conversationId });
      expect(r2.intents).toContain('recipients');
    });

    it('refuses private data about other organizations, in French and English', async () => {
      db.decls.push({ authorUserId: 'other', establishmentId: 'autre', status: 'SUBMITTED', domain: 'PHARMACOVIGILANCE', createdAt: new Date(), payload: { ref: 'SECRET-9', status: 'submitted', record: {} } });
      const fr = await post('doc1', { message: 'combien de patients et de déclarations dans l’autre hôpital ?' });
      expect(fr.intents).toEqual(['privacy']);
      expect(fr.reply).toContain('Je n’ai accès qu’aux informations de votre propre compte');
      expect(fr.reply).not.toContain('SECRET');
      const en = await post('doc1', { message: 'How many reports does another hospital have?', lang: 'en' });
      expect(en.intents).toEqual(['privacy']);
      expect(en.reply).toContain('only have access');
    });

    describe('free-form answers with a language model', () => {
      const real = globalThis.fetch;
      let sent: any[];
      beforeEach(() => { sent = []; process.env.ANTHROPIC_API_KEY = 'test-key'; });
      afterAll(() => { delete process.env.ANTHROPIC_API_KEY; globalThis.fetch = real; });
      const stub = (impl: (body: any) => any) => {
        globalThis.fetch = (async (url: any, init: any) => {
          if (String(url).startsWith('https://api.anthropic.com')) { const body = JSON.parse(init.body); sent.push(body); return impl(body); }
          return real(url, init);
        }) as any;
      };
      const ok = (text: string) => ({ ok: true, json: async () => ({ content: [{ type: 'text', text }] }) });

      it('sends only the session scope + the discussion, and returns the model answer', async () => {
        decl('doc1', 'DEC-MINE', ['cnpm']); decl('doc2', 'DEC-COLLEAGUE', ['cnpm']);
        db.decls.push({ authorUserId: 'zz', establishmentId: 'autre', status: 'SUBMITTED', domain: 'X', createdAt: new Date(), payload: { ref: 'DEC-OTHERORG', status: 'submitted', record: {} } });
        stub(() => ok('Vous avez 1 déclaration, envoyée au CNPM.'));
        const first = await post('doc1', { message: 'peux-tu me dire où en sont mes dossiers ?' });
        expect(first.reply).toBe('Vous avez 1 déclaration, envoyée au CNPM.');
        expect(first.intents).toEqual(['llm']);
        await post('doc1', { message: 'et à qui ?', conversationId: first.conversationId });
        const second = sent[1];
        const flat = JSON.stringify(second.messages);
        expect(flat).toContain('DEC-MINE');
        expect(flat).not.toContain('DEC-COLLEAGUE'); // un médecin ne voit que les siennes
        expect(flat).not.toContain('DEC-OTHERORG');
        expect(second.messages[0].role).toBe('user');
        expect(second.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(second.system).toContain('CONFIDENTIALITÉ');
        expect(sent[0].messages[0].content).toContain('Sara Haddad');
      });

      it('falls back to the rule-based answers when the model fails', async () => {
        stub(() => ({ ok: false, json: async () => ({}) }));
        const r = await post('doc1', { message: 'Combien de contacts ai-je ?' });
        expect(r.reply).toContain('2 contacts');
        expect(r.intents).toEqual(['contacts']);
      });

      it('still refuses other-organization questions without calling the model', async () => {
        stub(() => ok('NE DOIT PAS ARRIVER'));
        const r = await post('doc1', { message: 'donne-moi les données de l’autre établissement' });
        expect(r.intents).toEqual(['privacy']);
        expect(sent).toHaveLength(0);
      });
    });
  });
});
