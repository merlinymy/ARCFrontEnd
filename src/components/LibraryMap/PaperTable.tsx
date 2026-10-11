import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { PaperFlag } from '../../types';
import { FLAG_HELP, FLAG_LABEL, firstAuthor, formatCount, formatMaybeCount, formatYear } from './format';
import { useElementSize } from './hooks';
import { FLAG_ORDER, hasFlag, type CitedInfo, type MapModel } from './mapModel';

type SortKey = 'title' | 'year' | 'topic' | 'flags' | 'cited' | 'captions' | 'pages' | 'copies';

// Columns appear by the table's own width (container queries), not the viewport's,
// so an open side panel never squeezes the titles.
const MID = 'hidden @2xl:block';
const WIDE = 'hidden @4xl:block';
const GRID_BASE = 'grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_3.5rem] @2xl:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,11rem)_minmax(0,9rem)]';
const GRID = `${GRID_BASE} @4xl:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,12rem)_minmax(0,10rem)_4.5rem_3.5rem_3.5rem]`;
const GRID_CITED = `${GRID_BASE} @4xl:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,12rem)_minmax(0,10rem)_3.5rem_4.5rem_3.5rem_3.5rem]`;
const ROW_H = 52;
const OVERSCAN = 8;
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const copiesOf = (model: MapModel, i: number) => model.papers[i].duplicates?.length ?? 0;
const flagCount = (model: MapModel, i: number) => {
  let c = 0;
  for (let b = model.flagBits[i]; b; b &= b - 1) c++;
  return c;
};

interface PaperTableProps {
  model: MapModel;
  mask: Uint8Array | null;
  search: string;
  selected: number | null;
  cited: CitedInfo | null;
  /** when set, only rows with one of these flags */
  onlyFlags: readonly PaperFlag[] | null;
  onSelect: (index: number) => void;
}

