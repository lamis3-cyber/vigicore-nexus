/**
 * Données de TEST de la page /services — 2 organisations fournisseurs, 11 fiches (10 produits + la fiche « partenaire à la une »).
 *
 *   npm run seed:services-demo     → crée (ou remet à jour) les données de test
 *   npm run purge:services-demo    → supprime TOUT ce qui a été créé ici, rien d'autre
 *
 * Aucun changement de schéma : tout ce qui est créé ici porte un id préfixé « demo-svc- »
 * (organisations, comptes, produits). La purge supprime uniquement ces id-là, donc les vraies
 * organisations et leurs produits ne sont jamais touchés. Les images sont dans
 * frontend/public/demo-products/ (le dossier se supprime avec la purge manuelle, voir README).
 */
import { PrismaClient, ListingPlacement } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
export const DEMO_PREFIX = 'demo-svc-';
const PASSWORD = 'Demo@12345';
const IMG = '/demo-products/';

type Org = { id: string; name: string; email: string; contact: string; phone: string; website: string };
const ORGS: Org[] = [
  { id: `${DEMO_PREFIX}org-numidia`, name: 'Numidia Pharma', email: 'numidia@demo.vigicore.dz', contact: 'contact@numidia-pharma.dz', phone: '+213 36 00 00 01', website: 'https://numidia-pharma.dz' },
  { id: `${DEMO_PREFIX}org-atlas`, name: 'Atlas Médical Distribution', email: 'atlas@demo.vigicore.dz', contact: 'contact@atlas-medical.dz', phone: '+213 36 00 00 02', website: 'https://atlas-medical.dz' },
];

type P = {
  key: string; org: 0 | 1; title: string; summary: string; description: string;
  category: 'Medical' | 'Pharmaceuticals' | 'Chemical' | 'Cosmetic' | 'IVD products';
  img: string; placement: ListingPlacement; certs?: string[]; fit?: 'cover' | 'contain';
};

