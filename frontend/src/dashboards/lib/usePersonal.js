import { useCallback, useEffect, useState } from 'react';
import { personalApi } from '../services/personalApi';

/**
 * A list of the signed-in user's own records of one kind (products, treatments, appointments…).
 * items: null while loading, then [{ id, ...data, createdAt, updatedAt }].
 * add / update / remove return { ok, error } and keep the list in sync without a reload.
 */
export function usePersonalList(kind) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const flatten = (it) => ({ id: it.id, ...it.data, createdAt: it.createdAt, updatedAt: it.updatedAt });

  const reload = useCallback(async () => {
    const r = await personalApi.list(kind);
    if (r.ok) {
      setItems(r.items.map(flatten));
      setError(null);
    } else {
      setItems([]);
      setError(r.error);
    }
    return r;
  }, [kind]);

  useEffect(() => { reload(); }, [reload]);

  const add = useCallback(async (data) => {
    const r = await personalApi.create(kind, data);
    if (r.ok) setItems((list) => [flatten(r.item), ...(list || [])]);
    return r;
  }, [kind]);

  const update = useCallback(async (id, data) => {
    const r = await personalApi.update(kind, id, data);
    if (r.ok) setItems((list) => (list || []).map((x) => (x.id === id ? flatten(r.item) : x)));
    return r;
  }, [kind]);

  const remove = useCallback(async (id) => {
    const r = await personalApi.remove(kind, id);
    if (r.ok) setItems((list) => (list || []).filter((x) => x.id !== id));
    return r;
  }, [kind]);

  return { items, loading: items === null, error, add, update, remove, reload };
}

/** A single record of the signed-in user (health profile, laboratory profile…). data: null while loading. */
export function usePersonalSingleton(kind) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = false;
    personalApi.getOne(kind).then((r) => {
      if (off) return;
      if (r.ok) setData(r.item ? r.item.data : {});
      else { setData({}); setError(r.error); }
      setLoaded(true);
    });
    return () => { off = true; };
  }, [kind]);

  const save = useCallback(async (next) => {
    const r = await personalApi.saveOne(kind, next);
    if (r.ok) setData(r.item.data);
    return r;
  }, [kind]);

  return { data, loaded, error, save };
}

/** 'YYYY-MM-DD' of today in local time. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
