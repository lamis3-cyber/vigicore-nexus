import { navItemsFor } from '../config/navConfig';
import { DR_DECLARATIONS, DR_PATIENTS } from '../data/doctorVigilance';
import { LAB_DECLARATIONS } from '../data/laboVigilance';
import { isOrgScopedRecordVisible } from '../config/organizations';
import { readWizardDraftRows } from './wizardDrafts';

// Recherche globale de la barre du haut. Source : ce que l'utilisateur peut déjà voir (pages de son menu, ses
// déclarations de son établissement, ses brouillons, et — médecins seulement — ses patients). Aucun appel réseau ici :
// les envois et enregistrements du serveur sont chargés par le composant (cache court) et passés dans `remote`.
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchEverything(query, { portalKey, user, remote }) {
  const q = fold(query).trim();
  if (q.length < 2) return [];
  const nav = navItemsFor(portalKey, user).filter((n) => n.id);
  const declNav = nav.find((n) => /declarations$/.test(n.id))?.id;
  const declarerNav = nav.find((n) => /declarer$/.test(n.id))?.id;
  const patientsNav = nav.find((n) => n.id === 'doc-patients')?.id;
  const out = [];
  const has = (...f) => f.some((x) => fold(x).includes(q));

  for (const n of nav) if (has(n.label)) out.push({ group: 'Pages', icon: n.icon, title: n.label, sub: '', target: n.id, key: `nav:${n.id}` });
  if (declNav) {
    for (const d of [...DR_DECLARATIONS, ...LAB_DECLARATIONS]) {
      if (!isOrgScopedRecordVisible(d, user)) continue;
      if (has(d.ref, d.product, d.effect, d.domain, d.manufacturer, d.lot, d.symptoms, d.patient)) out.push({ group: 'Déclarations', icon: 'folder', title: d.ref, sub: d.product, target: declNav, key: `decl:${d.id}` });
      if (out.length > 60) break;
    }
  }
  if (declNav || declarerNav) {
    for (const d of readWizardDraftRows(user?.id)) {
      if (has('brouillon', d.product, d.lot, d.domain)) out.push({ group: 'Brouillons', icon: 'folder', title: 'Brouillon', sub: d.product, target: declarerNav || declNav, key: d.id });
    }
  }
  if (portalKey === 'doctor' && patientsNav) {
    for (const p of DR_PATIENTS) {
      if ((p.ownerUserId || isOrgScopedRecordVisible(p, user)) && has(p.name, p.condition, p.email)) out.push({ group: 'Patients', icon: 'users', title: p.name, sub: p.condition, target: patientsNav, key: `pt:${p.id}` });
    }
  }
  // Envois à la vigilance et enregistrements du serveur (produit, lot, description, champs saisis).
  const target = declNav || declarerNav;
  if (remote && target) {
    for (const r of remote.records ?? []) {
      const fields = Array.isArray(r.fields) ? r.fields : [];
      const hay = [r.id, r.kind, r.domain, ...fields.map((f) => `${f.key} ${f.value}`)];
      if (!has(...hay)) continue;
      const product = fields.find((f) => /product|device|produit|dispositif|name/i.test(String(f.key)))?.value;
      out.push({ group: 'Mes déclarations', icon: 'folder', title: `Réf. ${String(r.id).slice(0, 8)}`, sub: product ? String(product).slice(0, 60) : '', target, key: `rec:${r.id}` });
    }
    for (const s of remote.submissions ?? []) {
      if (!has(s.id, s.productLabel, s.lotNumber, s.description, s.status)) continue;
      out.push({ group: 'Mes envois', icon: 'send', title: s.productLabel || `Envoi ${String(s.id).slice(0, 8)}`, sub: s.lotNumber ? `Lot ${s.lotNumber}` : '', target, key: `sub:${s.id}` });
    }
  }
  return out.slice(0, 20);
}
