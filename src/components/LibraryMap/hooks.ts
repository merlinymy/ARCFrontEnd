import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useApp } from '../../context/AppContext';
import { getMapTokens, type MapTokens } from './tokens';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * "Ask ARC about these papers" (contract v2.0-L): start a new conversation scoped to
 * the papers (queryOptions.paperFilter, which ChatPage shows as its banner) and switch
 * to the chat page -- the same steps the Library page's "Chat about these papers" takes.
 */
export function useAskArc(): (paperIds: string[]) => void {
  const { dispatch, createNewConversation, setActivePage } = useApp();
  return useCallback(
    (paperIds: string[]) => {
      if (!paperIds.length) return;
      createNewConversation();
      dispatch({ type: 'SET_QUERY_OPTIONS', payload: { paperFilter: paperIds } });
      setActivePage('chat');
    },
    [dispatch, createNewConversation, setActivePage]
  );
}

/** Map color tokens for the app's current theme (state.theme toggles the html.dark class). */
export function useMapTokens(): MapTokens {
  const { state } = useApp();
  return getMapTokens(state.theme === 'dark' ? 'dark' : 'light');
}

/** Width/height of an element, tracked with a ResizeObserver. */
export function useElementSize<T extends HTMLElement>(): [(node: T | null) => void, { width: number; height: number }] {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, size];
}

const PREFS_KEY = 'arc.libraryMap.prefs';

export function readPrefs<T extends object>(fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...fallback, ...(parsed as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

export function writePrefs(prefs: object): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage blocked (private mode, quota): view prefs are a convenience only
  }
}
