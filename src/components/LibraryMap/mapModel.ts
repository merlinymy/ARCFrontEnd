// Turns the /library-map payload into typed arrays the renderer can draw from
// without allocating per frame: content-layout positions, a quadtree for hit
// testing, topic-cluster membership, label anchors, edges and search keys.
// The payload's structure fields (xy.structure, archetype, barcode) are ignored.
import { quadtree, type Quadtree } from 'd3-quadtree';
import type { LibraryMapCluster, LibraryMapFootprint, LibraryMapPaper, LibraryMapResponse, PaperFlag, SectionRole } from '../../types';
import { DEFAULT_ROLE_LABEL } from './format';

/** v2.0-I flags, in display order; bit k of MapModel.flagBits is FLAG_ORDER[k] */
export const FLAG_ORDER: readonly PaperFlag[] = ['duplicate', 'captions_only', 'filename_title', 'suspicious_year'];

/** A topic cluster (coarse "c*" or fine "f*"). */
export interface GroupRef {
  kind: 'cluster';
  id: string;
}

export interface ClusterInfo extends LibraryMapCluster {
  levelIndex: number;
  members: Int32Array;
}

export interface LabelAnchor {
  key: string;
  group: GroupRef;
  text: string;
  size: number;
  level: 'coarse' | 'fine';
  /** tooltip noun when not a topic (e.g. "Layout type") */
  what?: string;
  /** data coordinates in the layout */
  x: number;
  y: number;
}

export interface MapModel {
  data: LibraryMapResponse;
  n: number;
  papers: LibraryMapPaper[];
  idToIndex: Map<string, number>;
  /** n*2 content-layout coordinates, y up */
  pos: Float32Array;
  bbox: [number, number, number, number];
  tree: Quadtree<number>;
  /** 0 = no year */
  year: Int16Array;
  yearMin: number;
  yearMax: number;
  noYearCount: number;
  coarse: ClusterInfo[];
  fine: ClusterInfo[];
  clusterById: Map<string, ClusterInfo>;
  /** level index per paper, -1 when the cluster id is unknown */
  coarseOf: Int16Array;
  fineOf: Int16Array;
  /** 2*m endpoint indices and m scores */
  edges: Uint32Array;
  edgeScore: Float32Array;
  /** score tertile (0 weakest .. 2 strongest) */
  edgeBucket: Uint8Array;
  labels: { coarse: LabelAnchor[]; fine: LabelAnchor[] };
  titleLower: string[];
  authorsLower: string[];
  roleLabel: Record<SectionRole, string>;
  /** section_name -> role, from the payload's roles[].sections (the contract vocabulary) */
  sectionRole: Map<string, SectionRole>;
  /** v2.0-I: bit k set when the paper has FLAG_ORDER[k] */
  flagBits: Uint8Array;
  /** papers per flag (FLAG_ORDER order) and papers with any flag */
  flagCounts: number[];
  flaggedCount: number;
  /**
   * v1.2-E copy groups: the lowest index in each paper's group (itself when it has
   * no copies). Counting distinct roots counts each copy group once.
   */
  copyRoot: Int32Array;
  /** papers counted once per copy group */
  distinctCount: number;
  /** lazily filled: members sorted by distance to their cluster's centroid */
  sortedMembers: Map<string, number[]>;
  /** Engineering scatter only: layout-type slot per paper (ARCHETYPE_ORDER index) */
  archetype?: Uint8Array;
  /** Engineering scatter only: 1 = no position in this layout (not drawn, not hit) */
  hidden?: Uint8Array;
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Median of the members, snapped to the nearest member if it lands in empty space. */
export function anchorFor(members: ArrayLike<number>, pos: Float32Array): [number, number] {
  const m = members.length;
  if (!m) return [0.5, 0.5];
  const xs = new Float32Array(m);
  const ys = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    xs[k] = pos[2 * members[k]];
    ys[k] = pos[2 * members[k] + 1];
  }
  xs.sort();
  ys.sort();
  const mx = xs[m >> 1];
  const my = ys[m >> 1];
  let best = Infinity;
  let bx = mx;
  let by = my;
  for (let k = 0; k < m; k++) {
    const dx = pos[2 * members[k]] - mx;
    const dy = pos[2 * members[k] + 1] - my;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bx = pos[2 * members[k]];
      by = pos[2 * members[k] + 1];
    }
  }
  return best > 0.02 * 0.02 ? [bx, by] : [mx, my];
}

