import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Map as MapIcon, X } from 'lucide-react';
import type { ArchetypeId, LibraryMapCollections, LibraryMapEngineering, RoleInferenceReport, SectionRole, UndeterminedCause } from '../../types';
import { fromBarcode } from './barcode';
import { BarList } from './charts';
import { buildEngineeringModel, engineeringMask, type EngineeringModel } from './engineeringModel';
import {
  ARCHETYPE_ORDER,
  CAUSE_LABEL,
  CAUSE_ORDER,
  CONTENT_SOURCE_LABEL,
  CONTENT_SOURCE_ORDER,
  ROLE_ORDER,
  formatBuiltAt,
  formatCount,
  formatPercent,
  truncate,
} from './format';
import { useElementSize } from './hooks';
import { MapCanvas, type MapCanvasHandle } from './MapCanvas';
import { ZoomControls } from './MapLegend';
import type { GroupRef, MapModel } from './mapModel';
import type { MapScene } from './mapRenderer';
import { MapError, MapNotBuilt } from './MapStates';
import { MatrixHeatmap } from './MatrixHeatmap';
import { COLLECTIONS_KEY, collectionsStore, describeError, engineeringStore, useResource } from './resource';
import { RoleLegend } from './RoleLegend';
import { SectionBarcode } from './SectionBarcode';
import type { MapTokens } from './tokens';
import { ArchetypeBadge, IconButton, InfoTip, SectionHeading, Spinner, StatTile, Swatch } from './ui';

const CARD_BASE = 'min-w-0 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900';
const CARD = `${CARD_BASE} p-4`;
const pct = (v: number | null | undefined, digits = 0) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : '—');

interface EngineeringTabProps {
  /** the researcher map: titles, and "Show on map" */
  model: MapModel;
  tokens: MapTokens;
  reducedMotion: boolean;
  compact: boolean;
  onShowOnMap: (mapIndex: number) => void;
  onOpenPdf: (paperId: string) => void;
}

/**
 * Engineering view (contract v2.1-P): what the pipeline produced for a collection --
 * section labels, layout types, the structure layout, role inference. For whoever
 * tunes extraction, section detection and chunking; "Undetermined" is signal here.
 */
