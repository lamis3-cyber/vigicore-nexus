/**
 * Vérification de la chaîne des commandes : « chaque commande arrive-t-elle chez le vendeur ? » (2026-10-29).
 * Module PUR : reçoit l'état (env, réponse d'Audit, fiches publiées) et renvoie la liste des problèmes, avec la correction.
 * Utilisé par `npm run market:check` (src/scripts/checkMarket.ts).
 *
 *  - Fiche d'un FABRICANT : la commande part vers VigiCore Audit, chez le commercial de l'organisation liée.
 *    Il faut : mode démo coupé, Audit configuré et joignable, établissement lié à une organisation Audit qui publie
 *    des offres, et la fiche rattachée à UNE offre (lien explicite ou nom identique — voir offersForListing).
 *  - Fiche d'un FOURNISSEUR : la commande reste sur le Site (SupplierOrder) et arrive dans « Commandes clients ».
 *    Il faut : fournisseur vérifié, prix, stock suffisant. L'e-mail d'alerte demande le SMTP.
 */
import { offersForListing, offersForManufacturer } from './market';
import { isOrderableListing } from './supplierOrders';
import { auditManufacturers } from './manufacturerLink';

export type CheckLevel = 'ok' | 'warn' | 'error';
export interface CheckItem { level: CheckLevel; where: string; message: string; fix?: string }

export interface CheckListing {
  id: string;
  title: string;
  sellerKind: string | null;
  auditProductRef: string | null;
  unitPrice: number | null;
  priceUnit?: string | null;
  minOrderQty: number | null;
  inStock: boolean | null;
  stockQty: number | null;
  category?: string | null;
  establishment: { id: string; name: string; auditManufacturerRef: string | null; buyerCategory: string | null; buyerCategoryStatus: string | null };
}

export interface CheckInput {
  demoMode: boolean;
  auditConfigured: boolean;
  /** Résultat de GET /nexus/v1/catalogue/offers sur le VRAI Audit (null = non appelé). */
  audit: { ok: true; offers: any[] } | { ok: false; error: string } | null;
  mailConfigured: boolean;
  listings: CheckListing[];
}

const names = (offers: any[]) => offers.slice(0, 5).map((o) => `« ${o?.name} »`).join(', ') + (offers.length > 5 ? ` … (+${offers.length - 5})` : '');

