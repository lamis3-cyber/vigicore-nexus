import 'dotenv/config';
import './boot'; // config validation (fails fast in production) BEFORE the app/JWT modules load
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { callAudit } from './lib/auditClient';
import { makeMarketAudit } from './lib/demoAudit';
import { retryDueSubmissions } from './services/submissions';
import { retryDueMarketRequests } from './services/market';
import { runLotAlertPass } from './services/lotAlerts';
import { closeAllCallStreams } from './routes/call.routes';
import { describeError } from './lib/safeLog';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const server = createApp().listen(PORT, () => {
  console.log(`VigiCore NEXUS API listening on port ${PORT}`);
});
// Long-lived SSE streams must not be cut by Node's default request timeouts.
server.requestTimeout = 0;
server.keepAliveTimeout = 65_000; // above typical proxy idle timeouts (60 s)
server.headersTimeout = 66_000;

// Renvoi automatique des déclarations enregistrées mais pas encore confirmées par Audit.
// Idempotent côté Audit (Idempotency-Key = id de la soumission) : un renvoi ne crée jamais de doublon,
// même avec plusieurs instances. `running` évite le chevauchement de deux passes dans ce process.
const RETRY_EVERY_MS = 30_000;
let running = false;
const sweep = () => {
  if (running) return;
  running = true;
  retryDueSubmissions({ db: prisma, audit: callAudit })
    .catch((err) => console.error('[submissions] retry job failed:', describeError(err)))
    // Demandes aux fabricants (outbox market) : même balayage, mêmes délais.
    .then(() => retryDueMarketRequests({ db: prisma, audit: makeMarketAudit(prisma, callAudit) }))
    .catch((err) => console.error('[market] retry job failed:', describeError(err)))
    // Alertes de retrait de lot (étape 3) : relit le Logiciel (délai minimum par commande : LOT_ALERTS_INTERVAL_MIN, 15 min).
    // Son PROPRE .catch : une panne ici n'interrompt ni les renvois de déclarations ni ceux des demandes ci-dessus.
    .then(() => runLotAlertPass({ db: prisma, audit: makeMarketAudit(prisma, callAudit) }))
    .catch((err) => console.error('[lotAlerts] pass failed:', describeError(err)))
    .finally(() => { running = false; });
};
const retryTimer = setInterval(sweep, RETRY_EVERY_MS);
// Premier balayage peu après le démarrage : reprend les lignes laissées en attente par un arrêt précédent.
setTimeout(sweep, 5_000).unref();
retryTimer.unref();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, draining...`);
  clearInterval(retryTimer);
  const force = setTimeout(() => { console.error('[shutdown] forced exit after 15 s'); process.exit(1); }, 15_000);
  force.unref();
  closeAllCallStreams(); // otherwise server.close() waits forever on open SSE connections
  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    console.log('[shutdown] done');
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', (r as Error)?.message ?? r));
