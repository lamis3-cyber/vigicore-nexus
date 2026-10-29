/**
 * Relie un établissement du Site (fabricant) à son organisation dans VigiCore Audit :
 *
 *   npm run market:link                              -> état : organisations d'Audit, établissements et liens
 *   npm run market:link -- --auto                    -> propose les liens évidents (même nom) SANS rien écrire
 *   npm run market:link -- --auto --apply            -> applique ces liens
 *   npm run market:link -- "Numidia Pharma" "<id ou nom de l'organisation Audit>"
 *   npm run market:link -- "Numidia Pharma" --unlink
 *   npm run market:link -- "Numidia Pharma" "<id copié d'Audit>" --force   -> lie même si Audit ne publie encore aucune offre
 *
 * Mêmes garde-fous que l'écran staff (PUT /market/admin/manufacturers/link) : on ne lie qu'une organisation connue d'Audit
 * (elle publie au moins une offre) et jamais la même organisation à deux établissements. Les fiches produit n'ont rien à
 * modifier : elles héritent du lien de leur établissement. Contrôle ensuite : npm run market:check
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { auditConfigured, callAudit } from '../lib/auditClient';
import { linkManufacturer, ManufacturerAlreadyLinkedError } from '../services/market';
import {
  auditManufacturers, findEstablishment, findManufacturer, isDemoRef, proposeLinks,
  type AuditManufacturer, type EstablishmentLite,
} from '../services/manufacturerLink';

const BY = 'cli:market-link';
const die = (msg: string): never => { console.error(`❌ ${msg}`); process.exit(1); };

async function loadAuditManufacturers(): Promise<AuditManufacturer[]> {
  if (!auditConfigured()) die('Audit non configuré : renseigner AUDIT_BASE_URL et NEXUS_SERVICE_JWT_SECRET (≥ 32 caractères) dans le .env.');
  const r = await callAudit({ method: 'GET', path: '/nexus/v1/catalogue/offers', scope: 'orders:read', reporterRef: BY });
  if (!(r.kind === 'http' && r.status === 200)) die(`Audit injoignable ou refuse le Site (${r.kind === 'network' ? r.error : `HTTP ${r.status}`}).`);
  return auditManufacturers((r as any).data?.offers ?? []);
}

const loadEstablishments = (): Promise<EstablishmentLite[]> =>
  (prisma as any).establishment.findMany({
    where: { isSystemReserved: false, OR: [{ type: { in: ['LABORATOIRE', 'SUPPLIER'] } }, { auditManufacturerRef: { not: null } }] },
    select: { id: true, name: true, type: true, auditManufacturerRef: true },
    orderBy: { name: 'asc' },
  });

async function apply(est: EstablishmentLite, ref: string | null) {
  try {
    const u = await linkManufacturer(prisma, { establishmentId: est.id, manufacturerRef: ref, by: BY });
    console.log(ref ? `✅ « ${u.name} » lié à l'organisation Audit ${ref}.` : `✅ « ${u.name} » délié d'Audit.`);
  } catch (err) {
    if (err instanceof ManufacturerAlreadyLinkedError) die(err.establishmentName ? `Cette organisation est déjà liée à « ${err.establishmentName} ».` : 'Cette organisation est déjà liée à un autre établissement.');
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const pos = args.filter((a) => !a.startsWith('--'));

  if (flags.has('--unlink')) {
    if (pos.length !== 1) die('Usage : npm run market:link -- "<établissement>" --unlink');
    const f = findEstablishment(await loadEstablishments(), pos[0]);
    if (!f.ok) return die(f.reason === 'AMBIGUOUS' ? 'Plusieurs établissements portent ce nom : utiliser son id.' : `Établissement « ${pos[0]} » introuvable.`);
    return apply(f.item, null);
  }

  const manufacturers = await loadAuditManufacturers();
  const establishments = await loadEstablishments();

  if (flags.has('--auto')) {
    const plan = proposeLinks(establishments, manufacturers);
    if (!plan.length) return console.log('Aucun lien évident (nom identique) à proposer. Lier à la main : npm run market:link -- "<établissement>" "<organisation Audit>"');
    for (const p of plan) console.log(`${flags.has('--apply') ? '→' : '•'} « ${p.establishment.name} »  ⇄  ${p.manufacturer.name} (${p.manufacturer.ref}, ${p.manufacturer.offers} offre(s))`);
    if (!flags.has('--apply')) return console.log('\nAperçu seulement. Ajouter --apply pour enregistrer.');
    for (const p of plan) await apply(p.establishment, p.manufacturer.ref);
    return console.log('\nContrôle : npm run market:check');
  }

  if (pos.length === 2) {
    const e = findEstablishment(establishments, pos[0]);
    if (!e.ok) return die(e.reason === 'AMBIGUOUS' ? 'Plusieurs établissements portent ce nom : utiliser son id.' : `Établissement « ${pos[0]} » introuvable.`);
    const m = findManufacturer(manufacturers, pos[1]);
    if (!m.ok && flags.has('--force') && /^[A-Za-z0-9._:-]{8,100}$/.test(pos[1].trim()) && !isDemoRef(pos[1].trim())) {
      console.warn("⚠️  --force : l'id n'est PAS vérifié auprès d'Audit (aucune offre publiée pour cette organisation). Les fiches ne seront commandables qu'une fois ses produits publiés (« Offre en ligne »).");
      return apply(e.item, pos[1].trim());
    }
    if (!m.ok) {
      return die(m.reason === 'AMBIGUOUS'
        ? 'Plusieurs organisations portent ce nom dans Audit : utiliser son id.'
        : `« ${pos[1]} » n'est pas une organisation connue d'Audit : elle doit publier au moins un produit sur le Site (« Offre en ligne ») pour apparaître.`);
    }
    return apply(e.item, m.item.ref);
  }
  if (pos.length) die('Usage : npm run market:link -- "<établissement>" "<id ou nom de l\'organisation Audit>"');

  // Sans argument : état des lieux.
  console.log(`\nOrganisations d'Audit qui publient des offres pour le Site (${manufacturers.length})`);
  if (!manufacturers.length) console.log("  (aucune) → dans Audit, ouvrir chaque produit à vendre et activer « Offre en ligne ».");
  const linkedTo = new Map(establishments.filter((e) => e.auditManufacturerRef).map((e) => [e.auditManufacturerRef as string, e.name]));
  for (const m of manufacturers) console.log(`  ${m.ref}  ${m.name}  (${m.offers} offre(s))  ${linkedTo.has(m.ref) ? `→ lié à « ${linkedTo.get(m.ref)} »` : '→ non lié'}`);
  console.log(`\nÉtablissements du Site (${establishments.length})`);
  for (const e of establishments) {
    const state = !e.auditManufacturerRef ? 'non lié' : isDemoRef(e.auditManufacturerRef) ? `⚠️  ${e.auditManufacturerRef} (référence de démo : à remplacer)` : e.auditManufacturerRef;
    console.log(`  ${e.name} [${e.type}]  ${state}`);
  }
  console.log('\nLier : npm run market:link -- "<établissement>" "<organisation Audit>"   |   liens évidents : npm run market:link -- --auto\n');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
