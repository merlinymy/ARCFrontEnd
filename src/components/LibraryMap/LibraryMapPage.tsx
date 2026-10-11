import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Waypoints } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { LibraryMapResponse } from '../../types';
import { CompareView } from './CompareView';
import { EngineeringTab } from './EngineeringTab';
import { FilterBar } from './FilterBar';
import { FLAG_LABEL, LENS_LABEL, LENS_ORDER, PROJECTION_CAVEAT, formatBuiltAt, formatCount, formatDate, truncate, type ShownLens } from './format';
import { GroupPanel } from './GroupPanel';
import { useAskArc, useMapTokens, useMediaQuery, usePrefersReducedMotion, writePrefs } from './hooks';
import { MapCanvas, type MapCanvasHandle } from './MapCanvas';
import { MapLegend, ZoomControls } from './MapLegend';
import { FLAG_ORDER, buildCited, buildMapModel, computeMask, groupKey, groupLabel, groupMembers, hasFlag, type GroupRef } from './mapModel';
import type { MapScene } from './mapRenderer';
import { MapEmpty, MapError, MapLoading, MapNotBuilt } from './MapStates';
import { OverviewTab } from './OverviewTab';
import { PaperPanel } from './PaperPanel';
import { PaperTable } from './PaperTable';
import { PassageOverlay } from './PassageOverlay';
import { FOOTPRINT_KEY, MAP_KEY, describeError, footprintStore, mapStore, paperDetailStore, useLatestResource, useResource } from './resource';
import { initUi, uiReducer, type Panel } from './state';
import { InfoTip } from './ui';

/** Library Map page: loaded lazily (React.lazy) so it stays out of the main bundle. */
export default function LibraryMapPage() {
  const state = useResource(mapStore, MAP_KEY);
  const retry = useCallback(() => mapStore.load(MAP_KEY, true), []);
  if (!state || state.status === 'loading') return <MapLoading />;
  if (state.status === 'error') {
    const info = describeError(state.error);
    return info.status === 404 ? <MapNotBuilt detail={info.message} onRetry={retry} /> : <MapError info={info} onRetry={retry} />;
  }
  if (!Array.isArray(state.data.papers) || state.data.papers.length === 0) return <MapEmpty />;
  return <LibraryMapView data={state.data} />;
}

