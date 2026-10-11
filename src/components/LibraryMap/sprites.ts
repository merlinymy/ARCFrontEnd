// Pre-rendered point sprites. Each sprite is a dot plus its surface-colored
// separating ring, drawn once per (style, radius, dpr) and then stamped with
// drawImage -- far cheaper than thousands of arc()+fill() calls per frame,
// and it keeps the ring drawn per point (painter's order), so overlapping
// dots stay separable.

export interface DotStyle {
  key: string;
  /** null = hollow mark (ring only) */
  fill: string | null;
  fillAlpha: number;
  /** outline of the mark itself (hollow rings, hairline borders) */
  stroke: string | null;
  strokeWidth: number;
  /** surface color of the separating ring */
  halo: string;
  haloWidth: number;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** CSS-pixel size and half-size, for drawImage */
  size: number;
  half: number;
}

const TAU = Math.PI * 2;

function renderSprite(style: DotStyle, r: number, dpr: number): Sprite {
  const outer = r + style.haloWidth;
  const px = Math.ceil(outer * 2 * dpr) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  const size = px / dpr;
  if (!ctx) return { canvas, size, half: size / 2 };
  ctx.scale(dpr, dpr);
  const c = size / 2;
  // separating ring (annulus) in the surface color
  if (style.haloWidth > 0) {
    ctx.beginPath();
    ctx.arc(c, c, outer, 0, TAU);
    ctx.arc(c, c, r, 0, TAU, true);
    ctx.fillStyle = style.halo;
    ctx.fill('evenodd');
  }
  if (style.fill) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.globalAlpha = style.fillAlpha;
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // hollow: opaque surface inside so the ring reads as a ring
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fillStyle = style.halo;
    ctx.fill();
  }
  if (style.stroke && style.strokeWidth > 0) {
    ctx.beginPath();
    ctx.arc(c, c, Math.max(0.5, r - style.strokeWidth / 2), 0, TAU);
    ctx.lineWidth = style.strokeWidth;
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
  }
  return { canvas, size, half: size / 2 };
}

export class SpriteCache {
  private cache = new Map<string, Sprite>();
  private dpr = 1;

  setDpr(dpr: number): void {
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }

  /** Radius is quantized to 1/4 px so continuous zoom reuses sprites. */
  get(style: DotStyle, radius: number): Sprite {
    const r = Math.max(0.75, Math.round(radius * 4) / 4);
    const key = `${style.key}|${r}`;
    let s = this.cache.get(key);
    if (!s) {
      s = renderSprite(style, r, this.dpr);
      if (this.cache.size > 600) this.cache.clear();
      this.cache.set(key, s);
    }
    return s;
  }
}
