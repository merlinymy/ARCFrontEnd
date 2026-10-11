// Labels, vocabularies and number formatting for the Library Map.
import type { ArchetypeId, ContentSource, MapLens, PaperFlag, SectionRole, UndeterminedCause } from '../../types';

export const ROLE_ORDER: readonly SectionRole[] = ['background', 'methods', 'findings', 'back_matter', 'unlabeled'];

/** Lenses the UI shows. The contract's `structure` lens is ignored (structure views were dropped). */
export type ShownLens = Exclude<MapLens, 'structure'>;
export const LENS_ORDER: readonly ShownLens[] = ['content', 'introduction', 'methods', 'results', 'discussion'];

export const DEFAULT_ROLE_LABEL: Record<SectionRole, string> = {
  background: 'Background',
  methods: 'Methods',
  findings: 'Findings',
  back_matter: 'Back matter',
  unlabeled: 'Unlabeled',
};

export const LENS_LABEL: Record<ShownLens, string> = {
  content: 'Content',
  introduction: 'Introduction',
  methods: 'Methods',
  results: 'Results',
  discussion: 'Discussion',
};

export const LENS_HELP: Record<ShownLens, string> = {
  content: 'Whole-paper content: cosine similarity of the paper vectors.',
  introduction: 'Introductions that read alike: cosine of the mean introduction vectors.',
  methods: 'Methods that read alike, often from a different topic region: cosine of the mean methods vectors.',
  results: 'Results that read alike: cosine of the mean results vectors.',
  discussion: 'Discussions and conclusions that read alike: cosine of the mean discussion vectors.',
};

export const PROJECTION_CAVEAT =
  'The 2-D map is a projection. Nearby points are mostly true neighbors, but long distances on screen are not meaningful. Every score shown is exact cosine similarity on the original vectors.';

export const BUILD_COMMAND = 'cd backend && ../venv/bin/python scripts/build_library_map.py';

/** v1.1: shown on every inferred passage tooltip */
export const INFERRED_NOTE = 'Role inferred from content — no heading detected';

/** Engineering: papers with no reading-order text */
export const NO_BODY_TEXT = 'No body text extracted';

/** Engineering: layout types, fixed order = color slot order (the last one is the neutral) */
export const ARCHETYPE_ORDER: readonly ArchetypeId[] = ['imrad', 'combined_rd', 'no_methods', 'unstructured'];

export const CAUSE_ORDER: readonly UndeterminedCause[] = ['no_body_text', 'mostly_unlabeled', 'methods_without_findings'];
export const CAUSE_LABEL: Record<UndeterminedCause, string> = {
  no_body_text: 'No body text extracted',
  mostly_unlabeled: 'Headings mostly not detected',
  methods_without_findings: 'Methods without findings',
};

export const CONTENT_SOURCE_ORDER: readonly ContentSource[] = ['full', 'pooled', 'fine', 'captions'];
export const CONTENT_SOURCE_LABEL: Record<ContentSource, string> = {
  full: 'Full-text vector',
  pooled: 'Pooled abstract + sections',
  fine: 'Pooled passages',
  captions: 'Figure captions only',
};

export function formatPages(start: number | null | undefined, end: number | null | undefined): string {
  if (start == null && end == null) return '';
  if (start != null && end != null && end !== start) return `pp. ${start}–${end}`;
  return `p. ${start ?? end}`;
}

/** v1.2-F: content_source === 'captions' */
export const CAPTIONS_ONLY_NOTE = 'Placed from figure captions only (no body text was extracted) — position approximate';

export const FLAG_LABEL: Record<PaperFlag, string> = {
  duplicate: 'Redundant copy',
  captions_only: 'Captions only',
  filename_title: 'File-name title',
  suspicious_year: 'Suspicious year',
};

export const FLAG_HELP: Record<PaperFlag, string> = {
  duplicate: 'A near-identical copy of another paper in the library (not the copy kept as the group’s representative).',
  captions_only: 'No body text was extracted; the paper is placed from its figure captions only.',
  filename_title: 'The title looks like a file name or publisher id rather than a real title.',
  suspicious_year: 'The year matches digits in a publisher id in the file name, so it may be wrong.',
};

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function copiesLabel(n: number): string {
  return `${n} ${n === 1 ? 'copy' : 'copies'}`;
}

export function inferenceSummary(accuracy: number | null | undefined): string {
  const base = 'Lighter points have a role inferred from their content because no section heading was detected.';
  return typeof accuracy === 'number' && Number.isFinite(accuracy)
    ? `${base} Held-out accuracy of the role classifier: ${Math.round(accuracy * 100)}%.`
    : base;
}

const SECTION_LABEL: Record<string, string> = {
  abstract: 'Abstract',
  introduction: 'Introduction',
  methods: 'Methods',
  synthesis: 'Synthesis',
  characterization: 'Characterization',
  computational: 'Computational',
  results: 'Results',
  results_discussion: 'Results & discussion',
  discussion: 'Discussion',
  conclusion: 'Conclusion',
  bioactivity: 'Bioactivity',
  sar: 'SAR',
  references: 'References',
  acknowledgments: 'Acknowledgments',
  supplementary: 'Supplementary',
  abbreviations: 'Abbreviations',
  content: 'Unlabeled text',
  subsection: 'Unlabeled subsection',
  body: 'Body text',
  figures: 'Figure captions',
};

const SECTION_CODE: Record<string, string> = {
  abstract: 'A',
  introduction: 'I',
  methods: 'M',
  synthesis: 'Syn',
  characterization: 'Char',
  computational: 'Comp',
  results: 'R',
  results_discussion: 'R&D',
  discussion: 'D',
  conclusion: 'C',
  bioactivity: 'Bio',
  sar: 'SAR',
  references: 'Ref',
  acknowledgments: 'Ack',
  supplementary: 'SI',
  abbreviations: 'Abbr',
};

export function sectionLabel(section: string | null | undefined): string {
  if (!section) return 'Unlabeled';
  return SECTION_LABEL[section] ?? section.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Short code (I, M, R, R&D, D, C ...); empty when there is none. */
export function sectionCode(section: string | null | undefined): string {
  if (!section) return '';
  return SECTION_CODE[section] ?? '';
}

export function formatAuthors(authors: readonly string[], nAuthors: number): string {
  if (!authors.length) return 'Unknown authors';
  const extra = Math.max(0, nAuthors - authors.length);
  return extra > 0 ? `${authors.join(', ')} +${extra} more` : authors.join(', ');
}

export function firstAuthor(authors: readonly string[], nAuthors: number): string {
  if (!authors.length) return 'Unknown author';
  return nAuthors > 1 ? `${authors[0]} et al.` : authors[0];
}

export function formatYear(year: number | null | undefined): string {
  return year == null ? 'No year' : String(year);
}

export function formatScore(score: number | null | undefined, digits = 3): string {
  return score == null || Number.isNaN(score) ? '—' : score.toFixed(digits);
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

/** A count that may be unknown (e.g. pages without page provenance). */
export function formatMaybeCount(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—';
}

export function formatPercent(share: number): string {
  const p = share * 100;
  if (p > 0 && p < 1) return '<1%';
  return `${Math.round(p)}%`;
}

export function formatBuiltAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
