import { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';
import { DECLARE_WIZ_DOMAIN_BY_TYPE, DR_SEVERITY_CLASS } from '../data/doctorVigilance';

// Brouillons des assistants de déclaration, présentés comme des LIGNES de l'onglet « Brouillons ».
// Source : le stockage de l'appareil (une clé par utilisateur + service) ; au premier affichage on rapatrie aussi ceux
// du compte (autre appareil). Ce ne sont PAS des déclarations : aucune n'est envoyée, la ligne propose « Reprendre ».
export const DRAFTS_CHANGED_EVENT = 'vg:drafts-changed';
export const draftPrefix = (userId) => `vigicore.declaration-draft.${userId || 'anon'}.`;
export const notifyDraftsChanged = () => { try { window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT)); } catch { /* ignore */ } };

function rowOf(key, d) {
  const w = d?.wiz;
  if (!w || typeof w !== 'object') return null; // tout brouillon enregistré est listé, même commencé à la 1re étape
  const when = d.savedAt ? new Date(d.savedAt) : null;
  return {
    id: `draft:${key}`, draftKey: key, isWizardDraft: true, status: 'draft',
    ref: 'Brouillon', domain: DECLARE_WIZ_DOMAIN_BY_TYPE[w.type] || 'Pharmacovigilance',
    product: w.productName || w.deviceName || 'Déclaration commencée (étape {0})'.replace('{0}', String((w.stepIdx ?? 0) + 1)), lot: w.lot || '',
    severity: DR_SEVERITY_CLASS[w.severity] ? w.severity : 'legere',
    date: when ? when.toLocaleDateString() : '', dept: key.split('.').slice(3).join('.') || '',
    manualPatientName: '', patientId: null,
  };
}

export function readWizardDraftRows(userId) {
  const out = [];
  try {
    const prefix = draftPrefix(userId);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try { const r = rowOf(k, JSON.parse(localStorage.getItem(k))); if (r) out.push(r); } catch { /* ignore */ }
    }
  } catch { /* stockage indisponible */ }
  return out;
}

export function useWizardDraftRows(user) {
  const uid = user?.id;
  const [rows, setRows] = useState(() => readWizardDraftRows(uid));
  useEffect(() => {
    const refresh = () => setRows(readWizardDraftRows(uid));
    window.addEventListener(DRAFTS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    let off = false;
    (async () => {
      try { // brouillons du compte (autre appareil) : copiés sur l'appareil s'ils sont absents ou plus récents
        const res = await fetch(`${API_BASE}/drafts`, { credentials: 'include' });
        const j = await res.json();
        if (off || !j?.success) return;
        let changed = false;
        for (const d of j.drafts || []) {
          if (!d.key.startsWith(draftPrefix(uid)) || !d.data?.wiz) continue;
          let local = null; try { local = JSON.parse(localStorage.getItem(d.key)); } catch { /* ignore */ }
          if (!local || new Date(d.data.savedAt || d.updatedAt) > new Date(local.savedAt || 0)) {
            localStorage.setItem(d.key, JSON.stringify({ wiz: d.data.wiz, savedAt: d.data.savedAt || d.updatedAt })); changed = true;
          }
        }
        if (changed) refresh();
      } catch { /* hors ligne : on garde l'appareil */ }
    })();
    return () => { off = true; window.removeEventListener(DRAFTS_CHANGED_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [uid]);
  return rows;
}
