/**
 * Sentence-level citation boxes from pdf.js's text layer.
 *
 * The backend sends the boxes of the *blocks* the cited text falls in, and the
 * extractor's smallest box is a paragraph. The text layer of the PDF itself has
 * coordinates per text item, so the cited text is found there and boxed
 * tightly instead. Everything in this file is pure (no pdf.js, no DOM) so it
 * can be tested directly; `pdfCitationBoxes.ts` feeds it from a document.
 *
 * Coordinates are per-mille of the page, origin top-left, as everywhere else.
 */
import type { PageHighlight } from '../types';

/** One pdf.js text item, placed in per-mille page space (rotation applied). */
export interface PlacedItem {
  str: string;
  /** Start of the baseline. */
  ox: number;
  oy: number;
  /** The whole advance (baseline start to baseline end) as a vector. */
  wx: number;
  wy: number;
  /** The font height as a vector pointing from the baseline towards the top of the glyphs. */
  hx: number;
  hy: number;
}

export interface PlacedPage {
  /** 1-indexed PDF page */
  page: number;
  items: PlacedItem[];
}

/** The parts of a pdf.js TextItem that placement needs. */
export interface RawTextItem {
  str: string;
  /** [a, b, c, d, e, f], PDF user space. */
  transform: number[];
  width: number;
  height: number;
}

// Glyphs reach about this far below and above the baseline, as a fraction of the font height.
const DESCENT = 0.22;
const ASCENT = 0.88;

/** Fewer letters and digits than this in the quote is too little to find reliably. */
export const MIN_QUOTE_KEY = 15;
/** A page with less text than this has no usable text layer (a scan, say). */
export const MIN_PAGE_KEY = 20;
/** The head and tail of a quote that cannot be found whole. */
const ANCHOR_LEN = 40;
const ANCHOR_MIN_QUOTE = 80;
/**
 * How far (per-mille of the page) a tight box may sit from every box the
 * backend gave and still be believed. The backend's block boxes contain the
 * cited text, so a "match" well outside them is a different passage.
 */
export const BLOCK_TOLERANCE = 30;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const KEPT = /[\p{L}\p{N}]/u;

/**
 * The matching key of a string: its letters and digits, decomposed (NFKD, so
 * ligatures become letters, accents and superscripts reduce to their base) and
 * lower-cased. Whitespace, hyphens and dashes of every kind, quotes and all
 * other punctuation are dropped, which is what makes the match indifferent to
 * how the text layer spaces, hyphenates or styles the same words.
 *
 * `map[k]` is the index in `s` (a UTF-16 offset) of the character that
 * produced key unit `k`; a ligature's letters all point at the ligature.
 */
export function normalizeWithMap(s: string): { key: string; map: number[] } {
  let key = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    for (const part of ch.normalize('NFKD')) {
      const lower = part.toLowerCase();
      if (!KEPT.test(lower)) continue;
      key += lower;
      for (let u = 0; u < lower.length; u++) map.push(i);
    }
    i += ch.length;
  }
  return { key, map };
}

// ---------------------------------------------------------------------------
// The page stream: every item's key, concatenated, with a way back
// ---------------------------------------------------------------------------

export interface TextStream {
  key: string;
  /** Per key unit: which entry of `items` it came from, and where in that item's `str`. */
  owner: number[];
  at: number[];
  items: { page: number; item: PlacedItem }[];
}

/** Concatenate the text of the pages, in order, as one matchable stream. */
export function buildStream(pages: PlacedPage[]): TextStream {
  const parts: string[] = [];
  const owner: number[] = [];
  const at: number[] = [];
  const items: TextStream['items'] = [];
  for (const p of pages) {
    for (const item of p.items) {
      const { key, map } = normalizeWithMap(item.str);
      if (!key) continue;
      const idx = items.length;
      items.push({ page: p.page, item });
      parts.push(key);
      for (const m of map) {
        owner.push(idx);
        at.push(m);
      }
    }
  }
  return { key: parts.join(''), owner, at, items };
}

// ---------------------------------------------------------------------------
// Finding the quote
// ---------------------------------------------------------------------------

export interface Span {
  start: number;
  end: number;
  how: 'exact' | 'anchored';
}

function indexesOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) out.push(i);
  return out;
}

/**
 * Every place the quote's key occurs in the stream. When the whole quote is
 * nowhere (an inline reference number, a formula or a figure label in one
 * text and not the other), a long quote is looked for by its head and tail,
 * which must be a plausible distance apart.
 */
