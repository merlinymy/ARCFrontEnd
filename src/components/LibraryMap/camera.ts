// Fit and camera math shared by the paper map and the passage map.
//
// "data"  = normalized layout coordinates from the API, y up.
// "world" = data fitted into the canvas (CSS px, y down), before zoom.
// "screen" = world after the d3 zoom transform: X = k * wx + tx.

export interface Fit {
  s: number;
  ox: number;
  oy: number;
  x0: number;
  y1: number;
}

export function computeFit(
  bbox: readonly [number, number, number, number],
  width: number,
  height: number,
  pad: number
): Fit {
  const [x0, y0, x1, y1] = bbox;
  const bw = Math.max(x1 - x0, 1e-6);
  const bh = Math.max(y1 - y0, 1e-6);
  const s = Math.max(1e-6, Math.min((width - 2 * pad) / bw, (height - 2 * pad) / bh));
  return { s, ox: (width - bw * s) / 2, oy: (height - bh * s) / 2, x0, y1 };
}

export const worldX = (f: Fit, x: number): number => f.ox + (x - f.x0) * f.s;
export const worldY = (f: Fit, y: number): number => f.oy + (f.y1 - y) * f.s;
export const dataX = (f: Fit, wx: number): number => f.x0 + (wx - f.ox) / f.s;
export const dataY = (f: Fit, wy: number): number => f.y1 - (wy - f.oy) / f.s;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Point radius: small at full zoom-out, growing modestly with zoom. */
export function radiusForZoom(k: number, base: number, max: number): number {
  return Math.min(max, base * Math.pow(Math.max(1, k), 0.32));
}
