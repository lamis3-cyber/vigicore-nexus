import './lib/asyncErrors'; // must run before any router/middleware is created
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.routes';
import { servicesRouter } from './routes/services.routes';
import { imageRouter } from './routes/image.routes';
import { aiRouter } from './routes/ai.routes';
import { chatRouter } from './routes/chat.routes';
import { careRouter } from './routes/care.routes';
import { callRouter } from './routes/call.routes';
import { contactRouter } from './routes/contact.routes';
import { orgsRouter } from './routes/orgs.routes';
import { vigilanceRouter } from './routes/vigilance.routes';
import { accountRouter } from './routes/account.routes';
import { recordsRouter } from './routes/records.routes';
import { nativeRecordsRouter } from './routes/nativeRecords.routes';
import { supportRouter } from './routes/support.routes';
import { marketRouter } from './routes/market.routes';
import { draftsRouter } from './routes/drafts.routes';
import { personalRouter } from './routes/personal.routes';
import { assistantRouter } from './routes/assistant.routes';
import { declarationsRouter, catalogueRouter } from './routes/declarations.routes';
import { attachUser } from './middleware/requireAuth';
import { securityHeaders, apiLimiter, enforceHttps, requestLog } from './lib/security';
import { parseTrustProxy } from './lib/config';
import { prisma } from './lib/prisma';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Only trust X-Forwarded-* when told how many proxies sit in front (TRUST_PROXY=1, "loopback", CIDR...).
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  app.use(requestLog);
  app.use(enforceHttps);
  app.use(securityHeaders());
  app.use(
    cors({
      origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5176').split(',').map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(cookieParser());
  // Product images and payment receipts travel as data URLs, so the default 100 kB is too small.
  app.use(express.json({ limit: '3mb' }));
  app.use(attachUser);

  // Liveness (process up) and readiness (database answers). Neither exposes internals.
  app.get('/health', (_req, res) => res.json({ success: true }));
  app.get('/health/ready', async (_req, res) => {
    try {
      await Promise.race([prisma.$queryRaw`SELECT 1`, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
      res.json({ success: true });
    } catch {
      res.status(503).json({ success: false });
    }
  });

  app.use('/api', apiLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/image', imageRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/orgs', orgsRouter); // join requests, invitations, org-admin approvals
  app.use('/api/chat', chatRouter);
  app.use('/api/care', careRouter); // lien médecin ↔ patient (consentement du patient)
  app.use('/api/declarations', declarationsRouter); // Site -> Audit (outbox idempotent) + relais de messages
  app.use('/api/vigilance', vigilanceRouter); // déclarations saisies dans les tableaux de bord
  app.use('/api/account', accountRouter); // réglages et profil du compte connecté
  app.use('/api/records', recordsRouter); // patients suivis + journal d'audit (routes fixes, avant /:id)
  app.use('/api/records', nativeRecordsRouter); // dossiers natifs (panne interne / patient) + file d'établissement
  app.use('/api/personal', personalRouter); // données personnelles du tableau de bord (produits, traitements, RDV, profil…)
  app.use('/api/drafts', draftsRouter); // brouillons des assistants de déclaration (compte de l'utilisateur)
  app.use('/api/support', supportRouter); // client -> support d'une organisation (Audit, rôle SUPPORT)
  app.use('/api/market', marketRouter); // commandes / demandes d'intérêt aux fabricants (Audit), sans paiement
  app.use('/api/assistant', assistantRouter); // assistant du tableau de bord, réponses tirées de la base
  app.use('/api/catalogue', catalogueRouter); // produits approuvés déclarables
  app.use('/api/call', callRouter); // audio/video call signaling (SSE + POST), see call.routes.ts

  // Matches the { success: false, message } shape every route already uses.
  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Not found.' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (err?.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request body too large.', code: 'PAYLOAD_TOO_LARGE' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Malformed JSON body.', code: 'INVALID_JSON' });
    // Log the message only: stacks/objects can embed request payloads (health data, receipts, tokens).
    console.error('[error]', err?.name ?? 'Error', err?.message ?? '');
    res.status(500).json({ success: false, message: 'Internal server error.' });
  });

  return app;
}
