// The Engineering tab's data (contract v2.1-O), joined to the researcher map for
// titles, plus a MapModel of the STRUCTURE layout so the same canvas renderer can
// draw it (layout-type colors, the restored "archetype" mode).
import { quadtree } from 'd3-quadtree';
import type { ArchetypeId, LibraryMapEngineering, LibraryMapPaper, SectionRole, UndeterminedCause } from '../../types';
import { ARCHETYPE_ORDER, CAUSE_ORDER, DEFAULT_ROLE_LABEL } from './format';
import { anchorFor, FLAG_ORDER, type ClusterInfo, type LabelAnchor, type MapModel } from './mapModel';

export interface EngineeringModel {
  data: LibraryMapEngineering;
  /** the structure layout as a MapModel (indices = engineering papers' order) */
  scatter: MapModel;
  n: number;
  /** ARCHETYPE_ORDER slot per paper */
  archetype: Uint8Array;
  /** CAUSE_ORDER index per paper, -1 = none */
  cause: Int8Array;
  /** NaN when unknown (no body text) */
  unlabeled: Float32Array;
  /** the paper's index in the researcher map, -1 when it isn't there */
  mapIndex: Int32Array;
  archetypeLabel: Record<ArchetypeId, string>;
  archetypeDescription: Record<ArchetypeId, string>;
  /** papers per layout type / cause (ARCHETYPE_ORDER / CAUSE_ORDER) */
  archetypeCounts: number[];
  causeCounts: number[];
  /** papers without a structure position (not drawn) */
  noPosition: number;
  roleLabel: Record<SectionRole, string>;
  sectionRole: Map<string, SectionRole>;
  /** mean unlabeled share over papers that have body text, and how many are >= 60% */
  unlabeledMean: number | null;
  unlabeledHigh: number;
  withBody: number;
}

const FALLBACK_LABEL: Record<ArchetypeId, string> = {
  imrad: 'IMRaD',
  combined_rd: 'Combined R&D',
  no_methods: 'No methods section',
  unstructured: 'Undetermined',
};

function placeholderPaper(id: string): LibraryMapPaper {
  return {
    id,
    title: id,
    authors: [],
    n_authors: 0,
    year: null,
    xy: { content: [0.5, 0.5] },
    cluster: { fine: '', coarse: '' },
    counts: { pages: null, chunks: 0, captions: 0, tables: 0, tokens: 0 },
    lenses: [],
  };
}

