import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitCompareArrows, Map as MapIcon, ScatterChart } from 'lucide-react';
import { YearDistribution, YearSparkline } from './charts';
import { FLAG_HELP, FLAG_LABEL, formatCount, formatPercent, formatScore, formatYear, truncate } from './format';
import { MatrixHeatmap } from './MatrixHeatmap';
import { ASK_CAP, FLAG_ORDER, askPaperIds, membersByCentroid, type CitedInfo, type GroupRef, type MapModel } from './mapModel';
import {
  correlationView,
  scopeStats,
  sortTopics,
  topicPairs,
  topicStats,
  yearAxis,
  type TopicSortKey,
  type TopicStat,
  type YearAxis,
} from './overviewModel';
import { useTip } from './tip';
import type { MapTokens } from './tokens';
import { AskArcButton, FloatingTip, IconButton, SectionHeading, SegmentedControl, Spinner, StatTile, Swatch } from './ui';

interface OverviewTabProps {
  model: MapModel;
  /** the year filter (null = everything) */
  mask: Uint8Array | null;
  tokens: MapTokens;
  cited: CitedInfo | null;
  footprintLoading: boolean;
  onShowTopic: (group: GroupRef) => void;
  onShowAttention: () => void;
  onSelectPaper: (index: number) => void;
  onCompare: (a: number, b: number) => void;
  onOpenPassages: (ids: string[], title: string, subtitle: string) => void;
  onAsk: (paperIds: string[]) => void;
}

