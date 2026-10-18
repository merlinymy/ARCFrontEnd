import type { ReactNode } from 'react';
import { AlertTriangle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { formatCount, truncate } from './format';
import { formatClock, stripKind } from './refreshModel';
import type { MapRefresh } from './useMapRefresh';

const SECONDARY =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';
const PRIMARY =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900';

/** A rebuild takes minutes on this library; the strip says so rather than imply it is imminent. */
const BUILD_TAKES = 'A build takes about 3–4 minutes.';

function Row({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
      <span className="shrink-0 text-gray-500 dark:text-gray-400" aria-hidden>
        {icon}
      </span>
      <p className="min-w-0 flex-1 basis-60">{children}</p>
      {action}
    </div>
  );
}

/**
 * Says whether the map is current and what is being done about it. Quiet when it is current:
 * the header already gives the build date, so there is nothing to add and no row is drawn.
 * `onShowNew` is absent when no map is on screen (nothing to replace, so it loads by itself).
 */
export function MapRefreshStrip({ refresh, onShowNew }: { refresh: MapRefresh; onShowNew?: () => void }) {
  const { status, secondsUntil, runningFor, stale, starting, notice, unreachable, rebuild } = refresh;
  if (!status) return null;
  const r = status.refresh;
  const kind = stripKind(status);
  const behind = status.papers_behind ?? 0;
  const missing = behind > 0 ? `${formatCount(behind)} ${behind === 1 ? 'paper is' : 'papers are'} not on the map yet. ` : '';

  const rebuildButton = (label: string) => (
    <button type="button" className={SECONDARY} onClick={rebuild} disabled={starting} title={BUILD_TAKES}>
      {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  );

  const rows: ReactNode[] = [];

  if (stale && onShowNew) {
    rows.push(
      <Row
        key="stale"
        icon={<RefreshCw className="h-4 w-4" />}
        action={
          <button type="button" className={PRIMARY} onClick={onShowNew}>
            Show new map
          </button>
        }
      >
        A newer map is ready. Showing it closes the open paper or topic; the layout has changed, so positions will not match.
      </Row>
    );
  }

  if (kind === 'building') {
    rows.push(
      <Row key="kind" icon={<Loader2 className="h-4 w-4 animate-spin" />}>
        Rebuilding the map{runningFor != null ? `, running for ${formatClock(runningFor)}` : ''}. {BUILD_TAKES}
        {r.queued_after ? ' Another build will follow it.' : ''}
      </Row>
    );
  } else if (kind === 'scheduled') {
    rows.push(
      <Row key="kind" icon={<Clock className="h-4 w-4" />} action={rebuildButton('Rebuild now')}>
        {missing}
        {secondsUntil != null && secondsUntil > 0
          ? `A rebuild starts in ${formatClock(secondsUntil)}, once uploads settle. ${BUILD_TAKES}`
          : `A rebuild is about to start. ${BUILD_TAKES}`}
      </Row>
    );
  } else if (kind === 'never') {
    rows.push(
      <Row key="kind" icon={<RefreshCw className="h-4 w-4" />} action={rebuildButton('Build the map')}>
        No map has been built for {status.collection} yet. {BUILD_TAKES}
      </Row>
    );
  } else if (kind === 'behind') {
    rows.push(
      <Row key="kind" icon={<RefreshCw className="h-4 w-4" />} action={rebuildButton('Rebuild now')}>
        {missing}
        {r.enabled ? 'Nothing is scheduled.' : 'Automatic rebuilds are off.'} {BUILD_TAKES}
      </Row>
    );
  }

  if (notice) {
    rows.push(
      <p key="notice" role="status" className="px-1 text-xs text-gray-600 dark:text-gray-400">
        {notice}
      </p>
    );
  }

  // A failed build otherwise shows only in the server log. Hidden while the next one runs: that
  // build may well fix it, and showing last time's failure beside "rebuilding" reads as current.
  if (r.last_error && kind !== 'building') {
    rows.push(
      <Row key="error" icon={<AlertTriangle className="h-4 w-4" />}>
        <span role="alert" title={r.last_error}>
          <span className="font-medium text-gray-900 dark:text-gray-100">The last rebuild failed.</span> {truncate(r.last_error, 200)}
        </span>
      </Row>
    );
  }

  if (unreachable) {
    rows.push(
      <p key="unreachable" role="status" className="px-1 text-xs text-gray-500 dark:text-gray-400">
        Could not reach the server to check on the rebuild, so the above may be out of date.
      </p>
    );
  }

  if (!rows.length) return null;
  return <div className="space-y-1.5">{rows}</div>;
}
