import { useEffect, useRef, useState } from 'react';
import { getQueueSummary, QUEUE_SEEN_EVENT } from '../../lib/declarationsApi';
import { tr } from '../../i18n/translate.js';

// Notifications du responsable vigilance et de l'administrateur d'établissement : déclarations « Mon organisation » encore à traiter dans la file de l'établissement.
// Lu sur le serveur (GET /records/queue/summary) toutes les 30 s et après chaque envoi/action ; jamais de donnée patient.
export const QUEUE_NAV_IDS = new Set(['hosp-declarations', 'clin-declarations', 'cm-declarations', 'org-declarations', 'org-notifications']);
const POLL_MS = 30000;
const CHANGED_EVENT = 'vigicore:submissions-changed';

// Renvoie le nombre d'éléments NON LUS (pastilles) ; les messages s'appuient sur les arrivées et les clôtures.
export function useQueueAlerts(enabled, toast) {
  const [pending, setPending] = useState(null);
  const last = useRef(null);
  const lastClosed = useRef(undefined);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!enabled) { setPending(null); last.current = null; lastClosed.current = undefined; return undefined; }
    let alive = true;
    const tick = async () => {
      let r;
      try { r = await getQueueSummary(); } catch { return; }
      if (!alive || !r.ok) return;
      const notify = typeof toastRef.current === 'function' ? toastRef.current : null;
      if (notify) {
        if (last.current === null && r.pending > 0) {
          notify('info', tr("Nouvelles déclarations"),
            tr("{0} déclaration(s) reçue(s) sans mesure interne enregistrée.", [r.pending]), 'ti ti-bell');
        } else if (last.current !== null && r.pending > last.current) {
          notify('info', tr("Nouvelle déclaration reçue"),
            r.latest?.label ? tr("{0} — envoyée par votre établissement.", [r.latest.label]) : tr("Envoyée par votre établissement."),
            'ti ti-bell');
        }
      }
      // Enquête clôturée par le fabricant : notifiée dès qu'une nouvelle clôture apparaît (pas au premier chargement).
      const closedKey = r.closed ? `${r.closed.id}:${r.closed.at}` : null;
      if (notify && lastClosed.current !== undefined && closedKey && closedKey !== lastClosed.current) {
        notify('success', tr("Enquête clôturée par le fabricant"),
          r.closed.label ? tr("{0} — consultez le détail dans vos notifications.", [r.closed.label]) : tr("Consultez le détail dans vos notifications."), 'ti ti-circle-check');
      }
      lastClosed.current = closedKey;
      last.current = r.pending;
      setPending(r.unread);
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    window.addEventListener(CHANGED_EVENT, tick);
    window.addEventListener(QUEUE_SEEN_EVENT, tick);
    return () => { alive = false; clearInterval(timer); window.removeEventListener(CHANGED_EVENT, tick); window.removeEventListener(QUEUE_SEEN_EVENT, tick); };
  }, [enabled]);

  return pending;
}