export function buildEngineeringModel(data: LibraryMapEngineering, map: MapModel): EngineeringModel {
  const list = Array.isArray(data.papers) ? data.papers : [];
  const n = list.length;
  const archetypeLabel = { ...FALLBACK_LABEL };
  const archetypeDescription: Record<ArchetypeId, string> = { imrad: '', combined_rd: '', no_methods: '', unstructured: '' };
  for (const a of Array.isArray(data.archetypes) ? data.archetypes : []) {
    if (!a || !(a.id in archetypeLabel)) continue;
    if (a.label) archetypeLabel[a.id] = a.label;
    if (a.description) archetypeDescription[a.id] = a.description;
  }
  const roleLabel = { ...DEFAULT_ROLE_LABEL };
  const sectionRole = new Map<string, SectionRole>();
  for (const r of Array.isArray(data.roles) ? data.roles : []) {
    if (!r || !(r.id in roleLabel)) continue;
    if (r.label) roleLabel[r.id] = r.label;
    for (const s of Array.isArray(r.sections) ? r.sections : []) if (typeof s === 'string') sectionRole.set(s, r.id);
  }

  const archetype = new Uint8Array(n);
  const cause = new Int8Array(n).fill(-1);
  const unlabeled = new Float32Array(n);
  const mapIndex = new Int32Array(n).fill(-1);
  const archetypeCounts = ARCHETYPE_ORDER.map(() => 0);
  const causeCounts = CAUSE_ORDER.map(() => 0);
  const pos = new Float32Array(n * 2);
  const hidden = new Uint8Array(n);
  const papers: LibraryMapPaper[] = new Array(n);
  const idToIndex = new Map<string, number>();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let noPosition = 0;
  let sum = 0;
  let withBody = 0;
  let unlabeledHigh = 0;
  for (let i = 0; i < n; i++) {
    const p = list[i];
    idToIndex.set(p.id, i);
    const j = map.idToIndex.get(p.id);
    if (j != null) mapIndex[i] = j;
    papers[i] = j != null ? map.papers[j] : placeholderPaper(p.id);
    const slot = ARCHETYPE_ORDER.indexOf(p.archetype);
    archetype[i] = slot >= 0 ? slot : ARCHETYPE_ORDER.length - 1;
    archetypeCounts[archetype[i]]++;
    const c = p.cause ? CAUSE_ORDER.indexOf(p.cause as UndeterminedCause) : -1;
    cause[i] = c;
    if (c >= 0) causeCounts[c]++;
    const share = typeof p.unlabeled_share === 'number' && Number.isFinite(p.unlabeled_share) ? p.unlabeled_share : NaN;
    unlabeled[i] = share;
    if (!Number.isNaN(share)) {
      sum += share;
      withBody++;
      if (share >= 0.6) unlabeledHigh++;
    }
    const xy = p.xy;
    const x = Array.isArray(xy) ? Number(xy[0]) : NaN;
    const y = Array.isArray(xy) ? Number(xy[1]) : NaN;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pos[2 * i] = x;
      pos[2 * i + 1] = y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    } else {
      pos[2 * i] = NaN;
      pos[2 * i + 1] = NaN;
      hidden[i] = 1;
      noPosition++;
    }
  }
  if (!Number.isFinite(x0)) {
    x0 = 0;
    y0 = 0;
    x1 = 1;
    y1 = 1;
  }
  const visible: number[] = [];
  for (let i = 0; i < n; i++) if (!hidden[i]) visible.push(i);
  const tree = quadtree<number>()
    .x((i) => pos[2 * i])
    .y((i) => pos[2 * i + 1])
    .addAll(visible);

  // layout types as label groups: hovering a label highlights its papers, clicking filters
  const clusterById = new Map<string, ClusterInfo>();
  const anchors: LabelAnchor[] = [];
  ARCHETYPE_ORDER.forEach((a, slot) => {
    const members = Int32Array.from(visible.filter((i) => archetype[i] === slot));
    const id = `layout:${a}`;
    clusterById.set(id, {
      id,
      level: 'coarse',
      parent: null,
      label: archetypeLabel[a],
      terms: [],
      size: archetypeCounts[slot],
      levelIndex: slot,
      members,
    });
    if (!members.length) return;
    const [x, y] = anchorFor(members, pos);
    anchors.push({ key: `cluster:${id}`, group: { kind: 'cluster', id }, text: archetypeLabel[a], size: members.length, level: 'coarse', what: 'Layout type', x, y });
  });

  const year = new Int16Array(n);
  let yearMin = Infinity;
  let yearMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = papers[i].year;
    if (typeof y === 'number' && y > 0) {
      year[i] = y;
      if (y < yearMin) yearMin = y;
      if (y > yearMax) yearMax = y;
    }
  }
  const scatter: MapModel = {
    data: map.data,
    n,
    papers,
    idToIndex,
    pos,
    bbox: [x0, y0, x1, y1],
    tree,
    year,
    yearMin: Number.isFinite(yearMin) ? yearMin : map.yearMin,
    yearMax: Number.isFinite(yearMax) ? yearMax : map.yearMax,
    noYearCount: 0,
    coarse: [],
    fine: [],
    clusterById,
    coarseOf: new Int16Array(n).fill(-1),
    fineOf: new Int16Array(n).fill(-1),
    edges: new Uint32Array(0),
    edgeScore: new Float32Array(0),
    edgeBucket: new Uint8Array(0),
    labels: { coarse: anchors, fine: anchors },
    titleLower: papers.map((p) => (p.title || '').toLowerCase()),
    authorsLower: papers.map((p) => (Array.isArray(p.authors) ? p.authors.join(' · ') : '').toLowerCase()),
    roleLabel,
    sectionRole,
    flagBits: new Uint8Array(n),
    flagCounts: FLAG_ORDER.map(() => 0),
    flaggedCount: 0,
    copyRoot: Int32Array.from({ length: n }, (_, i) => i),
    distinctCount: n,
    sortedMembers: new Map(),
    archetype,
    hidden,
  };

  return {
    data,
    scatter,
    n,
    archetype,
    cause,
    unlabeled,
    mapIndex,
    archetypeLabel,
    archetypeDescription,
    archetypeCounts,
    causeCounts,
    noPosition,
    roleLabel,
    sectionRole,
    unlabeledMean: withBody ? sum / withBody : null,
    unlabeledHigh,
    withBody,
  };
}

/** 1 = matches the layout-type / cause filters; null = no filter. */
export function engineeringMask(em: EngineeringModel, layout: ArchetypeId | null, cause: UndeterminedCause | null): Uint8Array | null {
  if (!layout && !cause) return null;
  const slot = layout ? ARCHETYPE_ORDER.indexOf(layout) : -1;
  const c = cause ? CAUSE_ORDER.indexOf(cause) : -1;
  const mask = new Uint8Array(em.n);
  for (let i = 0; i < em.n; i++) mask[i] = (slot < 0 || em.archetype[i] === slot) && (c < 0 || em.cause[i] === c) ? 1 : 0;
  return mask;
}
