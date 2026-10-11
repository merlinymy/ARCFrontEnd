// Every color the Library Map uses, in one place, with a light and a dark set.
//
// Categorical slots 1-3 come from the data-viz reference palette and validate
// all-pairs (scatter rule) on the surfaces below. The neutral was picked by the
// validator, not by eye: Tailwind gray-400 sits in the CVD warn band against
// aqua on white (dE 6.9) and gray-500 misses the normal-vision floor against
// blue (14.2); #a9aeb6 is the darkest gray that clears every pair (CVD 8.4,
// normal 16.4). Ink and surfaces are the app's Tailwind grays.
import type { ArchetypeId, SectionRole } from '../../types';

export type ThemeMode = 'light' | 'dark';

export interface MapTokens {
  mode: ThemeMode;
  /** map, panel and overlay surface (gaps and rings are drawn in it) */
  surface: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  hairline: string;
  /** categorical slots 1-3: blue, orange, aqua */
  series: readonly [string, string, string];
  /** neutral category: back matter, "other papers", no-year rings */
  neutral: string;
  /** Topic mode: every point neutral, at pointNeutralAlpha */
  pointNeutral: string;
  pointNeutralAlpha: number;
  /** alpha for filtered-out / unrelated points */
  dimAlpha: number;
  roleFill: Record<SectionRole, string>;
  /** hairline border for the near-surface "unlabeled" fill; null elsewhere */
  roleBorder: Record<SectionRole, string | null>;
  /** Engineering view: layout types, 3 hues + neutral (validated all-pairs with the neutral) */
  archetype: Record<ArchetypeId, string>;
  /** ordinal-style ramp for year dots, older -> newer (validated --ordinal) */
  yearRamp: readonly string[];
  /** sequential ramp for the section heatmap, low -> high similarity */
  heatRamp: readonly string[];
  /** ordinal ramp for "cited by ARC" bins 1 / 2-4 / 5-9 / 10+ answers (validated --ordinal) */
  citedRamp: readonly [string, string, string, string];
  /** content-similarity links */
  edge: string;
  edgeAlpha: readonly [number, number, number];
}

const LIGHT_SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
const DARK_SERIES = ['#3987e5', '#d95926', '#199e70'] as const;

export const LIGHT_TOKENS: MapTokens = {
  mode: 'light',
  surface: '#ffffff',
  ink: '#111827', // gray-900
  inkSecondary: '#4b5563', // gray-600
  inkMuted: '#6b7280', // gray-500
  hairline: '#e5e7eb', // gray-200
  series: LIGHT_SERIES,
  neutral: '#a9aeb6',
  pointNeutral: '#6b7280',
  pointNeutralAlpha: 0.6,
  dimAlpha: 0.2,
  roleFill: {
    background: LIGHT_SERIES[0],
    methods: LIGHT_SERIES[1],
    findings: LIGHT_SERIES[2],
    back_matter: '#a9aeb6',
    unlabeled: '#f3f4f6', // gray-100
  },
  roleBorder: { background: null, methods: null, findings: null, back_matter: null, unlabeled: '#9ca3af' },
  archetype: { imrad: LIGHT_SERIES[0], combined_rd: LIGHT_SERIES[1], no_methods: LIGHT_SERIES[2], unstructured: '#a9aeb6' },
  // palette.md blue steps 250, 350, 450, 550, 700 (light end no lighter than 250)
  yearRamp: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'],
  // steps 100..700: the lightest step means "low" and may recede (sequential)
  heatRamp: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  // blue steps 250, 400, 550, 700
  citedRamp: ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
  edge: '#111827',
  edgeAlpha: [0.045, 0.075, 0.11],
};

export const DARK_TOKENS: MapTokens = {
  mode: 'dark',
  surface: '#111827', // gray-900
  ink: '#f3f4f6', // gray-100
  inkSecondary: '#9ca3af', // gray-400
  inkMuted: '#6b7280', // gray-500
  hairline: '#374151', // gray-700
  series: DARK_SERIES,
  neutral: '#6b7280',
  pointNeutral: '#9ca3af',
  pointNeutralAlpha: 0.5,
  dimAlpha: 0.2,
  roleFill: {
    background: DARK_SERIES[0],
    methods: DARK_SERIES[1],
    findings: DARK_SERIES[2],
    back_matter: '#6b7280',
    unlabeled: '#1f2937', // gray-800
  },
  roleBorder: { background: null, methods: null, findings: null, back_matter: null, unlabeled: '#4b5563' },
  archetype: { imrad: DARK_SERIES[0], combined_rd: DARK_SERIES[1], no_methods: DARK_SERIES[2], unstructured: '#6b7280' },
  // anchor flipped for the dark surface: older = step 600 (no darker), newer = 100
  yearRamp: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'],
  heatRamp: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'],
  // flipped for the dark surface: steps 600, 400, 250, 100
  citedRamp: ['#184f95', '#3987e5', '#86b6ef', '#cde2fb'],
  edge: '#f3f4f6',
  edgeAlpha: [0.04, 0.065, 0.1],
};

/** v1.1: roles inferred from content render in the same hue at reduced emphasis (never texture) */
export const INFERRED_OPACITY = 0.55;

export function getMapTokens(mode: ThemeMode): MapTokens {
  return mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
}

// ---------------------------------------------------------------- color math

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Piecewise-linear interpolation between documented ramp steps, t in [0, 1]. */
export function rampAt(ramp: readonly string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(ramp[i]);
  const b = hexToRgb(ramp[i + 1]);
  return toHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

export function rampGradientCss(ramp: readonly string[]): string {
  return `linear-gradient(to right, ${ramp.map((c, i) => `${c} ${((i / (ramp.length - 1)) * 100).toFixed(1)}%`).join(', ')})`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text set inside a colored fill: white or near-black, whichever clears more contrast. */
export function textOnFill(fill: string): string {
  return contrastRatio(fill, '#ffffff') >= contrastRatio(fill, '#111827') ? '#ffffff' : '#111827';
}
