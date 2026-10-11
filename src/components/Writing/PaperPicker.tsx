import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { getBibliographyLibrary } from '../../services/bibliographyApi';
import type { LibraryEntry } from '../../types/bibliography';
import { Badge, Spinner } from '../Bibliography/ui';
import { authorsLine, errorMessage, focusRing, inputClass, labelClass } from '../Bibliography/util';
import { useDebounced } from '../Bibliography/hooks';
import type { PickedPaper } from './form';

const LIMIT = 15;

/**
 * Optional: limit the run to chosen library entries. Searches the unified
 * library (duplicates already hidden). The model tasks take PDF papers only, so
 * they list those; the two retrieval tasks also take reference-only entries.
 */
export function PaperPicker({
  picked,
  onChange,
  papersOnly,
}: {
  picked: PickedPaper[];
  onChange: (next: PickedPaper[]) => void;
  papersOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText, 300);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const searchId = useId();

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getBibliographyLibrary({ limit: LIMIT, search: search.trim() || undefined, kind: papersOnly ? 'paper' : 'all', sort_by: 'title', sort_order: 'asc' })
      .then((res) => {
        if (id !== requestId.current) return;
        setEntries(res.entries);
        setTotal(res.total);
      })
      .catch((e) => {
        if (id === requestId.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [open, search, papersOnly]);

  const isPicked = (id: string) => picked.some((p) => p.id === id);
  const toggle = (e: LibraryEntry) =>
    onChange(isPicked(e.entry_id) ? picked.filter((p) => p.id !== e.entry_id) : [...picked, { id: e.entry_id, title: e.title || '(untitled)', kind: e.kind }]);

  const dropped = papersOnly ? picked.filter((p) => p.kind === 'reference').length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Limit to chosen papers <span className="font-normal text-gray-500 dark:text-gray-400">(optional; none chosen means the whole library)</span>
        </p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 ${focusRing}`}
        >
          {open ? 'Hide the list' : 'Choose papers'}
        </button>
      </div>

      {picked.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5 list-none p-0" aria-label="Chosen papers">
          {picked.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onChange(picked.filter((x) => x.id !== p.id))}
                aria-label={`Remove ${p.title}`}
                className={`inline-flex items-center gap-1 max-w-[18rem] pl-2.5 pr-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-900/60 ${focusRing}`}
              >
                <span className="truncate">{p.title}</span>
                <X className="w-3 h-3 shrink-0" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {dropped > 0 && (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200" role="note">
          {dropped} reference-only {dropped === 1 ? 'entry is' : 'entries are'} left out of this task: it works from PDF papers only.
        </p>
      )}

      {open && (
        <div className="mt-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <label htmlFor={searchId} className={labelClass}>
            Search title, author, journal or DOI
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input id={searchId} type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} className={`${inputClass} pl-9`} />
          </div>
          <div className="mt-2" aria-busy={loading} aria-live="polite">
            {loading && <Spinner label="Searching the library" />}
            {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
            {!loading && !error && entries.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Nothing matches.</p>}
          </div>
          {entries.length > 0 && (
            <ul className="mt-1 max-h-64 overflow-y-auto list-none p-0 space-y-1" aria-label="Library entries">
              {entries.map((e) => {
                const meta = [authorsLine(e.authors, 2), e.year, e.journal].filter(Boolean).join(' · ');
                return (
                  <li key={e.entry_id}>
                    <label className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-800 cursor-pointer text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500">
                      <input type="checkbox" checked={isPicked(e.entry_id)} onChange={() => toggle(e)} className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-gray-900 dark:text-gray-100 break-words">{e.title || '(untitled)'}</span>
                        {meta && <span className="block text-xs text-gray-500 dark:text-gray-400 break-words">{meta}</span>}
                      </span>
                      {e.kind === 'reference' && <Badge tone="amber">reference only</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {total > entries.length && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Showing {entries.length} of {total.toLocaleString()}. Search to narrow the list.</p>}
        </div>
      )}
    </div>
  );
}
