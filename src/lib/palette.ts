/**
 * Palette presets — the neutral scale the whole interface is built from.
 *
 * Deliberately NOT in AppContext. The choice is per-device, never sent to the
 * server, and must be applied before first paint; routing it through React
 * state would mean a flash of the default palette on every load.
 *
 * How it works: Tailwind v4 compiles `bg-gray-800` to
 * `var(--color-gray-800)`, so setting `data-palette` on <html> and
 * redefining that scale in index.css re-skins ~2,900 utility classes at once,
 * with no component aware of it. Orthogonal to dark mode, which is a `.dark`
 * class using the same scale from the other end.
 */

export interface Palette {
  id: string;
  label: string;
  /** What it is for, in the picker. */
  hint: string;
  /** A representative swatch, for the picker only. */
  swatch: string;
}

export const PALETTES: Palette[] = [
  { id: 'default', label: 'Cool grey', hint: 'The original. Neutral, slightly blue.', swatch: 'oklch(55.1% 0.027 260)' },
  { id: 'warm', label: 'Warm paper', hint: 'Softer on the eyes for long reading.', swatch: 'oklch(55.1% 0.041 75)' },
  { id: 'sage', label: 'Sage', hint: 'Muted green-grey. Calm, low glare.', swatch: 'oklch(55.1% 0.035 155)' },
  { id: 'slate', label: 'Deep slate', hint: 'Cooler and a little more contrast.', swatch: 'oklch(55.1% 0.049 250)' },
];

const KEY = 'arc.palette';
const DEFAULT = 'default';

export function getPalette(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && PALETTES.some((p) => p.id === saved)) return saved;
  } catch {
    // Private mode, or storage blocked. The default palette is fine.
  }
  return DEFAULT;
}

export function applyPalette(id: string): void {
  // The default keeps index.css's own @theme values, so the attribute is
  // removed rather than set to "default" - one less selector to maintain.
  if (id === DEFAULT) document.documentElement.removeAttribute('data-palette');
  else document.documentElement.setAttribute('data-palette', id);
}

export function setPalette(id: string): void {
  applyPalette(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not worth telling the user: the palette still applies for this session.
  }
}
