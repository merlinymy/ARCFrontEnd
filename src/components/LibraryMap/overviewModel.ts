// Numbers for the Overview tab: library-wide distribution, per-topic rows, and the
// topic-correlation matrix. Everything respects the year filter (the mask) except
// the correlation matrix itself, which the backend computes over the whole library.
// Copies (v1.2-E) count once wherever "distinct papers" or "cited" is reported.
import type { TopicCorrelationLevel } from '../../types';
import { FLAG_ORDER, hasFlag, type CitedInfo, type MapModel } from './mapModel';

const inScope = (mask: Uint8Array | null, i: number) => !mask || mask[i] === 1;

export interface ScopeStats {
  papers: number;
  /** copy groups counted once */
  distinct: number;
  /** distinct papers ARC answers have cited (null without a footprint) */
  cited: number | null;
  redundant: number;
  /** papers with any needs-attention flag, and per flag (FLAG_ORDER) */
  flagged: number;
  flagCounts: number[];
  /** distinct papers without a year */
  noYear: number;
  suspicious: number;
  coarseTopics: number;
  fineTopics: number;
  /** one entry per distinct paper in scope (0 = no year) */
  years: Int16Array;
  /** the cited subset, same unit; null without a footprint */
  citedYears: Int16Array | null;
}

export function scopeStats(model: MapModel, mask: Uint8Array | null, cited: CitedInfo | null): ScopeStats {
  let papers = 0;
  let redundant = 0;
  let flagged = 0;
  let suspicious = 0;
  const flagCounts = FLAG_ORDER.map(() => 0);
  const roots = new Set<number>();
  const coarse = new Set<number>();
  const fine = new Set<number>();
  for (let i = 0; i < model.n; i++) {
    if (!inScope(mask, i)) continue;
    papers++;
    roots.add(model.copyRoot[i]);
    if (model.flagBits[i]) flagged++;
    FLAG_ORDER.forEach((f, k) => {
      if (hasFlag(model, i, f)) flagCounts[k]++;
    });
    if (hasFlag(model, i, 'duplicate')) redundant++;
    if (hasFlag(model, i, 'suspicious_year')) suspicious++;
    if (model.coarseOf[i] >= 0) coarse.add(model.coarseOf[i]);
    if (model.fineOf[i] >= 0) fine.add(model.fineOf[i]);
  }
  const years = new Int16Array(roots.size);
  const citedList: number[] = [];
  let noYear = 0;
  let k = 0;
  for (const r of roots) {
    const y = model.year[r];
    years[k++] = y;
    if (!y) noYear++;
    if (cited && cited.answers[r] > 0) citedList.push(y);
  }
  return {
    papers,
    distinct: roots.size,
    cited: cited ? citedList.length : null,
    redundant,
    flagged,
    flagCounts,
    noYear,
    suspicious,
    coarseTopics: coarse.size,
    fineTopics: fine.size,
    years,
    citedYears: cited ? Int16Array.from(citedList) : null,
  };
}

// ---------------------------------------------------------------- topic rows

/** One year axis shared by every row's sparkline, so shapes compare across rows. */
export interface YearAxis {
  start: number;
  binSize: number;
  nBins: number;
  /** first year of the "recent" window (the library's last five years) */
  recentFrom: number;
}

export function yearAxis(model: MapModel): YearAxis {
  const span = model.yearMax - model.yearMin + 1;
  const binSize = [1, 2, 5, 10].find((b) => span / b <= 30) ?? 10;
  const start = Math.floor(model.yearMin / binSize) * binSize;
  return { start, binSize, nBins: Math.floor((model.yearMax - start) / binSize) + 1, recentFrom: model.yearMax - 4 };
}

export interface TopicStat {
  id: string;
  label: string;
  terms: string[];
  level: 'coarse' | 'fine';
  parent: string | null;
  /** member indices in scope */
  members: number[];
  papers: number;
  distinct: number;
  cited: number | null;
  /** cited distinct papers / distinct papers; null without a footprint */
  citedShare: number | null;
  yearBins: number[];
  noYear: number;
  median: number | null;
  /** share of dated papers from the library's last five years */
  recentShare: number | null;
  flagged: number;
}

