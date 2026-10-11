// Imperative Canvas 2D renderer for the paper map. React never re-renders per
// frame: the page hands over a scene, pointer and zoom events go straight to
// this class, and draws are coalesced into one requestAnimationFrame.
import { zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { computeFit, dataX, dataY, radiusForZoom, worldX, worldY, type Fit } from './camera';
import { ARCHETYPE_ORDER } from './format';
import { citedBin, groupKey, groupMembers, type GroupRef, type LabelAnchor, type MapModel } from './mapModel';
import { SpriteCache, type DotStyle, type Sprite } from './sprites';
import { rampAt, rgba, type MapTokens } from './tokens';

/** 'archetype' (layout type) is used only by the Engineering tab's structure-layout scatter */
export type ColorBy = 'topic' | 'year' | 'cited' | 'attention' | 'archetype';

export interface MapScene {
  colorBy: ColorBy;
  showLinks: boolean;
  tokens: MapTokens;
  /** answers citing each paper (footprint K); null when unavailable */
  cited: Uint16Array | null;
  /** Needs-attention mode: bitmask of the selected flags (FLAG_ORDER bits) */
  attentionBits: number;
  /** 1 = passes the filters; null = nothing filtered */
  mask: Uint8Array | null;
  selected: number | null;
  /** neighbors of the selected paper under the active lens, best first */
  neighbors: Int32Array | null;
  /** one paper to emphasize: a hovered panel row or search result */
  focus: number | null;
  /** cluster whose members are highlighted (open cluster panel) */
  group: GroupRef | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedLabel extends Rect {
  anchor: LabelAnchor;
}

export type MapHit =
  | { kind: 'point'; index: number; x: number; y: number }
  | { kind: 'label'; anchor: LabelAnchor; rect: Rect }
  | null;

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT = {
  coarse: `600 13px ${FONT_FAMILY}`,
  fine: `500 12px ${FONT_FAMILY}`,
  title: `400 11px ${FONT_FAMILY}`,
};
const FONT_PX = { coarse: 13, fine: 12 };
/** zoom at which fine topic labels replace coarse ones */
const FINE_LABEL_K = 2.4;
/** zoom at which individual paper titles start to appear */
const TITLE_LABEL_K = 6;
const HIT_RADIUS = 12;
const YEAR_LEVELS = 40;
const TAU = Math.PI * 2;

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private model: MapModel;
  private scene: MapScene;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private transform: ZoomTransform = zoomIdentity;
  private fit: Fit;
  private screen: Float32Array;
  private styles: DotStyle[] = [];
  private styleOf: Uint16Array;
  /** draw passes: dimmed, base, emphasized */
  private passes: [Int32Array, Int32Array, Int32Array] = [new Int32Array(0), new Int32Array(0), new Int32Array(0)];
  private sprites = new SpriteCache();
  private frameSprites: Sprite[] = [];
  private placed: PlacedLabel[] = [];
  private obstacles: Rect[] = [];
  private hover: number | null = null;
  private hoverLabel: LabelAnchor | null = null;
  private raf = 0;
  private textWidth = new Map<string, number>();
  private fitted = new Map<string, string>();
  private labelOrder: Record<'coarse' | 'fine', LabelAnchor[]>;
  /** called after every frame with its duration (ms) -- dev instrumentation */
  onFrame: ((ms: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, model: MapModel, scene: MapScene) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.model = model;
    this.scene = scene;
    this.screen = new Float32Array(model.n * 2);
    this.styleOf = new Uint16Array(model.n);
    this.fit = computeFit(model.bbox, 1, 1, 0);
    const bySize = (a: LabelAnchor, b: LabelAnchor) => b.size - a.size;
    this.labelOrder = { coarse: [...model.labels.coarse].sort(bySize), fine: [...model.labels.fine].sort(bySize) };
    this.restyle();
  }

  // ------------------------------------------------------------ inputs

  setScene(next: MapScene): void {
    const prev = this.scene;
    this.scene = next;
    if (prev.tokens !== next.tokens) this.sprites.clear();
    if (
      prev.colorBy !== next.colorBy ||
      prev.cited !== next.cited ||
      prev.attentionBits !== next.attentionBits ||
      prev.mask !== next.mask ||
      prev.selected !== next.selected ||
      prev.neighbors !== next.neighbors ||
      prev.focus !== next.focus ||
      (prev.group ? groupKey(prev.group) : '') !== (next.group ? groupKey(next.group) : '') ||
      prev.tokens !== next.tokens
    ) {
      this.restyle();
    }
    this.requestDraw();
  }

  /** Returns false (and keeps the old size) for a hidden, zero-sized canvas. */
  setSize(width: number, height: number, dpr: number): boolean {
    if (width < 2 || height < 2) return false;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.sprites.setDpr(dpr);
    this.fit = computeFit(this.model.bbox, width, height, width < 520 ? 18 : 34);
    this.requestDraw();
    return true;
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  getFit(): Fit {
    return this.fit;
  }

  setTransform(t: ZoomTransform): void {
    this.transform = t;
    this.requestDraw();
  }

  getTransform(): ZoomTransform {
    return this.transform;
  }

  /** Rects (CSS px, canvas-relative) that labels must avoid: legend, controls. */
  setObstacles(rects: Rect[]): void {
    this.obstacles = rects;
    this.requestDraw();
  }

  setHover(index: number | null, label: LabelAnchor | null): void {
    const labelChanged = (this.hoverLabel?.key ?? null) !== (label?.key ?? null);
    if (index === this.hover && !labelChanged) return;
    this.hover = index;
    this.hoverLabel = label;
    if (labelChanged) this.restyle();
    this.requestDraw();
  }

  // ------------------------------------------------------------ queries

  hitTest(x: number, y: number): MapHit {
    for (let k = this.placed.length - 1; k >= 0; k--) {
      const p = this.placed[k];
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return { kind: 'label', anchor: p.anchor, rect: p };
    }
    const t = this.transform;
    const index = this.model.tree.find(dataX(this.fit, (x - t.x) / t.k), dataY(this.fit, (y - t.y) / t.k), HIT_RADIUS / (t.k * this.fit.s));
    if (index === undefined) return null;
    return { kind: 'point', index, x: this.screen[2 * index], y: this.screen[2 * index + 1] };
  }

  /** Labels placed in the last frame (CSS px) -- for tests and dev tooling. */
  placedLabels(): Array<{ key: string; text: string; x: number; y: number; w: number; h: number }> {
    return this.placed.map((p) => ({ key: p.anchor.key, text: p.anchor.text, x: p.x, y: p.y, w: p.w, h: p.h }));
  }

  /** Screen position of a paper in the current frame. */
  pointPosition(index: number): [number, number] {
    return [this.screen[2 * index], this.screen[2 * index + 1]];
  }

  // ------------------------------------------------------------ frame loop

  requestDraw(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.draw);
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onFrame = null;
  }

  private draw = (): void => {
    this.raf = 0;
    if (!this.width) return;
    const t0 = performance.now();
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.scene.tokens.surface;
    ctx.fillRect(0, 0, this.width, this.height);
    this.computeScreen();
    if (this.scene.showLinks) this.drawEdges();
    this.drawPoints();
    this.drawLabels();
    this.onFrame?.(performance.now() - t0);
  };

  private computeScreen(): void {
    const { model, screen, fit: f } = this;
    const t = this.transform;
    const pos = model.pos;
    // X = k*(ox + (x - x0)*s) + tx ;  Y = k*(oy + (y1 - y)*s) + ty
    const ax = f.s * t.k;
    const bx = (f.ox - f.x0 * f.s) * t.k + t.x;
    const ay = -f.s * t.k;
    const by = (f.oy + f.y1 * f.s) * t.k + t.y;
    for (let i = 0; i < model.n; i++) {
      screen[2 * i] = ax * pos[2 * i] + bx;
      screen[2 * i + 1] = ay * pos[2 * i + 1] + by;
    }
  }

  private drawEdges(): void {
    const { ctx, model, screen } = this;
    const tk = this.scene.tokens;
    const mask = this.scene.mask;
    const { edges, edgeBucket } = model;
    const W = this.width;
    const H = this.height;
    const quiet = this.scene.selected != null || this.scene.group != null || this.hoverLabel != null ? 0.4 : 1;
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    for (let e = 0; e < edgeBucket.length; e++) {
      const i = edges[2 * e];
      const j = edges[2 * e + 1];
      if (mask && (!mask[i] || !mask[j])) continue;
      const x1 = screen[2 * i];
      const y1 = screen[2 * i + 1];
      const x2 = screen[2 * j];
      const y2 = screen[2 * j + 1];
      if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) continue;
      const p = paths[edgeBucket[e]];
      p.moveTo(x1, y1);
      p.lineTo(x2, y2);
    }
    ctx.lineWidth = 1;
    for (let b = 0; b < 3; b++) {
      ctx.strokeStyle = rgba(tk.edge, tk.edgeAlpha[b] * quiet);
      ctx.stroke(paths[b]);
    }
  }

  private radius(): number {
    return radiusForZoom(this.transform.k, 2.4, 5.5);
  }

  private drawPoints(): void {
    const { ctx } = this;
    const r = this.radius();
    this.frameSprites = this.styles.map((s) => this.sprites.get(s, r));
    ctx.globalAlpha = this.scene.tokens.dimAlpha;
    this.stamp(this.passes[0], r);
    ctx.globalAlpha = 1;
    this.drawLensLines();
    this.stamp(this.passes[1], r);
    this.stamp(this.passes[2], r);
    this.drawMarkers(r);
  }

  private stamp(list: Int32Array, r: number): void {
    const { ctx, screen, styleOf } = this;
    const sprites = this.frameSprites;
    const margin = r + 3;
    const W = this.width + margin;
    const H = this.height + margin;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = screen[2 * i];
      const y = screen[2 * i + 1];
      if (x < -margin || x > W || y < -margin || y > H) continue;
      const s = sprites[styleOf[i]];
      ctx.drawImage(s.canvas, x - s.half, y - s.half, s.size, s.size);
    }
  }

  private drawLensLines(): void {
    const { ctx, screen } = this;
    const { selected, neighbors, focus, tokens } = this.scene;
    if (selected == null) return;
    const sx = screen[2 * selected];
    const sy = screen[2 * selected + 1];
    if (neighbors && neighbors.length) {
      ctx.beginPath();
      for (let k = 0; k < neighbors.length; k++) {
        const j = neighbors[k];
        if (j === focus) continue;
        ctx.moveTo(sx, sy);
        ctx.lineTo(screen[2 * j], screen[2 * j + 1]);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(tokens.ink, 0.5);
      ctx.stroke();
    }
    if (focus != null && focus !== selected) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(screen[2 * focus], screen[2 * focus + 1]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(tokens.ink, 0.95);
      ctx.stroke();
    }
  }

  private ring(index: number, radius: number, width: number, color: string): void {
    const { ctx, screen } = this;
    ctx.beginPath();
    ctx.arc(screen[2 * index], screen[2 * index + 1], radius, 0, TAU);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  private restamp(index: number, r: number): void {
    const s = this.sprites.get(this.styles[this.styleOf[index]], r);
    this.ctx.drawImage(s.canvas, this.screen[2 * index] - s.half, this.screen[2 * index + 1] - s.half, s.size, s.size);
  }

  private drawMarkers(r: number): void {
    const tk = this.scene.tokens;
    const { selected, neighbors, focus } = this.scene;
    if (neighbors) {
      for (let k = 0; k < neighbors.length; k++) this.ring(neighbors[k], r + 1.9, 1.5, tk.ink);
    }
    if (focus != null && focus !== selected) {
      this.restamp(focus, r * 1.25);
      this.ring(focus, r * 1.25 + 2.2, 2, tk.ink);
    }
    if (this.hover != null && this.hover !== selected) {
      this.restamp(this.hover, r);
      this.ring(this.hover, r + 2.1, 1.5, tk.ink);
    }
    if (selected != null) {
      const big = Math.max(4.5, r * 1.75);
      this.ring(selected, big + 1, 2, tk.surface);
      this.restamp(selected, big);
      this.ring(selected, big + 2.6, 2, tk.ink);
    }
  }

  // ------------------------------------------------------------ labels

  private measure(font: string, text: string): number {
    const key = `${font}\u0001${text}`;
    let w = this.textWidth.get(key);
    if (w === undefined) {
      this.ctx.font = font;
      w = this.ctx.measureText(text).width;
      this.textWidth.set(key, w);
    }
    return w;
  }

  /** Text shortened with an ellipsis to fit maxWidth (measured, never clipped). */
  private fitText(font: string, text: string, maxWidth: number): string {
    const key = `${font}\u0001${maxWidth}\u0001${text}`;
    const hit = this.fitted.get(key);
    if (hit !== undefined) return hit;
    let out = text;
    if (this.measure(font, text) > maxWidth) {
      let lo = 1;
      let hi = text.length - 1;
      out = '…';
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const candidate = `${text.slice(0, mid).trimEnd()}…`;
        if (this.measure(font, candidate) <= maxWidth) {
          out = candidate;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
    }
    if (this.fitted.size > 4000) this.fitted.clear();
    this.fitted.set(key, out);
    return out;
  }

  private drawLabels(): void {
    this.placed = [];
    const occupied: Rect[] = [...this.obstacles];
    // never let a label cover the selected or focused paper's marker
    const r = this.radius();
    for (const i of [this.scene.selected, this.scene.focus]) {
      if (i == null) continue;
      const R = Math.max(4.5, r * 1.75) + 6;
      occupied.push({ x: this.screen[2 * i] - R, y: this.screen[2 * i + 1] - R, w: 2 * R, h: 2 * R });
    }
    const level = this.transform.k < FINE_LABEL_K ? 'coarse' : 'fine';
    this.placeGroupLabels(this.labelOrder[level], level, occupied);
    if (this.transform.k >= TITLE_LABEL_K) this.placeTitleLabels(occupied);
    this.ctx.globalAlpha = 1;
  }

  private placeGroupLabels(anchors: LabelAnchor[], level: 'coarse' | 'fine', occupied: Rect[]): void {
    const { ctx, fit } = this;
    const tk = this.scene.tokens;
    const t = this.transform;
    const W = this.width;
    const H = this.height;
    const font = FONT[level];
    const px = FONT_PX[level];
    const maxWidth = Math.min(level === 'fine' ? 180 : 280, W - 24);
    const activeKey = this.hoverLabel?.key ?? (this.scene.group ? groupKey(this.scene.group) : null);
    const padX = 4;
    const padY = 3;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    for (const a of anchors) {
      const ax = t.k * worldX(fit, a.x) + t.x;
      const ay = t.k * worldY(fit, a.y) + t.y;
      if (ax < 0 || ax > W || ay < 0 || ay > H) continue;
      const text = this.fitText(font, a.text, maxWidth);
      const w = this.measure(font, text) + 2 * padX;
      const h = px + 2 * padY;
      if (w > W - 8 || h > H - 8) continue;
      // centered on the anchor first, then nudged just above or below it
      let rect: Rect | null = null;
      for (const dy of [0, -(h + 2), h + 2]) {
        const candidate = { x: Math.max(4, Math.min(W - 4 - w, ax - w / 2)), y: Math.max(4, Math.min(H - 4 - h, ay - h / 2 + dy)), w, h };
        if (!occupied.some((o) => intersects(candidate, o))) {
          rect = candidate;
          break;
        }
      }
      if (!rect) continue;
      occupied.push(rect);
      this.placed.push({ ...rect, anchor: a });
      const cx = rect.x + w / 2;
      const cy = rect.y + h / 2;
      const active = a.key === activeKey;
      ctx.lineWidth = 4;
      ctx.strokeStyle = tk.surface;
      ctx.strokeText(text, cx, cy);
      ctx.fillStyle = level === 'fine' && !active ? tk.inkSecondary : tk.ink;
      ctx.fillText(text, cx, cy);
      if (active) ctx.fillRect(rect.x + padX, rect.y + h - 2, w - 2 * padX, 1.25);
    }
  }

  private placeTitleLabels(occupied: Rect[]): void {
    const { ctx, screen, model } = this;
    const tk = this.scene.tokens;
    const W = this.width;
    const H = this.height;
    const r = this.radius();
    const font = FONT.title;
    const h = 14;
    let placedCount = 0;
    let checked = 0;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    const tryPlace = (i: number) => {
      const x = screen[2 * i];
      const y = screen[2 * i + 1];
      if (x < 0 || x > W || y < 0 || y > H) return;
      checked++;
      const text = this.fitText(font, model.papers[i].title || model.papers[i].id, 180);
      const w = this.measure(font, text);
      for (const rect of [
        { x: x + r + 5, y: y - h / 2, w, h },
        { x: x - r - 5 - w, y: y - h / 2, w, h },
      ]) {
        if (rect.x < 2 || rect.x + rect.w > W - 2 || rect.y < 2 || rect.y + h > H - 2) continue;
        if (occupied.some((o) => intersects(rect, o))) continue;
        occupied.push(rect);
        placedCount++;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = tk.surface;
        ctx.strokeText(text, rect.x, y);
        ctx.fillStyle = tk.inkSecondary;
        ctx.fillText(text, rect.x, y);
        return;
      }
    };
    const { selected } = this.scene;
    if (selected != null) tryPlace(selected);
    for (const list of [this.passes[2], this.passes[1]]) {
      for (let k = 0; k < list.length && placedCount < 70 && checked < 500; k++) {
        if (list[k] !== selected) tryPlace(list[k]);
      }
    }
  }

  // ------------------------------------------------------------ styling

  /** Recompute each point's sprite style and draw pass (dim / base / emphasized). */
  private restyle(): void {
    const { model, scene } = this;
    const tk = scene.tokens;
    const n = model.n;
    const styles: DotStyle[] = [];
    const index = new Map<string, number>();
    const add = (s: DotStyle): number => {
      let k = index.get(s.key);
      if (k === undefined) {
        k = styles.length;
        styles.push(s);
        index.set(s.key, k);
      }
      return k;
    };
    const solid = (color: string, alpha = 1): DotStyle => ({
      key: `f${color}${alpha}`,
      fill: color,
      fillAlpha: alpha,
      stroke: null,
      strokeWidth: 0,
      halo: tk.surface,
      haloWidth: 1,
    });
    const neutral = add(solid(tk.pointNeutral, tk.pointNeutralAlpha));
    const neutralStrong = add(solid(tk.pointNeutral, 1));
    const accent = add(solid(tk.series[0]));
    const noYear = add({ key: `h${tk.neutral}`, fill: null, fillAlpha: 1, stroke: tk.neutral, strokeWidth: 1.4, halo: tk.surface, haloWidth: 1 });
    const yearStyles = Array.from({ length: YEAR_LEVELS }, (_, q) => add(solid(rampAt(tk.yearRamp, q / (YEAR_LEVELS - 1)))));
    const citedStyles = tk.citedRamp.map((c) => add(solid(c)));
    const archStyles = ARCHETYPE_ORDER.map((a) => add(solid(tk.archetype[a])));
    const archetype = scene.colorBy === 'archetype' ? model.archetype : undefined;
    const hidden = model.hidden;
    const span = Math.max(1, model.yearMax - model.yearMin);
    const cited = scene.colorBy === 'cited' ? scene.cited : null;
    const attention = scene.colorBy === 'attention' ? scene.attentionBits : 0;

    const group = this.hoverLabel?.group ?? scene.group;
    let inGroup: Uint8Array | null = null;
    if (group) {
      inGroup = new Uint8Array(n);
      const members = groupMembers(model, group);
      for (let k = 0; k < members.length; k++) inGroup[members[k]] = 1;
    }
    const related = scene.selected != null ? new Uint8Array(n) : null;
    if (related && scene.selected != null) {
      related[scene.selected] = 1;
      if (scene.neighbors) for (let k = 0; k < scene.neighbors.length; k++) related[scene.neighbors[k]] = 1;
      if (scene.focus != null) related[scene.focus] = 1;
    }
    const mask = scene.mask;
    const lists: number[][] = [[], [], []];
    for (let i = 0; i < n; i++) {
      // no position in this layout (Engineering: papers without a structure vector)
      if (hidden && hidden[i]) continue;
      let style: number;
      // "emphasized by the encoding": cited papers and selected-flag papers sit on top
      let lifted = false;
      if (archetype) {
        style = archStyles[archetype[i]] ?? archStyles[archStyles.length - 1];
      } else if (scene.colorBy === 'year') {
        const y = model.year[i];
        style = y === 0 ? noYear : yearStyles[Math.round(((y - model.yearMin) / span) * (YEAR_LEVELS - 1))];
      } else if (cited) {
        const bin = citedBin(cited[i]);
        style = bin < 0 ? neutral : citedStyles[bin];
        lifted = bin >= 0;
      } else if (scene.colorBy === 'attention') {
        lifted = (model.flagBits[i] & attention) !== 0;
        style = lifted ? accent : neutral;
      } else if (related) {
        style = i === scene.selected ? accent : related[i] ? neutralStrong : neutral;
      } else {
        style = inGroup && inGroup[i] ? accent : neutral;
      }
      const passes = !mask || mask[i] === 1;
      let pass: number;
      // layout-type mode keeps every color visible; the selection shows by its marker
      if (related && !archetype) pass = related[i] ? 2 : 0;
      else if (inGroup) pass = inGroup[i] && passes ? 2 : 0;
      else if (scene.colorBy === 'attention') pass = lifted && passes ? 2 : 0; // the rest dim
      else pass = passes ? (lifted ? 2 : 1) : 0;
      this.styleOf[i] = style;
      lists[pass].push(i);
    }
    this.styles = styles;
    this.passes = [Int32Array.from(lists[0]), Int32Array.from(lists[1]), Int32Array.from(lists[2])];
  }
}
