import { describe, it, expect } from 'vitest';
// Logique pure du frontend (sans React ni DOM)
import * as L from '../src/dashboards/lib/myDeclarations.js';

const msg = (id: string, direction: string, sentAt: string, content = 'x') => ({ id, direction, sentAt, content });

describe('presentStatus : aucun état inventé', () => {
  it('PENDING = enregistrée mais pas reçue (jamais présentée comme reçue)', () => {
    const s = L.presentStatus({ status: 'PENDING' }, null);
    expect(s.key).toBe('PENDING');
    expect(s.label).not.toMatch(/reçue/i);
    expect(s.tone).toBe('amber');
  });
  it('RECEIVED sans détail Audit => « Reçue » ; avec détail => statut public', () => {
    expect(L.presentStatus({ status: 'RECEIVED' }, null).key).toBe('RECEIVED');
    expect(L.presentStatus({ status: 'RECEIVED' }, { status: 'UNDER_REVIEW' }).key).toBe('UNDER_REVIEW');
    expect(L.presentStatus({ status: 'RECEIVED' }, { status: 'CLOSED' }).key).toBe('CLOSED');
    expect(L.presentStatus({ status: 'RECEIVED' }, { status: 'UNDER_REVIEW', awaitingReporterInformation: true }).key).toBe('AWAITING_INFO');
  });
  it('le détail Audit est ignoré tant que la soumission n\u2019est pas RECEIVED', () => {
    expect(L.presentStatus({ status: 'PENDING' }, { status: 'CLOSED' }).key).toBe('PENDING');
  });
  it('NOT_ROUTABLE / REJECTED / inconnu', () => {
    expect(L.presentStatus({ status: 'NOT_ROUTABLE' }).key).toBe('NOT_ROUTABLE');
    expect(L.presentStatus({ status: 'REJECTED' }).key).toBe('REJECTED');
    expect(L.presentStatus({ status: 'WAT' }).key).toBe('UNKNOWN');
    expect(L.presentStatus(null).key).toBe('UNKNOWN');
  });
});

describe('droits d\u2019action', () => {
  it('renvoi uniquement pour PENDING', () => {
    expect(L.canRetry({ status: 'PENDING' })).toBe(true);
    for (const st of ['RECEIVED', 'NOT_ROUTABLE', 'REJECTED']) expect(L.canRetry({ status: st })).toBe(false);
    // FAILED = statut propre à ce Site (envoi automatique épuisé) : jamais « reçue », renvoi manuel possible.
    expect(L.canRetry({ status: 'FAILED' })).toBe(true);
    expect(L.presentStatus({ status: 'FAILED' }, null).key).toBe('FAILED');
    expect(L.presentStatus({ status: 'FAILED' }, null).label).not.toMatch(/^Reçue/);
  });
  it('messagerie uniquement si RECEIVED et identifiant Audit présent', () => {
    expect(L.canMessage({ status: 'RECEIVED', auditDeclarationId: 'a1' })).toBe(true);
    expect(L.canMessage({ status: 'RECEIVED', auditDeclarationId: null })).toBe(false);
    expect(L.canMessage({ status: 'PENDING', auditDeclarationId: 'a1' })).toBe(false);
  });
});

