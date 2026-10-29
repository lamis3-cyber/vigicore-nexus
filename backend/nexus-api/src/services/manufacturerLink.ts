/**
 * Lien « établissement du Site » -> « organisation fabricante d'Audit » (2026-10-29). Module PUR (aucun accès base / réseau).
 *
 * Règle d'architecture : une commande ne suit jamais le produit, elle suit son PROPRIÉTAIRE.
 *   fiche produit -> établissement (auditManufacturerRef = id de l'organisation dans Audit) -> la commande part chez cette organisation.
 * L'id n'est donc stocké qu'UNE fois, sur l'établissement ; les fiches l'héritent. Changer l'id = 1 seule modification.
 * (Fournisseurs : pas d'id Audit, la commande reste sur le Site et arrive dans « Commandes clients ».)
 */
export interface AuditManufacturer { ref: string; name: string; offers: number }
export interface EstablishmentLite { id: string; name: string; type?: string | null; auditManufacturerRef: string | null }

/** Fabricants connus d'Audit, déduits des offres qu'il publie pour le Site (un fabricant sans offre est invisible). */
export function auditManufacturers(offers: any[]): AuditManufacturer[] {
  const byRef = new Map<string, AuditManufacturer>();
  for (const o of offers ?? []) {
    const ref = o?.manufacturer?.ref;
    if (typeof ref !== 'string' || !ref) continue;
    const m = byRef.get(ref) ?? { ref, name: String(o.manufacturer.name ?? ref), offers: 0 };
    m.offers++;
    byRef.set(ref, m);
  }
  return [...byRef.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** « Numidia  Pharma », « numidia-pharma » et « NUMIDIA PHARMA » sont le même nom. */
export const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type Found<T> = { ok: true; item: T } | { ok: false; reason: 'NOT_FOUND' | 'AMBIGUOUS'; candidates: T[] };

/** Établissement désigné par son id exact, sinon par son nom (unique, sans tenir compte de la casse ni des accents). */
export function findEstablishment(list: EstablishmentLite[], query: string): Found<EstablishmentLite> {
  const q = query.trim();
  const byId = list.find((e) => e.id === q);
  if (byId) return { ok: true, item: byId };
  const n = normalizeName(q);
  const hits = n ? list.filter((e) => normalizeName(e.name) === n) : [];
  if (hits.length === 1) return { ok: true, item: hits[0] };
  return { ok: false, reason: hits.length ? 'AMBIGUOUS' : 'NOT_FOUND', candidates: hits };
}

/** Organisation d'Audit désignée par son id exact, sinon par son nom. */
export function findManufacturer(list: AuditManufacturer[], query: string): Found<AuditManufacturer> {
  const q = query.trim();
  const byRef = list.find((m) => m.ref === q);
  if (byRef) return { ok: true, item: byRef };
  const n = normalizeName(q);
  const hits = n ? list.filter((m) => normalizeName(m.name) === n) : [];
  if (hits.length === 1) return { ok: true, item: hits[0] };
  return { ok: false, reason: hits.length ? 'AMBIGUOUS' : 'NOT_FOUND', candidates: hits };
}

export const isDemoRef = (ref: string | null | undefined) => !!ref && ref.startsWith('demo-');

export interface LinkProposal { establishment: EstablishmentLite; manufacturer: AuditManufacturer }

/**
 * Propositions de lien automatiques : établissement sans lien (ou lié à une référence « demo-… ») dont le nom est IDENTIQUE à celui
 * d'une organisation d'Audit, à condition que cette organisation ne soit pas déjà liée ailleurs et ne soit proposée qu'une fois.
 * Rien d'approximatif : en cas de doute, aucune proposition (on lie à la main).
 */
export function proposeLinks(establishments: EstablishmentLite[], manufacturers: AuditManufacturer[]): LinkProposal[] {
  const taken = new Set(establishments.map((e) => e.auditManufacturerRef).filter((r): r is string => !!r && !isDemoRef(r)));
  const claimed = new Set<string>();
  const out: LinkProposal[] = [];
  for (const e of establishments) {
    if (e.auditManufacturerRef && !isDemoRef(e.auditManufacturerRef)) continue;
    const n = normalizeName(e.name);
    if (!n) continue;
    const hits = manufacturers.filter((m) => normalizeName(m.name) === n && !taken.has(m.ref) && !claimed.has(m.ref));
    if (hits.length !== 1) continue;
    claimed.add(hits[0].ref);
    out.push({ establishment: e, manufacturer: hits[0] });
  }
  return out;
}