export function checkMarketChain(input: CheckInput): CheckItem[] {
  const out: CheckItem[] = [];
  const makers = input.listings.filter((l) => l.sellerKind !== 'DISTRIBUTOR');
  const suppliers = input.listings.filter((l) => l.sellerKind === 'DISTRIBUTOR');

  // ── Circuit fabricants (Audit) ──
  if (input.demoMode) {
    out.push({
      level: 'error', where: '.env (nexus-api)',
      message: "MARKET_DEMO_OFFERS=true : les commandes et demandes aux fabricants reçoivent une fausse confirmation (DEMO-…) et ne partent JAMAIS vers l'Audit.",
      fix: 'Mettre MARKET_DEMO_OFFERS=false puis redémarrer nexus-api.',
    });
  }
  if (!input.auditConfigured) {
    out.push({ level: 'error', where: '.env (nexus-api)', message: "Audit non configuré : AUDIT_BASE_URL absent ou NEXUS_SERVICE_JWT_SECRET de moins de 32 caractères.", fix: "Renseigner AUDIT_BASE_URL et le même NEXUS_SERVICE_JWT_SECRET que l'Audit." });
  } else if (input.audit && !input.audit.ok) {
    out.push({ level: 'error', where: 'VigiCore Audit', message: `Audit injoignable ou refuse le Site : ${input.audit.error}.`, fix: "Démarrer l'Audit (npm run dev) et vérifier que NEXUS_SERVICE_JWT_SECRET est identique des deux côtés." });
  } else if (input.audit?.ok) {
    out.push({ level: 'ok', where: 'VigiCore Audit', message: `Audit joignable : ${input.audit.offers.length} offre(s) publiée(s) pour le Site.` });
  }

  const offers = input.audit && input.audit.ok ? input.audit.offers : null;
  const byEst = new Map<string, CheckListing[]>();
  for (const l of makers) byEst.set(l.establishment.id, [...(byEst.get(l.establishment.id) ?? []), l]);
  for (const list of byEst.values()) {
    const est = list[0].establishment;
    const ref = est.auditManufacturerRef;
    if (!ref) {
      out.push({ level: 'error', where: est.name, message: `Fabricant non lié à une organisation de l'Audit : ses ${list.length} fiche(s) ne sont pas commandables.`, fix: "Lier l'établissement à l'id de son organisation dans l'Audit (auditManufacturerRef)." });
      continue;
    }
    if (!offers) continue; // Audit non vérifiable : l'erreur est déjà signalée au-dessus
    const mine = offersForManufacturer(offers, ref);
    if (!mine.length) {
      const known = offers.length ? auditManufacturers(offers) : [];
      const isDemo = ref.startsWith('demo-');
      out.push({
        level: 'error', where: est.name,
        message: `Aucune offre de l'Audit pour l'organisation « ${ref} »${isDemo ? ' (référence de démonstration, inconnue de l\'Audit)' : ''} : ses ${list.length} fiche(s) ne sont pas commandables.`,
        fix: !known.length
          ? "L'Audit ne publie aucune offre pour le Site : dans Audit, activer « Offre en ligne » sur les produits de l'organisation, puis la lier avec `npm run market:link -- \"<établissement>\" \"<organisation Audit>\"`."
          : `Lier l'établissement à l'une des organisations d'Audit : ${known.slice(0, 5).map((m) => `« ${m.name} » (${m.ref})`).join(', ')}${known.length > 5 ? ` … (+${known.length - 5})` : ''} — avec \`npm run market:link -- "${est.name}" "<id>"\` (ou \`npm run market:link -- --auto\`).`,
      });
      continue;
    }
    let linked = 0;
    for (const l of list) {
      if (offersForListing(mine, l).length) { linked++; continue; }
      out.push(l.auditProductRef
        ? { level: 'warn', where: `${est.name} › ${l.title}`, message: "Liée à un produit qui n'est plus proposé dans l'Audit : la fiche ne se commande pas.", fix: `Relier la fiche à l'un des produits publiés : ${names(mine)}.` }
        : { level: 'warn', where: `${est.name} › ${l.title}`, message: 'Aucun produit de l\'Audit ne correspond à cette fiche : elle ne se commande pas (seul « Contacter » reste).', fix: `La relier à son produit (auditProductRef) ou lui donner exactement le nom du produit. Produits publiés : ${names(mine)}.` });
    }
    if (linked) out.push({ level: 'ok', where: est.name, message: `${linked}/${list.length} fiche(s) commandable(s) : les commandes arrivent chez le commercial de l'organisation dans l'Audit.` });
  }

  // ── Circuit fournisseurs (Site) ──
  for (const l of suppliers) {
    if (isOrderableListing(l as any)) continue;
    const e = l.establishment;
    const why = e.buyerCategory !== 'DISTRIBUTOR' || e.buyerCategoryStatus !== 'VERIFIED' ? 'fournisseur pas encore vérifié par VigiCore (agrément)'
      : !(l.unitPrice != null && l.unitPrice > 0) ? 'aucun prix de gros'
        : 'hors stock ou stock sous le minimum de commande';
    out.push({ level: 'warn', where: `${e.name} › ${l.title}`, message: `Fiche de fournisseur non commandable : ${why}.`, fix: why.startsWith('fournisseur') ? 'Vérifier le fournisseur dans « Acheteurs à vérifier » (staff VigiCore).' : 'Le fournisseur complète sa fiche (prix / stock).' });
  }
  const okSuppliers = suppliers.filter((l) => isOrderableListing(l as any)).length;
  if (suppliers.length) out.push({ level: 'ok', where: 'Fournisseurs', message: `${okSuppliers}/${suppliers.length} fiche(s) commandable(s) : les commandes arrivent dans « Commandes clients » du fournisseur.` });
  if (suppliers.length && !input.mailConfigured) {
    out.push({ level: 'warn', where: '.env (nexus-api)', message: "SMTP non configuré : le fournisseur n'est pas prévenu par e-mail d'une nouvelle commande, et l'acheteur pas des changements d'étape (tout reste visible dans les tableaux de bord).", fix: 'Renseigner les variables SMTP du .env.' });
  }
  return out;
}