export function findSpans(streamKey: string, quoteKey: string): Span[] {
  const exact = indexesOf(streamKey, quoteKey);
  if (exact.length) return exact.map((start) => ({ start, end: start + quoteKey.length, how: 'exact' as const }));

  const n = quoteKey.length;
  if (n < ANCHOR_MIN_QUOTE) return [];
  const a = Math.min(ANCHOR_LEN, Math.floor(n / 3));
  const heads = indexesOf(streamKey, quoteKey.slice(0, a));
  const tails = indexesOf(streamKey, quoteKey.slice(n - a));
  if (!heads.length || !tails.length) return [];
  const spans: Span[] = [];
  for (const h of heads) {
    const t = tails.find((x) => {
      const len = x + a - h;
      return x >= h + a && len >= n * 0.7 && len <= n * 1.6 + 30;
    });
    if (t !== undefined) spans.push({ start: h, end: t + a, how: 'anchored' });
  }
  return spans;
}

// ---------------------------------------------------------------------------
// From a key range back to boxes
// ---------------------------------------------------------------------------

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Piece {
  page: number;
  rect: Rect;
  horizontal: boolean;
}

/** The box of characters [from, to) of an item: its advance is split in proportion to characters. */
function pieceRect(item: PlacedItem, from: number, to: number): Rect {
  const len = Math.max(1, item.str.length);
  const f0 = from / len;
  const f1 = to / len;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const f of [f0, f1]) {
    const bx = item.ox + f * item.wx;
    const by = item.oy + f * item.wy;
    for (const k of [-DESCENT, ASCENT]) {
      xs.push(bx + k * item.hx);
      ys.push(by + k * item.hy);
    }
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The item pieces a key range covers, in reading order. */
export function pieces(stream: TextStream, start: number, end: number): Piece[] {
  const out: Piece[] = [];
  let k = start;
  while (k < end) {
    const owner = stream.owner[k];
    let lo = stream.at[k];
    let hi = lo;
    while (k < end && stream.owner[k] === owner) {
      lo = Math.min(lo, stream.at[k]);
      hi = Math.max(hi, stream.at[k]);
      k++;
    }
    const { page, item } = stream.items[owner];
    // `hi` is the start of the last character; include all of it.
    const last = item.str.codePointAt(hi);
    const to = hi + (last !== undefined && last > 0xffff ? 2 : 1);
    out.push({ page, rect: pieceRect(item, lo, to), horizontal: Math.abs(item.wx) >= Math.abs(item.wy) });
  }
  return out;
}

/**
 * One box per line. Consecutive pieces share a line when they are on the same
 * page, run the same way, and sit at the same height (or, for vertical text,
 * the same column) and do not step backwards; otherwise a new line starts. A
 * span over three lines therefore gives three boxes, not one tall one.
 */
export function groupIntoLines(list: Piece[]): PageHighlight[] {
  const lines: { page: number; horizontal: boolean; rect: Rect }[] = [];
  for (const p of list) {
    const cur = lines[lines.length - 1];
    if (cur && cur.page === p.page && cur.horizontal === p.horizontal && sameLine(cur, p)) {
      cur.rect = {
        x0: Math.min(cur.rect.x0, p.rect.x0),
        y0: Math.min(cur.rect.y0, p.rect.y0),
        x1: Math.max(cur.rect.x1, p.rect.x1),
        y1: Math.max(cur.rect.y1, p.rect.y1),
      };
    } else {
      lines.push({ page: p.page, horizontal: p.horizontal, rect: { ...p.rect } });
    }
  }
  const r1 = (n: number) => Math.round(Math.min(1000, Math.max(0, n)) * 10) / 10;
  return lines.map((l) => ({
    page: l.page,
    bbox: [r1(l.rect.x0), r1(l.rect.y0), r1(l.rect.x1), r1(l.rect.y1)],
  }));
}

function sameLine(line: { horizontal: boolean; rect: Rect }, p: Piece): boolean {
  const a = line.rect;
  const b = p.rect;
  if (line.horizontal) {
    const thick = Math.max(a.y1 - a.y0, b.y1 - b.y0);
    const apart = Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
    // Reading along a line only moves rightwards; a step back is the next column or line.
    return apart <= thick * 0.5 && b.x0 >= a.x0;
  }
  const thick = Math.max(a.x1 - a.x0, b.x1 - b.x0);
  const apart = Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2);
  return apart <= thick * 0.5 && b.y0 >= a.y0;
}

