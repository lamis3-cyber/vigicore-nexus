import { useCallback, useEffect, useRef, useState } from 'react';
import { tr, localeTag } from '../../i18n/translate.js';
import { API_BASE } from '../../lib/api';
import { notifyDraftsChanged } from './wizardDrafts';

// Draft handling shared by the declaration wizards.
// The draft is written to this device (localStorage, one key per user + wizard) AND to the user's ACCOUNT
// (database, /api/drafts) : it is written when the user asks for it (`save(false)`) and automatically 1.5 s
// after the last change (`update` marks the state dirty). On open, a newer draft from the account (another
// browser/device, or a cleared cache) is restored unless the user already started typing. `reset()` removes both.
// Without a session (or server down) it silently falls back to the device only.
const hhmm = (d) => d.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.wiz ? d : null;
  } catch { return null; }
}

// Appels serveur : jamais bloquants ; { ok, status } ou { ok: false } si injoignable.
async function remote(method, key, body) {
  try {
    const res = await fetch(`${API_BASE}/drafts/${encodeURIComponent(key)}`, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* corps non JSON */ }
    return { ok: res.ok && json?.success === true, status: res.status, json };
  } catch { return { ok: false, status: 0, json: null }; }
}

export default function useDeclarationDraft(key, makeInitialState, toast) {
  const [state, setState] = useState(() => ({ ...makeInitialState(), ...(read(key)?.wiz || {}) }));
  const [savedAt, setSavedAt] = useState(() => {
    const d = read(key);
    return d?.savedAt ? hhmm(new Date(d.savedAt)) : '';
  });
  const dirty = useRef(false);

  // update({ field }) or update((prev) => next)
  const update = useCallback((patchOrFn) => {
    dirty.current = true;
    setState((prev) => (typeof patchOrFn === 'function' ? patchOrFn(prev) : { ...prev, ...patchOrFn }));
  }, []);

  const save = useCallback((silent, snapshot) => {
    const now = new Date();
    let local = false;
    try {
      localStorage.setItem(key, JSON.stringify({ wiz: snapshot, savedAt: now.toISOString() }));
      local = true;
    } catch { /* stockage local indisponible : on tente quand même le compte */ }
    setSavedAt(hhmm(now));
    dirty.current = false;
    notifyDraftsChanged();
    // Sauvegarde dans le compte (base de données) : la confirmation n'annonce QUE ce qui a réussi.
    remote('PUT', key, { data: { wiz: snapshot, savedAt: now.toISOString() } }).then((r) => {
      if (silent) return;
      if (r.ok) toast('success', tr("Brouillon enregistré"), tr("Votre brouillon est sauvegardé dans votre compte : retrouvez-le sur cet appareil ou un autre."), 'ti ti-device-floppy');
      else if (local) toast('warn', tr("Brouillon enregistré sur cet appareil"), tr("Le serveur n'a pas pu être joint : il n'est pas encore dans votre compte. Il sera renvoyé à la prochaine modification."), 'ti ti-device-floppy');
      else toast('error', tr("Brouillon non enregistré"), tr("Ni le stockage de cet appareil ni le serveur ne sont disponibles."), 'ti ti-alert-triangle');
    });
  }, [key, toast]);

  // Au premier affichage : récupère un brouillon plus récent du compte (autre appareil / cache vidé),
  // sauf si l'utilisateur a déjà commencé à modifier le formulaire.
  useEffect(() => {
    let off = false;
    remote('GET', key).then((r) => {
      const d = r.ok ? r.json?.draft : null;
      if (off || !d?.data?.wiz || dirty.current) return;
      const remoteAt = new Date(d.data.savedAt || d.updatedAt).getTime();
      const localAt = new Date(read(key)?.savedAt || 0).getTime();
      if (!(remoteAt > localAt)) return;
      setState({ ...makeInitialState(), ...d.data.wiz });
      setSavedAt(hhmm(new Date(remoteAt)));
      try { localStorage.setItem(key, JSON.stringify({ wiz: d.data.wiz, savedAt: new Date(remoteAt).toISOString() })); } catch { /* ignore */ }
    });
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(() => save(true, state), 1500);
    return () => clearTimeout(t);
  }, [state, save]);

  const reset = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    remote('DELETE', key); // le brouillon du compte disparaît aussi (déclaration envoyée ou formulaire vidé)
    notifyDraftsChanged();
    dirty.current = false;
    setState(makeInitialState());
    setSavedAt('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { state, update, savedAt, saveDraft: (silent) => save(silent, state), reset };
}
