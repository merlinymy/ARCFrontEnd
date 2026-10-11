import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import { dataX, dataY, easeInOutCubic, worldX, worldY } from './camera';
import { copiesLabel, firstAuthor, formatCount, formatYear } from './format';
import type { GroupRef, MapModel } from './mapModel';
import { MapRenderer, type MapScene, type Rect } from './mapRenderer';

export interface MapCanvasHandle {
  /** Smoothly center (and zoom in on) a paper. */
  flyTo: (index: number) => void;
  /** Frame a set of papers (a topic): the central 90% of them, so outliers don't zoom it out. */
  fitTo: (indices: ArrayLike<number>) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
}

interface MapCanvasProps {
  model: MapModel;
  scene: MapScene;
  reducedMotion: boolean;
  onPointClick: (index: number) => void;
  onLabelClick: (group: GroupRef) => void;
  onBackgroundClick: () => void;
  /** optional third tooltip line for a paper (citations, flags) */
  describe?: (index: number) => string | null;
  ariaLabel: string;
  /** overlays (legend, zoom controls); mark them data-map-obstacle so labels avoid them */
  children?: ReactNode;
  ref?: Ref<MapCanvasHandle>;
}

type View = [number, number, number];
const SCALE_EXTENT: [number, number] = [0.6, 80];
const clampK = (k: number) => Math.max(SCALE_EXTENT[0], Math.min(SCALE_EXTENT[1], k));
/** camera reset duration cap */
const RESET_MS = 700;