function topicStat(
  model: MapModel,
  id: string,
  all: ArrayLike<number>,
  mask: Uint8Array | null,
  cited: CitedInfo | null,
  axis: YearAxis
): TopicStat {
  const c = model.clusterById.get(id);
  const members: number[] = [];
  for (let k = 0; k < all.length; k++) if (inScope(mask, all[k])) members.push(all[k]);
  const yearBins = new Array<number>(axis.nBins).fill(0);
  const dated: number[] = [];
  let noYear = 0;
  let flagged = 0;
  let recent = 0;
  const roots = new Set<number>();
  let citedCount = 0;
  for (const i of members) {
    const y = model.year[i];
    if (y) {
      const b = Math.floor((y - axis.start) / axis.binSize);
      if (b >= 0 && b < axis.nBins) yearBins[b]++;
      dated.push(y);
      if (y >= axis.recentFrom) recent++;
    } else {
      noYear++;
    }
    if (model.flagBits[i]) flagged++;
    const r = model.copyRoot[i];
    if (!roots.has(r)) {
      roots.add(r);
      if (cited && cited.answers[r] > 0) citedCount++;
    }
  }
  dated.sort((a, b) => a - b);
  const median = dated.length ? (dated.length % 2 ? dated[dated.length >> 1] : Math.round((dated[dated.length / 2 - 1] + dated[dated.length / 2]) / 2)) : null;
  return {
    id,
    label: c?.label || id,
    terms: c?.terms ?? [],
    level: c?.level ?? 'coarse',
    parent: c?.parent ?? null,
    members,
    papers: members.length,
    distinct: roots.size,
    cited: cited ? citedCount : null,
    citedShare: cited ? (roots.size ? citedCount / roots.size : 0) : null,
    yearBins,
    noYear,
    median,
    recentShare: dated.length ? recent / dated.length : null,
    flagged,
  };
}

export function topicStats(
  model: MapModel,
  mask: Uint8Array | null,
  cited: CitedInfo | null,
  axis: YearAxis
): { coarse: TopicStat[]; fine: TopicStat[] } {
  return {
    coarse: model.coarse.map((c) => topicStat(model, c.id, c.members, mask, cited, axis)),
    fine: model.fine.map((c) => topicStat(model, c.id, c.members, mask, cited, axis)),
  };
}

export type TopicSortKey = 'label' | 'papers' | 'cited' | 'years' | 'median' | 'flagged';

export function sortTopics(rows: TopicStat[], key: TopicSortKey, dir: 1 | -1): TopicStat[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const num = (v: number | null) => (v == null ? -Infinity : v);
  return [...rows].sort((a, b) => {
    let r = 0;
    if (key === 'label') r = collator.compare(a.label, b.label) * dir;
    else if (key === 'papers') r = (a.papers - b.papers) * dir;
    else if (key === 'cited') r = (num(a.citedShare) - num(b.citedShare)) * dir;
    else if (key === 'years') r = (num(a.recentShare) - num(b.recentShare)) * dir;
    else if (key === 'median') r = (num(a.median) - num(b.median)) * dir;
    else r = (a.flagged - b.flagged) * dir;
    // nulls (no data) always last, whatever the direction
    if (key === 'cited' || key === 'years' || key === 'median') {
      const av = key === 'cited' ? a.citedShare : key === 'years' ? a.recentShare : a.median;
      const bv = key === 'cited' ? b.citedShare : key === 'years' ? b.recentShare : b.median;
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
    }
    return r || b.papers - a.papers || collator.compare(a.label, b.label);
  });
}

// ---------------------------------------------------------------- topic correlation

export interface CorrelationView {
  ids: string[];
  labels: string[];
  /** cluster level index per row (into model.coarse / model.fine) */
  levelIndex: number[];
  values: number[][];
  /** color domain: the off-diagonal range */
  domain: [number, number];
}

/** Validate the payload's matrix (v2.0-J); null when absent or malformed. */
export function correlationView(model: MapModel, level: TopicCorrelationLevel | undefined): CorrelationView | null {
  if (!level || !Array.isArray(level.ids) || !Array.isArray(level.neighbor_share)) return null;
  const n = level.ids.length;
  if (!n || level.neighbor_share.length !== n) return null;
  const values: number[][] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const row = level.neighbor_share[i];
    if (!Array.isArray(row) || row.length !== n) return null;
    values.push(row.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)));
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const v = values[i][j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (hi - lo < 0.01) hi = lo + 0.01;
  const levelIndex = level.ids.map((id) => model.clusterById.get(id)?.levelIndex ?? -1);
  return {
    ids: level.ids,
    labels: level.ids.map((id) => model.clusterById.get(id)?.label || id),
    levelIndex,
    values,
    domain: [lo, hi],
  };
}

export interface TopicPair {
  a: number;
  b: number;
  score: number;
}

/**
 * The strongest content links between two topics (or inside one): the map's
 * similarity edges whose endpoints fall in the row and column topics, best first.
 * Both endpoints must pass the filters.
 */
export function topicPairs(
  model: MapModel,
  level: 'coarse' | 'fine',
  rowIndex: number,
  colIndex: number,
  mask: Uint8Array | null,
  limit = 20
): TopicPair[] {
  const of = level === 'coarse' ? model.coarseOf : model.fineOf;
  const out: TopicPair[] = [];
  const m = model.edgeScore.length;
  for (let e = 0; e < m; e++) {
    const i = model.edges[2 * e];
    const j = model.edges[2 * e + 1];
    if (!inScope(mask, i) || !inScope(mask, j)) continue;
    const ti = of[i];
    const tj = of[j];
    if (ti === rowIndex && tj === colIndex) out.push({ a: i, b: j, score: model.edgeScore[e] });
    else if (ti === colIndex && tj === rowIndex) out.push({ a: j, b: i, score: model.edgeScore[e] });
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, limit);
}