function LibraryMapView({ data }: { data: LibraryMapResponse }) {
  const { state: app, setViewingPdf } = useApp();
  const tokens = useMapTokens();
  const reducedMotion = usePrefersReducedMotion();
  const ask = useAskArc();
  /** below md the panel is a bottom sheet that halves the map */
  const sheetLayout = useMediaQuery('(max-width: 767px)');
  /** below sm the legend and zoom controls compact so they don't bury the map */
  const compactChrome = useMediaQuery('(max-width: 639px)');
  const model = useMemo(() => buildMapModel(data), [data]);
  const [ui, dispatch] = useReducer(uiReducer, undefined, initUi);
  const mapRef = useRef<MapCanvasHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    writePrefs({ tab: ui.tab, view: ui.view, colorBy: ui.colorBy, showLinks: ui.showLinks });
  }, [ui.tab, ui.view, ui.colorBy, ui.showLinks]);

  // ------------------------------------------------------------ reading footprint (K)
  // Per user and it changes as they chat, so refresh it whenever the page opens.
  // Any error (401 without a session included) only hides the footprint features.
  const fpState = useResource(footprintStore, FOOTPRINT_KEY);
  const fpLatest = useLatestResource(footprintStore, FOOTPRINT_KEY);
  useEffect(() => {
    footprintStore.load(FOOTPRINT_KEY, true);
  }, []);
  const fpData = fpState?.status === 'error' ? undefined : fpState?.status === 'success' ? fpState.data : fpLatest;
  const cited = useMemo(() => (fpData ? buildCited(model, fpData) : null), [model, fpData]);
  const footprintLoading = !fpData && (!fpState || fpState.status === 'loading');
  // a saved "Cited" preference falls back to Topic while the footprint is unavailable
  const colorBy = ui.colorBy === 'cited' && !cited ? 'topic' : ui.colorBy;

  const selected = ui.panel?.kind === 'paper' ? ui.panel.index : null;
  const group = ui.panel?.kind === 'group' ? ui.panel.group : null;
  const selectedId = selected != null ? (model.papers[selected]?.id ?? null) : null;
  const detail = useResource(paperDetailStore, selectedId);
  const loadedDetail = detail?.status === 'success' ? detail.data : undefined;

  // lens tabs: the lenses this paper actually has (from the detail once loaded)
  const lenses = useMemo((): ShownLens[] => {
    if (selected == null) return ['content'];
    const has = loadedDetail
      ? LENS_ORDER.filter((l) => (loadedDetail.neighbors[l]?.length ?? 0) > 0)
      : LENS_ORDER.filter((l) => (model.papers[selected].lenses ?? []).includes(l));
    return has.length ? has : ['content'];
  }, [selected, loadedDetail, model]);
  // the chosen lens if this paper has it, else Methods when it has one, else Content
  const lens: ShownLens = ui.lens && lenses.includes(ui.lens) ? ui.lens : lenses.includes('methods') ? 'methods' : lenses[0];

  const neighbors = useMemo(() => {
    if (!loadedDetail || selected == null) return null;
    const copies = new Set([...(model.papers[selected].duplicates ?? []), ...(loadedDetail.duplicates ?? []).map((d) => d.paper_id)]);
    const out: number[] = [];
    for (const n of loadedDetail.neighbors[lens] ?? []) {
      const j = model.idToIndex.get(n.paper_id);
      if (j != null && j !== selected && !copies.has(n.paper_id)) out.push(j);
    }
    return Int32Array.from(out);
  }, [loadedDetail, lens, model, selected]);

  const mask = useMemo(() => computeMask(model, ui.filters), [model, ui.filters]);
  const attentionBits = useMemo(() => FLAG_ORDER.reduce((bits, f, k) => (ui.attentionFlags.includes(f) ? bits | (1 << k) : bits), 0), [ui.attentionFlags]);

  const scene: MapScene = useMemo(
    () => ({
      colorBy,
      showLinks: ui.showLinks,
      tokens,
      cited: cited?.answers ?? null,
      attentionBits,
      mask,
      selected,
      neighbors,
      focus: ui.focus,
      group,
    }),
    [colorBy, ui.showLinks, tokens, cited, attentionBits, mask, selected, neighbors, ui.focus, group]
  );

  // tooltip line for the active color mode (it repeats the encoding, never replaces it)
  const describe = useCallback(
    (i: number): string | null => {
      if (colorBy === 'cited' && cited) {
        const a = cited.answers[i];
        if (!a) return 'Not cited by ARC yet';
        const last = cited.lastCited[i];
        return `Cited in ${formatCount(a)} ${a === 1 ? 'answer' : 'answers'}${last ? ` · last ${formatDate(last)}` : ''}`;
      }
      if (colorBy === 'attention') {
        const flags = FLAG_ORDER.filter((f) => hasFlag(model, i, f));
        return flags.length ? `Needs attention: ${flags.map((f) => FLAG_LABEL[f]).join(', ')}` : 'No needs-attention flags';
      }
      return null;
    },
    [colorBy, cited, model]
  );

  // camera requests from search, the table, panel rows and other tabs
  useEffect(() => {
    if (ui.fly) mapRef.current?.flyTo(ui.fly.index);
  }, [ui.fly]);
  useEffect(() => {
    if (ui.fitGroup) mapRef.current?.fitTo(groupMembers(model, ui.fitGroup.group));
  }, [ui.fitGroup, model]);

  // Escape closes the topmost layer (PDF viewer > overlay > map panel); "/" focuses search
  const keysRef = useRef({ pdfOpen: false, overlay: false, panel: false, onMap: true });
  useEffect(() => {
    keysRef.current = { pdfOpen: !!app.viewingPdfId, overlay: !!ui.overlay, panel: !!ui.panel, onMap: ui.tab === 'map' };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.key === 'Escape') {
        if (k.pdfOpen) setViewingPdf(null);
        else if (k.overlay) dispatch({ type: 'closeOverlay' });
        else if (k.panel && k.onMap) dispatch({ type: 'closePanel' });
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (k.overlay || k.pdfOpen || !k.onMap) return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setViewingPdf]);

  // ------------------------------------------------------------ actions
  const openPdf = useCallback((paperId: string, page: number | null) => setViewingPdf(paperId, page ?? null), [setViewingPdf]);
  // With the bottom sheet the map shrinks under the clicked point, so center it.
  const onPointClick = useCallback(
    (index: number) => dispatch({ type: 'selectPaper', index, push: ui.panel?.kind === 'group', fly: sheetLayout }),
    [ui.panel, sheetLayout]
  );
  const onLabelClick = useCallback((g: GroupRef) => dispatch({ type: 'openGroup', group: g }), []);
  const onBackgroundClick = useCallback(() => dispatch({ type: 'closePanel' }), []);
  const onFocus = useCallback((index: number | null) => dispatch({ type: 'focus', index }), []);
  const flyToPaper = useCallback((index: number) => dispatch({ type: 'selectPaper', index, fly: true }), []);
  const openPassages = useCallback((ids: string[], title: string, subtitle?: string) => dispatch({ type: 'openPassages', ids, title, subtitle }), []);

  const panelTitle = (p: Panel): string =>
    p.kind === 'paper' ? truncate(model.papers[p.index]?.title || 'paper', 34) : truncate(groupLabel(model, p.group), 34);
  const previous = ui.history.length ? ui.history[ui.history.length - 1] : null;
  const back = previous ? () => dispatch({ type: 'back' }) : undefined;
  const backLabel = previous ? `Back to ${panelTitle(previous)}` : undefined;

  const header = data.header;
  const status = [
    `${formatCount(header?.n_papers ?? model.n)} papers`,
    header?.built_at ? `built ${formatBuiltAt(header.built_at)}` : null,
    header?.collection ? `${header.collection}${header.embedding_model ? ` (${header.embedding_model})` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const dup = header?.duplicates;
  const caveat = [
    PROJECTION_CAVEAT,
    header?.n_papers_skipped ? `${formatCount(header.n_papers_skipped)} indexed papers had no usable vector and are not on the map.` : '',
    dup && dup.groups
      ? `${formatCount(dup.papers)} papers are near-identical copies of each other (${formatCount(dup.groups)} groups, content cosine ≥ ${dup.threshold}); copies sit on the same spot and are left out of neighbor lists.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-gray-900">
      <div className="shrink-0 space-y-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
          <div className="flex items-center gap-2">
            <Waypoints className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Library Map</h1>
          </div>
          <p className="flex min-w-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{status}</span>
            <InfoTip text={caveat} label="How to read the library map" />
          </p>
        </div>
        <FilterBar
          model={model}
          tab={ui.tab}
          onTab={(tab) => dispatch({ type: 'tab', tab })}
          view={ui.view}
          onView={(view) => dispatch({ type: 'view', view })}
          colorBy={colorBy}
          onColorBy={(c) => dispatch({ type: 'colorBy', colorBy: c })}
          citedAvailable={cited != null}
          showLinks={ui.showLinks}
          onLinks={(on) => dispatch({ type: 'links', on })}
          filters={ui.filters}
          onFilters={(patch) => dispatch({ type: 'filters', patch })}
          onResetFilters={() => dispatch({ type: 'resetFilters' })}
          attentionFlags={ui.attentionFlags}
          onAttentionFlags={(flags) => dispatch({ type: 'attentionFlags', flags })}
          tableFlaggedOnly={ui.tableFlaggedOnly}
          onTableFlaggedOnly={(on) => dispatch({ type: 'tableFlaggedOnly', on })}
          search={ui.search}
          onSearch={(value) => dispatch({ type: 'search', value })}
          onPick={flyToPaper}
          onPreview={onFocus}
          searchRef={searchRef}
        />
      </div>

      {/* Map tab: always mounted so the camera survives a tab switch */}
      <div className={ui.tab === 'map' ? 'relative flex min-h-0 flex-1 flex-col md:flex-row' : 'hidden'}>
        <div className="relative min-h-0 min-w-0 flex-1">
          <div className={ui.view === 'map' ? 'absolute inset-0' : 'hidden'}>
            <MapCanvas
              ref={mapRef}
              model={model}
              scene={scene}
              reducedMotion={reducedMotion}
              onPointClick={onPointClick}
              onLabelClick={onLabelClick}
              onBackgroundClick={onBackgroundClick}
              describe={describe}
              ariaLabel={`Map of ${formatCount(model.n)} papers by content. Use the table view for an accessible list.`}
            >
              <MapLegend
                model={model}
                tokens={tokens}
                colorBy={colorBy}
                groupLabel={group ? groupLabel(model, group) : null}
                lensLabel={selected != null && neighbors ? LENS_LABEL[lens] : null}
                filtered={mask != null}
                cited={cited}
                attentionFlags={ui.attentionFlags}
                compact={compactChrome}
              />
              <ZoomControls
                onZoomIn={() => mapRef.current?.zoomBy(1.6)}
                onZoomOut={() => mapRef.current?.zoomBy(1 / 1.6)}
                onReset={() => mapRef.current?.resetView()}
                onLocate={selected != null ? () => mapRef.current?.flyTo(selected) : undefined}
                compact={compactChrome}
              />
            </MapCanvas>
          </div>
          {ui.view === 'table' && (
            <div className="absolute inset-0">
              <PaperTable
                model={model}
                mask={mask}
                search={ui.search}
                selected={selected}
                cited={cited}
                onlyFlags={ui.tableFlaggedOnly ? ui.attentionFlags : null}
                onSelect={flyToPaper}
              />
            </div>
          )}
        </div>

        {ui.panel && (
          <aside
            className="flex h-1/2 min-h-0 shrink-0 flex-col border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:h-auto md:w-[380px] md:border-l md:border-t-0"
            aria-label={ui.panel.kind === 'paper' ? 'Paper details' : 'Topic details'}
          >
            {ui.panel.kind === 'paper' ? (
              <PaperPanel
                key={model.papers[ui.panel.index].id}
                model={model}
                index={ui.panel.index}
                detail={detail}
                lens={lens}
                lenses={lenses}
                cited={cited}
                onLensChange={(l) => dispatch({ type: 'lens', lens: l })}
                onHoverPaper={onFocus}
                onSelectPaper={(j) => dispatch({ type: 'selectPaper', index: j, fly: true, push: true })}
                onCompare={(j) => selected != null && dispatch({ type: 'openCompare', a: selected, b: j })}
                onOpenPassages={() => {
                  if (selected == null) return;
                  const p = model.papers[selected];
                  const near = (loadedDetail?.neighbors.content ?? [])
                    .map((n) => n.paper_id)
                    .filter((id) => model.idToIndex.has(id) && id !== p.id)
                    .slice(0, 5);
                  openPassages(
                    [p.id, ...near],
                    'Passage map',
                    `“${truncate(p.title || p.id, 80)}” and its ${near.length} nearest content neighbors. Every passage is a point; passages that read alike sit together.`
                  );
                }}
                onOpenGroup={(g) => dispatch({ type: 'openGroup', group: g, push: true })}
                onOpenPdf={(page) => selectedId && openPdf(selectedId, page)}
                onOpenPaperPdf={(id) => openPdf(id, null)}
                onAsk={ask}
                onLocate={() => selected != null && mapRef.current?.flyTo(selected)}
                onClose={() => dispatch({ type: 'closePanel' })}
                onBack={back}
                backLabel={backLabel}
              />
            ) : (
              <GroupPanel
                key={groupKey(ui.panel.group)}
                model={model}
                group={ui.panel.group}
                tokens={tokens}
                cited={cited}
                onSelectPaper={(i) => dispatch({ type: 'selectPaper', index: i, fly: true, push: true })}
                onOpenGroup={(g) => dispatch({ type: 'openGroup', group: g, push: true })}
                onOpenPassages={openPassages}
                onHoverPaper={onFocus}
                onAsk={ask}
                onClose={() => dispatch({ type: 'closePanel' })}
                onBack={back}
                backLabel={backLabel}
              />
            )}
          </aside>
        )}
      </div>

      {ui.visited.includes('overview') && (
        <div className={ui.tab === 'overview' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <OverviewTab
            model={model}
            mask={mask}
            tokens={tokens}
            cited={cited}
            footprintLoading={footprintLoading}
            onShowTopic={(g) => dispatch({ type: 'openGroup', group: g, showOnMap: true })}
            onShowAttention={() => dispatch({ type: 'showAttention' })}
            onSelectPaper={flyToPaper}
            onCompare={(a, b) => dispatch({ type: 'openCompare', a, b })}
            onOpenPassages={openPassages}
            onAsk={ask}
          />
        </div>
      )}

      {ui.visited.includes('engineering') && (
        <div className={ui.tab === 'engineering' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <EngineeringTab
            model={model}
            tokens={tokens}
            reducedMotion={reducedMotion}
            compact={compactChrome}
            onShowOnMap={flyToPaper}
            onOpenPdf={(id) => openPdf(id, null)}
          />
        </div>
      )}

      {ui.overlay?.kind === 'compare' && (
        <CompareView
          model={model}
          a={ui.overlay.a}
          b={ui.overlay.b}
          tokens={tokens}
          reducedMotion={reducedMotion}
          onClose={() => dispatch({ type: 'closeOverlay' })}
          onOpenPdf={openPdf}
          onAsk={ask}
        />
      )}
      {ui.overlay?.kind === 'passages' && (
        <PassageOverlay
          model={model}
          ids={ui.overlay.ids}
          title={ui.overlay.title}
          subtitle={ui.overlay.subtitle}
          tokens={tokens}
          reducedMotion={reducedMotion}
          onClose={() => dispatch({ type: 'closeOverlay' })}
          onOpenPdf={openPdf}
          onSelectPaper={(i) => {
            dispatch({ type: 'closeOverlay' });
            dispatch({ type: 'selectPaper', index: i, fly: true });
          }}
          onAsk={ask}
        />
      )}
    </div>
  );
}
