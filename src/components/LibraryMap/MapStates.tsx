import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw, Waypoints } from 'lucide-react';
import { BUILD_COMMAND } from './format';
import type { ErrorInfo } from './resource';
import { Spinner } from './ui';

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">{children}</div>
    </div>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <RefreshCw className="h-4 w-4" /> Try again
    </button>
  );
}

export function MapLoading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-white dark:bg-gray-900">
      <Spinner label="Loading the library map…" />
    </div>
  );
}

/** 404 from /library-map (or /engineering): the artifact has not been built yet. */
export function MapNotBuilt({
  detail,
  onRetry,
  title = 'The library map hasn’t been built yet',
  body = 'The map is computed once from the indexed papers and saved on the server. Run this on the backend machine, then come back:',
  extraArgs = '',
}: {
  detail: string;
  onRetry: () => void;
  title?: string;
  body?: string;
  /** appended to the build command (e.g. --collection name) */
  extraArgs?: string;
}) {
  const [copied, setCopied] = useState(false);
  const fromDetail = /Run:\s*(.+)$/.exec(detail)?.[1]?.trim();
  const base = fromDetail || BUILD_COMMAND;
  const command = extraArgs && !base.includes(extraArgs) ? `${base} ${extraArgs}` : base;
  const copy = () => {
    navigator.clipboard?.writeText(command).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false)
    );
  };
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
          <Waypoints className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{body}</p>
          <div className="mt-3 flex items-stretch overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap bg-gray-50 px-3 py-2 font-mono text-[13px] text-gray-900 dark:bg-gray-800 dark:text-gray-100">
              {command}
            </code>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy command"
              title="Copy command"
              className="shrink-0 border-l border-gray-200 px-3 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-4">
            <RetryButton onRetry={onRetry} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function MapError({ info, onRetry, title = 'The map could not be loaded' }: { info: ErrorInfo; onRetry: () => void; title?: string }) {
  // gateway errors (a proxy or tunnel in front of a stopped backend) read like a network failure
  const unreachable = info.network || info.status === 502 || info.status === 503 || info.status === 504;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{unreachable ? 'Could not reach the server' : title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {unreachable
              ? `Check that the backend is running and reachable, then try again.${info.status ? ` (HTTP ${info.status})` : ''}`
              : `${info.status ? `Error ${info.status}: ` : ''}${info.message}`}
          </p>
          <div className="mt-4">
            <RetryButton onRetry={onRetry} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function MapEmpty() {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">The map has no papers</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">The map was built from an empty collection. Index some papers and rebuild it.</p>
    </Card>
  );
}