export function buildMapModel(data: LibraryMapResponse): MapModel {
  const papers = Array.isArray(data.papers) ? data.papers : [];
  const n = papers.length;
  const idToIndex = new Map<string, number>();
  papers.forEach((p, i) => idToIndex.set(p.id, i));

  const pos = new Float32Array(n * 2);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const xy = papers[i].xy?.content;
    const x = finite(xy?.[0], 0.5);
    const y = finite(xy?.[1], 0.5);
    pos[2 * i] = x;
    pos[2 * i + 1] = y;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (!n) {
    x0 = 0;
    y0 = 0;
    x1 = 1;
    y1 = 1;
  }
  const tree = quadtree<number>()
    .x((i) => pos[2 * i])
    .y((i) => pos[2 * i + 1])
    .addAll(Array.from({ length: n }, (_, i) => i));

  const year = new Int16Array(n);
  let yearMin = Infinity;
  let yearMax = -Infinity;
  let noYearCount = 0;
  for (let i = 0; i < n; i++) {
    const y = papers[i].year;
    if (typeof y === 'number' && Number.isFinite(y) && y > 0) {
      year[i] = y;
      if (y < yearMin) yearMin = y;
      if (y > yearMax) yearMax = y;
    } else {
      noYearCount++;
    }
  }
  if (!Number.isFinite(yearMin)) {
    yearMin = 2000;
    yearMax = 2000;
  }

  const clusterById = new Map<string, ClusterInfo>();
  const coarse: ClusterInfo[] = [];
  const fine: ClusterInfo[] = [];
  for (const c of Array.isArray(data.clusters) ? data.clusters : []) {
    const list = c.level === 'fine' ? fine : coarse;
    const info: ClusterInfo = { ...c, terms: Array.isArray(c.terms) ? c.terms : [], levelIndex: list.length, members: new Int32Array(0) };
    list.push(info);
    clusterById.set(c.id, info);
  }
  const coarseOf = new Int16Array(n).fill(-1);
  const fineOf = new Int16Array(n).fill(-1);
  const coarseLists: number[][] = coarse.map(() => []);
  const fineLists: number[][] = fine.map(() => []);
  for (let i = 0; i < n; i++) {
    const cl = papers[i].cluster;
    const co = cl ? clusterById.get(cl.coarse) : undefined;
    if (co && co.level === 'coarse') {
      coarseOf[i] = co.levelIndex;
      coarseLists[co.levelIndex].push(i);
    }
    const fi = cl ? clusterById.get(cl.fine) : undefined;
    if (fi && fi.level === 'fine') {
      fineOf[i] = fi.levelIndex;
      fineLists[fi.levelIndex].push(i);
    }
  }
  coarse.forEach((c, k) => (c.members = Int32Array.from(coarseLists[k])));
  fine.forEach((c, k) => (c.members = Int32Array.from(fineLists[k])));

  const anchor = (c: ClusterInfo, level: 'coarse' | 'fine'): LabelAnchor => {
    const [x, y] = anchorFor(c.members, pos);
    return { key: `cluster:${c.id}`, group: { kind: 'cluster', id: c.id }, text: c.label || c.id, size: c.members.length, level, x, y };
  };

  const roleLabel = { ...DEFAULT_ROLE_LABEL };
  const sectionRole = new Map<string, SectionRole>();
  for (const r of Array.isArray(data.roles) ? data.roles : []) {
    if (!r || !(r.id in roleLabel)) continue;
    if (r.label) roleLabel[r.id] = r.label;
    for (const s of Array.isArray(r.sections) ? r.sections : []) if (typeof s === 'string') sectionRole.set(s, r.id);
  }

  const flagBits = new Uint8Array(n);
  const flagCounts = FLAG_ORDER.map(() => 0);
  let flaggedCount = 0;
  for (let i = 0; i < n; i++) {
    const flags = papers[i].flags;
    if (!Array.isArray(flags) || !flags.length) continue;
    let bits = 0;
    FLAG_ORDER.forEach((f, k) => {
      if (flags.includes(f)) {
        bits |= 1 << k;
        flagCounts[k]++;
      }
    });
    flagBits[i] = bits;
    if (bits) flaggedCount++;
  }

  // copy groups: duplicates lists are symmetric, so the lowest index is a stable group key
  const copyRoot = new Int32Array(n);
  let distinctCount = 0;
  for (let i = 0; i < n; i++) {
    let root = i;
    for (const id of papers[i].duplicates ?? []) {
      const j = idToIndex.get(id);
      if (j != null && j < root) root = j;
    }
    copyRoot[i] = root;
    if (root === i) distinctCount++;
  }

  // edges: validate, then bucket by score tertile
  const rawEdges = Array.isArray(data.edges) ? data.edges : [];
  const edgeBuf = new Uint32Array(rawEdges.length * 2);
  const scoreBuf = new Float32Array(rawEdges.length);
  let m = 0;
  for (const e of rawEdges) {
    if (!Array.isArray(e)) continue;
    const a = e[0];
    const b = e[1];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) continue;
    edgeBuf[2 * m] = a;
    edgeBuf[2 * m + 1] = b;
    scoreBuf[m] = finite(e[2], 0);
    m++;
  }
  const edges = edgeBuf.slice(0, 2 * m);
  const edgeScore = scoreBuf.slice(0, m);
  const sortedScores = Float32Array.from(edgeScore).sort();
  const t1 = m ? sortedScores[Math.floor(m / 3)] : 0;
  const t2 = m ? sortedScores[Math.floor((2 * m) / 3)] : 0;
  const edgeBucket = new Uint8Array(m);
  for (let k = 0; k < m; k++) edgeBucket[k] = edgeScore[k] < t1 ? 0 : edgeScore[k] < t2 ? 1 : 2;

  return {
    data,
    n,
    papers,
    idToIndex,
    pos,
    bbox: [x0, y0, x1, y1],
    tree,
    year,
    yearMin,
    yearMax,
    noYearCount,
    coarse,
    fine,
    clusterById,
    coarseOf,
    fineOf,
    edges,
    edgeScore,
    edgeBucket,
    labels: {
      coarse: coarse.filter((c) => c.members.length > 0).map((c) => anchor(c, 'coarse')),
      fine: fine.filter((c) => c.members.length > 0).map((c) => anchor(c, 'fine')),
    },
    titleLower: papers.map((p) => (p.title || '').toLowerCase()),
    authorsLower: papers.map((p) => (Array.isArray(p.authors) ? p.authors.join(' · ') : '').toLowerCase()),
    roleLabel,
    sectionRole,
    flagBits,
    flagCounts,
    flaggedCount,
    copyRoot,
    distinctCount,
    sortedMembers: new Map(),
  };
}