export function EngineeringTab(props: EngineeringTabProps) {
  const collections = useResource(collectionsStore, COLLECTIONS_KEY);
  const list = collections?.status === 'success' && Array.isArray(collections.data.collections) ? collections.data.collections : [];
  const active = list.find((c) => c.active)?.collection ?? props.model.data.header?.collection ?? '';
  const [picked, setPicked] = useState<string | null>(null);
  const name = picked ?? active;
  // '' = the active collection (the endpoint's default), so it shares one cache entry
  const key = picked && picked !== active ? picked : '';
  const state = useResource(engineeringStore, key);
  const retry = () => engineeringStore.load(key, true);

  let body: ReactNode;
  if (!state || state.status === 'loading') {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Loading the engineering view…" />
      </div>
    );
  } else if (state.status === 'error') {
    const info = describeError(state.error);
    body =
      info.status === 404 ? (
        <MapNotBuilt
          detail={info.message}
          onRetry={retry}
          title={`The engineering view hasn’t been built for “${name || 'this collection'}”`}
          body="It is written by the same build as the map. Run this on the backend machine, then come back:"
          extraArgs={key ? `--collection ${key}` : ''}
        />
      ) : (
        <MapError info={info} onRetry={retry} title={info.status === 400 ? 'Not a valid collection name' : 'The engineering view could not be loaded'} />
      );
  } else {
    body = <EngineeringView key={key || '(active)'} data={state.data} {...props} collections={list} activeName={active} currentKey={key} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {list.length >= 2 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 sm:px-4">
          <label htmlFor="engineering-collection" className="text-gray-600 dark:text-gray-400">
            Collection
          </label>
          <select
            id="engineering-collection"
            name="engineering-collection"
            value={name}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {list.map((c) => (
              <option key={c.collection} value={c.collection}>
                {c.collection}
                {c.active ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {body}
    </div>
  );
}

// ---------------------------------------------------------------- the view

function EngineeringView({
  data,
  model,
  tokens,
  reducedMotion,
  compact,
  onShowOnMap,
  onOpenPdf,
  collections,
  activeName,
  currentKey,
}: EngineeringTabProps & {
  data: LibraryMapEngineering;
  collections: LibraryMapCollections['collections'];
  activeName: string;
  currentKey: string;
}) {
  const em = useMemo(() => buildEngineeringModel(data, model), [data, model]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [layout, setLayout] = useState<ArchetypeId | null>(null);
  const [cause, setCause] = useState<UndeterminedCause | null>(null);
  const mapRef = useRef<MapCanvasHandle>(null);
  const mask = useMemo(() => engineeringMask(em, layout, cause), [em, layout, cause]);
  const scene: MapScene = useMemo(
    () => ({ colorBy: 'archetype', showLinks: false, tokens, cited: null, attentionBits: 0, mask, selected, neighbors: null, focus: hover, group: null }),
    [tokens, mask, selected, hover]
  );
  const h = data.header;

  const pickLayout = (a: ArchetypeId | null) => {
    setLayout(a);
    if (a !== 'unstructured') setCause(null);
  };
  const pickCause = (c: UndeterminedCause | null) => {
    setCause(c);
    if (c) setLayout('unstructured');
  };
  const select = (i: number, fly: boolean) => {
    setSelected(i);
    if (fly && !em.scatter.hidden?.[i]) mapRef.current?.flyTo(i);
  };
  const onLabelClick = (g: GroupRef) => {
    const a = g.id.replace(/^layout:/, '') as ArchetypeId;
    if (ARCHETYPE_ORDER.includes(a)) pickLayout(layout === a ? null : a);
  };
  const describePoint = (i: number) => {
    const a = ARCHETYPE_ORDER[em.archetype[i]];
    const c = em.cause[i] >= 0 ? CAUSE_LABEL[CAUSE_ORDER[em.cause[i]]] : null;
    const share = em.unlabeled[i];
    return `${em.archetypeLabel[a]}${c ? ` · ${c}` : ''}${Number.isNaN(share) ? '' : ` · ${formatPercent(share)} unlabeled`}`;
  };

  const ri = h?.role_inference ?? null;
  const topTypes = Object.entries(h?.points_by_chunk_type ?? {})
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([t, n]) => `${t} ${formatCount(n)}`)
    .join(' · ');
  const sectionRows = Object.entries(h?.section_names ?? {})
    .sort((x, y) => y[1] - x[1])
    .map(([s, n]) => ({
      key: s,
      label: s,
      count: n,
      meta: s === '(none)' ? 'no section name' : em.roleLabel[em.sectionRole.get(s) ?? 'unlabeled'],
      help: s === '(none)' ? 'Points stored without a section_name (whole-paper "full" chunks)' : `section_name "${s}" counts as ${em.roleLabel[em.sectionRole.get(s) ?? 'unlabeled']}`,
    }));

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-4">
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-800 dark:text-gray-200">{h?.collection ?? activeName}</span>
            {h?.embedding_model && <span>· {h.embedding_model}</span>}
            {h?.built_at && <span>· built {formatBuiltAt(h.built_at)}</span>}
            {h?.payload_shape && <span>· payload shape {h.payload_shape}</span>}
            <InfoTip
              label="About the payload shape"
              text="pre_w2: every point was indexed before the W2 pipeline (no page numbers, section headers baked into fine chunks). w2: every point carries the W2 fields. mixed: both kinds are in the collection."
            />
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <StatTile label="Points" value={formatCount(h?.n_points ?? 0)} sub={topTypes} help="Every vector in the collection, by chunk type." />
            <StatTile
              label="Papers"
              value={formatCount(em.n)}
              sub={em.noPosition ? `${formatCount(em.noPosition)} without a structure position` : 'All have a structure position'}
            />
            <StatTile label="Page coverage" value={pct(h?.page_coverage)} sub="of non-full points carry a page number" />
            <StatTile
              label="Unlabeled share"
              value={pct(em.unlabeledMean)}
              sub={`mean over ${formatCount(em.withBody)} papers with body text · ${formatCount(em.unlabeledHigh)} at ≥ 60%`}
              help="Share of a paper's body text that sits under no recognised section heading (subsection, content, body). Papers without body text are left out."
            />
            <StatTile
              label="Undetermined"
              value={formatCount(em.archetypeCounts[3])}
              sub={`${formatPercent(em.n ? em.archetypeCounts[3] / em.n : 0)} of papers`}
              help={em.archetypeDescription.unstructured || undefined}
            />
            <StatTile
              label="Caption-only"
              value={formatCount(h?.content_source?.captions ?? 0)}
              sub="placed from figure captions"
              help="No body text was extracted; the paper's content vector is pooled from its figure captions."
            />
            <StatTile
              label="Role inference"
              value={ri?.enabled ? 'On' : 'Off'}
              sub={ri?.gate ? `${ri.gate.passed ? 'Gate passed' : 'Gate not passed'}: ${truncate(ri.gate.reason, 70)}` : ri ? 'No gate result' : 'Not run'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className={CARD} aria-label="Section names">
              <SectionHeading aside={<span className="text-xs text-gray-500 dark:text-gray-400">points</span>}>Section labels (section_name)</SectionHeading>
              <BarList rows={sectionRows} tokens={tokens} total={h?.n_points} mono />
            </section>
            <div className="space-y-4">
              <section className={CARD} aria-label="Layout types">
                <SectionHeading aside={<span className="text-xs text-gray-500 dark:text-gray-400">click to filter</span>}>Layout types</SectionHeading>
                <BarList
                  rows={ARCHETYPE_ORDER.map((a, k) => ({
                    key: a,
                    label: em.archetypeLabel[a],
                    count: em.archetypeCounts[k],
                    color: tokens.archetype[a],
                    help: em.archetypeDescription[a] || undefined,
                  }))}
                  tokens={tokens}
                  selected={layout}
                  onSelect={(k) => pickLayout(layout === k ? null : (k as ArchetypeId))}
                />
              </section>
              <section className={CARD} aria-label="Undetermined causes">
                <SectionHeading aside={<span className="text-xs text-gray-500 dark:text-gray-400">click to filter</span>}>Why “{em.archetypeLabel.unstructured}”</SectionHeading>
                <BarList
                  rows={CAUSE_ORDER.map((c, k) => ({ key: c, label: CAUSE_LABEL[c], count: h?.undetermined_causes?.[c] ?? em.causeCounts[k] }))}
                  tokens={tokens}
                  selected={cause}
                  onSelect={(k) => pickCause(cause === k ? null : (k as UndeterminedCause))}
                />
              </section>
            </div>
            <div className="space-y-4">
              <section className={CARD} aria-label="Content sources">
                <SectionHeading>Content source (map position)</SectionHeading>
                <BarList
                  rows={CONTENT_SOURCE_ORDER.map((s) => ({ key: s, label: CONTENT_SOURCE_LABEL[s], count: h?.content_source?.[s] ?? 0 }))}
                  tokens={tokens}
                />
              </section>
              <section className={CARD} aria-label="Points by chunk type">
                <SectionHeading>Points by chunk type</SectionHeading>
                <BarList
                  rows={Object.entries(h?.points_by_chunk_type ?? {})
                    .sort((x, y) => y[1] - x[1])
                    .map(([t, n]) => ({ key: t, label: t, count: n }))}
                  tokens={tokens}
                  total={h?.n_points}
                  mono
                />
              </section>
            </div>
          </div>

          <section className={CARD} aria-label="Structure layout">
            <SectionHeading
              aside={
                <InfoTip
                  label="About the structure layout"
                  text="Each point is a paper, placed by how its text divides into sections (a 2-D projection of section-structure vectors), so papers laid out alike sit together. Color is the layout type. Long distances are not meaningful."
                />
              }
            >
              Structure layout
            </SectionHeading>
            <div className="relative h-[420px] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              <MapCanvas
                ref={mapRef}
                model={em.scatter}
                scene={scene}
                reducedMotion={reducedMotion}
                onPointClick={(i) => select(i, false)}
                onLabelClick={onLabelClick}
                onBackgroundClick={() => setSelected(null)}
                describe={describePoint}
                ariaLabel={`Structure layout of ${formatCount(em.n - em.noPosition)} papers, colored by layout type. The paper list below has every value.`}
              >
                <div
                  data-map-obstacle
                  className="pointer-events-auto absolute bottom-2 left-2 max-w-[calc(100%-4.5rem)] rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300 sm:max-w-[30rem]"
                >
                  <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Color: layout type">
                    {ARCHETYPE_ORDER.map((a, k) => (
                      <li key={a} className="inline-flex items-center gap-1.5" title={em.archetypeDescription[a] || em.archetypeLabel[a]}>
                        <Swatch color={tokens.archetype[a]} shape="dot" />
                        {em.archetypeLabel[a]}
                        {!compact && <span className="tabular-nums text-gray-500 dark:text-gray-400">{formatCount(em.archetypeCounts[k])}</span>}
                      </li>
                    ))}
                  </ul>
                  {em.noPosition > 0 && (
                    <div className="mt-1 text-gray-600 dark:text-gray-400">{formatCount(em.noPosition)} papers not drawn: no reading-order text to place them</div>
                  )}
                  {mask && <div className="mt-1 text-gray-600 dark:text-gray-400">Faded: outside the list filters</div>}
                </div>
                <ZoomControls
                  onZoomIn={() => mapRef.current?.zoomBy(1.6)}
                  onZoomOut={() => mapRef.current?.zoomBy(1 / 1.6)}
                  onReset={() => mapRef.current?.resetView()}
                  onLocate={selected != null && !em.scatter.hidden?.[selected] ? () => mapRef.current?.flyTo(selected) : undefined}
                  compact={compact}
                />
              </MapCanvas>
            </div>
          </section>

          <PaperList
            em={em}
            tokens={tokens}
            mask={mask}
            selected={selected}
            layout={layout}
            cause={cause}
            onLayout={pickLayout}
            onCause={pickCause}
            onSelect={(i) => select(i, true)}
            onHover={setHover}
          />

          <RoleInferenceCard report={ri} tokens={tokens} roleLabel={em.roleLabel} />

          {collections.length >= 2 && (
            <CollectionsCompare collections={collections} currentKey={currentKey} activeName={activeName} current={data} em={em} />
          )}
        </div>
      </div>
      {selected != null && (
        <aside
          className="flex h-1/2 min-h-0 shrink-0 flex-col border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:h-auto md:w-[360px] md:border-l md:border-t-0"
          aria-label="Paper sections"
        >
          <PaperCard
            key={data.papers[selected]?.id ?? selected}
            em={em}
            index={selected}
            tokens={tokens}
            onClose={() => setSelected(null)}
            onShowOnMap={onShowOnMap}
            onOpenPdf={onOpenPdf}
          />
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- paper list

const ROW_H = 60;
const OVERSCAN = 6;
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function Chip({ pressed, onClick, children, title }: { pressed: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        pressed
          ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
          : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

function PaperList({
  em,
  tokens,
  mask,
  selected,
  layout,
  cause,
  onLayout,
  onCause,
  onSelect,
  onHover,
}: {
  em: EngineeringModel;
  tokens: MapTokens;
  mask: Uint8Array | null;
  selected: number | null;
  layout: ArchetypeId | null;
  cause: UndeterminedCause | null;
  onLayout: (a: ArchetypeId | null) => void;
  onCause: (c: UndeterminedCause | null) => void;
  onSelect: (i: number) => void;
  onHover: (i: number | null) => void;
}) {
  const [sort, setSort] = useState<{ key: 'unlabeled' | 'title'; dir: 1 | -1 }>({ key: 'unlabeled', dir: -1 });
  const [scrollTop, setScrollTop] = useState(0);
  const [sizeRef, { height }] = useElementSize<HTMLDivElement>();
  const papers = em.scatter.papers;
  const rows = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < em.n; i++) if (!mask || mask[i]) list.push(i);
    const title = (a: number, b: number) => collator.compare(papers[a].title || papers[a].id, papers[b].title || papers[b].id);
    list.sort((a, b) => {
      if (sort.key === 'title') return title(a, b) * sort.dir || a - b;
      const ua = em.unlabeled[a];
      const ub = em.unlabeled[b];
      // unknown share (no body text) always last
      if (Number.isNaN(ua) !== Number.isNaN(ub)) return Number.isNaN(ua) ? 1 : -1;
      return (Number.isNaN(ua) ? 0 : (ua - ub) * sort.dir) || title(a, b);
    });
    return list;
  }, [em, mask, sort, papers]);
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + (height || 480)) / ROW_H) + OVERSCAN);
  const header = (key: 'unlabeled' | 'title', label: string, className = '') => {
    const active = sort.key === key;
    return (
      <div role="columnheader" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={className}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'title' ? 1 : -1 }))}
          className={`inline-flex items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {label}
          {active && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
        </button>
      </div>
    );
  };

  return (
    <section className={`${CARD_BASE} pb-1`} aria-label="Papers and their sections">
      <div className="space-y-2 px-4 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionHeading>Papers and their sections</SectionHeading>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatCount(rows.length)} of {formatCount(em.n)} · select one for its full barcode and chunk counts
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by layout type">
          <span className="mr-0.5 text-xs text-gray-500 dark:text-gray-400">Layout</span>
          <Chip pressed={layout == null} onClick={() => onLayout(null)}>
            All
          </Chip>
          {ARCHETYPE_ORDER.map((a, k) => (
            <Chip key={a} pressed={layout === a} onClick={() => onLayout(layout === a ? null : a)} title={em.archetypeDescription[a] || undefined}>
              <Swatch color={tokens.archetype[a]} shape="dot" />
              {em.archetypeLabel[a]}
              <span className="tabular-nums opacity-80">{formatCount(em.archetypeCounts[k])}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Filter by why a paper is ${em.archetypeLabel.unstructured}`}>
          <span className="mr-0.5 text-xs text-gray-500 dark:text-gray-400">Cause</span>
          <Chip pressed={cause == null} onClick={() => onCause(null)}>
            Any
          </Chip>
          {CAUSE_ORDER.map((c, k) => (
            <Chip key={c} pressed={cause === c} onClick={() => onCause(cause === c ? null : c)}>
              {CAUSE_LABEL[c]}
              <span className="tabular-nums opacity-80">{formatCount(em.causeCounts[k])}</span>
            </Chip>
          ))}
        </div>
        <RoleLegend tokens={tokens} roleLabel={em.roleLabel} showInferred />
      </div>
      <div role="table" aria-label="Papers with their section barcodes" aria-rowcount={rows.length + 1} className="mt-2">
        <div role="rowgroup" className="border-y border-gray-200 bg-gray-50 px-4 dark:border-gray-700 dark:bg-gray-800/60">
          <div role="row" className="grid h-8 grid-cols-[minmax(0,1fr)_auto_5.5rem] items-center gap-x-3">
            {header('title', 'Paper')}
            <div role="columnheader" className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Layout
            </div>
            {header('unlabeled', 'Unlabeled', 'text-right')}
          </div>
        </div>
        <div
          ref={sizeRef}
          role="rowgroup"
          className="relative h-[480px] overflow-y-auto"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onMouseLeave={() => onHover(null)}
        >
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            {rows.slice(start, end).map((i, k) => {
              const p = em.data.papers[i];
              const paper = papers[i];
              const a = ARCHETYPE_ORDER[em.archetype[i]];
              const c = em.cause[i] >= 0 ? CAUSE_ORDER[em.cause[i]] : null;
              const share = em.unlabeled[i];
              return (
                <div
                  key={p.id}
                  role="row"
                  aria-rowindex={start + k + 2}
                  aria-selected={i === selected}
                  tabIndex={0}
                  onClick={() => onSelect(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(i);
                    }
                  }}
                  onMouseEnter={() => onHover(i)}
                  onFocus={() => onHover(i)}
                  className={`absolute left-0 right-0 cursor-pointer border-b border-gray-100 px-4 py-1.5 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-gray-800 dark:hover:bg-gray-800/60 ${
                    i === selected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  style={{ top: (start + k) * ROW_H, height: ROW_H }}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_5.5rem] items-center gap-x-3">
                    <div role="cell" className="min-w-0 truncate text-sm text-gray-900 dark:text-gray-100" title={paper.title || p.id}>
                      {paper.title || p.id}
                    </div>
                    <div role="cell" className="flex min-w-0 items-center gap-1.5">
                      <ArchetypeBadge id={a} label={em.archetypeLabel[a]} tokens={tokens} title={em.archetypeDescription[a] || undefined} />
                      {c && <span className="hidden truncate text-xs text-gray-500 dark:text-gray-400 sm:inline">{CAUSE_LABEL[c]}</span>}
                    </div>
                    <div role="cell" className="text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {Number.isNaN(share) ? '—' : formatPercent(share)}
                    </div>
                  </div>
                  <div className="mt-1.5" role="cell">
                    <SectionBarcode segments={fromBarcode(p.barcode)} tokens={tokens} roleLabel={em.roleLabel} size="mini" label="Sections" />
                  </div>
                </div>
              );
            })}
          </div>
          {rows.length === 0 && <p className="px-4 py-6 text-sm text-gray-600 dark:text-gray-400">No papers match these filters.</p>}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- one paper

const CHUNK_TYPES = ['abstract', 'section', 'fine', 'caption', 'table'] as const;

function PaperCard({
  em,
  index,
  tokens,
  onClose,
  onShowOnMap,
  onOpenPdf,
}: {
  em: EngineeringModel;
  index: number;
  tokens: MapTokens;
  onClose: () => void;
  onShowOnMap: (mapIndex: number) => void;
  onOpenPdf: (paperId: string) => void;
}) {
  const p = em.data.papers[index];
  const paper = em.scatter.papers[index];
  if (!p) return null;
  const a = ARCHETYPE_ORDER[em.archetype[index]];
  const c = em.cause[index] >= 0 ? CAUSE_ORDER[em.cause[index]] : null;
  const share = em.unlabeled[index];
  const mi = em.mapIndex[index];
  const chunks = p.chunks ?? {};
  const extraTypes = Object.keys(chunks).filter((t) => !(CHUNK_TYPES as readonly string[]).includes(t));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 px-2 py-1.5 dark:border-gray-700">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Paper sections</span>
        <span className="flex-1" />
        <IconButton label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <h2 className="text-base font-semibold leading-snug text-gray-900 dark:text-gray-100">{paper.title || p.id}</h2>
          <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">{p.id}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ArchetypeBadge id={a} label={em.archetypeLabel[a]} tokens={tokens} title={em.archetypeDescription[a] || undefined} />
            {c && <span className="text-xs text-gray-700 dark:text-gray-300">{CAUSE_LABEL[c]}</span>}
          </div>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-500 dark:text-gray-400">Unlabeled</dt>
            <dd className="tabular-nums text-gray-900 dark:text-gray-100">{Number.isNaN(share) ? 'unknown (no body text)' : `${formatPercent(share)} of body text`}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Map position</dt>
            <dd className="text-gray-900 dark:text-gray-100">{CONTENT_SOURCE_LABEL[p.content_source] ?? p.content_source}</dd>
            <dt className="text-gray-500 dark:text-gray-400">Structure</dt>
            <dd className="text-gray-900 dark:text-gray-100">{em.scatter.hidden?.[index] ? 'not placed (no reading-order text)' : 'placed in the layout above'}</dd>
          </dl>
        </div>

        <section aria-label="Sections in reading order">
          <SectionHeading>Sections in reading order</SectionHeading>
          <SectionBarcode segments={fromBarcode(p.barcode)} tokens={tokens} roleLabel={em.roleLabel} size="full" label="Sections in reading order" showRaw />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Width = share of the reading-order text. Hover or focus a segment for its section, role and share.</p>
          <div className="mt-2">
            <RoleLegend tokens={tokens} roleLabel={em.roleLabel} showInferred />
          </div>
        </section>

        <section aria-label="Chunks">
          <SectionHeading>Chunks</SectionHeading>
          <dl className="grid grid-cols-3 gap-2">
            {[...CHUNK_TYPES, ...extraTypes].map((t) => (
              <div key={t} className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-800">
                <dt className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{t}</dt>
                <dd className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatCount(chunks[t] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="flex flex-wrap gap-2">
          {mi >= 0 && (
            <button
              type="button"
              onClick={() => onShowOnMap(mi)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              <MapIcon className="h-4 w-4" /> Show on map
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenPdf(p.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ExternalLink className="h-4 w-4" /> Open PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- role inference

function RoleInferenceCard({ report, tokens, roleLabel }: { report: RoleInferenceReport | null; tokens: MapTokens; roleLabel: Record<SectionRole, string> }) {
  const labelOf = (r: string) => (r in roleLabel ? roleLabel[r as SectionRole] : r);
  if (!report) {
    return (
      <section className={CARD} aria-label="Role inference">
        <SectionHeading>Role inference</SectionHeading>
        <p className="text-sm text-gray-600 dark:text-gray-400">This build has no role-inference report.</p>
      </section>
    );
  }
  const ho = report.holdout;
  const gate = report.gate;
  const recall = ho?.per_role_recall ?? {};
  const transfer = Object.entries(report.transfer ?? {});
  const conf = ho?.confusion;
  const confOk =
    conf && Array.isArray(conf.labels) && Array.isArray(conf.rows_true_cols_predicted) && conf.rows_true_cols_predicted.length === conf.labels.length;
  const rowShares = confOk
    ? conf.rows_true_cols_predicted.map((row) => {
        const sum = row.reduce((s, v) => s + (Number(v) || 0), 0);
        return row.map((v) => (sum ? (Number(v) || 0) / sum : 0));
      })
    : [];
  const confLabels = confOk ? conf.labels.map(labelOf) : [];
  const numbers: Array<[string, string, string?]> = [
    ['Held-out accuracy', pct(ho?.accuracy, 1), ho?.n_test != null ? `${formatCount(ho.n_test)} chunks from ${formatCount(ho.n_test_papers ?? 0)} unseen papers` : undefined],
    ['Worst unseen-heading test', pct(report.transfer_min, 1), gate?.transfer_min != null ? `gate needs ≥ ${pct(gate.transfer_min)}` : undefined],
    ['Confidence threshold', report.threshold != null ? report.threshold.toFixed(2) : '—', report.threshold_rule],
    ['Labelled training chunks', formatCount(report.n_labelled ?? 0), 'fine chunks under a detected heading'],
    [
      'Unlabeled chunks',
      formatCount(report.targets?.n ?? report.n_targets ?? 0),
      report.targets ? `${formatCount(report.targets.n_inferred)} would get a role, ${formatCount(report.targets.n_left_unlabeled)} stay unlabeled` : undefined,
    ],
    ...(report.silver_check?.agreement_at_threshold != null
      ? ([['Silver-label agreement', pct(report.silver_check.agreement_at_threshold, 1), report.silver_check.note]] as Array<[string, string, string?]>)
      : []),
  ];
  return (
    <section className={CARD} aria-label="Role inference">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SectionHeading>Role inference</SectionHeading>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            report.enabled ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300'
          }`}
        >
          {report.enabled ? 'On' : 'Off'}
        </span>
        {report.mode && <span className="text-xs text-gray-500 dark:text-gray-400">mode {report.mode}</span>}
      </div>
      {report.method && <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">{report.method}</p>}
      {gate && (
        <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
          <span className="font-semibold">{gate.passed ? 'Gate passed' : 'Gate not passed'}:</span> {gate.reason}
          {(gate.holdout_min != null || gate.transfer_min != null) && (
            <span className="text-gray-600 dark:text-gray-400">
              {' '}
              (needs held-out accuracy ≥ {pct(gate.holdout_min)} and every unseen-heading test ≥ {pct(gate.transfer_min)})
            </span>
          )}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <dl className="space-y-2">
          {numbers.map(([label, value, note]) => (
            <div key={label}>
              <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="text-sm">
                <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
                {note && <span className="block text-xs text-gray-600 dark:text-gray-400">{note}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Held-out recall per role</div>
            <ul className="space-y-1.5">
              {ROLE_ORDER.filter((r) => typeof recall[r] === 'number').map((r) => (
                <li key={r} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-gray-800 dark:text-gray-200">
                    <Swatch color={tokens.roleFill[r]} border={tokens.roleBorder[r]} />
                    {roleLabel[r]}
                  </span>
                  <span className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
                    <span className="block h-1.5 rounded-full" style={{ width: `${(recall[r] ?? 0) * 100}%`, background: tokens.series[0] }} />
                  </span>
                  <span className="text-right tabular-nums text-gray-900 dark:text-gray-100">{pct(recall[r])}</span>
                </li>
              ))}
            </ul>
          </div>
          {transfer.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Unseen headings (trained without them)
              </div>
              <ul className="space-y-2">
                {transfer.map(([name, t]) => {
                  const bar = gate?.transfer_min;
                  return (
                    <li key={name} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-[12px] text-gray-800 dark:text-gray-200" title={name}>
                          {name}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-900 dark:text-gray-100">{pct(t.accuracy)}</span>
                      </div>
                      <span className="relative mt-1 block h-1.5 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
                        <span className="block h-1.5 rounded-full" style={{ width: `${(t.accuracy ?? 0) * 100}%`, background: tokens.series[0] }} />
                        {typeof bar === 'number' && (
                          <span className="absolute -top-0.5 h-2.5 w-px" style={{ left: `${bar * 100}%`, background: tokens.ink }} title={`gate ${pct(bar)}`} />
                        )}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatCount(t.n)} chunks</span>
                    </li>
                  );
                })}
              </ul>
              {typeof gate?.transfer_min === 'number' && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The tick marks the gate ({pct(gate.transfer_min)}).</p>}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Confusion matrix (held out)</div>
          {confOk ? (
            <MatrixHeatmap
              label="Role-inference confusion matrix: rows are the true role, columns the predicted role"
              rowLabels={confLabels}
              colLabels={confLabels}
              values={rowShares}
              domain={[0, 1]}
              tokens={tokens}
              cellText={(i, j) => formatCount(conf.rows_true_cols_predicted[i][j] ?? 0)}
              tooltip={(i, j) => (
                <span>
                  True <span className="font-semibold">{confLabels[i]}</span>, predicted <span className="font-semibold">{confLabels[j]}</span>
                  <br />
                  {formatCount(conf.rows_true_cols_predicted[i][j] ?? 0)} chunks · {pct(rowShares[i][j], 1)} of true {confLabels[i]}
                </span>
              )}
              describe={(i, j) =>
                `True ${confLabels[i]}, predicted ${confLabels[j]}: ${conf.rows_true_cols_predicted[i][j] ?? 0} chunks, ${pct(rowShares[i][j], 1)} of true ${confLabels[i]}`
              }
              minCell={34}
              maxCell={56}
              labelChars={14}
              rowTitle="Rows: true role · columns: predicted role"
              formatDomain={(v) => pct(v)}
              legend={<span>Share of each true role’s chunks (rows sum to 100%); numbers are chunk counts</span>}
            />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">No confusion matrix in this report.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- collections side by side

function CollectionsCompare({
  collections,
  currentKey,
  activeName,
  current,
  em,
}: {
  collections: LibraryMapCollections['collections'];
  currentKey: string;
  activeName: string;
  current: LibraryMapEngineering;
  em: EngineeringModel;
}) {
  const currentName = currentKey || activeName;
  const others = collections.filter((c) => c.collection !== currentName);
  const [other, setOther] = useState(others[0]?.collection ?? '');
  const otherKey = other && other !== activeName ? other : '';
  const state = useResource(engineeringStore, other ? otherKey : null);
  const b = state?.status === 'success' ? state.data : undefined;
  type Row = [string, (d: LibraryMapEngineering) => string];
  const rows: Row[] = [
    ['Embedding model', (d) => d.header?.embedding_model ?? '—'],
    ['Built', (d) => (d.header?.built_at ? formatBuiltAt(d.header.built_at) : '—')],
    ['Payload shape', (d) => d.header?.payload_shape ?? '—'],
    ['Points', (d) => formatCount(d.header?.n_points ?? 0)],
    ['Papers', (d) => formatCount(Array.isArray(d.papers) ? d.papers.length : 0)],
    ['Page coverage', (d) => pct(d.header?.page_coverage, 1)],
    ...CONTENT_SOURCE_ORDER.map((s): Row => [`Source: ${CONTENT_SOURCE_LABEL[s]}`, (d) => formatCount(d.header?.content_source?.[s] ?? 0)]),
    ...ARCHETYPE_ORDER.map((a): Row => [`Layout: ${em.archetypeLabel[a]}`, (d) => formatCount(d.header?.archetype_counts?.[a] ?? 0)]),
    ...CAUSE_ORDER.map((c): Row => [`Undetermined: ${CAUSE_LABEL[c]}`, (d) => formatCount(d.header?.undetermined_causes?.[c] ?? 0)]),
    ['Role inference', (d) => (d.header?.role_inference ? (d.header.role_inference.enabled ? 'on' : 'off') : '—')],
    ['Held-out accuracy', (d) => pct(d.header?.role_inference?.holdout?.accuracy, 1)],
  ];
  return (
    <section className={CARD} aria-label="Collections side by side">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SectionHeading>Collections side by side</SectionHeading>
        <label htmlFor="engineering-compare" className="text-sm text-gray-600 dark:text-gray-400">
          compare with
        </label>
        <select
          id="engineering-compare"
          name="engineering-compare"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          {others.map((c) => (
            <option key={c.collection} value={c.collection}>
              {c.collection}
            </option>
          ))}
        </select>
      </div>
      {!other ? null : !state || state.status === 'loading' ? (
        <Spinner label="Loading…" />
      ) : state.status === 'error' ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {describeError(state.error).status === 404 ? `“${other}” has no engineering view yet.` : describeError(state.error).message}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  <span className="sr-only">Measure</span>
                </th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  {currentName}
                </th>
                <th scope="col" className="py-1.5 font-semibold">
                  {other}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, get]) => {
                const va = get(current);
                const vb = b ? get(b) : '—';
                return (
                  <tr key={label} className="border-b border-gray-100 dark:border-gray-800">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-600 dark:text-gray-400">
                      {label}
                    </th>
                    <td className="py-1.5 pr-3 tabular-nums text-gray-900 dark:text-gray-100">{va}</td>
                    <td className={`py-1.5 tabular-nums ${va !== vb ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{vb}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Bold: differs from {currentName}.</p>
        </div>
      )}
    </section>
  );
}
