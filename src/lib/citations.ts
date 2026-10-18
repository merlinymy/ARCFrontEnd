/**
 * Pure helpers for the W3 answer format (docs/W3_ANSWER_PIPELINE.md section 3).
 * No JSX here, so the components that use them stay fast-refresh friendly.
 */
import type {
  Citation,
  Claim,
  EntailmentLabel,
  EntailmentLabelValue,
  EntailmentReport,
  PageHighlight,
  PdfHighlight,
  TurnBudget,
} from '../types';

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

/** U+27E6 ids U+27E7, e.g. `⟦1⟧` or `⟦1,3⟧`. The contract's regex, verbatim. */
export const CITATION_MARKER_RE = /⟦(\d+(?:,\d+)*)⟧/g;

/** A marker after `tagMarkers`: `⟦1,3:4⟧` is the fifth marker of the answer (index 4). */
export const TAGGED_MARKER_RE = /⟦(\d+(?:,\d+)*):(\d+)⟧/g;

/**
 * Prepare answer text for the markdown renderer.
 *
 *  - Horizontal whitespace directly before a marker is dropped (the contract:
 *    the model may leave whitespace at the end of the cited stretch).
 *  - Each marker is tagged with its position among the answer's markers. The
 *    k-th marker is the one that follows `claims[k]`, which is how an
 *    entailment label (per claim) finds the chip it belongs to. Tagging the
 *    string, rather than counting while rendering, keeps the index right even
 *    if a marker ends up somewhere the renderer does not touch (a code span).
 *  - A marker cut off at the end of a live stream is held back until it is
 *    whole. (The server sends each marker as one chunk, so this is belt and braces.)
 */
export function tagMarkers(text: string): string {
  let k = 0;
  return text
    .replace(/⟦[\d,]*$/, '')
    .replace(/[ \t]*⟦(\d+(?:,\d+)*)⟧/g, (_m, ids: string) => `⟦${ids}:${k++}⟧`);
}