const PRODUCTS: P[] = [
  // ── Numidia Pharma ────────────────────────────────────────────────────────────
  { key: 'insuline', org: 0, title: 'Algerpharm — Insuline glargine 100 UI/mL, stylo prérempli 3 mL', summary: 'Insuline basale en stylo prérempli, conservation 2–8 °C.', description: 'Insuline glargine 100 UI/mL en stylo prérempli de 3 mL. Médicament soumis à prescription (liste I). À conserver entre 2 et 8 °C.', category: 'Pharmaceuticals', img: 'insuline-glargine.jpg', placement: 'SPONSORED', certs: ['BPF', 'Chaîne du froid'] },
  { key: 'solaire', org: 0, title: 'NOUR — Crème solaire SPF 50+ très haute protection, 200 mL', summary: 'Protection solaire très haute, flacon pompe de 200 mL.', description: 'Crème solaire SPF 50+ à très haute protection, flacon de 200 mL avec embout pompe.', category: 'Cosmetic', img: 'nour-spf50.jpg', placement: 'SPONSORED' },
  { key: 'paracetamol', org: 0, title: 'Pharmora — Paracétamol 500 mg, boîte de 20 comprimés', summary: 'Comprimés de paracétamol 500 mg, boîte de 20 (2 plaquettes).', description: 'Paracétamol 500 mg, comprimés, boîte de 20. Liste 0. Lot et date de péremption imprimés sur la boîte.', category: 'Pharmaceuticals', img: 'paracetamol-500.jpg', placement: 'RECOMMENDED' },
  { key: 'dermia', org: 0, title: 'DERMIA — Crème hydratante peaux sensibles, 50 mL', summary: 'Soin quotidien sans parfum, sans paraben, hypoallergénique.', description: 'Crème hydratante pour peaux sensibles, tube de 50 mL. Sans parfum, sans paraben, hypoallergénique.', category: 'Cosmetic', img: 'dermia-creme.jpg', placement: 'RECOMMENDED' },
  { key: 'ethanol', org: 0, title: 'CHEMOLAB — Éthanol 96 %, qualité analytique, 1 L', summary: 'Éthanol 96 % qualité analytique, flacon verre ambré 1 L.', description: 'Éthanol 96 % de qualité analytique en flacon de verre ambré de 1 L. Danger : liquide inflammable.', category: 'Chemical', img: 'ethanol-96.jpg', placement: 'STANDARD' },
  // Featured partner (exclusive slot): the organization itself, shown with its factory photo.
  { key: 'usine', org: 0, title: 'NumidiaPharma — Usine de production pharmaceutique', summary: 'Formes sèches, formes liquides, solutions injectables et dispositifs médicaux.', description: 'NumidiaPharma — Santé pour tous. Usine de production pharmaceutique : formes sèches, formes liquides, solutions injectables et dispositifs médicaux.', category: 'Pharmaceuticals', img: 'numidia-usine.jpg', fit: 'cover', placement: 'FEATURED', certs: ['BPF', 'Qualité'] },
  // ── Atlas Médical Distribution ────────────────────────────────────────────────
  { key: 'hepatite', org: 1, title: 'DIAGNOVA — Test rapide Hépatite B (HBsAg), boîte de 25', summary: 'Test rapide sérum/plasma, résultat en 15 minutes.', description: 'Test rapide de détection de l\'antigène HBsAg sur sérum ou plasma, lecture en 15 minutes, boîte de 25 tests. Dispositif de diagnostic in vitro (CE IVD).', category: 'IVD products', img: 'test-hepatite-b.jpg', placement: 'RECOMMENDED', certs: ['CE IVD', 'ISO 13485'] },
  { key: 'catheter', org: 1, title: 'SURGITEC — Cathéter veineux périphérique 18G, boîte de 50', summary: 'Cathéter stérile 18G 1,3 × 45 mm avec ailettes.', description: 'Cathéter veineux périphérique 18G (1,3 × 45 mm), stérile, à usage unique, boîte de 50.', category: 'Medical', img: 'catheter-18g.jpg', placement: 'SPONSORED' },
  { key: 'bandelettes', org: 1, title: 'DIAGNOVA — Bandelettes de glycémie, sang total, 50', summary: 'Flacon de 50 bandelettes pour l\'autocontrôle glycémique.', description: 'Bandelettes de glycémie sur sang total, flacon de 50. Dispositif de diagnostic in vitro (CE IVD).', category: 'IVD products', img: 'bandelettes-glycemie.jpg', placement: 'RECOMMENDED' },
  { key: 'seringue', org: 1, title: 'MEDISAFE — Seringue stérile 5 mL Luer, boîte de 100', summary: 'Seringue à usage unique, Luer, 5 mL, stérile.', description: 'Seringue stérile à usage unique, embout Luer, 5 mL, boîte de 100. Ne pas réutiliser ; stérile si l\'emballage est intact.', category: 'Medical', img: 'seringue-5ml.jpg', placement: 'STANDARD' },
  { key: 'gel', org: 1, title: 'CHEMOLAB — Gel hydroalcoolique pour les mains, 500 mL', summary: 'Gel de désinfection des mains, flacon pompe 500 mL.', description: 'Gel hydroalcoolique pour la désinfection des mains, flacon pompe de 500 mL.', category: 'Chemical', img: 'gel-hydroalcoolique.jpg', placement: 'STANDARD' },
];