export function MapCanvas({
  model,
  scene,
  reducedMotion,
  onPointClick,
  onLabelClick,
  onBackgroundClick,
  describe,
  ariaLabel,
  children,
  ref,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTitleRef = useRef<HTMLDivElement>(null);
  const tipMetaRef = useRef<HTMLDivElement>(null);
  const tipExtraRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const sceneRef = useRef(scene);
  const motionRef = useRef(reducedMotion);
  const handlersRef = useRef({ onPointClick, onLabelClick, onBackgroundClick, describe });
  const apiRef = useRef<MapCanvasHandle | null>(null);

  useEffect(() => {
    handlersRef.current = { onPointClick, onLabelClick, onBackgroundClick, describe };
    motionRef.current = reducedMotion;
  });

  // Scene first, so the renderer created below starts from the latest scene.
  useEffect(() => {
    sceneRef.current = scene;
    rendererRef.current?.setScene(scene);
  }, [scene]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (index) => apiRef.current?.flyTo(index),
      fitTo: (indices) => apiRef.current?.fitTo(indices),
      zoomBy: (factor) => apiRef.current?.zoomBy(factor),
      resetView: () => apiRef.current?.resetView(),
    }),
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tip = tipRef.current;
    const tipTitle = tipTitleRef.current;
    const tipMeta = tipMetaRef.current;
    const tipExtra = tipExtraRef.current;
    if (!canvas || !container || !tip || !tipTitle || !tipMeta || !tipExtra) return;

    const renderer = new MapRenderer(canvas, model, sceneRef.current);
    rendererRef.current = renderer;
    const selection = select<HTMLCanvasElement, unknown>(canvas);

    // ---------------------------------------------------------- tooltip
    const hideTip = () => {
      tip.style.display = 'none';
    };
    const showTip = (title: string, meta: string, x: number, y: number, extra: string | null = null) => {
      tipTitle.textContent = title;
      tipMeta.textContent = meta;
      tipExtra.textContent = extra ?? '';
      tipExtra.style.display = extra ? 'block' : 'none';
      tip.style.display = 'block';
      const { width: W, height: H } = renderer.size;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let left = x + 14;
      let top = y + 14;
      if (left + w > W - 6) left = Math.max(6, x - 14 - w);
      if (top + h > H - 6) top = Math.max(6, y - 14 - h);
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const paperTip = (i: number, x: number, y: number) => {
      const p = model.papers[i];
      // copies sit on the same spot, so the tooltip is the only place they show (v1.2-E)
      const copies = p.duplicates?.length ?? 0;
      showTip(
        p.title || p.id,
        `${formatYear(p.year)} · ${firstAuthor(p.authors ?? [], p.n_authors ?? 0)}${copies ? ` · +${copiesLabel(copies)}` : ''}`,
        x,
        y,
        handlersRef.current.describe?.(i) ?? null
      );
    };

    // ---------------------------------------------------------- camera
    let camRaf = 0;
    const cancelCamera = () => {
      if (camRaf) cancelAnimationFrame(camRaf);
      camRaf = 0;
    };
    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .clickDistance(4)
      .on('start', (event: { sourceEvent: Event | null }) => {
        if (event.sourceEvent) cancelCamera();
        hideTip();
      })
      .on('zoom', (event: { transform: ZoomTransform }) => {
        renderer.setTransform(event.transform);
      });
    selection.call(zoomBehavior).on('dblclick.zoom', null);

    const apply = (t: ZoomTransform) => zoomBehavior.transform(selection, t);
    const animate = (step: (e: number) => ZoomTransform, duration: number) => {
      cancelCamera();
      if (motionRef.current || duration <= 0) {
        apply(step(1));
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        apply(step(easeInOutCubic(p)));
        camRaf = p < 1 ? requestAnimationFrame(tick) : 0;
      };
      camRaf = requestAnimationFrame(tick);
    };
    const viewOf = (t: ZoomTransform): View => {
      const { width: W, height: H } = renderer.size;
      return [(W / 2 - t.x) / t.k, (H / 2 - t.y) / t.k, W / t.k];
    };
    const transformOf = ([cx, cy, w]: View): ZoomTransform => {
      const { width: W, height: H } = renderer.size;
      const k = W / w;
      return zoomIdentity.translate(W / 2 - cx * k, H / 2 - cy * k).scale(k);
    };
    const animateTo = (target: ZoomTransform, maxMs: number) => {
      const interp = interpolateZoom(viewOf(renderer.getTransform()), viewOf(target));
      animate((e) => (e >= 1 ? target : transformOf(interp(e) as View)), Math.min(maxMs, Math.max(250, interp.duration * 0.6)));
    };
    const zoomAround = (factor: number, x: number, y: number, ms: number) => {
      const t0 = renderer.getTransform();
      const k1 = clampK(t0.k * factor);
      animate((e) => {
        const k = t0.k * Math.pow(k1 / t0.k, e);
        return zoomIdentity.translate(x - ((x - t0.x) * k) / t0.k, y - ((y - t0.y) * k) / t0.k).scale(k);
      }, ms);
    };
    // A camera request made while the canvas is hidden (another tab, the table
    // view) has no size to work with; it runs on the first resize instead.
    let pending: (() => void) | null = null;
    const flyTo = (index: number) => {
      if (index < 0 || index >= model.n) return;
      const pos = model.pos;
      if (!Number.isFinite(pos[2 * index]) || !Number.isFinite(pos[2 * index + 1])) return;
      const t0 = renderer.getTransform();
      const fit0 = renderer.getFit();
      const { width: W, height: H } = renderer.size;
      if (!W || !container.clientWidth) {
        pending = () => flyTo(index);
        return;
      }
      // Interpolate the center in data space and the zoom against a fixed reference
      // width, so a panel opening mid-flight (canvas resize) neither jolts the camera
      // nor changes where it lands: the flight always ends centered at targetK.
      const ref = W / fit0.s;
      const from: View = [dataX(fit0, (W / 2 - t0.x) / t0.k), dataY(fit0, (H / 2 - t0.y) / t0.k), ref / t0.k];
      const targetK = clampK(Math.min(14, Math.max(t0.k, 4)));
      const to: View = [pos[2 * index], pos[2 * index + 1], ref / targetK];
      const interp = interpolateZoom(from, to);
      animate((e) => {
        const [dx, dy, dw] = interp(e) as View;
        const fit = renderer.getFit();
        const { width, height } = renderer.size;
        const k = ref / dw;
        return zoomIdentity.translate(width / 2 - k * worldX(fit, dx), height / 2 - k * worldY(fit, dy)).scale(k);
      }, Math.min(1100, Math.max(420, interp.duration * 0.6)));
    };
    const fitTo = (indices: ArrayLike<number>) => {
      // The request usually comes with a layout change in the same commit (tab switch,
      // panel opening) that the ResizeObserver hasn't reported yet: measure now, so the
      // target is computed for the size the canvas actually has.
      if (container.clientWidth) resize();
      const { width: W, height: H } = renderer.size;
      if (!W || !container.clientWidth) {
        pending = () => fitTo(indices);
        return;
      }
      const fit = renderer.getFit();
      const xs: number[] = [];
      const ys: number[] = [];
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        const x = model.pos[2 * i];
        const y = model.pos[2 * i + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        xs.push(worldX(fit, x));
        ys.push(worldY(fit, y));
      }
      if (!xs.length) return;
      xs.sort((a, b) => a - b);
      ys.sort((a, b) => a - b);
      const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
      const x0 = q(xs, 0.05);
      const x1 = q(xs, 0.95);
      const y0 = q(ys, 0.05);
      const y1 = q(ys, 0.95);
      const pad = W < 520 ? 24 : 56;
      const k = clampK(Math.min(8, (W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad) / Math.max(1, y1 - y0)));
      animateTo(zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k), RESET_MS);
    };
    apiRef.current = {
      flyTo,
      fitTo,
      zoomBy: (factor) => {
        const { width, height } = renderer.size;
        zoomAround(factor, width / 2, height / 2, 240);
      },
      resetView: () => animateTo(zoomIdentity, RESET_MS),
    };

    // ---------------------------------------------------------- size, dpr, obstacles
    const measureObstacles = () => {
      const base = canvas.getBoundingClientRect();
      const rects: Rect[] = [];
      container.querySelectorAll<HTMLElement>('[data-map-obstacle]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) rects.push({ x: r.left - base.left - 6, y: r.top - base.top - 6, w: r.width + 12, h: r.height + 12 });
      });
      renderer.setObstacles(rects);
    };
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const prev = renderer.size;
      const t = renderer.getTransform();
      const fitPrev = renderer.getFit();
      const isIdentity = t.k === 1 && t.x === 0 && t.y === 0;
      const center = prev.width > 1 ? [dataX(fitPrev, (prev.width / 2 - t.x) / t.k), dataY(fitPrev, (prev.height / 2 - t.y) / t.k)] : null;
      if (!renderer.setSize(w, h, window.devicePixelRatio || 1)) return;
      zoomBehavior.translateExtent([
        [-w * 0.75, -h * 0.75],
        [w * 1.75, h * 1.75],
      ]);
      if (center && !isIdentity && (prev.width !== w || prev.height !== h)) {
        const fit = renderer.getFit();
        apply(zoomIdentity.translate(w / 2 - t.k * worldX(fit, center[0]), h / 2 - t.k * worldY(fit, center[1])).scale(t.k));
      }
      measureObstacles();
      if (pending) {
        const run = pending;
        pending = null;
        run();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    const observeObstacles = () => container.querySelectorAll<HTMLElement>('[data-map-obstacle]').forEach((el) => ro.observe(el));
    observeObstacles();
    const mo = new MutationObserver(() => {
      observeObstacles();
      measureObstacles();
    });
    mo.observe(container, { childList: true, subtree: true });
    let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onDprChange = () => {
      dprQuery.removeEventListener('change', onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener('change', onDprChange);
      const { width, height } = renderer.size;
      renderer.setSize(width, height, window.devicePixelRatio || 1);
    };
    dprQuery.addEventListener('change', onDprChange);
    resize();

    // ---------------------------------------------------------- pointer & keys
    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (e.buttons) {
        renderer.setHover(null, null);
        hideTip();
        canvas.style.cursor = 'grabbing';
        return;
      }
      const [x, y] = local(e);
      const hit = renderer.hitTest(x, y);
      if (!hit) {
        renderer.setHover(null, null);
        hideTip();
        canvas.style.cursor = 'grab';
      } else if (hit.kind === 'label') {
        renderer.setHover(null, hit.anchor);
        const what = hit.anchor.what ?? (hit.anchor.level === 'fine' ? 'Subtopic' : 'Topic');
        const action = hit.anchor.what ? 'click to filter' : 'click for details';
        showTip(hit.anchor.text, `${what} · ${formatCount(hit.anchor.size)} papers · ${action}`, hit.rect.x + hit.rect.w / 2, hit.rect.y + hit.rect.h);
        canvas.style.cursor = 'pointer';
      } else {
        renderer.setHover(hit.index, null);
        paperTip(hit.index, hit.x, hit.y);
        canvas.style.cursor = 'pointer';
      }
    };
    const onPointerLeave = () => {
      renderer.setHover(null, null);
      hideTip();
    };
    const onClick = (e: MouseEvent) => {
      const [x, y] = local(e);
      const hit = renderer.hitTest(x, y);
      if (hit?.kind === 'point') handlersRef.current.onPointClick(hit.index);
      else if (hit?.kind === 'label') handlersRef.current.onLabelClick(hit.anchor.group);
      else handlersRef.current.onBackgroundClick();
    };
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      const [x, y] = local(e);
      zoomAround(e.shiftKey ? 0.5 : 2, x, y, 300);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const { width, height } = renderer.size;
      const pan = (dx: number, dy: number) => {
        const t = renderer.getTransform();
        animate((p) => zoomIdentity.translate(t.x + dx * p, t.y + dy * p).scale(t.k), 160);
      };
      switch (e.key) {
        case '+':
        case '=':
          zoomAround(1.6, width / 2, height / 2, 240);
          break;
        case '-':
        case '_':
          zoomAround(1 / 1.6, width / 2, height / 2, 240);
          break;
        case '0':
          animateTo(zoomIdentity, RESET_MS);
          break;
        case 'ArrowLeft':
          pan(90, 0);
          break;
        case 'ArrowRight':
          pan(-90, 0);
          break;
        case 'ArrowUp':
          pan(0, 90);
          break;
        case 'ArrowDown':
          pan(0, -90);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('keydown', onKeyDown);

    if (import.meta.env.DEV) {
      const samples: number[] = [];
      renderer.onFrame = (ms) => {
        samples.push(ms);
        if (samples.length > 1200) samples.shift();
      };
      (window as unknown as Record<string, unknown>).__libraryMapDebug = {
        samples,
        setTransform: (k: number, x: number, y: number) => apply(zoomIdentity.translate(x, y).scale(k)),
        flyTo,
        size: () => renderer.size,
        labels: () => renderer.placedLabels(),
        point: (i: number) => renderer.pointPosition(i),
      };
    }

    return () => {
      cancelCamera();
      ro.disconnect();
      mo.disconnect();
      dprQuery.removeEventListener('change', onDprChange);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('keydown', onKeyDown);
      selection.on('.zoom', null);
      renderer.destroy();
      rendererRef.current = null;
      apiRef.current = null;
      if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__libraryMapDebug;
    };
  }, [model]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white dark:bg-gray-900">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        style={{ cursor: 'grab' }}
      />
      <div
        ref={tipRef}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-0 z-20 hidden max-w-[18rem] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <div ref={tipTitleRef} className="text-sm font-medium leading-snug text-gray-900 line-clamp-3 dark:text-gray-100" />
        <div ref={tipMetaRef} className="mt-1 text-xs text-gray-600 dark:text-gray-400" />
        <div ref={tipExtraRef} className="mt-0.5 hidden text-xs text-gray-600 dark:text-gray-400" />
      </div>
      {children}
    </div>
  );
}
