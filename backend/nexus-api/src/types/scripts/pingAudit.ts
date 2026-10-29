/**
 * Diagnostic de la liaison Site -> Audit : `npm run audit:ping`.
 * Dit en clair pourquoi une commande n'arrive pas chez le commercial (URL, secret, port, scope).
 */
import 'dotenv/config';
import { auditConfigured, callAudit } from '../lib/auditClient';

(async () => {
  console.log(`AUDIT_BASE_URL            = ${process.env.AUDIT_BASE_URL ?? '(vide)'}`);
  console.log(`NEXUS_SERVICE_JWT_SECRET  = ${(process.env.NEXUS_SERVICE_JWT_SECRET ?? '').length >= 32 ? 'OK (>= 32 car.)' : 'ABSENT ou trop court'}`);
  console.log(`MARKET_DEMO_OFFERS        = ${process.env.MARKET_DEMO_OFFERS ?? '(vide)'}${process.env.MARKET_DEMO_OFFERS === 'true' ? '  <-- les commandes de démo ne partent PAS chez Audit' : ''}`);
  console.log(`SMTP_HOST / MAIL_FROM     = ${process.env.SMTP_HOST && process.env.MAIL_FROM ? 'OK' : 'ABSENTS (aucun e-mail fournisseur)'}`);
  if (!auditConfigured()) { console.error('\nX Liaison NON configurée (URL ou secret manquant).'); process.exit(1); }
  const r = await callAudit({ method: 'GET', path: '/nexus/v1/catalogue/offers', scope: 'orders:read', reporterRef: 'ping' });
  if (r.kind === 'network') { console.error(`\nX Audit injoignable : ${r.error} (mauvais port / Audit éteint ?)`); process.exit(1); }
  if (r.status === 200) for (const o of r.data?.offers ?? []) console.log(`   • ${o.ref}  ${o.name}  ${o.unitPrice} DA`);
  if (r.status === 200) console.log(`\nOK Audit répond : ${r.data?.offers?.length ?? 0} offre(s) publiée(s) sur le Site.${r.data?.offers?.length ? '' : ' (0 = aucun produit "publishedToSite" avec prix)'}`);
  else { console.error(`\nX Audit répond HTTP ${r.status} ${JSON.stringify(r.data)} (401 = secret différent, 403 = scope, 503 = secret absent côté Audit).`); process.exit(1); }
})();
