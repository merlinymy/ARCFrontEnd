import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, FileText, Pencil, Plus, Search, SortAsc, SortDesc } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getBibliographyLibrary, getBibliographyStats } from '../../services/bibliographyApi';
import type { LibraryEntry, LibraryListResponse, LibraryQuery, LibraryStats, LibrarySortBy, MissingField } from '../../types/bibliography';
import { EntryDetailDialog, ReferenceFormDialog, SearchabilityBadge } from './EntryDialogs';
import { Badge, Banner, Button, Card, EmptyState, Pager, Spinner, Stat } from './ui';
import { MISSING_FIELDS, MISSING_LABEL, authorsLine, doiUrl, errorMessage, focusRing, inputClass, labelClass } from './util';
import { useDebounced } from './hooks';
import type { BibliographyTabId } from './tabs';

const PAGE_SIZE = 50;

const SORT_OPTIONS: Array<{ value: LibrarySortBy; label: string }> = [
  { value: 'indexed_at', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'first_author', label: 'First author' },
  { value: 'year', label: 'Year' },
  { value: 'chunk_count', label: 'Indexed chunks' },
];

function EntryRow({ entry, onOpen, onEdit }: { entry: LibraryEntry; onOpen: () => void; onEdit: () => void }) {
  const { setViewingPdf } = useApp();
  const meta = [authorsLine(entry.authors), entry.year, entry.journal].filter(Boolean).join(' · ');
  return (
    <li className="flex gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="mt-1 shrink-0 text-gray-400" aria-hidden="true">
        {entry.kind === 'paper' ? <FileText className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className={`text-left font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 break-words rounded ${focusRing}`}
        >
          {entry.title || '(untitled)'}
        </button>
        {meta && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 break-words">{meta}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <SearchabilityBadge searchable={entry.full_text_searchable} />
          {entry.doi && (
            <a href={doiUrl(entry.doi)} target="_blank" rel="noreferrer" className={`text-xs text-blue-600 dark:text-blue-400 hover:underline rounded ${focusRing}`}>
              {entry.doi}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          {entry.source !== 'pdf' && <Badge>from {entry.source}</Badge>}
          {entry.zotero_key && <Badge tone="purple">Zotero</Badge>}
          {entry.hidden && <Badge tone="red">hidden</Badge>}
          {entry.missing.length > 0 && (
            <Badge tone="amber" title="Metadata quality: these fields are empty">
              Missing {entry.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}
            </Badge>
          )}
          {entry.missing.length === 0 && <Badge tone="green">metadata complete</Badge>}
          {Object.keys(entry.metadata_sources ?? {}).length > 0 && (
            <Badge tone="blue" title={Object.entries(entry.metadata_sources).map(([k, v]) => `${k}: ${v}`).join(', ')}>
              filled from {Array.from(new Set(Object.values(entry.metadata_sources).map((v) => v.split(':')[0]))).join(', ')}
            </Badge>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col sm:flex-row gap-1.5 items-end sm:items-start">
        {entry.paper && (
          <Button size="sm" onClick={() => setViewingPdf(entry.entry_id)} aria-label={`Open PDF: ${entry.title}`}>
            PDF
          </Button>
        )}
        <Button size="sm" icon={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />} onClick={onEdit} aria-label={`Edit metadata: ${entry.title}`}>
          Edit
        </Button>
      </div>
    </li>
  );
}

export function LibraryTab({ version, onNavigate, onChanged }: { version: number; onNavigate: (tab: BibliographyTabId) => void; onChanged: () => void }) {
  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText, 300);
  const [kind, setKind] = useState<'all' | 'paper' | 'reference'>('all');
  const [missing, setMissing] = useState<MissingField[]>([]);
  const [sortBy, setSortBy] = useState<LibrarySortBy>('indexed_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState<LibraryListResponse | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<{ id: string; edit: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const requestId = useRef(0);

  // Back to the first page whenever a filter changes.
  useEffect(() => {
    setOffset(0);
  }, [search, kind, missing, sortBy, sortOrder, includeHidden]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const query: LibraryQuery = {
      offset,
      limit: PAGE_SIZE,
      search: search.trim() || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
      kind,
      missing,
      include_hidden: includeHidden,
    };
    try {
      const res = await getBibliographyLibrary(query);
      if (id === requestId.current) setData(res);
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [offset, search, sortBy, sortOrder, kind, missing, includeHidden]);

  // `version` changes when another tab changed the library (import committed,
  // backfill applied, duplicates accepted, Zotero synced).
  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    let alive = true;
    getBibliographyStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {
        if (alive) setStats(null);
      });
    return () => {
      alive = false;
    };
  }, [version]);

  const toggleMissing = (field: MissingField) => setMissing((cur) => (cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field]));
  const filtered = search.trim() !== '' || kind !== 'all' || missing.length > 0;
  const lowDoi = stats && stats.papers.total > 0 && stats.papers.pct_doi < 50;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Library totals">
          <Stat label="PDF papers (searchable)" value={data?.counts.paper ?? stats?.papers.total ?? '-'} />
          <Stat label="Reference-only entries" value={data?.counts.reference ?? stats?.references.total ?? '-'} />
          {stats && <Stat label="Papers with a DOI" value={`${stats.papers.pct_doi}%`} tone={lowDoi ? 'warn' : undefined} />}
          {stats && stats.hidden > 0 && <Stat label="Hidden (duplicates, removed)" value={stats.hidden} />}
        </div>
        <Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={() => setAdding(true)}>
          Add reference
        </Button>
      </div>

      {lowDoi && (
        <Banner
          tone="warning"
          title="Most PDF papers have no DOI"
          actions={
            <Button size="sm" onClick={() => onNavigate('backfill')} icon={<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}>
              Metadata backfill
            </Button>
          }
        >
          Only {stats?.papers.with_doi.toLocaleString()} of {stats?.papers.total.toLocaleString()} papers have a DOI, which limits deduplication, Zotero matching and exports.
        </Banner>
      )}

      <Card className="p-4">
        <form role="search" aria-label="Filter the library" onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="lib-search" className={labelClass}>
                Search title, author, journal, DOI or file name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                <input id="lib-search" type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} className={`${inputClass} pl-9`} />
              </div>
            </div>
            <div>
              <label htmlFor="lib-kind" className={labelClass}>
                Show
              </label>
              <select id="lib-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputClass}>
                <option value="all">PDF papers and references</option>
                <option value="paper">PDF papers only</option>
                <option value="reference">Reference-only entries only</option>
              </select>
            </div>
            <div>
              <label htmlFor="lib-sort" className={labelClass}>
                Sort by
              </label>
              <div className="flex gap-2">
                <select id="lib-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as LibrarySortBy)} className={inputClass}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                  aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}. Activate to reverse.`}
                  className={`px-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 ${focusRing}`}
                >
                  {sortOrder === 'asc' ? <SortAsc className="w-5 h-5" aria-hidden="true" /> : <SortDesc className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Metadata quality: only entries missing any of</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {MISSING_FIELDS.map((f) => (
                <label key={f} className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={missing.includes(f)}
                    onChange={() => toggleMissing(f)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  {MISSING_LABEL[f]}
                </label>
              ))}
              <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 sm:ml-auto">
                <input
                  type="checkbox"
                  checked={includeHidden}
                  onChange={(e) => setIncludeHidden(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                Include hidden entries
              </label>
            </div>
          </fieldset>
        </form>
      </Card>

      {error && (
        <Banner tone="error" title="Could not load the library" actions={<Button size="sm" onClick={() => void load()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      <div aria-busy={loading}>
        {loading && !data && <Spinner label="Loading library" />}
        {data && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2" aria-live="polite">
              {loading ? 'Updating...' : `${data.total.toLocaleString()} ${data.total === 1 ? 'entry' : 'entries'}${filtered ? ' match these filters' : ''}`}
            </p>
            {data.entries.length === 0 ? (
              <EmptyState icon={<BookOpen className="w-12 h-12" />} title={filtered ? 'No entries match' : 'The library is empty'}>
                {filtered ? 'Try clearing a filter.' : 'Upload PDFs, import a RIS or BibTeX file, or add a reference by hand.'}
              </EmptyState>
            ) : (
              <ul className={`space-y-2 ${loading ? 'opacity-60' : ''}`} aria-label="Library entries">
                {data.entries.map((entry) => (
                  <EntryRow key={entry.entry_id} entry={entry} onOpen={() => setOpenId({ id: entry.entry_id, edit: false })} onEdit={() => setOpenId({ id: entry.entry_id, edit: true })} />
                ))}
              </ul>
            )}
            <Pager offset={data.offset} limit={data.limit} total={data.total} onChange={setOffset} disabled={loading} />
          </>
        )}
      </div>

      {openId && <EntryDetailDialog key={`${openId.id}-${openId.edit}`} entryId={openId.id} startInEdit={openId.edit} onClose={() => setOpenId(null)} onChanged={() => { onChanged(); }} />}
      {adding && <ReferenceFormDialog onClose={() => setAdding(false)} onCreated={() => onChanged()} />}
    </div>
  );
}
