/**
 * Client HTTP Nexus -> Audit (backend -> backend, contrat Annexe A).
 *
 * Chaque appel porte un JWT de 60 s signé avec NEXUS_SERVICE_JWT_SECRET (le MÊME
 * secret que côté Audit), `sub` = identifiant du déclarant (signé : Audit ne le
 * lit jamais dans un en-tête ou un corps), un `jti` unique et un scope.
 *
 * Ne lève jamais d'exception : le résultat dit si l'on a une RÉPONSE d'Audit
 * ("http") ou aucune ("network" : coupure, timeout, mauvaise configuration).
 * L'appelant doit traiter "network" comme « envoi NON confirmé », jamais comme
 * un succès ni comme un refus.
 */
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

export type AuditScope = 'catalogue:read' | 'intake:write' | 'intake:read' | 'support:use' | 'orders:read' | 'orders:write' | 'link:write';

export type AuditResult =
  | { kind: 'http'; status: number; data: any }
  | { kind: 'network'; error: string };

export interface AuditRequest {
  method: 'GET' | 'POST';
  path: string; // ex. /nexus/v1/declarations
  scope: AuditScope;
  reporterRef: string;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export type AuditTransport = (req: AuditRequest) => Promise<AuditResult>;

export function auditConfigured(): boolean {
  return !!process.env.AUDIT_BASE_URL && (process.env.NEXUS_SERVICE_JWT_SECRET ?? '').length >= 32;
}

export const callAudit: AuditTransport = async (req) => {
  const base = process.env.AUDIT_BASE_URL;
  const secret = process.env.NEXUS_SERVICE_JWT_SECRET;
  if (!base || !secret || secret.length < 32) {
    return { kind: 'network', error: 'AUDIT_NOT_CONFIGURED' };
  }
  const token = jwt.sign({ scope: req.scope, sub: req.reporterRef, jti: randomUUID() }, secret, {
    algorithm: 'HS256',
    issuer: 'vigicore-nexus',
    audience: 'vigicore-audit',
    expiresIn: 60,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 8000);
  try {
    const res = await fetch(base.replace(/\/+$/, '') + req.path, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(req.idempotencyKey ? { 'Idempotency-Key': req.idempotencyKey } : {}),
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* corps vide ou non JSON */
    }
    return { kind: 'http', status: res.status, data };
  } catch (err: any) {
    return { kind: 'network', error: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR' };
  } finally {
    clearTimeout(timer);
  }
};