describe('messages : fusion, non-lus, validation', () => {
  it('mergeMessages dédoublonne par id et trie par date', () => {
    const a = [msg('2', 'FROM_REPORTER', '2026-10-01T10:00:00Z'), msg('1', 'FROM_VIGILANCE', '2026-10-01T09:00:00Z')];
    const b = [msg('2', 'FROM_REPORTER', '2026-10-01T10:00:00Z'), msg('3', 'FROM_VIGILANCE', '2026-10-01T11:00:00Z')];
    expect(L.mergeMessages(a, b).map((m: any) => m.id)).toEqual(['1', '2', '3']);
    expect(L.mergeMessages(undefined, undefined)).toEqual([]);
    expect(L.mergeMessages([{ content: 'sans id' }], [])).toEqual([]);
  });
  it('latestSentAt', () => {
    expect(L.latestSentAt([])).toBeNull();
    expect(L.latestSentAt([msg('1', 'FROM_VIGILANCE', 'a'), msg('2', 'FROM_VIGILANCE', 'c'), msg('3', 'FROM_REPORTER', 'b')])).toBe('c');
  });
  it('unreadCount ne compte que la vigilance, plus récente que le dernier lu', () => {
    const m = [msg('1', 'FROM_VIGILANCE', '2026-10-01T09:00:00Z'), msg('2', 'FROM_REPORTER', '2026-10-01T10:00:00Z'), msg('3', 'FROM_VIGILANCE', '2026-10-01T11:00:00Z')];
    expect(L.unreadCount(m, null)).toBe(2);
    expect(L.unreadCount(m, '2026-10-01T09:00:00Z')).toBe(1);
    expect(L.unreadCount(m, '2026-10-01T12:00:00Z')).toBe(0);
    expect(L.unreadCount([], null)).toBe(0);
  });
  it('validateMessage : même règle que le serveur (trim, non vide, <= 4000)', () => {
    expect(L.validateMessage('   ')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(L.validateMessage(undefined)).toEqual({ ok: false, reason: 'EMPTY' });
    expect(L.validateMessage('a'.repeat(4001))).toEqual({ ok: false, reason: 'TOO_LONG' });
    expect(L.validateMessage('  bonjour  ')).toEqual({ ok: true, content: 'bonjour' });
    expect(L.validateMessage('a'.repeat(4000)).ok).toBe(true);
  });
  it('newIdempotencyKey respecte 8-128 caractères et change à chaque appel', () => {
    const a = L.newIdempotencyKey(), b = L.newIdempotencyKey();
    expect(a).not.toBe(b);
    for (const k of [a, b]) { expect(k.length).toBeGreaterThanOrEqual(8); expect(k.length).toBeLessThanOrEqual(128); }
  });
});

describe('stockage « dernier lu » : jamais bloquant', () => {
  it('lit/écrit avec un storage normal, par utilisateur et par déclaration', () => {
    const store: Record<string, string> = {};
    const st = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    L.writeSeen(st, 'u1', 's1', '2026-10-01T10:00:00Z');
    expect(L.readSeen(st, 'u1', 's1')).toBe('2026-10-01T10:00:00Z');
    expect(L.readSeen(st, 'u2', 's1')).toBeNull();
    expect(L.readSeen(st, 'u1', 's2')).toBeNull();
  });
  it('un storage qui lève (mode privé, quota) ou absent ne casse rien', () => {
    const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(L.readSeen(boom, 'u', 's')).toBeNull();
    expect(() => L.writeSeen(boom, 'u', 's', 'x')).not.toThrow();
    expect(L.readSeen(null, 'u', 's')).toBeNull();
    expect(() => L.writeSeen(undefined, 'u', 's', 'x')).not.toThrow();
  });
});

describe('describeRetry / shorten', () => {
  it('traduit chaque code sans promettre ce qui n\u2019est pas confirmé', () => {
    expect(L.describeRetry({ httpStatus: 201 }).tone).toBe('success');
    expect(L.describeRetry({ httpStatus: 202 }).tone).toBe('warn');
    expect(L.describeRetry({ httpStatus: 202 }).text).not.toMatch(/a bien reçu/);
    expect(L.describeRetry({ httpStatus: 409 }).tone).toBe('info');
    expect(L.describeRetry({ httpStatus: 0 }).tone).toBe('error');
    expect(L.describeRetry(undefined).tone).toBe('error');
  });
  it('shorten tronque proprement et neutralise les espaces', () => {
    expect(L.shorten('a  b\n c')).toBe('a b c');
    expect(L.shorten('x'.repeat(200), 10)).toHaveLength(10);
    expect(L.shorten(null)).toBe('');
  });
});
