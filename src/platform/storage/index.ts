import { del, get, keys, set } from 'idb-keyval';

/**
 * Storage (PLAN.md §7.5).
 *
 * One interface over IndexedDB (web) and, later, `@capacitor/preferences` for small
 * key-values on iOS. The game never calls either directly.
 *
 * This is also where the Supabase cloud-sync adapter plugs in (PLAN.md §8.2) — and note
 * the governing rule: **local is the source of truth, the cloud is a sync target.** The
 * game must remain fully playable offline with no account, forever.
 */

export interface KeyValueStore {
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

class IndexedDbStore implements KeyValueStore {
  async read<T>(key: string): Promise<T | undefined> {
    return get<T>(key);
  }

  async write<T>(key: string, value: T): Promise<void> {
    await set(key, value);
  }

  async remove(key: string): Promise<void> {
    await del(key);
  }

  async list(prefix = ''): Promise<string[]> {
    const all = await keys<string>();
    return all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));
  }
}

/** In-memory fallback: used by tests, and by the headless harness where no DB exists. */
export class MemoryStore implements KeyValueStore {
  readonly #map = new Map<string, unknown>();

  async read<T>(key: string): Promise<T | undefined> {
    return this.#map.get(key) as T | undefined;
  }

  async write<T>(key: string, value: T): Promise<void> {
    this.#map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.#map.delete(key);
  }

  async list(prefix = ''): Promise<string[]> {
    return [...this.#map.keys()].filter((k) => k.startsWith(prefix));
  }
}

let store: KeyValueStore | undefined;

export function getStore(): KeyValueStore {
  store ??= typeof indexedDB === 'undefined' ? new MemoryStore() : new IndexedDbStore();
  return store;
}

/** Test seam. */
export function setStore(next: KeyValueStore): void {
  store = next;
}
