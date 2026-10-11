import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Link2Off, RefreshCw, Unplug } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  connectZotero,
  disconnectZotero,
  getZoteroConflicts,
  getZoteroStatus,
  getZoteroSyncJob,
  resolveZoteroConflict,
  startZoteroSync,
} from '../../services/bibliographyApi';
import { ApiError } from '../../services/api';
import type { ZoteroConflictPolicy, ZoteroParkedConflict, ZoteroStatus, ZoteroSyncJob, ZoteroSyncRequest, ZoteroSyncResult } from '../../types/bibliography';
import { EntryDetailDialog } from './EntryDialogs';
import { Badge, Banner, Button, Card, CheckboxField, ConfirmDialog, EmptyState, SectionTitle, Spinner, Stat } from './ui';
import { displayValue, errorMessage, focusRing, formatDateTime, inputClass, labelClass } from './util';
import { usePolling } from './hooks';

const POLICY_LABEL: Record<ZoteroConflictPolicy, string> = {
  zotero_wins: "Zotero wins (Zotero's value is written into ARC)",
  arc_wins: "ARC wins (ARC's value is kept and pushed)",
  manual: 'Decide by hand (the item is parked and listed below)',
};

const PULL_LABEL: Record<string, string> = {
  items_seen: 'Items seen in Zotero',
  skipped_non_bibliographic: 'Skipped (attachments, notes)',
  created_references: 'New reference-only entries',
  linked_existing: 'Linked to existing entries',
  updated_local: 'Updated in ARC',
  unchanged: 'Unchanged',
  deleted_in_zotero: 'Deleted in Zotero',
};

const PUSH_LABEL: Record<string, string> = {
  created: 'Created in Zotero',
  updated: 'Updated in Zotero',
  skipped_unusable_title: 'Skipped (title is a file name)',
  failed: 'Failed',
  capped_at: 'Limit on items created',
  would_create: 'Would create',
  would_update: 'Would update',
};

// ---------------------------------------------------------------------------
// Connect form
// ---------------------------------------------------------------------------