export function PaperTable({ model, mask, search, selected, cited, onlyFlags, onSelect }: PaperTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'title', dir: 1 });
  const [scrollTop, setScrollTop] = useState(0);
  const [sizeRef, { height }] = useElementSize<HTMLDivElement>();
  const columns: Array<{ key: SortKey; label: string; numeric?: boolean; show?: string }> = [
    { key: 'title', label: 'Title' },
    { key: 'year', label: 'Year', numeric: true },
    { key: 'topic', label: 'Topic', show: MID },
    { key: 'flags', label: 'Needs attention', show: MID },
    ...(cited ? [{ key: 'cited' as const, label: 'Cited', numeric: true, show: WIDE }] : []),
    { key: 'captions', label: 'Captions', numeric: true, show: WIDE },
    { key: 'pages', label: 'Pages', numeric: true, show: WIDE },
    { key: 'copies', label: 'Copies', numeric: true, show: WIDE },
  ];
  const grid = cited ? GRID_CITED : GRID;

  const topicOf = (i: number) => {
    const c = model.coarseOf[i];
    return c >= 0 ? model.coarse[c].label : '';
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let bits = 0;
    if (onlyFlags) for (const f of onlyFlags) bits |= 1 << FLAG_ORDER.indexOf(f);
    const list: number[] = [];
    for (let i = 0; i < model.n; i++) {
      if (mask && !mask[i]) continue;
      if (onlyFlags && !(model.flagBits[i] & bits)) continue;
      if (q && !model.titleLower[i].includes(q) && !model.authorsLower[i].includes(q)) continue;
      list.push(i);
    }
    const { key, dir } = sort;
    const title = (a: number, b: number) => collator.compare(model.papers[a].title || '', model.papers[b].title || '');
    const num = (va: number, vb: number) => (va - vb) * dir;
    const topic = (i: number) => {
      const c = model.coarseOf[i];
      return c >= 0 ? model.coarse[c].label : '￿';
    };
    list.sort((a, b) => {
      let r = 0;
      if (key === 'title') r = title(a, b) * dir;
      else if (key === 'year') {
        const ya = model.year[a];
        const yb = model.year[b];
        if (!ya || !yb) r = ya === yb ? 0 : ya ? -1 : 1; // no-year rows always last
        else r = num(ya, yb);
      } else if (key === 'topic') r = collator.compare(topic(a), topic(b)) * dir;
      else if (key === 'flags') r = num(flagCount(model, a), flagCount(model, b));
      else if (key === 'cited') r = num(cited?.answers[a] ?? 0, cited?.answers[b] ?? 0);
      else if (key === 'captions') r = num(model.papers[a].counts?.captions ?? 0, model.papers[b].counts?.captions ?? 0);
      else if (key === 'copies') r = num(copiesOf(model, a), copiesOf(model, b));
      else r = num(model.papers[a].counts?.pages ?? -1, model.papers[b].counts?.pages ?? -1);
      return r || title(a, b);
    });
    return list;
  }, [model, mask, search, sort, onlyFlags, cited]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + (height || 600)) / ROW_H) + OVERSCAN);
  const visible = rows.slice(start, end);

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-white dark:bg-gray-900">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
        <span>
          Showing {formatCount(rows.length)} of {formatCount(model.n)} papers{mask || onlyFlags ? ' (filters applied)' : ''}
          {search.trim() ? ` matching “${search.trim()}”` : ''}
        </span>
        <span>Select a row to show the paper on the map</span>
      </div>
      <div role="table" aria-label="Papers in the library map" aria-rowcount={rows.length + 1} className="flex min-h-0 flex-1 flex-col">
        <div role="rowgroup" className="shrink-0 border-y border-gray-200 bg-gray-50 px-4 dark:border-gray-700 dark:bg-gray-800/60">
          <div role="row" className={`${grid} h-9`}>
            {columns.map((c) => {
              const active = sort.key === c.key;
              return (
                <div
                  key={c.key}
                  role="columnheader"
                  aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  className={`${c.show ?? ''} ${c.numeric ? 'text-right' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.numeric || c.key === 'flags' ? -1 : 1 }))}
                    className={`inline-flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {c.label}
                    {active && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div ref={sizeRef} role="rowgroup" className="relative min-h-0 flex-1 overflow-y-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            {visible.map((i, k) => {
              const p = model.papers[i];
              const isSel = i === selected;
              const flags = FLAG_ORDER.filter((f) => hasFlag(model, i, f));
              return (
                <div
                  key={p.id}
                  role="row"
                  aria-rowindex={start + k + 2}
                  aria-selected={isSel}
                  tabIndex={0}
                  onClick={() => onSelect(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(i);
                    }
                  }}
                  className={`${grid} absolute left-0 right-0 cursor-pointer border-b border-gray-100 px-4 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-gray-800 dark:hover:bg-gray-800/60 ${
                    isSel ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  style={{ top: (start + k) * ROW_H, height: ROW_H }}
                >
                  <div role="cell" className="min-w-0">
                    <div className="truncate text-gray-900 dark:text-gray-100">{p.title || p.id}</div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">{firstAuthor(p.authors ?? [], p.n_authors ?? 0)}</div>
                  </div>
                  <div role="cell" className="text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {model.year[i] ? model.year[i] : <span className="text-gray-400 dark:text-gray-500">{formatYear(null)}</span>}
                  </div>
                  <div role="cell" className={`${MID} min-w-0 truncate text-gray-700 dark:text-gray-300`} title={topicOf(i)}>
                    {topicOf(i) || '—'}
                  </div>
                  <div role="cell" className={`${MID} min-w-0 truncate text-xs text-gray-700 dark:text-gray-300`} title={flags.map((f) => FLAG_HELP[f]).join(' ')}>
                    {flags.length ? flags.map((f) => FLAG_LABEL[f]).join(' · ') : <span className="text-gray-400 dark:text-gray-500">—</span>}
                  </div>
                  {cited && (
                    <div role="cell" className={`${WIDE} text-right tabular-nums text-gray-700 dark:text-gray-300`}>
                      {cited.answers[i] ? formatCount(cited.answers[i]) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </div>
                  )}
                  <div role="cell" className={`${WIDE} text-right tabular-nums text-gray-700 dark:text-gray-300`}>
                    {formatCount(p.counts?.captions ?? 0)}
                  </div>
                  <div role="cell" className={`${WIDE} text-right tabular-nums text-gray-700 dark:text-gray-300`}>
                    {formatMaybeCount(p.counts?.pages)}
                  </div>
                  <div
                    role="cell"
                    className={`${WIDE} text-right tabular-nums text-gray-700 dark:text-gray-300`}
                    title={copiesOf(model, i) ? 'Near-identical copies of this paper in the library' : undefined}
                  >
                    {copiesOf(model, i) ? formatCount(copiesOf(model, i)) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {rows.length === 0 && <p className="px-4 py-6 text-sm text-gray-600 dark:text-gray-400">No papers match.</p>}
        </div>
      </div>
    </div>
  );
}
