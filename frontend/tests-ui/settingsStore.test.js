import { describe, it, expect, beforeEach } from 'vitest';
import { loadField, saveField, loadSwitch, saveSwitch, resetSettings } from '../src/dashboards/data/settingsStore';

// Mode « hors session » (tests) : repli sur localStorage. La synchro serveur est testée côté API (account.routes.test.ts).
const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; } };
  globalThis.document = { documentElement: { classList: { toggle() {} } } };
});

describe('settingsStore (repli local)', () => {
  it('relit ce qui a été enregistré, sinon la valeur par défaut', () => {
    expect(loadField('x', 'def')).toBe('def');
    saveField('x', 'val');
    expect(loadField('x', 'def')).toBe('val');
    expect(loadSwitch('s', true)).toBe(true);
    saveSwitch('s', false);
    expect(loadSwitch('s', true)).toBe(false);
  });
  it('resetSettings efface les réglages', async () => {
    saveField('x', 'val');
    const r = await resetSettings();
    expect(r.ok).toBe(true);
    expect(loadField('x', 'def')).toBe('def');
  });
});
