// Session caches for the Library Map endpoints.
//
// A tiny external store read through useSyncExternalStore: components ask for a
// key, the store fetches it once, and every later reader in the session gets
// the cached result. /library-map/papers/{id} responses are kept for the whole
// session (they are small and served from the prebuilt artifact).
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  getLibraryMap,
  getLibraryMapCollections,
  getLibraryMapCompare,
  getLibraryMapEngineering,
  getLibraryMapFootprint,
  getLibraryMapPaper,
  getLibraryMapPassages,
  ApiError,
} from '../../services/api';
import type {
  LibraryMapCollections,
  LibraryMapCompare,
  LibraryMapEngineering,
  LibraryMapFootprint,
  LibraryMapPaperDetail,
  LibraryMapPassages,
  LibraryMapResponse,
} from '../../types';

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

export class ResourceStore<T> {
  private entries = new Map<string, ResourceState<T>>();
  private latest = new Map<string, T>();
  private listeners = new Set<() => void>();
  private fetcher: (key: string) => Promise<T>;
  private groupOf: (key: string) => string;
  private maxEntries: number;

  constructor(fetcher: (key: string) => Promise<T>, options?: { maxEntries?: number; groupOf?: (key: string) => string }) {
    this.fetcher = fetcher;
    this.maxEntries = options?.maxEntries ?? Infinity;
    this.groupOf = options?.groupOf ?? ((k) => k);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(key: string | null): ResourceState<T> | undefined {
    return key == null ? undefined : this.entries.get(key);
  }

  /** Latest successful value for the key's group (e.g. the same paper set with other options). */
  getLatest(key: string | null): T | undefined {
    return key == null ? undefined : this.latest.get(this.groupOf(key));
  }

  /** Fetch unless cached or in flight; `force` re-fetches (retry after an error). */
  load(key: string, force = false): void {
    const current = this.entries.get(key);
    if (current && !force && current.status !== 'error') return;
    if (current?.status === 'loading') return;
    this.entries.set(key, { status: 'loading' });
    this.emit();
    this.fetcher(key).then(
      (data) => {
        this.entries.delete(key);
        this.entries.set(key, { status: 'success', data });
        this.latest.set(this.groupOf(key), data);
        this.evict();
        this.emit();
      },
      (error: unknown) => {
        this.entries.set(key, { status: 'error', error });
        this.emit();
      }
    );
  }

  private evict(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export function useResource<T>(store: ResourceStore<T>, key: string | null): ResourceState<T> | undefined {
  const getSnapshot = useCallback(() => store.get(key), [store, key]);
  const state = useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (key != null) store.load(key);
  }, [store, key]);
  return state;
}

export function useLatestResource<T>(store: ResourceStore<T>, key: string | null): T | undefined {
  const getSnapshot = useCallback(() => store.getLatest(key), [store, key]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

// ---------------------------------------------------------------- stores

export const mapStore = new ResourceStore<LibraryMapResponse>(() => getLibraryMap(), { maxEntries: 1 });
export const MAP_KEY = 'library-map';

export const paperDetailStore = new ResourceStore<LibraryMapPaperDetail>((id) => getLibraryMapPaper(id));

/** v2.0-K: per-user reading footprint; any error (401 included) just hides the footprint features */
export const footprintStore = new ResourceStore<LibraryMapFootprint>(() => getLibraryMapFootprint(), { maxEntries: 1 });
export const FOOTPRINT_KEY = 'footprint';

/** v2.1: engineering payload per collection (key '' = the active collection) */
export const engineeringStore = new ResourceStore<LibraryMapEngineering>((key) => getLibraryMapEngineering(key || undefined), {
  maxEntries: 3,
});
export const collectionsStore = new ResourceStore<LibraryMapCollections>(() => getLibraryMapCollections(), { maxEntries: 1 });
export const COLLECTIONS_KEY = 'collections';

export function compareKey(a: string, b: string): string {
  return `${a}|${b}`;
}
export const compareStore = new ResourceStore<LibraryMapCompare>(
  (key) => {
    const [a, b] = key.split('|');
    return getLibraryMapCompare(a, b);
  },
  { maxEntries: 40 }
);

export function passagesKey(ids: readonly string[], includeCaptions: boolean, maxPerPaper = 150): string {
  return `${ids.join(',')}|${maxPerPaper}|${includeCaptions ? 1 : 0}`;
}
export const passagesStore = new ResourceStore<LibraryMapPassages>(
  (key) => {
    const [ids, max, captions] = key.split('|');
    return getLibraryMapPassages(ids.split(','), { maxPerPaper: Number(max), includeCaptions: captions === '1' });
  },
  { maxEntries: 12, groupOf: (key) => key.split('|')[0] }
);

// ---------------------------------------------------------------- errors

export interface ErrorInfo {
  status: number | null;
  message: string;
  /** network failure (no HTTP response at all) */
  network: boolean;
}

export function describeError(error: unknown): ErrorInfo {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message, network: false };
  }
  if (error instanceof TypeError) {
    return { status: null, message: 'Could not reach the server.', network: true };
  }
  return { status: null, message: error instanceof Error ? error.message : 'Something went wrong.', network: false };
}
