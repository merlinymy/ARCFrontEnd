import { useId, useMemo, useState, type ReactNode, type Ref } from 'react';
import { Search, X } from 'lucide-react';
import { copiesLabel, firstAuthor, formatYear } from './format';
import { searchPapers, type MapModel } from './mapModel';

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-yellow-100 text-inherit dark:bg-yellow-500/30">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

interface SearchBoxProps {
  model: MapModel;
  value: string;
  onChange: (value: string) => void;
  /** map mode: Enter or a click picks a paper (fly to + select) */
  onPick: (index: number) => void;
  /** map mode: preview a result on the map while it is highlighted */
  onPreview: (index: number | null) => void;
  /** table mode filters rows instead of offering results */
  mode: 'map' | 'table';
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchBox({ model, value, onChange, onPick, onPreview, mode, inputRef }: SearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => (mode === 'map' ? searchPapers(model, value, 8) : []), [model, value, mode]);
  const showList = open && mode === 'map' && value.trim().length > 0;
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  const pick = (i: number) => {
    onPick(i);
    onPreview(null);
    setOpen(false);
  };

  return (
    <div className="relative min-w-[11rem] flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        name="library-map-search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? `${listId}-${activeIndex}` : undefined}
        aria-label={mode === 'map' ? 'Find a paper by title or author' : 'Filter the table by title or author'}
        aria-keyshortcuts="/"
        placeholder={mode === 'map' ? 'Find a paper…' : 'Filter by title or author…'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onPreview(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (showList) setOpen(false);
            else if (value) onChange('');
            else e.currentTarget.blur();
            onPreview(null);
            return;
          }
          if (!showList || !results.length) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
            setActive(next);
            onPreview(results[next]);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(results[activeIndex]);
          }
        }}
        className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-8 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 [&::-webkit-search-cancel-button]:hidden"
      />
      {!value && (
        <kbd
          aria-hidden
          title="Press / to search"
          className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-gray-300 px-1.5 font-sans text-[11px] leading-4 text-gray-500 dark:border-gray-600 dark:text-gray-400 sm:block"
        >
          /
        </kbd>
      )}
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            onPreview(null);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching papers"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 sm:right-auto sm:w-[28rem]"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No titles or authors match.</li>
          ) : (
            results.map((i, k) => {
              const p = model.papers[i];
              return (
                <li
                  key={p.id}
                  id={`${listId}-${k}`}
                  role="option"
                  aria-selected={k === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    setActive(k);
                    onPreview(i);
                  }}
                  onClick={() => pick(i)}
                  className={`cursor-pointer px-3 py-1.5 ${k === activeIndex ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                >
                  <div className="text-sm text-gray-900 line-clamp-1 dark:text-gray-100">{highlightMatch(p.title || p.id, value)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatYear(p.year)} · {firstAuthor(p.authors ?? [], p.n_authors ?? 0)}
                    {p.duplicates?.length ? ` · +${copiesLabel(p.duplicates.length)}` : ''}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