// ---------------------------------------------------------------------------
// Choosing among occurrences
// ---------------------------------------------------------------------------

function gap(a: number[], b: number[]): number {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.hypot(dx, dy);
}

/** Distance from a box to the nearest block box on its page; Infinity when the page has none. */
function distanceToBlocks(box: PageHighlight, blocks: PageHighlight[]): number {
  let best = Infinity;
  for (const b of blocks) if (b.page === box.page) best = Math.min(best, gap(box.bbox, b.bbox));
  return best;
}

export type LocateResult =
  | { boxes: PageHighlight[]; how: 'exact' | 'anchored'; candidates: number }
  | { boxes: null; reason: 'quote-too-short' | 'empty-text-layer' | 'no-match' | 'outside-blocks' | 'ambiguous' };

/**
 * Tight boxes for `quote`, found in the text of `pages`, or the reason it was
 * not. `blocks` are the backend's paragraph boxes: they pick between several
 * occurrences (the nearest wins) and veto a match that lies away from all of
 * them. With no blocks to check against, only an unambiguous match is used.
 */
export function locateQuote(quote: string, pages: PlacedPage[], blocks: PageHighlight[]): LocateResult {
  const q = normalizeWithMap(quote).key;
  if (q.length < MIN_QUOTE_KEY) return { boxes: null, reason: 'quote-too-short' };
  const stream = buildStream(pages);
  if (stream.key.length < MIN_PAGE_KEY) return { boxes: null, reason: 'empty-text-layer' };
  const spans = findSpans(stream.key, q);
  if (!spans.length) return { boxes: null, reason: 'no-match' };

  const candidates = spans.map((s) => ({ span: s, boxes: groupIntoLines(pieces(stream, s.start, s.end)) }));
  if (!blocks.length) {
    return candidates.length === 1
      ? { boxes: candidates[0].boxes, how: candidates[0].span.how, candidates: 1 }
      : { boxes: null, reason: 'ambiguous' };
  }

  const scored = candidates.map((c) => {
    const d = c.boxes.map((b) => distanceToBlocks(b, blocks));
    return {
      ...c,
      near: Math.min(...d),
      // Boxes on a page with no block count as at distance zero; the rest, capped.
      total: d.reduce((s, x) => s + (Number.isFinite(x) ? Math.min(x, 1000) : 0), 0),
    };
  });
  // An exact occurrence beats an anchored one; then the nearest to the backend's boxes.
  scored.sort((a, b) => Number(a.span.how === 'anchored') - Number(b.span.how === 'anchored') || a.total - b.total);
  const best = scored[0];
  if (!(best.near <= BLOCK_TOLERANCE)) return { boxes: null, reason: 'outside-blocks' };
  return { boxes: best.boxes, how: best.span.how, candidates: candidates.length };
}

// ---------------------------------------------------------------------------
// pdf.js items -> per-mille page space
// ---------------------------------------------------------------------------

/**
 * Place pdf.js text items in per-mille page space. `viewportTransform` is a
 * scale-1 `PageViewport.transform` (it carries the page's rotation and the
 * flip to a top-left origin) and `width`/`height` that viewport's size, so the
 * result does not depend on zoom and holds on rotated pages.
 */
export function placeItems(
  items: RawTextItem[],
  viewportTransform: number[],
  width: number,
  height: number
): PlacedItem[] {
  const [va, vb, vc, vd, ve, vf] = viewportTransform;
  const out: PlacedItem[] = [];
  for (const it of items) {
    const [a, b, c, d, e, f] = it.transform;
    const adv = Math.hypot(a, b);
    const up = Math.hypot(c, d);
    if (!it.str || !adv || !Number.isFinite(adv) || !it.width) continue;
    const fontH = it.height > 0 ? it.height : up;
    // Vectors in user space, then through the viewport's linear part.
    const wx = (it.width * a) / adv;
    const wy = (it.width * b) / adv;
    const hx = up ? (fontH * c) / up : 0;
    const hy = up ? (fontH * d) / up : fontH;
    out.push({
      str: it.str,
      ox: ((va * e + vc * f + ve) / width) * 1000,
      oy: ((vb * e + vd * f + vf) / height) * 1000,
      wx: ((va * wx + vc * wy) / width) * 1000,
      wy: ((vb * wx + vd * wy) / height) * 1000,
      hx: ((va * hx + vc * hy) / width) * 1000,
      hy: ((vb * hx + vd * hy) / height) * 1000,
    });
  }
  return out;
}