// ---------------------------------------------------------------- copies, Ask ARC, footprint

export function hasFlag(model: MapModel, i: number, flag: PaperFlag): boolean {
  return (model.flagBits[i] & (1 << FLAG_ORDER.indexOf(flag))) !== 0;
}

/**
 * The copy-group representative: the copy without the `duplicate` flag (v2.0-I).
 * Without flags (an older payload) every paper represents itself.
 */
export function representativeOf(model: MapModel, i: number): number {
  if (!hasFlag(model, i, 'duplicate')) return i;
  for (const id of model.papers[i].duplicates ?? []) {
    const j = model.idToIndex.get(id);
    if (j != null && !hasFlag(model, j, 'duplicate')) return j;
  }
  return i;
}

export const ASK_CAP = 100;

/** Paper ids for "Ask ARC about these papers": representatives only, deduped, capped (L). */
export function askPaperIds(model: MapModel, indices: Iterable<number>, cap = ASK_CAP): string[] {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const i of indices) {
    const r = representativeOf(model, i);
    if (seen.has(r)) continue;
    seen.add(r);
    out.push(model.papers[r].id);
    if (out.length >= cap) break;
  }
  return out;
}

export interface CitedInfo {
  /**
   * answers citing each paper (0 = not cited), merged by copy group: every copy
   * carries its group's value
   */
  answers: Uint16Array;
  lastCited: Array<string | undefined>;
  /** cited papers, each copy group counted once */
  citedCount: number;
  nAnswers: number;
  nConversations: number;
}

/**
 * Merge the reading footprint (K) into per-paper arrays. The footprint counts each
 * copy of a paper separately (one answer usually cites several copies of the same
 * passages), so a copy group's count is the MAX over its members, not the sum, and
 * the group counts as one cited paper.
 */
export function buildCited(model: MapModel, footprint: LibraryMapFootprint): CitedInfo {
  const groupAnswers = new Uint16Array(model.n);
  const groupLast: Array<string | undefined> = new Array(model.n);
  for (const [id, info] of Object.entries(footprint.papers ?? {})) {
    const i = model.idToIndex.get(id);
    if (i == null || !info) continue;
    const a = Math.max(0, Math.min(65535, Math.round(Number(info.answers) || 0)));
    if (!a) continue;
    const root = model.copyRoot[i];
    if (a > groupAnswers[root]) groupAnswers[root] = a;
    const last = typeof info.last_cited === 'string' ? info.last_cited : undefined;
    if (last && (!groupLast[root] || last > (groupLast[root] as string))) groupLast[root] = last;
  }
  const answers = new Uint16Array(model.n);
  const lastCited: Array<string | undefined> = new Array(model.n);
  let citedCount = 0;
  for (let i = 0; i < model.n; i++) {
    const root = model.copyRoot[i];
    answers[i] = groupAnswers[root];
    lastCited[i] = groupLast[root];
    if (root === i && groupAnswers[i] > 0) citedCount++;
  }
  return { answers, lastCited, citedCount, nAnswers: footprint.n_answers ?? 0, nConversations: footprint.n_conversations ?? 0 };
}

