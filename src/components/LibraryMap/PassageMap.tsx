import { useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { Maximize2, Minus, Plus, RefreshCw } from 'lucide-react';
import type { SectionRole } from '../../types';
import { easeInOutCubic } from './camera';
import { INFERRED_NOTE, PROJECTION_CAVEAT, formatCount, sectionLabel, truncate } from './format';
import type { MapModel } from './mapModel';
import { PassageRenderer, type PassageScene } from './passageRenderer';
import { describeError, passagesKey, passagesStore, useLatestResource, useResource } from './resource';
import { RoleLegend } from './RoleLegend';
import type { MapTokens } from './tokens';
import { IconButton, InfoTip, SegmentedControl, Spinner, Swatch } from './ui';

interface PassageMapProps {
  model: MapModel;
  /** 1..12 paper ids; with variant 'compare' exactly [A, B] */
  ids: string[];
  tokens: MapTokens;
  variant: 'compare' | 'set';
  roleLabel: Record<SectionRole, string>;
  /** chunk ids to emphasize (hovered passage pair) */
  highlightChunks?: ReadonlySet<string> | null;
  onOpenPdf: (paperId: string, page: number | null) => void;
  reducedMotion: boolean;
  /** CSS height of the plot */
  height?: string;
}

const COLOR_OPTIONS = [
  { value: 'paper' as const, label: 'Paper' },
  { value: 'role' as const, label: 'Section role' },
];

export function PassageMap({
  model,
  ids,
  tokens,
  variant,
  roleLabel,
  highlightChunks = null,
  onOpenPdf,
  reducedMotion,
  height = '420px',
}: PassageMapProps) {
  // Role color by default in both variants: in the compare view the barcodes and
  // passage chips already spend the three hues on roles, so coloring the map by
  // paper would give orange two meanings on one screen. A/B identity rides on
  // shape (filled dot / ring) there, matching the A/B marks used across the view.
  const [colorBy, setColorBy] = useState<'paper' | 'role'>('role');
  const [includeCaptions, setIncludeCaptions] = useState(false);
  const [highlightPaper, setHighlightPaper] = useState(0);
  const key = passagesKey(ids, includeCaptions);
  const state = useResource(passagesStore, key);
  const latest = useLatestResource(passagesStore, key);
  const current = state?.status === 'success' ? state.data : undefined;
  const shown = current ?? latest;
  const loading = !state || state.status === 'loading';
  const error = state?.status === 'error' ? describeError(state.error) : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTextRef = useRef<HTMLDivElement>(null);
  const tipMetaRef = useRef<HTMLDivElement>(null);
  const tipNoteRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PassageRenderer | null>(null);
  const controlsRef = useRef<{ zoomBy: (f: number) => void; reset: () => void; resetNow: () => void } | null>(null);
  const openRef = useRef(onOpenPdf);
  const motionRef = useRef(reducedMotion);
  const idsRef = useRef(ids);
  const labelsRef = useRef(roleLabel);

  const nPapers = ids.length;
  const shapeByPaper = variant === 'compare' && nPapers === 2 && colorBy === 'role';
  const scene: PassageScene = useMemo(
    () => ({ tokens, colorBy, highlightPaper, shapeByPaper, highlight: highlightChunks }),
    [tokens, colorBy, highlightPaper, shapeByPaper, highlightChunks]
  );
  const sceneRef = useRef(scene);

  useEffect(() => {
    openRef.current = onOpenPdf;
    motionRef.current = reducedMotion;
    idsRef.current = ids;
    labelsRef.current = roleLabel;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tip = tipRef.current;
    const tipText = tipTextRef.current;
    const tipMeta = tipMetaRef.current;
    const tipNote = tipNoteRef.current;
    if (!canvas || !container || !tip || !tipText || !tipMeta || !tipNote) return;
    const renderer = new PassageRenderer(canvas, sceneRef.current);
    rendererRef.current = renderer;
    const sel = select<HTMLCanvasElement, unknown>(canvas);
    let raf = 0;
    const hideTip = () => {
      tip.style.display = 'none';
    };
    const zb = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.7, 40])
      .clickDistance(4)
      .on('start', (e: { sourceEvent: Event | null }) => {
        if (e.sourceEvent && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        hideTip();
      })
      .on('zoom', (e: { transform: ZoomTransform }) => renderer.setTransform(e.transform));
    sel.call(zb).on('dblclick.zoom', null);
    let zoomNow = zoomIdentity;
    zb.on('zoom.track', (e: { transform: ZoomTransform }) => {
      zoomNow = e.transform;
    });
    const animate = (target: ZoomTransform, ms: number) => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      const t0 = zoomNow;
      if (motionRef.current) {
        zb.transform(sel, target);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / ms);
        const e = easeInOutCubic(p);
        const k = t0.k * Math.pow(target.k / t0.k, e);
        const x = t0.x + (target.x - t0.x) * e;
        const y = t0.y + (target.y - t0.y) * e;
        zb.transform(sel, zoomIdentity.translate(x, y).scale(k));
        raf = p < 1 ? requestAnimationFrame(tick) : 0;
      };
      raf = requestAnimationFrame(tick);
    };
    const zoomAround = (f: number, x: number, y: number) => {
      const k = Math.max(0.7, Math.min(40, zoomNow.k * f));
      animate(zoomIdentity.translate(x - ((x - zoomNow.x) * k) / zoomNow.k, y - ((y - zoomNow.y) * k) / zoomNow.k).scale(k), 240);
    };
    controlsRef.current = {
      zoomBy: (f) => {
        const { width, height: h } = renderer.size;
        zoomAround(f, width / 2, h / 2);
      },
      reset: () => animate(zoomIdentity, 400),
      resetNow: () => zb.transform(sel, zoomIdentity),
    };
    const ro = new ResizeObserver(() => {
      renderer.setSize(container.clientWidth, container.clientHeight, window.devicePixelRatio || 1);
    });
    ro.observe(container);
    renderer.setSize(container.clientWidth, container.clientHeight, window.devicePixelRatio || 1);

    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons) {
        renderer.setHover(null);
        hideTip();
        return;
      }
      const [x, y] = local(e);
      const hit = renderer.hitTest(x, y);
      if (!hit) {
        renderer.setHover(null);
        hideTip();
        canvas.style.cursor = 'grab';
        return;
      }
      const p = renderer.point(hit.index);
      if (!p) return;
      renderer.setHover(hit.index);
      canvas.style.cursor = 'pointer';
      const paperIdx = renderer.paperIndexOf(hit.index);
      const paper = model.papers[model.idToIndex.get(p.paper_id) ?? -1];
      const tag = idsRef.current.length === 2 ? `${paperIdx === 0 ? 'A' : 'B'} · ` : '';
      tipText.textContent = p.text;
      tipMeta.textContent = `${tag}${truncate(paper?.title ?? p.paper_id, 60)} · ${sectionLabel(p.section)} (${labelsRef.current[p.role] ?? p.role})${p.page != null ? ` · p. ${p.page}` : ''}${p.chunk_type === 'caption' ? ' · caption' : p.chunk_type === 'table' ? ' · table' : ''}`;
      tipNote.textContent = p.role_inferred ? INFERRED_NOTE : '';
      tipNote.style.display = p.role_inferred ? 'block' : 'none';
      tip.style.display = 'block';
      const W = container.clientWidth;
      const H = container.clientHeight;
      let left = hit.x + 14;
      let top = hit.y + 14;
      if (left + tip.offsetWidth > W - 6) left = Math.max(6, hit.x - 14 - tip.offsetWidth);
      if (top + tip.offsetHeight > H - 6) top = Math.max(6, hit.y - 14 - tip.offsetHeight);
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const onLeave = () => {
      renderer.setHover(null);
      hideTip();
    };
    const onClick = (e: MouseEvent) => {
      const [x, y] = local(e);
      const hit = renderer.hitTest(x, y);
      const p = hit ? renderer.point(hit.index) : undefined;
      if (p) openRef.current(p.paper_id, p.page ?? null);
    };
    const onDbl = (e: MouseEvent) => {
      e.preventDefault();
      const [x, y] = local(e);
      zoomAround(e.shiftKey ? 0.5 : 2, x, y);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDbl);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('dblclick', onDbl);
      sel.on('.zoom', null);
      renderer.destroy();
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    sceneRef.current = scene;
    rendererRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    if (!shown) return;
    rendererRef.current?.setData(shown.points, ids);
    // a new projection is a new layout: start from the full view
    controlsRef.current?.resetNow();
  }, [shown, ids]);

  const papers = ids.map((id) => model.papers[model.idToIndex.get(id) ?? -1]);
  const perPaper = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of shown?.points ?? []) counts.set(p.paper_id, (counts.get(p.paper_id) ?? 0) + 1);
    return counts;
  }, [shown]);
  const truncatedTotal = shown ? Object.values(shown.truncated ?? {}).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const hasInferred = !!shown?.points.some((p) => p.role_inferred);
  const empty = !!current && current.points.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl options={COLOR_OPTIONS} value={colorBy} onChange={setColorBy} label="Color passages by" />
        {colorBy === 'paper' && nPapers > 3 && (
          <label className="flex min-w-0 items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            <span className="shrink-0">Highlight</span>
            <select
              value={highlightPaper}
              onChange={(e) => setHighlightPaper(Number(e.target.value))}
              className="min-w-0 max-w-[16rem] truncate rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {papers.map((p, i) => (
                <option key={ids[i]} value={i}>
                  {truncate(p?.title ?? ids[i], 70)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            name="include-captions"
            checked={includeCaptions}
            onChange={(e) => setIncludeCaptions(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
          />
          Include captions
        </label>
        <span className="ml-auto flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          {shown && (
            <span>
              {formatCount(shown.points.length)} passages · {shown.method === 'tsne' ? 't-SNE' : shown.method === 'pca' ? 'PCA' : shown.method} ·{' '}
              {shown.seconds.toFixed(1)} s
              {truncatedTotal > 0 && ` · ${formatCount(truncatedTotal)} not shown (cap)`}
            </span>
          )}
          <InfoTip text={`${PROJECTION_CAVEAT} Passages are sampled evenly through each paper when over the per-paper cap.`} label="About the passage map" />
        </span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700" style={{ height }}>
        <div ref={containerRef} className={`absolute inset-0 transition-opacity ${loading && shown ? 'opacity-40' : ''}`}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Passage map of ${nPapers} paper${nPapers === 1 ? '' : 's'}: each point is a passage; nearby points read alike.`}
            className="block touch-none select-none"
            style={{ cursor: 'grab' }}
          />
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none absolute left-0 top-0 z-10 hidden max-w-[20rem] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <div ref={tipTextRef} className="text-sm leading-snug text-gray-900 line-clamp-5 dark:text-gray-100" />
            <div ref={tipMetaRef} className="mt-1 text-xs text-gray-600 dark:text-gray-400" />
            <div ref={tipNoteRef} className="mt-0.5 hidden text-xs italic text-gray-600 dark:text-gray-400" />
          </div>
        </div>
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-lg bg-white/90 px-3 py-1.5 shadow-sm dark:bg-gray-800/90">
              <Spinner label={shown ? 'Re-projecting passages…' : `Projecting the passages of ${nPapers} paper${nPapers === 1 ? '' : 's'}…`} />
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/85 p-4 dark:bg-gray-900/85">
            <div className="max-w-sm text-center text-sm text-gray-700 dark:text-gray-300">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {error.status === 503
                  ? 'Vector store unavailable'
                  : error.status === 404
                    ? 'Not in the library map'
                    : error.network
                      ? 'Could not reach the server'
                      : 'Could not load passages'}
              </p>
              <p className="mt-1">
                {error.status === 503
                  ? 'Passage vectors are read live from Qdrant. Start the vector store and retry.'
                  : error.status === 404
                    ? 'One of these papers is not in the map, or the map has not been built.'
                    : error.message}
              </p>
              <button
                type="button"
                onClick={() => passagesStore.load(key, true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          </div>
        )}
        {empty && !loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-gray-600 dark:text-gray-400">
            {includeCaptions ? 'These papers have no passages to project.' : 'No body-text passages to project. Try including captions.'}
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex flex-col gap-1 rounded-lg border border-gray-200 bg-white/90 p-0.5 shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
          <IconButton label="Zoom in" onClick={() => controlsRef.current?.zoomBy(1.6)}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => controlsRef.current?.zoomBy(1 / 1.6)}>
            <Minus className="h-4 w-4" />
          </IconButton>
          <IconButton label="Reset view" onClick={() => controlsRef.current?.reset()}>
            <Maximize2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* legend: always present when color encodes >= 2 categories */}
      {colorBy === 'paper' ? (
        nPapers <= 3 ? (
          <ul className="flex flex-col gap-1 text-xs text-gray-700 dark:text-gray-300" aria-label="Papers">
            {papers.map((p, i) => (
              <li key={ids[i]} className="flex min-w-0 items-center gap-1.5">
                <Swatch color={tokens.series[Math.min(2, i)]} shape="dot" />
                {variant === 'compare' && <span className="font-semibold">{i === 0 ? 'A' : 'B'}</span>}
                <span className="truncate">{p?.title ?? ids[i]}</span>
                <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{formatCount(perPaper.get(ids[i]) ?? 0)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
            <li className="flex min-w-0 items-center gap-1.5">
              <Swatch color={tokens.series[0]} shape="dot" />
              <span className="truncate">{truncate(papers[highlightPaper]?.title ?? ids[highlightPaper] ?? '', 80)}</span>
            </li>
            <li className="flex items-center gap-1.5">
              <Swatch color={tokens.neutral} shape="dot" />
              The other {nPapers - 1} papers
            </li>
          </ul>
        )
      ) : (
        <div className="flex flex-col gap-1">
          <RoleLegend tokens={tokens} roleLabel={roleLabel} showInferred={hasInferred} inferenceAccuracy={model.data.header?.role_inference?.holdout_accuracy} />
          {shapeByPaper && (
            <ul className="flex flex-wrap gap-x-3 text-xs text-gray-700 dark:text-gray-300" aria-label="Papers">
              <li className="flex items-center gap-1.5">
                <Swatch color={tokens.inkSecondary} shape="dot" /> A: {truncate(papers[0]?.title ?? ids[0], 48)}
              </li>
              <li className="flex items-center gap-1.5">
                <Swatch color={tokens.inkSecondary} shape="ring" /> B: {truncate(papers[1]?.title ?? ids[1], 48)}
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
