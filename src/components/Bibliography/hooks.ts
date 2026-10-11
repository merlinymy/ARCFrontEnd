import { useEffect, useRef, useState } from 'react';

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// Calls `tick` every `intervalMs` while `active` is true. Calls never overlap:
// the next one is scheduled only after the previous has settled, so a slow
// server cannot pile up requests. `tick` is read through a ref, so it may close
// over fresh state without restarting the loop.
export function usePolling(tick: () => Promise<void> | void, intervalMs: number, active: boolean): void {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      try {
        await tickRef.current();
      } catch {
        // the caller decides what a failed poll means; keep the loop alive
      }
      if (!cancelled) timer = setTimeout(loop, intervalMs);
    };
    timer = setTimeout(loop, intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, intervalMs]);
}
