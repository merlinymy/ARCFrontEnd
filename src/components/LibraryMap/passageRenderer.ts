// Canvas renderer for the passage map ("every passage is a point").
import { quadtree, type Quadtree } from 'd3-quadtree';
import { zoomIdentity, type ZoomTransform } from 'd3-zoom';
import type { PassagePoint } from '../../types';
import { computeFit, dataX, dataY, radiusForZoom, type Fit } from './camera';
import { SpriteCache, type DotStyle, type Sprite } from './sprites';
import { INFERRED_OPACITY, rgba, type MapTokens } from './tokens';

export interface PassageScene {
  tokens: MapTokens;
  colorBy: 'paper' | 'role';
  /** more than 3 papers in paper mode: which one is blue (others neutral) */
  highlightPaper: number;
  /** two-paper compare in role mode: paper identity moves to shape (A filled, B ring) */
  shapeByPaper: boolean;
  /** chunk ids to emphasize (a hovered passage pair) */
  highlight: ReadonlySet<string> | null;
}

const TAU = Math.PI * 2;
const HIT_RADIUS = 12;

export class PassageRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scene: PassageScene;
  private points: PassagePoint[] = [];
  private paperOf = new Uint8Array(0);
  private nPapers = 0;
  private pos = new Float32Array(0);
  private tree: Quadtree<number> = quadtree<number>();
  private bbox: [number, number, number, number] = [0, 0, 1, 1];
  private fit: Fit = computeFit([0, 0, 1, 1], 1, 1, 0);
  private width = 0;
  private height = 0;
  private dpr = 1;
  private transform: ZoomTransform = zoomIdentity;
  private sprites = new SpriteCache();
  private styles: DotStyle[] = [];
  private styleOf = new Uint16Array(0);
  private order: Int32Array = new Int32Array(0);
  private emphasized: Int32Array = new Int32Array(0);
  private hover: number | null = null;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement, scene: PassageScene) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.scene = scene;
  }

  setData(points: PassagePoint[], paperIds: readonly string[]): void {
    this.points = points;
    this.nPapers = paperIds.length;
    const index = new Map(paperIds.map((id, i) => [id, i]));
    const n = points.length;
    this.pos = new Float32Array(n * 2);
    this.paperOf = new Uint8Array(n);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const x = Number.isFinite(p.x) ? p.x : 0.5;
      const y = Number.isFinite(p.y) ? p.y : 0.5;
      this.pos[2 * i] = x;
      this.pos[2 * i + 1] = y;
      this.paperOf[i] = index.get(p.paper_id) ?? 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    this.bbox = n ? [x0, y0, x1, y1] : [0, 0, 1, 1];
    const pos = this.pos;
    this.tree = quadtree<number>()
      .x((i) => pos[2 * i])
      .y((i) => pos[2 * i + 1])
      .addAll(Array.from({ length: n }, (_, i) => i));
    this.styleOf = new Uint16Array(n);
    this.hover = null;
    this.refit();
    this.restyle();
    this.requestDraw();
  }

  setScene(scene: PassageScene): void {
    if (scene.tokens !== this.scene.tokens) this.sprites.clear();
    this.scene = scene;
    this.restyle();
    this.requestDraw();
  }

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
    this.refit();
    this.requestDraw();
    return true;
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  setTransform(t: ZoomTransform): void {
    this.transform = t;
    this.requestDraw();
  }

  setHover(index: number | null): void {
    if (index === this.hover) return;
    this.hover = index;
    this.requestDraw();
  }

  point(index: number): PassagePoint | undefined {
    return this.points[index];
  }

  paperIndexOf(index: number): number {
    return this.paperOf[index] ?? 0;
  }

  hitTest(x: number, y: number): { index: number; x: number; y: number } | null {
    if (!this.points.length) return null;
    const t = this.transform;
    const f = this.fit;
    const i = this.tree.find(dataX(f, (x - t.x) / t.k), dataY(f, (y - t.y) / t.k), HIT_RADIUS / (t.k * f.s));
    if (i === undefined) return null;
    const [sx, sy] = this.screenOf(i);
    return { index: i, x: sx, y: sy };
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  requestDraw(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.draw);
  }

  private refit(): void {
    if (this.width) this.fit = computeFit(this.bbox, this.width, this.height, this.width < 420 ? 14 : 24);
  }

  private screenOf(i: number): [number, number] {
    const f = this.fit;
    const t = this.transform;
    return [t.k * (f.ox + (this.pos[2 * i] - f.x0) * f.s) + t.x, t.k * (f.oy + (f.y1 - this.pos[2 * i + 1]) * f.s) + t.y];
  }

  private restyle(): void {
    const { tokens: tk, colorBy, highlightPaper, shapeByPaper, highlight } = this.scene;
    const styles: DotStyle[] = [];
    const keys = new Map<string, number>();
    const add = (s: DotStyle) => {
      let k = keys.get(s.key);
      if (k === undefined) {
        k = styles.length;
        styles.push(s);
        keys.set(s.key, k);
      }
      return k;
    };
    const filled = (color: string, alpha: number, border: string | null): DotStyle => ({
      key: `f${color}${alpha}${border}`,
      fill: color,
      fillAlpha: alpha,
      stroke: border,
      strokeWidth: border ? 1 : 0,
      halo: tk.surface,
      haloWidth: 1,
    });
    const ring = (color: string): DotStyle => ({ key: `r${color}`, fill: null, fillAlpha: 1, stroke: color, strokeWidth: 1.75, halo: tk.surface, haloWidth: 1 });
    const n = this.points.length;
    const back: number[] = [];
    const front: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const paper = this.paperOf[i];
      let style: number;
      if (colorBy === 'paper') {
        if (this.nPapers <= 3) style = add(filled(tk.series[Math.min(2, paper)], 1, null));
        else style = add(filled(paper === highlightPaper ? tk.series[0] : tk.neutral, 1, null));
      } else {
        const role = p.role in tk.roleFill ? p.role : 'unlabeled';
        const fill = tk.roleFill[role];
        const border = tk.roleBorder[role];
        const alpha = p.role_inferred ? INFERRED_OPACITY : 1;
        if (shapeByPaper && paper === 1) {
          style = add(ring(rgba(border ?? fill, alpha)));
        } else {
          style = add(filled(fill, alpha, border));
        }
      }
      this.styleOf[i] = style;
      const emph =
        (highlight && highlight.has(p.chunk_id)) ||
        (colorBy === 'paper' && this.nPapers > 3 && paper === highlightPaper);
      (emph ? front : back).push(i);
    }
    this.styles = styles;
    this.order = Int32Array.from(back);
    this.emphasized = Int32Array.from(front);
  }

  private draw = (): void => {
    this.raf = 0;
    if (!this.width) return;
    const { ctx } = this;
    const tk = this.scene.tokens;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = tk.surface;
    ctx.fillRect(0, 0, this.width, this.height);
    const r = radiusForZoom(this.transform.k, 3.2, 6.5);
    const sprites: Sprite[] = this.styles.map((s) => this.sprites.get(s, r));
    const highlighting = !!(this.scene.highlight && this.scene.highlight.size);
    ctx.globalAlpha = highlighting ? 0.3 : 1;
    this.stamp(this.order, sprites, r);
    ctx.globalAlpha = 1;
    this.stamp(this.emphasized, sprites, r);
    if (highlighting) {
      for (let k = 0; k < this.emphasized.length; k++) this.ring(this.emphasized[k], r + 2.2, 2, tk.ink);
    }
    if (this.hover != null) {
      const s = sprites[this.styleOf[this.hover]];
      const [x, y] = this.screenOf(this.hover);
      if (s) ctx.drawImage(s.canvas, x - s.half, y - s.half, s.size, s.size);
      this.ring(this.hover, r + 2.1, 1.5, tk.ink);
    }
  };

  private stamp(list: Int32Array, sprites: Sprite[], r: number): void {
    const { ctx } = this;
    const f = this.fit;
    const t = this.transform;
    const ax = f.s * t.k;
    const bx = (f.ox - f.x0 * f.s) * t.k + t.x;
    const ay = -f.s * t.k;
    const by = (f.oy + f.y1 * f.s) * t.k + t.y;
    const m = r + 3;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = ax * this.pos[2 * i] + bx;
      const y = ay * this.pos[2 * i + 1] + by;
      if (x < -m || x > this.width + m || y < -m || y > this.height + m) continue;
      const s = sprites[this.styleOf[i]];
      ctx.drawImage(s.canvas, x - s.half, y - s.half, s.size, s.size);
    }
  }

  private ring(i: number, radius: number, width: number, color: string): void {
    const [x, y] = this.screenOf(i);
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}