// Les 18 fiches « Exemple » de la page /services (demo-1 … demo-18) en VRAIES fiches publiées chez Numidia : elles se commandent
// comme les autres (acheteur de test ci-dessous). Id « demo-svc-lst-demo-N » : le site redirige /services/demo-N vers cette fiche.
const EXAMPLES: { n: number; img: string; title: string; summary: string; category: P['category'] }[] = [
  { n: 1, img: "catheter-18g.jpg", title: "SafeTrack Device Registry", summary: "Cloud-based serial-number tracking for medical devices, from shipment to patient outcome.", category: "Medical" },
  { n: 2, img: "paracetamol-500.jpg", title: "PharmaSignal AI", summary: "Automated adverse-event pattern detection across pharmacy dispensing records.", category: "Pharmaceuticals" },
  { n: 3, img: "ethanol-96.jpg", title: "CleanLab Exposure Monitor", summary: "Real-time sensors and alerts for hazardous chemical exposure in clinical labs.", category: "Chemical" },
  { n: 4, img: "dermia-creme.jpg", title: "DermaCheck Reporting Portal", summary: "Consumer-facing adverse-event reporting for cosmetic and skincare products.", category: "Cosmetic" },
  { n: 5, img: "seringue-5ml.jpg", title: "BioTrace Cold Chain Monitor", summary: "End-to-end temperature and integrity tracking for biologics in transit.", category: "Medical" },
  { n: 6, img: "insuline-glargine.jpg", title: "ReactAlert Triage Engine", summary: "Prioritizes incoming adverse-event reports so reviewers see the urgent ones first.", category: "Pharmaceuticals" },
  { n: 7, img: "test-hepatite-b.jpg", title: "ReagentTrace Lot Monitor", summary: "Lot-level quality control and incident tracking for diagnostic reagents and in-vitro test kits.", category: "IVD products" },
  { n: 8, img: "catheter-18g.jpg", title: "VaxLog Distribution Tracker", summary: "Chain-of-custody logging for vaccine batches from cold storage to clinic.", category: "Medical" },
  { n: 9, img: "paracetamol-500.jpg", title: "DoseCheck Interaction Engine", summary: "Flags risky drug interactions at the point of prescription in real time.", category: "Pharmaceuticals" },
  { n: 10, img: "gel-hydroalcoolique.jpg", title: "SolventGuard Air Monitor", summary: "Continuous air-quality monitoring for volatile solvents on the production floor.", category: "Chemical" },
  { n: 11, img: "nour-spf50.jpg", title: "PureGlow Ingredient Tracer", summary: "Full ingredient traceability and recall management for cosmetic manufacturers.", category: "Cosmetic" },
  { n: 12, img: "bandelettes-glycemie.jpg", title: "RapidTest Result Sync", summary: "Syncs point-of-care diagnostic results directly into patient records.", category: "IVD products" },
  { n: 13, img: "seringue-5ml.jpg", title: "ImplantWatch Registry", summary: "Long-term post-market surveillance for implantable medical devices.", category: "Medical" },
  { n: 14, img: "insuline-glargine.jpg", title: "BatchTrace QC Suite", summary: "Batch-level quality control workflows for pharmaceutical manufacturing lines.", category: "Pharmaceuticals" },
  { n: 15, img: "ethanol-96.jpg", title: "SpillGuard Response Kit", summary: "Digitized spill-response protocols and reporting for lab chemical incidents.", category: "Chemical" },
  { n: 16, img: "dermia-creme.jpg", title: "HydraSkin Patch Analytics", summary: "Wear-testing analytics and adverse-reaction tracking for cosmetic patches.", category: "Cosmetic" },
  { n: 17, img: "test-hepatite-b.jpg", title: "LotSure Reagent Passport", summary: "Digital passport for reagent lots, from manufacture to lab shelf life.", category: "IVD products" },
  { n: 18, img: "catheter-18g.jpg", title: "FieldTrace Device Auditor", summary: "Mobile audit tool for field technicians servicing deployed medical devices.", category: "Medical" },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const until = new Date(); until.setFullYear(until.getFullYear() + 5);
  const userIds: string[] = [];

  for (const o of ORGS) {
    // Numidia = le fabricant de test. Avec le VRAI Audit : DEMO_AUDIT_MANUFACTURER_REF=<id de l'organisation Numidia dans Audit>
    // (ou, après coup : npm run market:link). « demo-numidia » n'est écrit QUE si MARKET_DEMO_OFFERS=true : sinon il rendrait
    // les 29 fiches non commandables (Audit ne connaît pas cette référence). Atlas reste sans lien (fiche sans offre).
    const envRef = process.env.DEMO_AUDIT_MANUFACTURER_REF?.trim();
    const wantedRef = envRef || (process.env.MARKET_DEMO_OFFERS === 'true' ? 'demo-numidia' : null);
    const mfrLink = o.id === ORGS[0].id && wantedRef ? { auditManufacturerRef: wantedRef, auditManufacturerLinkedAt: new Date(), auditManufacturerLinkedBy: 'seed-services-demo' } : {};
    // Re-seed : ne JAMAIS écraser un vrai lien (posé via market:link ou l'écran staff) par une référence de démo.
    const existing: any = await prisma.establishment.findUnique({ where: { id: o.id }, select: { auditManufacturerRef: true } });
    const keepRealLink = !!existing?.auditManufacturerRef && !existing.auditManufacturerRef.startsWith('demo-') && !envRef;
    await prisma.establishment.upsert({
      where: { id: o.id }, update: { name: o.name, ...(keepRealLink ? {} : mfrLink) },
      create: { id: o.id, name: o.name, type: 'SUPPLIER', ...mfrLink },
    });
    const uid = `${DEMO_PREFIX}user-${o.id.split('org-')[1]}`;
    userIds.push(uid);
    await prisma.user.upsert({
      where: { id: uid }, update: { displayName: `Admin ${o.name}` },
      create: { id: uid, email: o.email, displayName: `Admin ${o.name}`, role: 'ESTABLISHMENT_ADMIN', passwordHash },
    });
    const link = await prisma.userEstablishment.findUnique({ where: { userId_establishmentId: { userId: uid, establishmentId: o.id } } });
    if (!link) {
      await prisma.userEstablishment.create({ data: { userId: uid, establishmentId: o.id, isActiveContext: true, status: 'ACTIVE', memberRole: 'ADMIN' } });
    }
  }

  // TOUS les produits de test appartiennent à Numidia Pharma (pour tester les commandes sur n'importe quelle fiche).
  for (const p of PRODUCTS) {
    const o = ORGS[0];
    const data = {
      establishmentId: o.id, createdByUserId: userIds[0],
      title: p.title, summary: p.summary, description: p.description, category: p.category,
      imageUrl: IMG + p.img, imageFit: p.fit ?? 'contain', imageZoom: 100, imageFocusX: 50, imageFocusY: 50,
      certifications: p.certs ? JSON.stringify(p.certs) : null,
      contactEmail: o.contact, contactPhone: o.phone, website: o.website,
      status: 'PUBLISHED' as const, reviewStatus: 'APPROVED' as const, placement: p.placement, placementUntil: until,
    };
    const id = `${DEMO_PREFIX}lst-${p.key}`;
    await prisma.productListing.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  for (const e of EXAMPLES) {
    const o = ORGS[0];
    const data = {
      establishmentId: o.id, createdByUserId: userIds[0],
      title: e.title, summary: e.summary, description: e.summary, category: e.category,
      imageUrl: IMG + e.img, imageFit: 'contain', imageZoom: 100, imageFocusX: 50, imageFocusY: 50,
      certifications: null, contactEmail: o.contact, contactPhone: o.phone, website: o.website,
      status: 'PUBLISHED' as const, reviewStatus: 'APPROVED' as const, placement: 'STANDARD' as ListingPlacement, placementUntil: until,
    };
    const id = `${DEMO_PREFIX}lst-demo-${e.n}`;
    await prisma.productListing.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // Acheteur de test : hôpital public (catégorie PUBLIC_INSTITUTION VÉRIFIÉE) -> peut envoyer une demande de commande.
  // (type HOSPITAL : c'est un type qui a la page « Commandes » dans le tableau de bord.)
  const buyerEstId = `${DEMO_PREFIX}org-buyer`;
  const buyerUserId = `${DEMO_PREFIX}user-buyer`;
  const buyerData = { buyerCategory: 'PUBLIC_INSTITUTION', buyerCategoryStatus: 'VERIFIED', buyerCategoryReviewedAt: new Date(), buyerCategoryReviewedBy: 'seed-services-demo' };
  await prisma.establishment.upsert({
    where: { id: buyerEstId }, update: { name: 'Hôpital Test Sétif', ...buyerData },
    create: { id: buyerEstId, name: 'Hôpital Test Sétif', type: 'HOSPITAL', ...buyerData },
  });
  await prisma.user.upsert({
    where: { id: buyerUserId }, update: { displayName: 'Acheteur test' },
    create: { id: buyerUserId, email: 'acheteur@demo.vigicore.dz', displayName: 'Acheteur test', role: 'ESTABLISHMENT_ADMIN', passwordHash },
  });
  const buyerLink = await prisma.userEstablishment.findUnique({ where: { userId_establishmentId: { userId: buyerUserId, establishmentId: buyerEstId } } });
  if (!buyerLink) {
    await prisma.userEstablishment.create({ data: { userId: buyerUserId, establishmentId: buyerEstId, isActiveContext: true, status: 'ACTIVE', memberRole: 'ADMIN' } });
  }

  console.log(`\nDonnées de test /services prêtes : ${ORGS.length} organisations, ${PRODUCTS.length + EXAMPLES.length} fiches.`);
  console.log(`Comptes (mot de passe ${PASSWORD}) : ${ORGS.map((o) => o.email).join(' · ')}`);
  console.log(`Acheteur de test (peut commander) : acheteur@demo.vigicore.dz · ${PASSWORD}`);
  console.log('Pour voir « Commander » : mettre MARKET_DEMO_OFFERS=true dans backend/nexus-api/.env puis redémarrer l\'API.');
  console.log('Suppression : npm run purge:services-demo\n');
}

main().catch((e) => { console.error('Seed services-demo failed:', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