/** The library's distribution and topic correlation (v2.0). The year filter scopes every number except the correlation matrix. */
export function OverviewTab(props: OverviewTabProps) {
  const { model, mask, tokens, cited } = props;
  const stats = useMemo(() => scopeStats(model, mask, cited), [model, mask, cited]);
  const axis = useMemo(() => yearAxis(model), [model]);
  const topics = useMemo(() => topicStats(model, mask, cited, axis), [model, mask, cited, axis]);
  const filtered = mask != null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-4">
        {filtered && (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Year filter applied: {formatCount(stats.papers)} of {formatCount(model.n)} papers in scope.
          </p>
        )}
        <StatTiles model={model} stats={stats} cited={cited} footprintLoading={props.footprintLoading} onShowAttention={props.onShowAttention} />
        <TopicTable
          model={model}
          rows={topics}
          axis={axis}
          tokens={tokens}
          citedAvailable={cited != null}
          mask={mask}
          onShowTopic={props.onShowTopic}
          onOpenPassages={props.onOpenPassages}
          onAsk={props.onAsk}
        />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <TopicCorrelation
            model={model}
            mask={mask}
            tokens={tokens}
            onSelectPaper={props.onSelectPaper}
            onCompare={props.onCompare}
            onAsk={props.onAsk}
          />
          <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900" aria-label="Papers per year">
            <SectionHeading>Papers per year</SectionHeading>
            <YearDistribution years={stats.years} citedYears={stats.citedYears} tokens={tokens} />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <Swatch color={tokens.neutral} /> All papers
              </span>
              {stats.citedYears && (
                <span className="inline-flex items-center gap-1.5">
                  <Swatch color={tokens.series[0]} /> Cited by ARC
                </span>
              )}
              <span>Copies counted once</span>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
              {stats.noYear > 0 && <li>{formatCount(stats.noYear)} papers have no year and are not shown.</li>}
              {stats.suspicious > 0 && (
                <li>
                  {formatCount(stats.suspicious)} papers have a year that may be wrong: it matches digits of a publisher id in the file name, so some bars
                  are inflated.
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stat tiles

function StatTiles({
  model,
  stats,
  cited,
  footprintLoading,
  onShowAttention,
}: {
  model: MapModel;
  stats: ReturnType<typeof scopeStats>;
  cited: CitedInfo | null;
  footprintLoading: boolean;
  onShowAttention: () => void;
}) {
  const dup = model.data.header?.duplicates;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile
        label="Papers"
        value={formatCount(stats.papers)}
        sub={`${formatCount(stats.distinct)} distinct after merging copies`}
        help="Every indexed paper on the map. Near-identical copies (the same paper under different file names) are counted once in the distinct figure."
      />
      <StatTile
        label="Topics"
        value={formatCount(stats.coarseTopics)}
        sub={`${formatCount(stats.fineTopics)} subtopics`}
        help="Content clusters found by the map build; each topic splits into subtopics. Labels are the clusters' most distinctive terms."
      />
      {cited ? (
        <StatTile
          label="Cited by ARC"
          value={formatCount(stats.cited ?? 0)}
          sub={`${formatPercent(stats.distinct ? (stats.cited ?? 0) / stats.distinct : 0)} of distinct papers · ${formatCount(cited.nAnswers)} answers in ${formatCount(cited.nConversations)} conversations`}
          help="Papers that at least one of your ARC answers used as a source. Copies of a paper count once."
        />
      ) : footprintLoading ? (
        <StatTile label="Cited by ARC" value={<Spinner />} />
      ) : null}
      <StatTile
        label="Redundant copies"
        value={formatCount(stats.redundant)}
        sub={dup ? `${formatCount(dup.groups)} groups of near-identical files` : undefined}
        help="Extra files of a paper that is already in the library (content cosine ≥ 0.999). One copy per group is kept as its representative. Nothing is ever deleted."
      />
      <StatTile
        label="Needs attention"
        value={formatCount(stats.flagged)}
        sub={FLAG_ORDER.map((f, k) => (stats.flagCounts[k] ? `${FLAG_LABEL[f]} ${formatCount(stats.flagCounts[k])}` : null))
          .filter(Boolean)
          .join(' · ')}
        help={FLAG_ORDER.map((f) => `${FLAG_LABEL[f]}: ${FLAG_HELP[f]}`).join(' ')}
        action={
          stats.flagged > 0 ? (
            <button
              type="button"
              onClick={onShowAttention}
              className="inline-flex items-center gap-1 rounded text-xs text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
            >
              <MapIcon className="h-3.5 w-3.5" aria-hidden /> Show on the map
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- topic table

const GRID_CITED = 'grid-cols-[minmax(13rem,1fr)_8rem_7rem_9.5rem_4rem_5.5rem_9.5rem]';
const GRID_PLAIN = 'grid-cols-[minmax(13rem,1fr)_8rem_9.5rem_4rem_5.5rem_9.5rem]';

function TopicTable({
  model,
  rows,
  axis,
  tokens,
  citedAvailable,
  mask,
  onShowTopic,
  onOpenPassages,
  onAsk,
}: {
  model: MapModel;
  rows: { coarse: TopicStat[]; fine: TopicStat[] };
  axis: YearAxis;
  tokens: MapTokens;
  citedAvailable: boolean;
  mask: Uint8Array | null;
  onShowTopic: (group: GroupRef) => void;
  onOpenPassages: (ids: string[], title: string, subtitle: string) => void;
  onAsk: (paperIds: string[]) => void;
}) {
  const [sort, setSort] = useState<{ key: TopicSortKey; dir: 1 | -1 }>({ key: 'papers', dir: -1 });
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const { tip, bind } = useTip();
  const grid = citedAvailable ? GRID_CITED : GRID_PLAIN;
  const maxPapers = Math.max(1, ...rows.coarse.map((r) => r.papers));
  const coarse = useMemo(() => sortTopics(rows.coarse.filter((r) => r.papers > 0), sort.key, sort.dir), [rows, sort]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, TopicStat[]>();
    for (const f of rows.fine) {
      if (!f.parent || f.papers === 0) continue;
      const list = m.get(f.parent) ?? [];
      list.push(f);
      m.set(f.parent, list);
    }
    for (const [k, list] of m) m.set(k, sortTopics(list, sort.key, sort.dir));
    return m;
  }, [rows, sort]);

  const columns: Array<{ key: TopicSortKey; label: string; help: string; right?: boolean }> = [
    { key: 'label', label: 'Topic', help: 'Sort by name' },
    { key: 'papers', label: 'Papers', help: 'Papers in the topic (in scope)' },
    ...(citedAvailable ? [{ key: 'cited' as const, label: 'Cited', help: 'Share of the topic’s distinct papers that ARC answers have cited (copies count once)' }] : []),
    {
      key: 'years',
      label: 'Years',
      help: `Papers per year on one shared axis (${axis.start}–${axis.start + axis.nBins * axis.binSize - 1}); +N = no year. Sorts by the share published from ${axis.recentFrom} on.`,
    },
    { key: 'median', label: 'Median', help: 'Median publication year', right: true },
    { key: 'flagged', label: 'Attention', help: 'Papers with any needs-attention flag', right: true },
  ];

  const scoped = (g: GroupRef) => membersByCentroid(model, g).filter((i) => !mask || mask[i] === 1);
  const renderRow = (r: TopicStat, depth: 0 | 1) => {
    const g: GroupRef = { kind: 'cluster', id: r.id };
    const kids = depth === 0 ? (childrenOf.get(r.id) ?? []) : [];
    const expanded = open.has(r.id);
    const sorted = scoped(g);
    const askIds = askPaperIds(model, sorted, ASK_CAP);
    const nearest = sorted.slice(0, 12).map((i) => model.papers[i].id);
    return (
      <div key={r.id} role="row" className={`grid ${grid} items-center gap-x-3 border-b border-gray-100 px-3 py-1.5 text-sm dark:border-gray-800 ${depth ? 'bg-gray-50/60 dark:bg-gray-900/60' : ''}`}>
        <div role="cell" className={`flex min-w-0 items-center gap-1 ${depth ? 'pl-6' : ''}`}>
          {depth === 0 &&
            (kids.length ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Hide' : 'Show'} the ${kids.length} subtopics of ${r.label}`}
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
                className="rounded p-0.5 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="w-5" />
            ))}
          <span
            tabIndex={0}
            className={`min-w-0 truncate rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${depth ? 'text-gray-700 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-gray-100'}`}
            {...bind(
              <span>
                <span className="font-semibold">{r.label}</span>
                {r.terms.length > 0 && (
                  <>
                    <br />
                    {r.terms.join(' · ')}
                  </>
                )}
              </span>
            )}
          >
            {r.label}
          </span>
        </div>
        <div role="cell" className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatCount(r.papers)}</span>
          <span className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
            <span className="block h-1.5 rounded-full" style={{ width: `${(r.papers / maxPapers) * 100}%`, background: tokens.series[0] }} />
          </span>
        </div>
        {citedAvailable && (
          <div role="cell" className="flex items-center gap-2" title={`${formatCount(r.cited ?? 0)} of ${formatCount(r.distinct)} distinct papers`}>
            <span className="w-9 shrink-0 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatPercent(r.citedShare ?? 0)}</span>
            <span className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
              <span className="block h-1.5 rounded-full" style={{ width: `${(r.citedShare ?? 0) * 100}%`, background: tokens.series[0] }} />
            </span>
          </div>
        )}
        <div role="cell" className="min-w-0">
          <YearSparkline counts={r.yearBins} start={axis.start} binSize={axis.binSize} noYear={r.noYear} tokens={tokens} width={112} height={20} />
        </div>
        <div role="cell" className="text-right tabular-nums text-gray-700 dark:text-gray-300">
          {r.median ?? '—'}
        </div>
        <div role="cell" className="text-right tabular-nums text-gray-700 dark:text-gray-300">
          {r.flagged ? formatCount(r.flagged) : '—'}
        </div>
        <div role="cell" className="flex items-center justify-end gap-0.5">
          <IconButton label={`Show “${truncate(r.label, 40)}” on the map`} onClick={() => onShowTopic(g)}>
            <MapIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={`Passage map of the ${nearest.length} papers nearest the center of “${truncate(r.label, 40)}”`}
            onClick={() =>
              onOpenPassages(nearest, `Passages near the center of “${r.label}”`, `The ${nearest.length} papers nearest the center of this topic on the map.`)
            }
          >
            <ScatterChart className="h-4 w-4" />
          </IconButton>
          <AskArcButton ids={askIds} total={r.distinct} onAsk={onAsk} subsetNote="nearest this topic’s center" compact />
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" aria-label="Topics">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3">
        <SectionHeading>Topics</SectionHeading>
        <span className="text-xs text-gray-500 dark:text-gray-400">Expand a topic for its subtopics · hover a name for its terms</span>
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-label="Topics in the library" className={citedAvailable ? 'min-w-[63rem]' : 'min-w-[55rem]'}>
          <div role="rowgroup">
            <div role="row" className={`grid ${grid} items-center gap-x-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700`}>
              {columns.map((c) => {
                const active = sort.key === c.key;
                return (
                  <div
                    key={c.key}
                    role="columnheader"
                    aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    className={c.right ? 'text-right' : ''}
                  >
                    <button
                      type="button"
                      title={c.help}
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === 'label' ? 1 : -1 }))}
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
              <div role="columnheader" className="text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <span className="sr-only">Actions</span>
              </div>
            </div>
          </div>
          <div role="rowgroup">
            {coarse.map((r) => (
              <Fragment key={r.id}>
                {renderRow(r, 0)}
                {open.has(r.id) && (childrenOf.get(r.id) ?? []).map((f) => renderRow(f, 1))}
              </Fragment>
            ))}
            {coarse.length === 0 && <p className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">No papers in scope.</p>}
          </div>
        </div>
      </div>
      <FloatingTip tip={tip} />
    </section>
  );
}

// ---------------------------------------------------------------- topic correlation

const LEVEL_OPTIONS = [
  { value: 'coarse' as const, label: 'Topics' },
  { value: 'fine' as const, label: 'Subtopics' },
];

function TopicCorrelation({
  model,
  mask,
  tokens,
  onSelectPaper,
  onCompare,
  onAsk,
}: {
  model: MapModel;
  mask: Uint8Array | null;
  tokens: MapTokens;
  onSelectPaper: (index: number) => void;
  onCompare: (a: number, b: number) => void;
  onAsk: (paperIds: string[]) => void;
}) {
  const [level, setLevel] = useState<'coarse' | 'fine'>('coarse');
  const [cell, setCell] = useState<{ level: 'coarse' | 'fine'; i: number; j: number } | null>(null);
  const tc = model.data.topic_correlation;
  const view = useMemo(() => correlationView(model, tc?.[level]), [model, tc, level]);
  const active = cell && cell.level === level && view ? cell : null;
  const pairs = useMemo(() => {
    if (!active || !view) return [];
    const ri = view.levelIndex[active.i];
    const ci = view.levelIndex[active.j];
    if (ri < 0 || ci < 0) return [];
    return topicPairs(model, level, ri, ci, mask, 20);
  }, [active, view, model, level, mask]);

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const fmtDomain = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900" aria-label="Topic correlation">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>How topics connect</SectionHeading>
        {view && (
          <SegmentedControl
            options={LEVEL_OPTIONS}
            value={level}
            onChange={(l) => {
              setLevel(l);
              setCell(null);
            }}
            label="Correlation level"
          />
        )}
      </div>
      {!view ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This build of the map has no topic correlation (it arrives with map schema 2). Rebuild the map to see it.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
            Each row is a topic; each cell is the share of its papers’ 10 nearest content neighbors that sit in the column’s topic. Rows sum to 100%. Related
            topics are ordered next to each other. Whole library: the year filter does not apply. Click a cell for the strongest pairs.
          </p>
          <MatrixHeatmap
            label={`Topic correlation, ${level === 'coarse' ? 'topics' : 'subtopics'}`}
            rowLabels={view.labels}
            colLabels={view.labels}
            values={view.values}
            domain={view.domain}
            tokens={tokens}
            neutralDiagonal
            cellText={(i, j) => {
              const v = view.values[i][j];
              return i === j || v >= 0.005 ? pct(v) : '';
            }}
            tooltip={(i, j) => (
              <span>
                <span className="font-semibold">{pct(view.values[i][j])}</span> of the nearest neighbors of “{view.labels[i]}” papers are in “{view.labels[j]}”
                <br />
                {i === j ? 'Same topic (gray: kept out of the color scale)' : 'Click to list the strongest pairs'}
              </span>
            )}
            describe={(i, j) => `${pct(view.values[i][j])} of the nearest neighbors of ${view.labels[i]} papers are in ${view.labels[j]}`}
            onCellClick={(i, j) => setCell({ level, i, j })}
            selected={active ? [active.i, active.j] : null}
            minCell={level === 'fine' ? 11 : 22}
            maxCell={level === 'fine' ? 16 : 44}
            labelChars={level === 'fine' ? 22 : 30}
            formatDomain={fmtDomain}
            legend={<span>Share of neighbor slots · color scale fit to the off-diagonal range · diagonal (same topic) in gray with its value</span>}
          />
          {active && (
            <PairList
              model={model}
              title={`${view.labels[active.i]} ↔ ${view.labels[active.j]}`}
              pairs={pairs}
              onSelectPaper={onSelectPaper}
              onCompare={onCompare}
              onAsk={onAsk}
              onClose={() => setCell(null)}
            />
          )}
        </>
      )}
    </section>
  );
}

function PairList({
  model,
  title,
  pairs,
  onSelectPaper,
  onCompare,
  onAsk,
  onClose,
}: {
  model: MapModel;
  title: string;
  pairs: Array<{ a: number; b: number; score: number }>;
  onSelectPaper: (index: number) => void;
  onCompare: (a: number, b: number) => void;
  onAsk: (paperIds: string[]) => void;
  onClose: () => void;
}) {
  const ids = askPaperIds(
    model,
    pairs.flatMap((p) => [p.a, p.b]),
    ASK_CAP
  );
  const paperButton = (i: number) => {
    const p = model.papers[i];
    return (
      <button
        type="button"
        onClick={() => onSelectPaper(i)}
        title="Show on the map"
        className="block w-full min-w-0 truncate rounded text-left text-sm text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-100"
      >
        {p.title || p.id} <span className="text-xs text-gray-500 dark:text-gray-400">· {formatYear(p.year)}</span>
      </button>
    );
  };
  return (
    <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700" aria-live="polite">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={title}>
          Strongest pairs: {title}
        </h4>
        <div className="flex items-center gap-2">
          <AskArcButton ids={ids} onAsk={onAsk} compact />
          <button
            type="button"
            onClick={onClose}
            className="rounded text-xs text-gray-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400"
          >
            Close
          </button>
        </div>
      </div>
      {pairs.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No direct links between these topics among the map’s similarity links{' '}
          {'(only each paper’s strongest content links are kept, and both papers must pass the year filter).'}
        </p>
      ) : (
        <ol className="divide-y divide-gray-100 dark:divide-gray-800">
          {pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-2 py-1.5">
              <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100" title="Content cosine similarity">
                {formatScore(p.score)}
              </span>
              <div className="min-w-0">
                {paperButton(p.a)}
                {paperButton(p.b)}
              </div>
              <IconButton label="Compare these two papers" onClick={() => onCompare(p.a, p.b)}>
                <GitCompareArrows className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
