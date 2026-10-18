// What the freshness strip says, decided apart from React so it can be tested.
import type { LibraryMapStatus } from '../../types';

/** In the order they win: a running build matters more than a missing paper. */
export type StripKind = 'building' | 'scheduled' | 'never' | 'behind' | 'current';

export function stripKind(s: LibraryMapStatus): StripKind {
  if (s.refresh.state === 'building') return 'building';
  if (s.refresh.state === 'scheduled') return 'scheduled';
  // null, not 0: an index cutover leaves a collection with no map directory at all.
  if (s.papers_mapped === null) return 'never';
  if ((s.papers_behind ?? 0) > 0) return 'behind';
  return 'current';
}

export const isActive = (s: LibraryMapStatus | null): boolean => s != null && s.refresh.state !== 'idle';

/**
 * The map the server now holds is not the one on screen. Compared by build time, not by watching
 * a state change, so it also catches a build that finished while this page was closed or was
 * started from another tab.
 */
export function mapIsStale(shownBuiltAt: string | null | undefined, s: LibraryMapStatus | null): boolean {
  return !!shownBuiltAt && !!s?.built_at && s.built_at !== shownBuiltAt;
}

/** A counter that was read `elapsedMs` ago, aged to now. Whole seconds, never negative. */
export function aged(seconds: number, elapsedMs: number): number {
  return Math.max(0, Math.round(seconds - elapsedMs / 1000));
}

/** 134 -> "2:14" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Milliseconds until the next status fetch, or null to stop polling.
 *
 * A build is 3-4 minutes, so 5 s is plenty to notice it finishing. While scheduled the countdown
 * is drawn locally, but another upload restarts the server's window and only a fetch learns of
 * that, so it is re-read every 10 s, and quickly once it should be about to fire.
 */
export function pollDelay(s: LibraryMapStatus | null, secondsLeft: number | null): number | null {
  if (!s) return null;
  if (s.refresh.state === 'building') return 5000;
  if (s.refresh.state === 'scheduled') return secondsLeft != null && secondsLeft <= 10 ? 2000 : 10000;
  return null;
}
