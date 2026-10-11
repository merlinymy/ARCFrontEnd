import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { getBibliographyLibrary } from '../services/bibliographyApi';
import type { LibraryEntry, LibraryListResponse, LibrarySortBy } from '../types/bibliography';
import { EntryDetailDialog, SearchabilityBadge } from './Bibliography/EntryDialogs';
import { Badge, Banner, Button, Pager, Spinner } from './Bibliography/ui';
import { authorsLine, doiUrl, errorMessage, focusRing } from './Bibliography/util';

const PAGE_SIZE = 25;

function ReferenceRow({ entry, onOpen }: { entry: LibraryEntry; onOpen: () => void }) {
  const meta = [authorsLine(entry.authors), entry.year, entry.journal].filter(Boolean).join(' · ');
  return (
    <li className="flex gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <BookOpen className="w-5 h-5 mt-1 shrink-0 text-gray-400" aria-hidden="true" />
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
        </div>
      </div>
      <Button size="sm" onClick={onOpen} aria-label={`Details: ${entry.title}`} className="self-start">
        Details
      </Button>
    </li>
  );
}

/**
 * The reference-only entries of the library (imported from RIS, BibTeX or
 * Zotero, or added by hand): no PDF, so no figures, no upload and no chat
 * about them, but they are part of the library and can be cited. Read from
 * `GET /bibliography/library`, which already leaves out hidden duplicates.
 *
 * They are matched on title, author, journal and DOI only: a semantic search
 * of the PDFs' text does not reach them, so while one is running they are
 * filtered by the same words.
 */
export function LibraryReferences({
  search,
  sortBy,
  sortOrder,
  onTotal,
}: {
  search: string;
  sortBy: LibrarySortBy;
  sortOrder: 'asc' | 'desc';
  onTotal: (total: number) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LibraryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const requestId = useRef(0);
  const onTotalRef = useRef(onTotal);
  useEffect(() => {
    onTotalRef.current = onTotal;
  });

  useEffect(() => {
    setOffset(0);
  }, [search, sortBy, sortOrder]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await getBibliographyLibrary({ offset, limit: PAGE_SIZE, kind: 'reference', search: search.trim() || undefined, sort_by: sortBy, sort_order: sortOrder });
      if (id !== requestId.current) return;
      setData(res);
      // Unfiltered total for the page header only when nothing narrows the list.
      onTotalRef.current(res.total);
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [offset, search, sortBy, sortOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = search.trim() !== '';

  return (
    <section aria-labelledby="library-references-heading" className="mt-8">
      <h2 id="library-references-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Reference-only entries{data ? ` (${data.total.toLocaleString()}${filtered ? ' match' : ''})` : ''}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        No PDF in ARC, so they are not searchable by content and cannot ground an answer. They can still be cited and exported
        {filtered ? '; here they are filtered by title, author, journal and DOI.' : '.'}
      </p>

      {error && (
        <Banner tone="error" title="Could not load the reference-only entries" actions={<Button size="sm" onClick={() => void load()}>Retry</Button>}>
          {error}
        </Banner>
      )}
      <div aria-busy={loading}>
        {loading && !data && <Spinner label="Loading reference-only entries" />}
        {data && (
          <>
            {data.entries.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filtered ? 'No reference-only entries match.' : 'None yet. Import a RIS or BibTeX file, sync Zotero, or add a reference in the Bibliography.'}
              </p>
            ) : (
              <ul className={`space-y-2 list-none p-0 ${loading ? 'opacity-60' : ''}`} aria-label="Reference-only entries">
                {data.entries.map((entry) => (
                  <ReferenceRow key={entry.entry_id} entry={entry} onOpen={() => setOpenId(entry.entry_id)} />
                ))}
              </ul>
            )}
            <Pager offset={data.offset} limit={data.limit} total={data.total} onChange={setOffset} disabled={loading} />
          </>
        )}
      </div>

      {openId && <EntryDetailDialog key={openId} entryId={openId} startInEdit={false} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </section>
  );
}
