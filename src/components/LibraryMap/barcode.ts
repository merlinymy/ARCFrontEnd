// Section barcodes (Engineering view) and the compare view's section strips.
import type { BarcodeEntry, PaperStructureSegment, SectionRole } from '../../types';

export interface BarcodeSegmentView {
  role: SectionRole;
  share: number;
  section: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  subsections?: string[];
  /** v1.1: role predicted from content (no heading detected) */
  inferred?: boolean;
}

const roleOf = (r: unknown): SectionRole => (typeof r === 'string' && ROLES.has(r) ? (r as SectionRole) : 'unlabeled');

/** Compact barcode ([role, share, section, inferred]) -> segment views. */
export function fromBarcode(entries: readonly BarcodeEntry[] | undefined): BarcodeSegmentView[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => Array.isArray(e) && typeof e[1] === 'number' && e[1] > 0)
    .map((e) => ({ role: roleOf(e[0]), share: e[1], section: e[2] ?? null, inferred: e[3] === 1 }));
}

/** Detail segments (with pages and subsections) -> segment views. */
export function fromSegments(segments: readonly PaperStructureSegment[] | undefined): BarcodeSegmentView[] {
  if (!Array.isArray(segments)) return [];
  return segments
    .filter((s) => s && typeof s.share === 'number' && s.share > 0)
    .map((s) => ({
      role: roleOf(s.role),
      share: s.share,
      section: s.section ?? null,
      pageStart: s.page_start,
      pageEnd: s.page_end,
      subsections: Array.isArray(s.subsections) ? s.subsections : [],
      inferred: s.inferred === true,
    }));
}

let measureCtx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();

/** Width of an in-segment label in the barcode's font (cached). */
export function labelWidth(text: string): number {
  let w = widths.get(text);
  if (w !== undefined) return w;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  w = measureCtx.measureText(text).width;
  widths.set(text, w);
  return w;
}

// ---- compare view: one role-colored cell per heatmap row / column

export interface StripCell {
  section: string;
  role: SectionRole;
  /** share of the paper's reading-order tokens in this section (0 when unknown) */
  share: number;
}

const ROLES = new Set<string>(['background', 'methods', 'findings', 'back_matter', 'unlabeled']);
const safeRole = (r: unknown): SectionRole | null => (typeof r === 'string' && ROLES.has(r) ? (r as SectionRole) : null);

/**
 * Role and token share for each section name, from the detail segments when
 * loaded, else the map's compact barcode; the contract's section -> role table
 * covers names that appear in neither.
 */
export function stripCells(
  names: readonly string[],
  segments: readonly PaperStructureSegment[] | undefined,
  barcode: readonly BarcodeEntry[] | undefined,
  sectionRole: Map<string, SectionRole>
): StripCell[] {
  const share = new Map<string, number>();
  const role = new Map<string, SectionRole>();
  const take = (section: string | null | undefined, r: unknown, s: unknown) => {
    if (!section) return;
    share.set(section, (share.get(section) ?? 0) + (typeof s === 'number' && Number.isFinite(s) ? s : 0));
    const rr = safeRole(r);
    if (rr && !role.has(section)) role.set(section, rr);
  };
  if (Array.isArray(segments) && segments.length) {
    for (const seg of segments) take(seg?.section, seg?.role, seg?.share);
  } else if (Array.isArray(barcode)) {
    for (const e of barcode) if (Array.isArray(e)) take(e[2], e[0], e[1]);
  }
  return names.map((section) => ({
    section,
    role: role.get(section) ?? sectionRole.get(section) ?? 'unlabeled',
    share: share.get(section) ?? 0,
  }));
}