/** Ids from a marker body like "1,3". */
export function parseMarkerIds(body: string): number[] {
  return body
    .split(',')
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

/** True when the text contains at least one `⟦n⟧` marker. */
export function hasMarkers(text: string): boolean {
  return new RegExp(CITATION_MARKER_RE.source).test(text);
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

function sectionLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  const label = name.replace(/_/g, ' ').trim();
  return label ? label.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

export function isBookCitation(c: Pick<Citation, 'doc_kind'>): boolean {
  return c.doc_kind === 'book';
}

/**
 * The location line: "p. 7 · Methods" for a paper, "Ch. 4, p. 103" for a
 * book (the printed page when known, which is the number the reader sees).
 * Falls back to the server's own `locator` if nothing can be built.
 */
export function formatLocation(c: Citation): string | null {
  const book = isBookCitation(c);
  const page = book && c.printed_page ? c.printed_page : c.page;
  let pageLabel: string | null = null;
  if (page) {
    const spansPages = !(book && c.printed_page) && c.page_end && c.page_end !== c.page;
    pageLabel = spansPages ? `pp. ${page}–${c.page_end}` : `p. ${page}`;
  }
  if (book) {
    const chapter = c.chapter_label || null;
    const built = [chapter, pageLabel].filter(Boolean).join(', ');
    return built || c.locator || null;
  }
  const built = [pageLabel, sectionLabel(c.section_name)].filter(Boolean).join(' · ');
  return built || c.locator || null;
}

/** "Book title \u2014 Ch. 4: Chapter title" for books, else null. Works on a citation or a source. */
export function formatBookLine(c: {
  doc_kind?: string | null;
  book_title?: string | null;
  chapter_label?: string | null;
  chapter_title?: string | null;
}): string | null {
  if (c.doc_kind !== 'book') return null;
  const chapter = [c.chapter_label, c.chapter_title].filter(Boolean).join(': ');
  return [c.book_title, chapter].filter(Boolean).join(' \u2014 ') || null;
}

/** The location is a guess (or only a page), not a pinned-down passage. */
export function locationNote(c: Pick<Citation, 'location_source'>): string | null {
  switch (c.location_source) {
    case 'record_search':
      return 'Found by searching the paper for the quote; the first match is shown.';
    case 'chunk':
      return 'Approximate: only the retrieved passage’s page and box are known.';
    case 'pdf_page':
      return 'Page only: no box is available for this citation.';
    case 'none':
      return 'No page location is available for this citation.';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// What to draw in the PDF viewer
// ---------------------------------------------------------------------------

function validBox(box: unknown): box is number[] {
  return (
    Array.isArray(box) &&
    box.length === 4 &&
    box.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    box[2] > box[0] &&
    box[3] > box[1]
  );
}

/**
 * The rectangles to draw, in order of preference: the citation's per-page
 * `highlights`; else its single `bbox` on `page`; else none (page only).
 * `pdf_page` and `none` mean the server has no box, so nothing is drawn even
 * if a stray field is present.
 */
export function highlightBoxes(c: Citation): PageHighlight[] {
  if (c.location_source === 'none' || c.location_source === 'pdf_page') return [];
  const fromHighlights = (c.highlights ?? []).filter(
    (h) => typeof h?.page === 'number' && h.page > 0 && validBox(h.bbox)
  );
  if (fromHighlights.length) return fromHighlights;
  if (c.page && validBox(c.bbox)) return [{ page: c.page, bbox: c.bbox }];
  return [];
}

/** The page the viewer should open at. */
export function citationPage(c: Citation): number | null {
  return c.page ?? highlightBoxes(c)[0]?.page ?? null;
}

export function pdfHighlightFromCitation(c: Citation): PdfHighlight {
  return {
    highlights: highlightBoxes(c),
    quote: c.cited_text || null,
    locationSource: c.location_source ?? null,
    pageEnd: c.page_end ?? null,
    locator: formatLocation(c),
  };
}

// ---------------------------------------------------------------------------
// Entailment
// ---------------------------------------------------------------------------

export const ENTAILMENT_TEXT: Record<EntailmentLabelValue, string> = {
  supported: 'Supported',
  partially_supported: 'Partially supported',
  unsupported: 'Unsupported',
};

export const ENTAILMENT_HELP: Record<EntailmentLabelValue, string> = {
  supported: 'The quote states the claim, including its numbers and conditions.',
  partially_supported:
    'The quote supports part of the claim, or a different value, condition or scope.',
  unsupported: 'The quote does not state the claim. Read it before relying on this.',
};

/** Pill colours per label. Colour never carries the meaning alone: every use also prints the label. */
export const ENTAILMENT_PILL_CLASS: Record<EntailmentLabelValue, string> = {
  supported:
    'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  partially_supported:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  unsupported:
    'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
};

export interface EntailmentIndex {
  byPair: Map<string, EntailmentLabel>;
  byCitation: Map<number, EntailmentLabel[]>;
}

const pairKey = (claimIndex: number, citationId: number) => `${claimIndex}:${citationId}`;

export function indexEntailment(report: EntailmentReport | null | undefined): EntailmentIndex {
  const byPair = new Map<string, EntailmentLabel>();
  const byCitation = new Map<number, EntailmentLabel[]>();
  for (const label of report?.labels ?? []) {
    byPair.set(pairKey(label.claim_index, label.citation_id), label);
    const list = byCitation.get(label.citation_id);
    if (list) list.push(label);
    else byCitation.set(label.citation_id, [label]);
  }
  return { byPair, byCitation };
}

export function labelForPair(
  index: EntailmentIndex,
  claimIndex: number | null,
  citationId: number
): EntailmentLabel | null {
  if (claimIndex == null) return null;
  return index.byPair.get(pairKey(claimIndex, citationId)) ?? null;
}

/**
 * The claim a marker belongs to, or null when it cannot be told. The k-th
 * marker follows claims[k]; that is only trusted when the ids agree, so a
 * mismatch degrades to "no per-marker label", never to a wrong one.
 */
export function claimIndexForMarker(
  claims: Claim[],
  markerIndex: number,
  ids: number[]
): number | null {
  const claim = claims[markerIndex];
  if (!claim) return null;
  const a = [...claim.citation_ids].sort((x, y) => x - y).join(',');
  const b = [...ids].sort((x, y) => x - y).join(',');
  return a === b ? claim.index : null;
}

// ---------------------------------------------------------------------------
// Model names
// ---------------------------------------------------------------------------

/** "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5". */
export function formatModelName(id: string | null | undefined): string | null {
  if (!id) return null;
  const parts = id
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .split('-')
    .filter(Boolean);
  if (!parts.length) return id;
  const words: string[] = [];
  const nums: string[] = [];
  for (const part of parts) {
    if (/^\d+$/.test(part)) nums.push(part);
    else words.push(part.charAt(0).toUpperCase() + part.slice(1));
  }
  return [...words, nums.join('.')].filter(Boolean).join(' ');
}

/**
 * What one turn cost, as text, or null when there is nothing honest to say.
 *
 * Reads `actual.cost_usd` only: the response's own counters. The `estimate`
 * figure is input-only and an upper bound, so showing it as the turn's cost
 * would overstate it. Null for an unpriced model (`known_model` false or no
 * price row), a message from before the backend sent a budget, and zero:
 * "$0.00" would read as free when it means unmeasured.
 *
 * Always three decimals. A single answer is usually cents or fractions of one,
 * and a precision that changes with the size makes two answers hard to compare.
 */
export function formatTurnCost(budget: TurnBudget | null | undefined): string | null {
  if (!budget || budget.known_model === false) return null;
  const cost = budget.actual?.cost_usd;
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) return null;
  return cost < 0.0005 ? '<$0.001' : `$${cost.toFixed(3)}`;
}
