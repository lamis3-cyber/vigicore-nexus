import { describe, it, expect, vi } from 'vitest';
import {
  sendSubmission, retryDueSubmissions, parseSubmissionPayload, buildAuditBody, backoffMs, toSubmissionDto,
  MAX_AUTO_ATTEMPTS,
} from '../src/services/submissions';
import type { AuditTransport } from '../src/lib/auditClient';

const reporter = { id: 'user-1', role: 'doctor', displayName: 'Dr Test' };
const NOW = new Date('2026-10-14T10:00:00Z');

function fakeDb(initial: Partial<any> = {}) {
  const row: any = {
    id: 'sub-1', authorUserId: 'user-1', status: 'PENDING', attempts: 0, nextAttemptAt: null,
    payload: { productRef: 'prod-1', description: 'Rash', lotNumber: 'L1' }, createdAt: NOW, ...initial,
  };
  const db: any = {
    row,
    externalSubmission: {
      findUnique: async () => ({ ...row }),
      findMany: async ({ where }: any) => (row.status === where.status && row.nextAttemptAt && row.nextAttemptAt <= where.nextAttemptAt.lte ? [{ ...row }] : []),
      update: async ({ data }: any) => Object.assign(row, data),
    },
    user: { findUnique: async () => ({ id: 'user-1', role: 'doctor', displayName: 'Dr Test' }) },
  };
  return db;
}
const deps = (db: any, audit: AuditTransport) => ({ db, audit, now: () => NOW });

describe('sendSubmission — on n\'annonce jamais un succès non confirmé', () => {
  it('201 d\'Audit => RECEIVED + auditDeclarationId ; Idempotency-Key = id de la soumission', async () => {
    const db = fakeDb();
    const audit = vi.fn<AuditTransport>(async () => ({ kind: 'http', status: 201, data: { auditDeclarationId: 'aud-9', receivedAt: '2026-10-14T10:00:01.000Z', routingBasis: 'PRODUCT_OWNER_DEFAULT' } }));
    const s = await sendSubmission(deps(db, audit), 'sub-1', reporter);
    expect(s).toMatchObject({ status: 'RECEIVED', auditDeclarationId: 'aud-9', attempts: 1, nextAttemptAt: null });
    expect(audit.mock.calls[0][0]).toMatchObject({ method: 'POST', path: '/nexus/v1/declarations', scope: 'intake:write', idempotencyKey: 'sub-1', reporterRef: 'user-1' });
  });
  it('200 (rejeu côté Audit) => RECEIVED aussi', async () => {
    const db = fakeDb();
    const s = await sendSubmission(deps(db, async () => ({ kind: 'http', status: 200, data: { auditDeclarationId: 'aud-9' } })), 'sub-1', reporter);
    expect(s?.status).toBe('RECEIVED');
  });
  it('201 SANS auditDeclarationId => PAS RECEIVED (réponse suspecte)', async () => {
    const db = fakeDb();
    const s = await sendSubmission(deps(db, async () => ({ kind: 'http', status: 201, data: {} })), 'sub-1', reporter);
    expect(s?.status).toBe('PENDING');
  });
  it('422 NOT_ROUTABLE => NOT_ROUTABLE avec la raison, brouillon conservé, pas de renvoi auto', async () => {
    const db = fakeDb();
    const s = await sendSubmission(deps(db, async () => ({ kind: 'http', status: 422, data: { error: 'NOT_ROUTABLE', reason: 'PRODUCT_NOT_APPROVED' } })), 'sub-1', reporter);
    expect(s).toMatchObject({ status: 'NOT_ROUTABLE', failureReason: 'PRODUCT_NOT_APPROVED', nextAttemptAt: null });
  });
  it('400 / 409 => REJECTED définitif', async () => {
    for (const status of [400, 409]) {
      const db = fakeDb();
      const s = await sendSubmission(deps(db, async () => ({ kind: 'http', status, data: { error: 'VALIDATION_ERROR' } })), 'sub-1', reporter);
      expect(s).toMatchObject({ status: 'REJECTED', nextAttemptAt: null });
    }
  });
  it('réseau coupé / timeout / 5xx / 401 / 503 => PENDING avec nouvelle tentative programmée', async () => {
    const cases: any[] = [{ kind: 'network', error: 'TIMEOUT' }, { kind: 'http', status: 502, data: null }, { kind: 'http', status: 503, data: { error: 'NEXUS_INTEGRATION_NOT_CONFIGURED' } }, { kind: 'http', status: 401, data: null }];
    for (const result of cases) {
      const db = fakeDb();
      const s = await sendSubmission(deps(db, async () => result), 'sub-1', reporter);
      expect(s?.status).toBe('PENDING');
      expect(s?.nextAttemptAt).toEqual(new Date(NOW.getTime() + backoffMs(1)));
      expect(s?.lastError).toBeTruthy();
    }
  });
  it('au-delà de MAX_AUTO_ATTEMPTS : FAILED actionnable (jamais un PENDING éternel), plus de renvoi automatique', async () => {
    const db = fakeDb({ attempts: MAX_AUTO_ATTEMPTS - 1 });
    const s = await sendSubmission(deps(db, async () => ({ kind: 'network', error: 'NETWORK_ERROR' })), 'sub-1', reporter);
    expect(s).toMatchObject({ status: 'FAILED', failureReason: 'AUDIT_UNAVAILABLE', nextAttemptAt: null });
  });
  it('déjà RECEIVED : aucun nouvel appel à Audit', async () => {
    const db = fakeDb({ status: 'RECEIVED', auditDeclarationId: 'aud-1' });
    const audit = vi.fn<AuditTransport>();
    await sendSubmission(deps(db, audit), 'sub-1', reporter);
    expect(audit).not.toHaveBeenCalled();
  });
  it('un renvoi réutilise EXACTEMENT la même Idempotency-Key', async () => {
    const db = fakeDb();
    const audit = vi.fn<AuditTransport>(async () => ({ kind: 'network', error: 'NETWORK_ERROR' }));
    await sendSubmission(deps(db, audit), 'sub-1', reporter);
    await sendSubmission(deps(db, audit), 'sub-1', reporter);
    expect(audit.mock.calls.map((c) => c[0].idempotencyKey)).toEqual(['sub-1', 'sub-1']);
  });
});

