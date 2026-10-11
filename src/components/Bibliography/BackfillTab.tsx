import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, RefreshCw, Terminal } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { applyBackfill, getBackfillReport, getBackfillStatus, getBibliographyStats } from '../../services/bibliographyApi';
import type {
  BackfillApplyResponse,
  BackfillItem,
  BackfillReportResponse,
  BackfillStatusKey,
  BackfillStatusResponse,
  LibraryStats,
} from '../../types/bibliography';
import { Badge, Banner, Button, Card, ConfirmDialog, CopyButton, EmptyState, Pager, Spinner, Stat } from './ui';
import { authorToLine, doiUrl, errorMessage, formatDateTime } from './util';

const PAGE_SIZE = 25;
const COMMAND = 'python scripts/backfill_bibliography.py --mailto you@example.org';
const TRIAL_COMMAND = 'python scripts/backfill_bibliography.py --limit 50 --mailto you@example.org';

const BANDS: Array<{ key: BackfillStatusKey; label: string; hint: string; tone: 'green' | 'amber' | 'gray' | 'red' | 'blue' }> = [
  { key: 'accept', label: 'Accept', hint: 'Confident matches (at or above the accept threshold)', tone: 'green' },
  { key: 'review', label: 'Review', hint: 'Plausible, but a person should look', tone: 'amber' },
  { key: 'verified', label: 'Verified', hint: 'Matched, nothing to fill', tone: 'blue' },
  { key: 'no_match', label: 'No match', hint: 'Crossref had nothing close enough', tone: 'gray' },
  { key: 'no_evidence', label: 'No evidence', hint: 'Nothing to search with', tone: 'gray' },
  { key: 'error', label: 'Error', hint: 'Crossref failed for these', tone: 'red' },
];

const FIELD_ROWS: Array<{ key: 'title' | 'doi' | 'year' | 'authors' | 'journal'; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'authors', label: 'Authors' },
  { key: 'year', label: 'Year' },
  { key: 'doi', label: 'DOI' },
  { key: 'journal', label: 'Journal' },
];

function authorsText(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  const names = value.map((a) => (typeof a === 'string' ? a : authorToLine(a as Parameters<typeof authorToLine>[0]))).filter(Boolean);
  return names.length > 4 ? `${names.slice(0, 4).join('; ')}; and ${names.length - 4} more` : names.join('; ');
}

function fieldText(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (key === 'authors') return authorsText(value);
  return String(value);
}

function ConfidenceMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">no score</span>;
  const tone = value >= 0.9 ? 'bg-green-500' : value >= 0.75 ? 'bg-amber-500' : 'bg-gray-400';
  return (
    <span className="inline-flex items-center gap-2" title={`Confidence ${value.toFixed(2)}`}>
      <span className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
        <span className={`block h-full ${tone}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="text-sm font-medium tabular-nums">{value.toFixed(2)}</span>
      <span className="sr-only">confidence</span>
    </span>
  );
}

function ItemCard({ item, selected, onSelect }: { item: BackfillItem; selected: boolean; onSelect: (checked: boolean) => void }) {
  const writable = Object.keys(item.proposed ?? {}).length > 0;
  const applied = !!item.applied_at;
  const cr = item.crossref;
  const crossref: Record<string, unknown> = cr ? { title: cr.title, authors: cr.authors, year: cr.year, doi: cr.doi, journal: cr.journal } : {};
  const current: Record<string, unknown> = {
    title: item.current.title_usable ? item.current.title : '',
    authors: item.current.authors,
    year: item.current.year,
    doi: item.current.doi,
    journal: item.current.journal,
  };
  const checkboxId = `bf-${item.paper_id}`;
  return (
    <li className={`bg-white dark:bg-gray-800 border rounded-lg p-4 ${selected ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-start gap-3">
        {writable && !applied ? (
          <input
            id={checkboxId}
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        ) : (
          <span className="w-4" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {writable && !applied ? (
              <label htmlFor={checkboxId} className="font-medium text-gray-900 dark:text-gray-100 break-all">
                {item.filename}
                <span className="sr-only"> (apply these changes)</span>
              </label>
            ) : (
              <span className="font-medium text-gray-900 dark:text-gray-100 break-all">{item.filename}</span>
            )}
            <ConfidenceMeter value={item.confidence} />
            {item.route && <Badge>{item.route === 'doi' ? 'via DOI' : item.route === 'title' ? 'via title search' : item.route}</Badge>}
            {applied && <Badge tone="green">applied {formatDateTime(item.applied_at)}</Badge>}
            {item.decision === 'reject' && <Badge tone="red" title="Marked reject in the report file by hand">marked reject</Badge>}
            {item.decision === 'accept' && <Badge tone="green" title="Marked accept in the report file by hand">marked accept</Badge>}
          </div>

          {writable ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <caption className="sr-only">Current metadata, the Crossref match and what would be written for {item.filename}</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <th scope="col" className="py-1 pr-3 w-20">
                      Field
                    </th>
                    <th scope="col" className="py-1 pr-3">
                      Now
                    </th>
                    <th scope="col" className="py-1 pr-3">
                      Crossref
                    </th>
                    <th scope="col" className="py-1">
                      Will be written
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_ROWS.map(({ key, label }) => {
                    const proposed = item.proposed[key];
                    const now = fieldText(key, current[key]);
                    const there = fieldText(key, crossref[key]);
                    const writes = proposed !== undefined;
                    return (
                      <tr key={key} className="border-t border-gray-100 dark:border-gray-700/60 align-top">
                        <th scope="row" className="py-1.5 pr-3 font-medium text-gray-700 dark:text-gray-300">
                          {label}
                        </th>
                        <td className="py-1.5 pr-3 break-words text-gray-700 dark:text-gray-300">
                          {now || <span className="text-gray-400">empty</span>}
                          {key === 'title' && !item.current.title_usable && item.current.title && <span className="block text-xs text-amber-700 dark:text-amber-300">file name stand-in: {item.current.title}</span>}
                        </td>
                        <td className="py-1.5 pr-3 break-words text-gray-700 dark:text-gray-300">
                          {key === 'doi' && there ? (
                            <a href={doiUrl(there)} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                              {there}
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : (
                            there || <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-1.5 break-words">
                          {writes ? <span className="font-medium text-green-800 dark:text-green-300">{fieldText(key, proposed) || 'set'}</span> : <span className="text-gray-400">unchanged</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {item.status === 'verified' ? 'Crossref confirms the existing metadata; nothing to fill.' : item.note || 'Nothing to write for this paper.'}
            </p>
          )}

          {item.conflicts.length > 0 && (
            <Banner tone="warning" className="mt-2">
              Crossref disagrees with {item.conflicts.length} existing {item.conflicts.length === 1 ? 'value' : 'values'}. Existing values are left alone; only empty fields are filled.
            </Banner>
          )}

          <details className="mt-2">
            <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">How this match was scored</summary>
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {item.evidence.title_used && (
                <p>
                  Searched with the title <em>{item.evidence.title_used}</em>
                  {item.evidence.title_from ? ` (from ${item.evidence.title_from})` : ''}.
                </p>
              )}
              {item.evidence.dois_considered.length > 0 && <p>DOIs considered: {item.evidence.dois_considered.join(', ')}.</p>}
              <pre className="overflow-auto p-2 rounded bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">{JSON.stringify(item.components, null, 2)}</pre>
              {item.note && <p>Note: {item.note}</p>}
            </div>
          </details>
        </div>
      </div>
    </li>
  );
}

export function BackfillTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { showToast } = useApp();
  const [status, setStatus] = useState<BackfillStatusResponse | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [band, setBand] = useState<BackfillStatusKey>('review');
  const bandChosen = useRef(false);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<BackfillReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<BackfillApplyResponse | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const [s, st] = await Promise.all([getBackfillStatus(), getBibliographyStats().catch(() => null)]);
      setStatus(s);
      setStats(st);
      if (s.exists && !bandChosen.current) {
        // Start where a person is needed: the review band, or accept if nothing needs review.
        setBand((s.stats.by_status.review ?? 0) > 0 ? 'review' : 'accept');
      }
    } catch (e) {
      setStatusError(errorMessage(e));
    }
  }, []);

  // Reload when the library changed elsewhere (`version`).
  useEffect(() => {
    void loadStatus();
  }, [loadStatus, version]);

  const exists = status?.exists === true;
  const loadPage = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setPageError(null);
    try {
      const res = await getBackfillReport({ status: band, offset, limit: PAGE_SIZE });
      if (id === requestId.current) setPage(res);
    } catch (e) {
      if (id === requestId.current) setPageError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [band, offset]);

  useEffect(() => {
    if (exists) void loadPage();
  }, [exists, loadPage]);

  const chooseBand = (next: BackfillStatusKey) => {
    bandChosen.current = true;
    setBand(next);
    setOffset(0);
  };

  const selectAllInBand = async () => {
    setSelectingAll(true);
    setPageError(null);
    try {
      const ids: string[] = [];
      let off = 0;
      for (;;) {
        const res = await getBackfillReport({ status: band, offset: off, limit: 500 });
        for (const it of res.items) if (Object.keys(it.proposed ?? {}).length > 0 && !it.applied_at) ids.push(it.paper_id);
        off += res.items.length;
        if (res.items.length === 0 || off >= res.total) break;
      }
      setSelected((cur) => new Set([...cur, ...ids]));
      showToast({ type: 'info', message: `${ids.length.toLocaleString()} papers selected in the ${band} band` });
    } catch (e) {
      setPageError(errorMessage(e));
    } finally {
      setSelectingAll(false);
    }
  };

  const doApply = async () => {
    const ids = Array.from(selected);
    setApplying(true);
    setApplyError(null);
    try {
      const decisions: Record<string, 'accept'> = {};
      ids.forEach((id) => {
        decisions[id] = 'accept';
      });
      // paper_ids limits the run to exactly the selection; decisions=accept makes an item eligible whatever its band.
      const res = await applyBackfill({ paper_ids: ids, decisions });
      setResult(res);
      setSelected(new Set());
      setConfirming(false);
      showToast({ type: 'success', message: `Metadata written for ${res.papers_updated.toLocaleString()} papers` });
      onChanged();
      await loadStatus();
      await loadPage();
    } catch (e) {
      setConfirming(false);
      setApplyError(errorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const items = useMemo(() => page?.items ?? [], [page]);
  const pageSelectable = useMemo(() => items.filter((i) => Object.keys(i.proposed ?? {}).length > 0 && !i.applied_at), [items]);
  const allPageSelected = pageSelectable.length > 0 && pageSelectable.every((i) => selected.has(i.paper_id));
  const counts = status && status.exists ? status.stats.by_status : {};

  if (!status && !statusError) return <Spinner label="Checking for a backfill report" />;

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Fills missing DOIs, years, authors and journals from Crossref">
        The Crossref lookup makes thousands of requests, so it runs from the command line on the server, not from this page. This page shows its report and applies the changes you select. Applying only fills <strong>empty</strong> fields
        (and the title only when it is currently a file name); it never overwrites a value, and the PDFs and search index are not touched.
      </Banner>

      {statusError && (
        <Banner tone="error" title="Could not read the backfill status" actions={<Button size="sm" onClick={() => void loadStatus()}>Retry</Button>}>
          {statusError}
        </Banner>
      )}

      {stats && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Metadata coverage of PDF papers">
          <Stat label="PDF papers" value={stats.papers.total} />
          <Stat label="with a DOI" value={stats.papers.with_doi} />
          <Stat label="with authors" value={stats.papers.with_authors} />
          <Stat label="with a year" value={stats.papers.with_year} />
          <Stat label="with a journal" value={stats.papers.with_journal} />
          <Stat label="with a real title" value={stats.papers.usable_title} />
        </div>
      )}

      {status && !status.exists && (
        <Card className="p-4 space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
            <Terminal className="w-4 h-4" aria-hidden="true" />
            No backfill report yet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Run the lookup once from the <code>backend/</code> directory. It is a dry run: it writes a report and applies nothing. Try a small batch first, then run it for the whole library (about 30 to 60 minutes for ~4,800 papers).
          </p>
          {[TRIAL_COMMAND, COMMAND].map((cmd) => (
            <div key={cmd} className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-nowrap">{cmd}</code>
              <CopyButton text={cmd} label="Copy" ariaLabel={`Copy command: ${cmd}`} />
            </div>
          ))}
          {status.hint && <p className="text-xs text-gray-500 dark:text-gray-400">Server hint: {status.hint}</p>}
          <Button icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />} onClick={() => void loadStatus()}>
            Check again
          </Button>
        </Card>
      )}

      {status && status.exists && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                <p>
                  Report generated <strong>{formatDateTime(status.generated_at)}</strong> for {status.stats.evaluated.toLocaleString()} papers.
                </p>
                <p>
                  {status.applied_at ? (
                    <>
                      Last applied <strong>{formatDateTime(status.applied_at)}</strong>.
                    </>
                  ) : (
                    'Nothing from this report has been applied yet.'
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Accept at {status.thresholds.accept}, review at {status.thresholds.review}, title gate {status.thresholds.title_gate}. Options: {Object.entries(status.options).map(([k, v]) => `${k}=${String(v)}`).join(', ') || 'defaults'}.
                </p>
                {status.stats.crossref && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Crossref: {status.stats.crossref.requests.toLocaleString()} requests, {status.stats.crossref.cache_hits.toLocaleString()} from cache, {status.stats.crossref.retries} retries, {status.stats.crossref.not_found} not found.
                  </p>
                )}
                {Object.keys(status.stats.fields_proposed_if_accepted).length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    If every accept-band match were applied: {Object.entries(status.stats.fields_proposed_if_accepted).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(', ')}.
                  </p>
                )}
              </div>
              <Button icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />} onClick={() => void loadStatus()}>
                Refresh status
              </Button>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              To refresh the report itself, run <code>python scripts/backfill_bibliography.py --fresh --mailto you@example.org</code> on the server, then press Refresh status.
            </p>
          </Card>

          {result && (
            <Banner tone="success" title="Applied" actions={<Button size="sm" onClick={() => setResult(null)}>Dismiss</Button>}>
              {result.papers_updated.toLocaleString()} papers updated. Fields written: {Object.entries(result.fields_written).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(', ') || 'none'}.
              {result.stale_skipped.length > 0 && ` ${result.stale_skipped.length} papers were skipped because their fields were filled since the report was made.`}
              {result.papers_not_in_library.length > 0 && ` ${result.papers_not_in_library.length} papers are no longer in the library.`}
            </Banner>
          )}
          {applyError && <Banner tone="error">{applyError}</Banner>}

          <div>
            <div role="radiogroup" aria-label="Report band" className="flex flex-wrap gap-2">
              {BANDS.map((b) => {
                const n = counts[b.key] ?? 0;
                const active = band === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={b.hint}
                    onClick={() => chooseBand(b.key)}
                    className={`px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {b.label} <span className={active ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}>{n.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{BANDS.find((b) => b.key === band)?.hint}.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700" role="group" aria-label="Selection">
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={allPageSelected}
                disabled={pageSelectable.length === 0}
                onChange={(e) =>
                  setSelected((cur) => {
                    const n = new Set(cur);
                    pageSelectable.forEach((i) => (e.target.checked ? n.add(i.paper_id) : n.delete(i.paper_id)));
                    return n;
                  })
                }
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              Select all on this page
            </label>
            <Button size="sm" icon={<CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />} loading={selectingAll} disabled={(page?.total ?? 0) === 0} onClick={() => void selectAllInBand()}>
              Select every change in this band
            </Button>
            <Button size="sm" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <span className="text-sm text-gray-600 dark:text-gray-400 sm:ml-auto" aria-live="polite">
              {selected.size.toLocaleString()} selected
            </span>
            <Button variant="primary" disabled={selected.size === 0} onClick={() => setConfirming(true)}>
              Apply {selected.size.toLocaleString()} selected
            </Button>
          </div>

          {pageError && (
            <Banner tone="error" actions={<Button size="sm" onClick={() => void loadPage()}>Retry</Button>}>
              {pageError}
            </Banner>
          )}
          <div aria-busy={loading}>
            {loading && !page && <Spinner label="Loading items" />}
            {page && items.length === 0 && !loading && <EmptyState title="Nothing in this band" />}
            {items.length > 0 && (
              <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`} aria-label="Proposed changes">
                {items.map((item) => (
                  <ItemCard
                    key={item.paper_id}
                    item={item}
                    selected={selected.has(item.paper_id)}
                    onSelect={(checked) =>
                      setSelected((cur) => {
                        const n = new Set(cur);
                        if (checked) n.add(item.paper_id);
                        else n.delete(item.paper_id);
                        return n;
                      })
                    }
                  />
                ))}
              </ul>
            )}
            {page && <Pager offset={page.offset} limit={page.limit} total={page.total} onChange={setOffset} disabled={loading} />}
          </div>
        </>
      )}

      {confirming && (
        <ConfirmDialog title="Apply these changes?" confirmLabel={`Apply ${selected.size.toLocaleString()} papers`} busy={applying} onConfirm={() => void doApply()} onCancel={() => setConfirming(false)}>
          <p>
            Crossref metadata will be written for <strong>{selected.size.toLocaleString()}</strong> selected papers, whichever band they are in.
          </p>
          <p>Only fields that are empty right now are filled (the title only if it is a file name). Anything you or another run has filled since the report is skipped. The PDFs and the search index are not changed.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