function ConnectForm({ onConnected }: { onConnected: (s: ZoteroStatus) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [libraryType, setLibraryType] = useState<'user' | 'group'>('user');
  const [libraryId, setLibraryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (apiKey.trim().length < 8) {
      setError('Paste the whole API key (at least 8 characters).');
      return;
    }
    if (libraryType === 'group' && !libraryId.trim()) {
      setError('A group library needs its numeric group id.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = await connectZotero({ api_key: apiKey.trim(), library_type: libraryType, library_id: libraryId.trim() || undefined });
      setApiKey(''); // the key is held in the field only until it is sent
      onConnected(status);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 502 ? `Zotero could not be reached: ${e.message}` : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <SectionTitle hint="ARC stores the key in its own database and never shows it again.">Connect to Zotero</SectionTitle>
      <form
        className="space-y-3 max-w-xl"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="zotero-key" className={labelClass}>
            API key
          </label>
          <input
            id="zotero-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            aria-describedby="zotero-key-hint"
            className={inputClass}
          />
          <p id="zotero-key-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Create one at zotero.org/settings/keys. Allow library read access, and write access too if you want ARC to push changes to Zotero.
          </p>
        </div>
        <fieldset>
          <legend className={labelClass}>Library</legend>
          <div className="flex gap-4">
            {(['user', 'group'] as const).map((t) => (
              <label key={t} className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                <input type="radio" name="zotero-library-type" checked={libraryType === t} onChange={() => setLibraryType(t)} className="text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                {t === 'user' ? 'My library' : 'A group library'}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="zotero-library-id" className={labelClass}>
            {libraryType === 'group' ? 'Group id (required)' : 'User id (optional)'}
          </label>
          <input
            id="zotero-library-id"
            inputMode="numeric"
            value={libraryId}
            onChange={(e) => setLibraryId(e.target.value)}
            aria-describedby="zotero-id-hint"
            className={inputClass}
          />
          <p id="zotero-id-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {libraryType === 'group' ? 'The number in the group URL, zotero.org/groups/<id>/...' : 'Leave empty to use the user the key belongs to.'}
          </p>
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <Button type="submit" variant="primary" loading={busy} icon={<KeyRound className="w-4 h-4" aria-hidden="true" />}>
          Verify and connect
        </Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sync result
// ---------------------------------------------------------------------------

function CountTable({ title, counts, labels }: { title: string; counts: Record<string, number | null>; labels: Record<string, string> }) {
  const rows = Object.entries(counts).filter(([, v]) => v !== null && v !== undefined);
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h4>
      <dl className="text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-0.5 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
            <dt className="text-gray-600 dark:text-gray-400">{labels[k] ?? k.replace(/_/g, ' ')}</dt>
            <dd className="font-medium tabular-nums">{Number(v).toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SyncResultView({ result, onOpenEntry }: { result: ZoteroSyncResult; onOpenEntry: (id: string) => void }) {
  const tone = result.status === 'ok' ? 'success' : result.status === 'dry_run' ? 'info' : 'warning';
  return (
    <div className="space-y-3">
      <Banner tone={tone} title={result.status === 'dry_run' ? 'Dry run: nothing was written' : result.status === 'ok' ? 'Sync finished' : 'Sync finished with some errors'}>
        {result.direction} sync, conflict policy {result.policy}. Library version {result.library_version_before} to {result.library_version_after}. {formatDateTime(result.started_at)} to {formatDateTime(result.finished_at)}.
        {result.dry_run && ' Run again without "dry run" to apply what is listed as "would".'}
      </Banner>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CountTable title="Read from Zotero (into ARC)" counts={result.pulled} labels={PULL_LABEL} />
        <CountTable title="Sent to Zotero" counts={result.pushed} labels={PUSH_LABEL} />
      </div>

      {result.conflicts.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Conflicts ({result.conflicts.length})</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Both sides changed the same field to different values.</p>
          <ul className="space-y-1.5 text-sm">
            {result.conflicts.map((c, i) => (
              <li key={`${c.zotero_key}-${c.field}-${i}`} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => onOpenEntry(c.entry_id)} className={`font-medium text-blue-600 dark:text-blue-400 hover:underline rounded ${focusRing}`}>
                  {c.field} of Zotero item {c.zotero_key}
                </button>{' '}
                <Badge tone={c.resolution === 'pending' ? 'amber' : 'green'}>
                  {c.resolution === 'zotero' ? "Zotero's value used" : c.resolution === 'arc' ? "ARC's value kept" : 'waiting for you'}
                </Badge>
                <p className="text-xs mt-0.5 break-words">
                  ARC: <code className="px-1 rounded bg-gray-100 dark:bg-gray-700">{displayValue(c.arc)}</code> Zotero: <code className="px-1 rounded bg-gray-100 dark:bg-gray-700">{displayValue(c.zotero)}</code>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.possible_duplicates.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Possible duplicates not linked ({result.possible_duplicates.length})</h4>
          <ul className="space-y-1 text-sm">
            {result.possible_duplicates.map((d, i) => (
              <li key={`${d.zotero_key}-${i}`} className="break-words">
                <strong>{d.title}</strong> looks like <strong>{d.similar_title}</strong> ({d.basis}). {d.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.notes.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
          {result.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {result.errors.length > 0 && (
        <Banner tone="error" title={`${result.errors.length} errors`}>
          <ul className="list-disc pl-5">
            {result.errors.slice(0, 20).map((e, i) => (
              <li key={i} className="break-words">
                {typeof e === 'string' ? e : JSON.stringify(e)}
              </li>
            ))}
          </ul>
        </Banner>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parked conflicts
// ---------------------------------------------------------------------------

function ConflictList({ conflicts, onResolve, busyId, onOpenEntry }: { conflicts: ZoteroParkedConflict[]; onResolve: (c: ZoteroParkedConflict, choice: 'zotero' | 'arc') => void; busyId: number | null; onOpenEntry: (id: string) => void }) {
  return (
    <ul className="space-y-3">
      {conflicts.map((c) => (
        <li key={c.item_id} className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <button type="button" onClick={() => onOpenEntry(c.entry_id)} className={`font-medium text-blue-600 dark:text-blue-400 hover:underline rounded ${focusRing}`}>
                Open the ARC entry
              </button>{' '}
              <span className="text-gray-500 dark:text-gray-400">
                {c.kind === 'paper' ? 'PDF paper' : 'reference'}, Zotero item {c.zotero_key}, found {formatDateTime(c.detected_at)}
              </span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" loading={busyId === c.item_id} onClick={() => onResolve(c, 'zotero')}>
                Use Zotero's values
              </Button>
              <Button size="sm" disabled={busyId === c.item_id} onClick={() => onResolve(c, 'arc')}>
                Keep ARC's values
              </Button>
            </div>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Fields that differ for Zotero item {c.zotero_key}</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th scope="col" className="pr-3 py-1">
                    Field
                  </th>
                  <th scope="col" className="pr-3 py-1">
                    ARC
                  </th>
                  <th scope="col" className="pr-3 py-1">
                    Zotero
                  </th>
                  <th scope="col" className="py-1">
                    Last agreed
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.fields.map((f) => (
                  <tr key={f.field} className="border-t border-amber-200/60 dark:border-amber-800/40 align-top">
                    <th scope="row" className="pr-3 py-1 font-medium">
                      {f.field}
                    </th>
                    <td className="pr-3 py-1 break-words">{displayValue(f.arc)}</td>
                    <td className="pr-3 py-1 break-words">{displayValue(f.zotero)}</td>
                    <td className="py-1 break-words text-gray-500 dark:text-gray-400">{displayValue(f.base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export function ZoteroTab({ onChanged }: { onChanged: () => void }) {
  const { showToast } = useApp();
  const [status, setStatus] = useState<ZoteroStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // sync options
  const [direction, setDirection] = useState<'both' | 'pull' | 'push'>('both');
  const [dryRun, setDryRun] = useState(false);
  const [pushPapers, setPushPapers] = useState(false);
  const [pushReferences, setPushReferences] = useState(false);
  const [maxPush, setMaxPush] = useState('');
  const [policy, setPolicy] = useState<'' | ZoteroConflictPolicy>('');
  const [confirmSync, setConfirmSync] = useState(false);

  // job
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ZoteroSyncJob | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // conflicts + disconnect
  const [conflicts, setConflicts] = useState<ZoteroParkedConflict[] | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<number | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const finishedJob = useRef<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await getZoteroStatus();
      setStatus(s);
      setStatusError(null);
      return s;
    } catch (e) {
      setStatusError(errorMessage(e));
      return null;
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    try {
      setConflicts((await getZoteroConflicts()).conflicts);
      setConflictError(null);
    } catch (e) {
      setConflictError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadStatus().then((s) => {
      if (s?.connected) void loadConflicts();
    });
  }, [loadStatus, loadConflicts]);

  const running = job?.status === 'running' || (!job && status?.sync_running === true);

  // Poll the job every 1.5 s. A 404 means the server forgot the job (a restart): fall back to /status.
  usePolling(
    async () => {
      if (jobId) {
        try {
          const j = await getZoteroSyncJob(jobId);
          setJob(j);
          if (j.status !== 'running' && finishedJob.current !== jobId) {
            finishedJob.current = jobId;
            await loadStatus();
            await loadConflicts();
            if (j.status === 'done') {
              showToast({ type: j.result?.status === 'dry_run' ? 'info' : 'success', message: j.result?.status === 'dry_run' ? 'Dry run finished' : 'Zotero sync finished' });
              if (j.result && !j.result.dry_run) onChanged();
            } else {
              showToast({ type: 'error', message: j.error ?? 'The sync failed' });
            }
          }
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            setJobId(null);
            setJob(null);
            setJobError('The server no longer knows this sync (it may have restarted). The status above shows where the last sync stopped; syncing again is safe.');
            await loadStatus();
          } else {
            throw e;
          }
        }
      } else {
        // a sync started elsewhere: just watch the status
        const s = await loadStatus();
        if (s && !s.sync_running) {
          await loadConflicts();
          onChanged();
        }
      }
    },
    1500,
    running
  );

  const pushing = direction !== 'pull' && (pushPapers || pushReferences);
  const canWrite = status?.can_write !== false;

  const buildRequest = (): ZoteroSyncRequest => {
    const req: ZoteroSyncRequest = { direction, dry_run: dryRun };
    if (direction !== 'pull') {
      req.push_papers = pushPapers;
      req.push_references = pushReferences;
      if (maxPush.trim() !== '' && Number.isFinite(Number(maxPush)) && Number(maxPush) >= 0) req.max_push = Math.floor(Number(maxPush));
    }
    if (policy) req.policy = policy;
    return req;
  };

  const startSync = async () => {
    setConfirmSync(false);
    setStarting(true);
    setJobError(null);
    setJob(null);
    try {
      const res = await startZoteroSync(buildRequest());
      finishedJob.current = null;
      setJobId(res.job_id);
      setJob({ job_id: res.job_id, status: 'running', message: 'Starting', started_at: new Date().toISOString(), request: buildRequest() });
    } catch (e) {
      setJobError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const onStartClick = () => {
    if (pushing && !dryRun) setConfirmSync(true);
    else void startSync();
  };

  const resolve = async (c: ZoteroParkedConflict, choice: 'zotero' | 'arc') => {
    setResolving(c.item_id);
    try {
      await resolveZoteroConflict(c.item_id, choice);
      showToast({ type: 'success', message: choice === 'zotero' ? "Zotero's values written into ARC" : "ARC's values kept; the next sync pushes them" });
      await loadConflicts();
      await loadStatus();
      if (choice === 'zotero') onChanged();
    } catch (e) {
      showToast({ type: 'error', message: errorMessage(e) });
    } finally {
      setResolving(null);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectZotero();
      setConfirmDisconnect(false);
      setJob(null);
      setJobId(null);
      setConflicts(null);
      await loadStatus();
      showToast({ type: 'success', message: 'Zotero disconnected. The key was forgotten; links to Zotero items are kept.' });
    } catch (e) {
      setConfirmDisconnect(false);
      showToast({ type: 'error', message: errorMessage(e) });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!status && !statusError) return <Spinner label="Checking the Zotero connection" />;

  const connected = status?.connected === true;
  const summary = status?.last_sync_summary as { pulled?: Record<string, number>; pushed?: Record<string, number | null>; conflicts?: number } | null | undefined;

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Zotero syncs both ways. EndNote and Mendeley stay file-based: use Import and Export. By default ARC changes only what already exists on both sides, and never deletes anything in Zotero. Creating Zotero items is opt-in.
      </p>

      {statusError && (
        <Banner tone="error" title="Could not read the Zotero status" actions={<Button size="sm" onClick={() => void loadStatus()}>Retry</Button>}>
          {statusError}
        </Banner>
      )}

      {status && !connected && <ConnectForm onConnected={(s) => { setStatus(s); void loadConflicts(); showToast({ type: 'success', message: 'Connected to Zotero' }); }} />}

      {connected && status && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionTitle>Connection</SectionTitle>
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  {status.library_type === 'group' ? 'Group library' : 'Personal library'} <strong>{status.library_key}</strong>
                  {status.username ? <> ({status.username})</> : null}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {status.can_write ? <Badge tone="green">key can write</Badge> : <Badge tone="amber">key is read-only: nothing can be pushed</Badge>}
                  <Badge>{status.source === 'environment' ? 'configured in the server .env' : 'stored in ARC'}</Badge>
                  {status.api_key_hint && <Badge title="Only the end of the key is ever shown">key ending {status.api_key_hint}</Badge>}
                </div>
              </div>
              <Button variant="danger" size="sm" icon={<Unplug className="w-4 h-4" aria-hidden="true" />} onClick={() => setConfirmDisconnect(true)} disabled={running}>
                Disconnect
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Sync status">
              <Stat label="Linked items" value={status.linked_items ?? 0} />
              <Stat label="Open conflicts" value={status.conflicts ?? 0} tone={(status.conflicts ?? 0) > 0 ? 'warn' : undefined} />
              <Stat label="PDF papers not in Zotero" value={status.arc_only?.papers ?? 0} />
              <Stat label="References not in Zotero" value={status.arc_only?.references ?? 0} />
              <Stat label="Zotero library version" value={status.last_version ?? 0} />
            </div>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">Last pull</dt>
                <dd>{formatDateTime(status.last_pull_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">Last push</dt>
                <dd>{formatDateTime(status.last_push_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">Last sync result</dt>
                <dd>{status.last_sync_status ?? 'never synced'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">Default conflict policy</dt>
                <dd>{status.conflict_policy.replace(/_/g, ' ')}</dd>
              </div>
            </dl>
            {summary && (summary.pulled || summary.pushed) && (
              <details className="mt-2">
                <summary className={`text-sm text-gray-600 dark:text-gray-400 cursor-pointer rounded ${focusRing}`}>Last sync in detail</summary>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {summary.pulled && <CountTable title="Read from Zotero" counts={summary.pulled} labels={PULL_LABEL} />}
                  {summary.pushed && <CountTable title="Sent to Zotero" counts={summary.pushed} labels={PUSH_LABEL} />}
                </div>
              </details>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle hint="Reads Zotero's changes into ARC and sends ARC's edits to items that are already linked.">Sync</SectionTitle>
            <form
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                onStartClick();
              }}
            >
              <div>
                <label htmlFor="zotero-direction" className={labelClass}>
                  Direction
                </label>
                <select id="zotero-direction" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className={inputClass} disabled={running}>
                  <option value="both">Both ways (pull, then push edits to linked items)</option>
                  <option value="pull">Pull only (Zotero to ARC; nothing is written to Zotero)</option>
                  <option value="push">Push only (ARC to Zotero)</option>
                </select>
              </div>
              <div>
                <label htmlFor="zotero-policy" className={labelClass}>
                  When both sides changed the same field
                </label>
                <select id="zotero-policy" value={policy} onChange={(e) => setPolicy(e.target.value as typeof policy)} className={inputClass} disabled={running}>
                  <option value="">Server default ({status.conflict_policy.replace(/_/g, ' ')})</option>
                  {(Object.keys(POLICY_LABEL) as ZoteroConflictPolicy[]).map((p) => (
                    <option key={p} value={p}>
                      {POLICY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <CheckboxField checked={dryRun} onChange={setDryRun} disabled={running} label="Dry run" hint="Reads Zotero and reports what a real run would do. Nothing is written to Zotero or to ARC." />
              </div>

              <fieldset className="md:col-span-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700" disabled={running || direction === 'pull' || !canWrite}>
                <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">Create new items in Zotero (opt-in)</legend>
                {!canWrite && <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">This key is read-only, so nothing can be created in Zotero.</p>}
                {direction === 'pull' && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Not used when pulling only.</p>}
                <div className="space-y-2">
                  <CheckboxField
                    checked={pushPapers}
                    onChange={setPushPapers}
                    label={`Create Zotero items for ARC PDF papers that have none (${(status.arc_only?.papers ?? 0).toLocaleString()} could be created)`}
                    hint="Papers whose title is a file name are skipped. Items get the tag ARC; PDFs are not uploaded."
                  />
                  <CheckboxField
                    checked={pushReferences}
                    onChange={setPushReferences}
                    label={`Create Zotero items for reference-only entries added in ARC (${(status.arc_only?.references ?? 0).toLocaleString()} could be created)`}
                    hint="Entries that came from Zotero are never sent back."
                  />
                  <div className="max-w-xs">
                    <label htmlFor="zotero-max-push" className={labelClass}>
                      At most this many new items in one run
                    </label>
                    <input id="zotero-max-push" type="number" min={0} inputMode="numeric" value={maxPush} onChange={(e) => setMaxPush(e.target.value)} placeholder="server default (200)" className={inputClass} />
                  </div>
                </div>
              </fieldset>

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" loading={starting || running} icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}>
                  {running ? 'Sync running...' : dryRun ? 'Start dry run' : 'Start sync'}
                </Button>
                {pushing && !dryRun && <span className="text-sm text-amber-800 dark:text-amber-200">This will create items in your Zotero library.</span>}
              </div>
            </form>
          </Card>

          {(job || jobError || running) && (
            <Card className="p-4" >
              <SectionTitle>Sync progress</SectionTitle>
              <div aria-live="polite">
                {job?.status === 'running' && (
                  <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Spinner label={job.message || 'Working'} />
                  </p>
                )}
                {!job && running && <Spinner label="A sync started elsewhere is running" />}
                {job?.status === 'error' && <Banner tone="error" title="The sync failed">{job.error ?? job.message}</Banner>}
              </div>
              {jobError && <Banner tone="warning" className="mt-2">{jobError}</Banner>}
              {job?.status === 'done' && job.result && (
                <div className="mt-2">
                  <SyncResultView result={job.result} onOpenEntry={setOpenEntry} />
                </div>
              )}
            </Card>
          )}

          <Card className="p-4">
            <SectionTitle hint="Only filled when the conflict policy is 'decide by hand'. Under the other policies every conflict is still listed in the sync result.">Conflicts waiting for you</SectionTitle>
            {conflictError && <Banner tone="error">{conflictError}</Banner>}
            {!conflicts && !conflictError && <Spinner label="Loading conflicts" />}
            {conflicts && conflicts.length === 0 && <EmptyState icon={<Link2Off className="w-10 h-10" />} title="No conflicts waiting" />}
            {conflicts && conflicts.length > 0 && <ConflictList conflicts={conflicts} onResolve={(c, choice) => void resolve(c, choice)} busyId={resolving} onOpenEntry={setOpenEntry} />}
          </Card>
        </>
      )}

      {confirmSync && (
        <ConfirmDialog title="Create items in Zotero?" confirmLabel="Start sync" onConfirm={() => void startSync()} onCancel={() => setConfirmSync(false)}>
          <p>
            This sync will create Zotero items for{' '}
            {[pushPapers && 'ARC PDF papers', pushReferences && 'reference-only entries'].filter(Boolean).join(' and ')}, up to {maxPush.trim() ? Number(maxPush).toLocaleString() : 'the server limit (200 by default)'} new items.
          </p>
          <p>ARC never deletes anything in Zotero, but new items cannot be removed from here. Run a dry run first if you are unsure.</p>
        </ConfirmDialog>
      )}
      {confirmDisconnect && (
        <ConfirmDialog title="Disconnect Zotero?" confirmLabel="Disconnect" danger busy={disconnecting} onConfirm={() => void disconnect()} onCancel={() => setConfirmDisconnect(false)}>
          <p>ARC forgets the API key. Library entries and their links to Zotero items are kept, so reconnecting resumes where it stopped.</p>
          {status?.source === 'environment' && <p>The connection is configured in the server's .env file, so it will stay active until that is changed.</p>}
        </ConfirmDialog>
      )}
      {openEntry && <EntryDetailDialog entryId={openEntry} onClose={() => setOpenEntry(null)} onChanged={onChanged} />}
    </div>
  );
}