describe('retryDueSubmissions', () => {
  it('renvoie les PENDING arrivés à échéance et ignore les autres', async () => {
    const due = fakeDb({ nextAttemptAt: new Date(NOW.getTime() - 1000) });
    const audit = vi.fn<AuditTransport>(async () => ({ kind: 'http', status: 201, data: { auditDeclarationId: 'aud-2' } }));
    expect(await retryDueSubmissions(deps(due, audit))).toBe(1);
    expect(due.row.status).toBe('RECEIVED');

    const notDue = fakeDb({ nextAttemptAt: new Date(NOW.getTime() + 60_000) });
    const audit2 = vi.fn<AuditTransport>();
    expect(await retryDueSubmissions(deps(notDue, audit2))).toBe(0);
    expect(audit2).not.toHaveBeenCalled();
  });
});

describe('contenu envoyé à Audit', () => {
  it('n\'envoie JAMAIS organizationId / patient / e-mail, même s\'ils sont dans le corps', () => {
    const parsed = parseSubmissionPayload({ productRef: 'p', description: 'd', organizationId: 'org-evil', patientName: 'X', email: 'a@b.c' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const body = buildAuditBody({ ...(parsed.payload as any), organizationId: 'org-evil' }, reporter);
    expect(JSON.stringify(body)).not.toMatch(/org-evil|patientName|a@b\.c/);
    expect(body.reporter).toEqual({ role: 'doctor', displayName: 'Dr Test' });
  });
  it('valide les entrées', () => {
    expect(parseSubmissionPayload({ description: 'd' }).ok).toBe(false);
    expect(parseSubmissionPayload({ productRef: 'p', description: '  ' }).ok).toBe(false);
    expect(parseSubmissionPayload({ productRef: 'p', description: 'd', declaredSeverity: 'critique' }).ok).toBe(false);
    expect(parseSubmissionPayload({ productRef: 'p', description: 'd', declaredSeverity: 'grave', lotNumber: 'L1' }).ok).toBe(true);
    expect(parseSubmissionPayload(null).ok).toBe(false);
  });
  it('le DTO navigateur n\'expose ni lastError, ni attempts, ni authorUserId', () => {
    const dto = toSubmissionDto({ id: 'x', status: 'PENDING', createdAt: NOW, payload: { description: 'd', productRef: 'p' }, lastError: 'secret', attempts: 3, authorUserId: 'u' });
    expect(Object.keys(dto).sort()).toEqual(['auditDeclarationId', 'autoRetryExhausted', 'createdAt', 'declaredSeverity', 'description', 'device', 'failureReason', 'id', 'kind', 'lotNumber', 'malfunction', 'productLabel', 'productRef', 'receivedAt', 'retrying', 'status']);
  });
  it('backoff exponentiel plafonné à 15 min', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([30_000, 60_000, 120_000]);
    expect(backoffMs(50)).toBe(15 * 60_000);
  });
});
