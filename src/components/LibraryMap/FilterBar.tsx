import { useState, type Ref } from 'react';
import { LayoutDashboard, Map as MapIcon, Share2, Table2, Waypoints, Wrench } from 'lucide-react';
import type { PaperFlag } from '../../types';
import { FLAG_HELP, FLAG_LABEL, formatCount } from './format';
import { FLAG_ORDER, activeFilterCount, type MapFilters, type MapModel } from './mapModel';
import type { ColorBy } from './mapRenderer';
import { SearchBox } from './SearchBox';
import type { MapView, Tab } from './state';
import { SegmentedControl, ToggleButton } from './ui';

const TAB_OPTIONS = [
  { value: 'map' as const, label: 'Map', icon: Waypoints, title: 'The library as a map of what papers say' },
  { value: 'overview' as const, label: 'Overview', icon: LayoutDashboard, title: 'Distribution and topic correlation' },
  { value: 'engineering' as const, label: 'Engineering', icon: Wrench, title: 'What the pipeline produced: paper layout, section labels' },
];
const VIEW_OPTIONS = [
  { value: 'map' as const, label: 'Map', icon: MapIcon, title: 'Map view' },
  { value: 'table' as const, label: 'Table', icon: Table2, title: 'Table view (every value, sortable)' },
];

function YearInput({
  name,
  value,
  placeholder,
  label,
  min,
  max,
  onCommit,
}: {
  name: string;
  value: number | null;
  placeholder: number;
  label: string;
  min: number;
  max: number;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const commit = () => {
    const t = draft.trim();
    if (!t) return onCommit(null);
    const n = Math.round(Number(t));
    if (!Number.isFinite(n)) {
      setDraft(value == null ? '' : String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    setDraft(String(clamped));
    onCommit(clamped);
  };
  return (
    <input
      type="number"
      name={name}
      inputMode="numeric"
      aria-label={label}
      placeholder={String(placeholder)}
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className="w-[4.5rem] rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
    />
  );
}

interface FilterBarProps {
  model: MapModel;
  tab: Tab;
  onTab: (tab: Tab) => void;
  view: MapView;
  onView: (v: MapView) => void;
  colorBy: ColorBy;
  onColorBy: (c: ColorBy) => void;
  /** the footprint loaded (401/errors hide the Cited mode) */
  citedAvailable: boolean;
  showLinks: boolean;
  onLinks: (on: boolean) => void;
  filters: MapFilters;
  onFilters: (patch: Partial<MapFilters>) => void;
  onResetFilters: () => void;
  attentionFlags: readonly PaperFlag[];
  onAttentionFlags: (flags: PaperFlag[]) => void;
  tableFlaggedOnly: boolean;
  onTableFlaggedOnly: (on: boolean) => void;
  search: string;
  onSearch: (v: string) => void;
  onPick: (index: number) => void;
  onPreview: (index: number | null) => void;
  searchRef: Ref<HTMLInputElement>;
}

/** One row of controls above the content; it wraps on narrow screens. Filters scope Map and Overview. */
export function FilterBar(props: FilterBarProps) {
  const { model, tab, view, colorBy } = props;
  const colorOptions = [
    { value: 'topic' as const, label: 'Topic', title: 'Neutral points; topics are named by labels' },
    { value: 'year' as const, label: 'Year', title: 'Color by publication year' },
    ...(props.citedAvailable ? [{ value: 'cited' as const, label: 'Cited', title: 'How often ARC answers cited the paper' }] : []),
    { value: 'attention' as const, label: 'Attention', title: 'Papers that need attention (copies, captions only, file-name titles, suspicious years)' },
  ];
  const onMap = tab === 'map';
  const showChips = onMap && (view === 'table' || colorBy === 'attention') && model.flaggedCount > 0;
  const filterCount = activeFilterCount(model, props.filters);
  const toggleFlag = (f: PaperFlag) => {
    const on = props.attentionFlags.includes(f);
    props.onAttentionFlags(on ? props.attentionFlags.filter((x) => x !== f) : [...props.attentionFlags, f]);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={props.onTab} label="Page" compactLabels />
        {onMap && view === 'map' && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">Color</span>
              <SegmentedControl options={colorOptions} value={colorBy} onChange={props.onColorBy} label="Color by" />
            </div>
            <ToggleButton pressed={props.showLinks} onChange={props.onLinks} icon={Share2} title="Draw content-similarity links between papers">
              Links
            </ToggleButton>
          </>
        )}
        {onMap && (
          <SearchBox
            model={model}
            value={props.search}
            onChange={props.onSearch}
            onPick={props.onPick}
            onPreview={props.onPreview}
            mode={view}
            inputRef={props.searchRef}
          />
        )}
        {onMap && (
          <div className="ml-auto">
            <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={props.onView} label="View" compactLabels />
          </div>
        )}
      </div>
      {tab !== 'engineering' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400" role="group" aria-label="Year range">
            <span>Years</span>
            <YearInput
              key={`lo-${props.filters.yearMin}`}
              name="year-from"
              value={props.filters.yearMin}
              placeholder={model.yearMin}
              label="From year"
              min={model.yearMin}
              max={model.yearMax}
              onCommit={(v) => props.onFilters({ yearMin: v })}
            />
            <span aria-hidden>–</span>
            <YearInput
              key={`hi-${props.filters.yearMax}`}
              name="year-to"
              value={props.filters.yearMax}
              placeholder={model.yearMax}
              label="To year"
              min={model.yearMin}
              max={model.yearMax}
              onCommit={(v) => props.onFilters({ yearMax: v })}
            />
            {model.noYearCount > 0 && (
              <label className="ml-1 inline-flex items-center gap-1.5 whitespace-nowrap">
                <input
                  type="checkbox"
                  name="include-no-year"
                  checked={props.filters.includeNoYear}
                  onChange={(e) => props.onFilters({ includeNoYear: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                />
                No year ({formatCount(model.noYearCount)})
              </label>
            )}
            {filterCount > 0 && (
              <button
                type="button"
                onClick={props.onResetFilters}
                className="ml-1 rounded text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
              >
                Reset
              </button>
            )}
          </div>
          {showChips && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Needs attention: flags">
              <span className="mr-0.5 text-xs text-gray-500 dark:text-gray-400">Needs attention</span>
              {FLAG_ORDER.map((f, k) => {
                const on = props.attentionFlags.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFlag(f)}
                    title={FLAG_HELP[f]}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      on
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    {FLAG_LABEL[f]}
                    <span className="tabular-nums opacity-80">{formatCount(model.flagCounts[k])}</span>
                  </button>
                );
              })}
              {view === 'table' && (
                <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    name="flagged-only"
                    checked={props.tableFlaggedOnly}
                    onChange={(e) => props.onTableFlaggedOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                  />
                  Only these
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
