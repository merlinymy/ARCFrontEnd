// Keeps the Library Map's freshness in view: reads /library-map/status, follows a pending or
// running rebuild until it ends, and starts one on request.
//
// Polling lives only as long as a rebuild is pending. An idle map costs one request on open
// (and one when the tab becomes visible again); a timer that outlived the build would hold the
// backend's attention for nothing.
import { useCallback, useEffect, useState } from 'react';
import { getLibraryMapStatus, rebuildLibraryMap } from '../../services/api';
import type { LibraryMapStatus } from '../../types';
import { describeError } from './resource';
import { aged, isActive, mapIsStale, pollDelay } from './refreshModel';

/** Consecutive failed reads before polling gives up; the next focus or click tries again. */
const MAX_FAILURES = 5;

interface Snapshot {
  status: LibraryMapStatus;
  /** when it was read, so the server's counters can be aged to now */
  at: number;
}

export interface MapRefresh {
  status: LibraryMapStatus | null;
  /** the server's countdown, aged to now (scheduled only) */
  secondsUntil: number | null;
  /** how long the build has run, aged to now (building only) */
  runningFor: number | null;
  /** the server holds a newer map than `shownBuiltAt` */
  stale: boolean;
  /** the rebuild request is in flight */
  starting: boolean;
  /** what the last click came to, when it was not simply "a build started" */
  notice: string | null;
  /** status cannot be read; what is shown may be out of date */
  unreachable: boolean;
  rebuild: () => void;
}

export function useMapRefresh(shownBuiltAt: string | null): MapRefresh {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failures, setFailures] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [outcome, setOutcome] = useState<{ text: string; whileBuilding: boolean } | null>(null);

  const read = useCallback(async (signal?: AbortSignal) => {
    try {
      const status = await getLibraryMapStatus(signal);
      if (signal?.aborted) return;
      setSnap({ status, at: Date.now() });
      setFailures(0);
    } catch {
      if (!signal?.aborted) setFailures((n) => n + 1);
    }
  }, []);

  // On open, and when the user comes back to the tab: an upload may have finished meanwhile,
  // and a hidden tab was (rightly) not being polled.
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read(controller.signal);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      controller.abort();
    };
  }, [read]);

  // Re-arms after every read, so the chain ends the moment a read says idle.
  useEffect(() => {
    if (failures >= MAX_FAILURES || document.visibilityState === 'hidden') return;
    const refresh = snap?.status.refresh;
    const left = refresh?.seconds_until != null && snap ? aged(refresh.seconds_until, Date.now() - snap.at) : null;
    const delay = pollDelay(snap?.status ?? null, left);
    if (delay == null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void read(controller.signal), delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [snap, failures, read]);

  // Drives the on-screen countdown and elapsed time between reads.
  const active = isActive(snap?.status ?? null);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const rebuild = useCallback(async () => {
    setStarting(true);
    setOutcome(null);
    try {
      const result = await rebuildLibraryMap();
      setSnap((prev) => (prev ? { status: { ...prev.status, refresh: result.refresh }, at: Date.now() } : prev));
      if (!result.started) {
        // `started: false` means "already running" -- but only believe that if the server
        // also says it is running, so a request that started nothing is not reported as a build.
        setOutcome(
          result.refresh.state === 'building'
            ? { text: 'A build was already running, so this request was added to it. Another build will follow.', whileBuilding: true }
            : { text: 'The server did not start a build. Try again, and check the server log if it keeps happening.', whileBuilding: false }
        );
      }
      void read();
    } catch (error) {
      setOutcome({ text: `Could not start a rebuild: ${describeError(error).message}`, whileBuilding: false });
    } finally {
      setStarting(false);
    }
  }, [read]);

  const elapsedMs = snap ? Math.max(0, now - snap.at) : 0;
  const refresh = snap?.status.refresh ?? null;
  return {
    status: snap?.status ?? null,
    secondsUntil: refresh?.seconds_until != null ? aged(refresh.seconds_until, elapsedMs) : null,
    runningFor: refresh?.running_for_seconds != null ? Math.round(refresh.running_for_seconds + elapsedMs / 1000) : null,
    stale: mapIsStale(shownBuiltAt, snap?.status ?? null),
    starting,
    notice: outcome && (!outcome.whileBuilding || refresh?.state === 'building') ? outcome.text : null,
    unreachable: failures >= 2,
    rebuild: () => void rebuild(),
  };
}