/** Distinct papers (copy groups) among `indices`, and how many of them ARC has cited. */
export function distinctCounts(model: MapModel, indices: ArrayLike<number>, cited: CitedInfo | null): { distinct: number; cited: number } {
  const seen = new Set<number>();
  let c = 0;
  for (let k = 0; k < indices.length; k++) {
    const root = model.copyRoot[indices[k]];
    if (seen.has(root)) continue;
    seen.add(root);
    if (cited && cited.answers[root] > 0) c++;
  }
  return { distinct: seen.size, cited: c };
}

/** Ordinal bins for "cited by ARC": 1, 2-4, 5-9, 10+ answers (0 = not cited). */
export function citedBin(answers: number): number {
  if (answers <= 0) return -1;
  if (answers === 1) return 0;
  if (answers <= 4) return 1;
  if (answers <= 9) return 2;
  return 3;
}
export const CITED_BIN_LABELS = ['1 answer', '2–4', '5–9', '10+'] as const;

// ---------------------------------------------------------------- groups

export function groupKey(g: GroupRef): string {
  return `${g.kind}:${g.id}`;
}

export function groupMembers(model: MapModel, g: GroupRef): Int32Array {
  return model.clusterById.get(g.id)?.members ?? new Int32Array(0);
}

export function groupLabel(model: MapModel, g: GroupRef): string {
  return model.clusterById.get(g.id)?.label ?? g.id;
}

/**
 * Members ordered by distance to the cluster's centroid on the map: a "typical
 * members first" ordering, not a similarity score.
 */
export function membersByCentroid(model: MapModel, g: GroupRef): number[] {
  const key = groupKey(g);
  const cached = model.sortedMembers.get(key);
  if (cached) return cached;
  const members = groupMembers(model, g);
  const { pos } = model;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < members.length; k++) {
    cx += pos[2 * members[k]];
    cy += pos[2 * members[k] + 1];
  }
  cx /= members.length || 1;
  cy /= members.length || 1;
  const dist = (i: number) => (pos[2 * i] - cx) ** 2 + (pos[2 * i + 1] - cy) ** 2;
  const sorted = Array.from(members).sort((a, b) => dist(a) - dist(b) || a - b);
  model.sortedMembers.set(key, sorted);
  return sorted;
}

// ---------------------------------------------------------------- search

/** Title/author substring search (or an exact paper id); best match first. */
export function searchPapers(model: MapModel, query: string, limit = 8): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = model.idToIndex.get(query.trim());
  const ranked: Array<[number, number, number]> = [];
  for (let i = 0; i < model.n; i++) {
    const t = model.titleLower[i];
    const at = t.indexOf(q);
    let rank = -1;
    if (i === exact) rank = 0;
    else if (at === 0) rank = 1;
    else if (at > 0) rank = /[\s\-:(/"'[]/.test(t[at - 1]) ? 2 : 3;
    else if (model.authorsLower[i].includes(q)) rank = 4;
    if (rank >= 0) ranked.push([rank, t.length, i]);
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return ranked.slice(0, limit).map((r) => r[2]);
}

// ---------------------------------------------------------------- filters

export interface MapFilters {
  yearMin: number | null;
  yearMax: number | null;
  includeNoYear: boolean;
}

export const DEFAULT_FILTERS: MapFilters = { yearMin: null, yearMax: null, includeNoYear: true };

export function activeFilterCount(model: MapModel, f: MapFilters): number {
  let c = 0;
  if ((f.yearMin != null && f.yearMin > model.yearMin) || (f.yearMax != null && f.yearMax < model.yearMax)) c++;
  if (!f.includeNoYear && model.noYearCount > 0) c++;
  return c;
}

/** 1 = passes the filters; null when nothing is filtered. */
export function computeMask(model: MapModel, f: MapFilters): Uint8Array | null {
  if (!activeFilterCount(model, f)) return null;
  const lo = f.yearMin ?? -Infinity;
  const hi = f.yearMax ?? Infinity;
  const mask = new Uint8Array(model.n);
  for (let i = 0; i < model.n; i++) {
    const y = model.year[i];
    mask[i] = (y === 0 ? f.includeNoYear : y >= lo && y <= hi) ? 1 : 0;
  }
  return mask;
}
