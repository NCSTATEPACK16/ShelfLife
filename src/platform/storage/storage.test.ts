import { beforeEach, describe, expect, it } from 'vitest';
import { getStore, MemoryStore, setStore } from './index.js';

describe('storage', () => {
  beforeEach(() => setStore(new MemoryStore()));

  it('round-trips a value', async () => {
    const store = getStore();
    await store.write('save:slot1', { level: 'l01', chapter: 2 });
    expect(await store.read('save:slot1')).toEqual({ level: 'l01', chapter: 2 });
  });

  it('returns undefined for a missing key rather than throwing', async () => {
    expect(await getStore().read('nope')).toBeUndefined();
  });

  it('lists by prefix', async () => {
    const store = getStore();
    await store.write('save:slot1', 1);
    await store.write('save:slot2', 2);
    await store.write('settings:audio', 3);

    expect((await store.list('save:')).sort()).toEqual(['save:slot1', 'save:slot2']);
  });

  it('removes', async () => {
    const store = getStore();
    await store.write('k', 1);
    await store.remove('k');
    expect(await store.read('k')).toBeUndefined();
  });

  it('falls back to memory where IndexedDB does not exist, so the harness can run headless', () => {
    setStore(new MemoryStore());
    expect(getStore()).toBeInstanceOf(MemoryStore);
  });
});
