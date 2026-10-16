// Types for the bibliography layer (W4). Mirrors docs/W4_BIBLIOGRAPHY.md section 7
// of the backend branch feat/w4-bibliography. Field names are the backend's
// (snake_case) on purpose: these objects are shown, not re-shaped.

export type EntryKind = 'paper' | 'reference';
export type EntrySource = 'pdf' | 'ris' | 'bibtex' | 'csljson' | 'zotero' | 'manual';
export type MissingField = 'title' | 'authors' | 'year' | 'doi' | 'journal';
export type CitationStyle = 'acs' | 'apa' | 'ieee' | 'vancouver';
export type FileFormat = 'ris' | 'bibtex' | 'csljson';
export type EntryType =
  | 'article'
  | 'book'
  | 'chapter'
  | 'conference'
  | 'thesis'
  | 'report'
  | 'preprint'
  | 'patent'
  | 'webpage'
  | 'other';

// An author in a record: structured, or a single literal (consortium) name.
export interface BibAuthor {
  family?: string;
  given?: string;
  literal?: string;
}

// ---------------------------------------------------------------------------
// Library listing and entries
// ---------------------------------------------------------------------------

export interface LibraryEntryPaper {
  filename: string;
  chunk_count: number;
  chunk_stats: Record<string, number>;
  page_count: number;
  status: string;
  error_message: string | null;
  pdf_url: string;
}

export interface LibraryEntry {
  entry_id: string;
  kind: EntryKind;
  full_text_searchable: boolean;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  pmid: string | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  entry_type: string;
  has_abstract: boolean;
  source: EntrySource;
  metadata_sources: Record<string, string>;
  added_at: string | null;
  hidden: boolean;
  zotero_key: string | null;
  missing: MissingField[];
  paper: LibraryEntryPaper | null;
}

export interface LibraryListResponse {
  entries: LibraryEntry[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  counts: { paper: number; reference: number };
}

export type LibrarySortBy = 'indexed_at' | 'title' | 'year' | 'chunk_count' | 'first_author';

export interface LibraryQuery {
  offset?: number;
  limit?: number;
  search?: string;
  sort_by?: LibrarySortBy;
  sort_order?: 'asc' | 'desc';
  kind?: 'all' | EntryKind;
  missing?: MissingField[];
  full_text?: boolean;
  include_hidden?: boolean;
}

export interface CoverageStats {
  total: number;
  with_doi: number;
  with_year: number;
  with_authors: number;
  with_journal: number;
  usable_title: number;
  pct_doi: number;
}

export interface LibraryStats {
  papers: CoverageStats;
  references: CoverageStats;
  hidden: number;
}

export interface BibRecord {
  entry_type: string;
  title: string;
  authors: BibAuthor[];
  editors: BibAuthor[];
  year: number | null;
  date_raw: string;
  journal: string;
  journal_abbrev: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  arxiv_id: string | null;
  isbn: string;
  issn: string;
  url: string;
  abstract: string;
  language: string;
  notes: string;
  keywords: string[];
  extra: Record<string, unknown>;
  source: string;
}

export interface Citation {
  style: CitationStyle;
  text: string;
  html: string; // only <i> and <b>, escaped
  in_text: string;
  csl_json: Record<string, unknown>;
  quality: 'complete' | 'partial';
  missing: string[];
}

export interface EntryDetail {
  entry_id: string;
  kind: EntryKind;
  full_text_searchable: boolean;
  record: BibRecord;
  missing: MissingField[];
  metadata_sources: Record<string, string>;
  zotero_key: string | null;
  citation: Citation;
  paper: {
    filename: string;
    chunk_count: number;
    page_count: number;
    indexed_at: string | null;
    pdf_url: string;
  } | null;
  reference: {
    source: string;
    source_ref: string | null;
    hidden: boolean;
    created_at: string | null;
  } | null;
}

export interface PossibleDuplicate {
  entry_id: string;
  title: string;
  level: string;
  basis: string;
}

export interface ReferenceCreateResponse extends EntryDetail {
  possible_duplicate_of: PossibleDuplicate | null;
}

// Editable fields (PATCH /entries/{id}, POST /references). Authors may be sent
// as display strings ("Smith, Jane") or objects.
export interface EntryFieldsInput {
  title?: string;
  authors?: Array<string | BibAuthor>;
  year?: number | null;
  journal?: string;
  journal_abbrev?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  abstract?: string;
  keywords?: string[];
  url?: string;
  entry_type?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportSummaryCounts {
  input_records: number;
  output_records: number;
  duplicates_merged: number;
  duplicate_groups: number;
  fields_filled: number;
  conflicts_flagged: number;
  pairs_needing_review: number;
  matched_library_entries: number;
  records_with_problems: number;
  with_doi: number;
  with_year: number;
  with_authors: number;
}

export interface ImportRecordRef {
  rid: string;
  title: string;
  year: number | null;
  doi: string | null;
  first_author: string;
  source_index: number;
}

export interface ImportDuplicateGroup {
  group_id: string;
  pass: number;
  basis: string;
  confidence: number;
  kept: ImportRecordRef;
  merged: ImportRecordRef[];
  edges: Array<{ a: string; b: string; level: string; score: number; basis: string }>;
}

export interface ImportFieldFilled {
  rid: string;
  field: string;
  value: unknown;
  source: string;
}

export interface ImportConflict {
  rid: string;
  field: string;
  kept: unknown;
  other: unknown;
  other_source: string;
  resolution: string;
}

export interface ImportReviewPair {
  a: ImportRecordRef;
  b: ImportRecordRef;
  score: number;
  basis: string;
  flags: string[];
  action: string;
}

export interface ImportLibraryMatch {
  rid: string;
  entry_id: string;
  kind: EntryKind;
  level: string;
  score: number;
  basis: string;
  flags: string[];
  library_title: string;
  has_pdf: boolean;
}

export interface ImportEnrichmentItem {
  rid: string;
  status: string;
  basis?: string;
  doi?: string | null;
  [key: string]: unknown;
}

export interface ImportProblem {
  rid: string;
  title: string;
  issues: string[];
}

export interface ImportReport {
  summary: ImportSummaryCounts;
  duplicate_groups: ImportDuplicateGroup[];
  fields_filled: ImportFieldFilled[];
  conflicts: ImportConflict[];
  review_pairs: ImportReviewPair[];
  library_matches: ImportLibraryMatch[];
  enrichment: ImportEnrichmentItem[];
  problems: ImportProblem[];
  normalizations: Record<string, number>;
  thresholds: Record<string, number>;
}

export interface ImportCommitResult {
  created: number;
  linked_to_existing: number;
  fields_filled_in_existing: number;
  skipped: number;
  committed_at: string;
}

export type ImportStatus = 'ready' | 'enriching' | 'error';

export interface ImportInfo {
  import_id: string;
  filename: string;
  format: FileFormat;
  created_at: string;
  status: ImportStatus;
  progress: { stage: string; done: number; total: number } | null;
  parse_warnings: string[];
  enriched: boolean;
  committed: boolean;
  commit_result: ImportCommitResult | null;
  error: string | null;
  summary: ImportSummaryCounts;
  report?: ImportReport;
  downloads?: {
    cleaned: Record<FileFormat, string>;
    report_json: string;
    report_markdown: string;
  };
}

export interface ImportCommitRequest {
  record_ids?: string[] | null;
  link_matches?: boolean;
  fill_library_from_import?: boolean;
}

export interface ImportCommitResponse extends ImportCommitResult {
  created_ids: string[];
}

// ---------------------------------------------------------------------------
// Export / formatting
// ---------------------------------------------------------------------------

export interface ExportRequest {
  format: FileFormat;
  scope: 'all' | 'papers' | 'references';
  ids?: string[] | null;
  include_hidden?: boolean;
  include_incomplete?: boolean;
}

export interface ExportPreview {
  exported: number;
  skipped_unusable_title: number;
  skipped_examples: Array<{ entry_id: string; title: string; kind: EntryKind }>;
  hint?: string;
}

export interface CiteStylesResponse {
  styles: CitationStyle[];
  default: CitationStyle;
}

export interface FormatCitationsResponse {
  style: CitationStyle;
  citations: Array<{ entry_id: string; citation: Citation }>;
  unknown_ids: string[];
}

// ---------------------------------------------------------------------------
// Library duplicates
// ---------------------------------------------------------------------------

export type DedupeKind = 'alias' | 'suffix' | 'doi' | 'pmid' | 'title';
export type DedupeDecisionState = 'accepted' | 'rejected' | 'partial' | null;

export interface DedupeMember {
  entry_id: string;
  kind: EntryKind;
  title: string;
  title_usable: boolean;
  authors: string[];
  year: number | null;
  doi: string | null;
  pmid: string | null;
  filename: string;
  chunk_count: number;
  full_text_searchable: boolean;
  pdf_opens: boolean;
  size_bytes: number | null;
  cited_in_answers: number;
  suffix: string | null;
  metadata_completeness: number;
  added_at: string | null;
}

export interface DedupeGroup {
  group_id: string;
  kind: DedupeKind;
  kinds: DedupeKind[];
  confidence: number;
  flags: string[];
  proposed_winner: string;
  proposed_losers: string[];
  winner_reasons: Array<{ loser_id: string; reason: string }>;
  members: DedupeMember[]; // members[0] is the proposed winner
  evidence: Array<{ a: string; b: string; kind: string; score: number; basis: string }>;
  decision: DedupeDecisionState;
}

export interface DedupeReviewPair {
  a: DedupeMember;
  b: DedupeMember;
  score: number;
  basis: string;
  flags: string[];
}

export interface DedupeReport {
  generated_at: string;
  library: { papers: number; references: number };
  thresholds: Record<string, number>;
  summary: {
    groups: number;
    by_kind: Partial<Record<DedupeKind, number>>;
    redundant_entries: number;
    pending: number;
    accepted: number;
    rejected: number;
    review_pairs: number;
    entries_with_unusable_title: number;
    unverified_suffix_pairs: number;
    bytes_verified: boolean;
  };
  hidden_by_accepted_decisions: number;
  total_groups_matching: number;
  offset: number;
  limit: number;
  groups: DedupeGroup[];
  review_pairs: DedupeReviewPair[];
  unusable_title_count: number;
}

export interface DedupeReportQuery {
  decision?: 'pending' | 'accepted' | 'rejected' | 'all';
  kind?: DedupeKind;
  offset?: number;
  limit?: number;
  refresh?: boolean;
  verify_bytes?: boolean;
}

export interface DedupeDecisionRequest {
  group_id: string;
  kind: DedupeKind;
  action: 'accept' | 'reject' | 'undo';
  winner_id: string;
  loser_ids: string[];
  reasons?: Record<string, string>;
}

export interface DedupeDecisionResult {
  group_id: string;
  action: string;
  winner_id: string;
  affected: string[];
}

export interface DedupeBatchResponse {
  applied: DedupeDecisionResult[];
  errors: Array<{ group_id: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Metadata backfill
// ---------------------------------------------------------------------------

export type BackfillStatusKey = 'accept' | 'review' | 'verified' | 'no_match' | 'no_evidence' | 'error';

export interface BackfillStats {
  evaluated: number;
  by_status: Partial<Record<BackfillStatusKey, number>>;
  fields_proposed_if_accepted: Record<string, number>;
  crossref?: { requests: number; cache_hits: number; retries: number; not_found: number };
}

export type BackfillStatusResponse =
  | { exists: false; hint: string }
  | {
      exists: true;
      generated_at: string;
      applied_at: string | null;
      thresholds: { accept: number; review: number; title_gate: number };
      options: Record<string, unknown>;
      stats: BackfillStats;
    };

export interface BackfillItem {
  paper_id: string;
  filename: string;
  status: BackfillStatusKey;
  confidence: number | null;
  route: string | null;
  current: {
    title: string;
    title_usable: boolean;
    authors: unknown[];
    n_authors: number;
    year: number | null;
    doi: string | null;
    journal: string | null;
  };
  evidence: {
    page_text: boolean;
    record: boolean;
    title_used: string | null;
    title_from: string | null;
    dois_considered: string[];
  };
  crossref: {
    doi: string | null;
    title: string | null;
    year: number | null;
    journal: string | null;
    authors: unknown[];
    type: string | null;
  } | null;
  components: Record<string, unknown>;
  proposed: {
    title?: string;
    doi?: string;
    year?: number;
    authors?: Array<BibAuthor | string>;
    journal?: string;
    [key: string]: unknown;
  };
  conflicts: unknown[];
  decision: 'accept' | 'reject' | null;
  note: string;
  applied_at?: string | null;
}

export interface BackfillReportResponse {
  generated_at: string;
  applied_at: string | null;
  thresholds: { accept: number; review: number; title_gate: number };
  stats: BackfillStats;
  total: number;
  offset: number;
  limit: number;
  items: BackfillItem[];
}

export interface BackfillApplyRequest {
  min_confidence?: number | null;
  include_review?: boolean;
  paper_ids?: string[] | null;
  decisions?: Record<string, 'accept' | 'reject'>;
}

export interface BackfillApplyResponse {
  papers_updated: number;
  fields_written: Record<string, number>;
  stale_skipped: string[];
  papers_not_in_library: string[];
  applied_ids: string[];
}

// ---------------------------------------------------------------------------
// Zotero
// ---------------------------------------------------------------------------

export type ZoteroConflictPolicy = 'zotero_wins' | 'arc_wins' | 'manual';

export interface ZoteroStatus {
  configured: boolean;
  connected: boolean;
  sync_running: boolean;
  conflict_policy: ZoteroConflictPolicy;
  source?: 'database' | 'environment';
  library_type?: 'user' | 'group';
  library_id?: string;
  library_key?: string;
  username?: string | null;
  can_write?: boolean;
  api_key_hint?: string; // 4 characters of the key at most; the key itself is never returned
  last_version?: number;
  last_pull_at?: string | null;
  last_push_at?: string | null;
  last_sync_status?: string | null;
  last_sync_summary?: Record<string, unknown> | null;
  linked_items?: number;
  conflicts?: number;
  arc_only?: { papers: number; references: number };
}

export interface ZoteroConnectRequest {
  api_key: string;
  library_type: 'user' | 'group';
  library_id?: string;
}

export interface ZoteroSyncRequest {
  direction?: 'both' | 'pull' | 'push';
  dry_run?: boolean;
  push_papers?: boolean;
  push_references?: boolean;
  max_push?: number | null;
  policy?: ZoteroConflictPolicy | null;
}

export interface ZoteroSyncConflict {
  zotero_key: string;
  entry_id: string;
  field: string;
  arc: unknown;
  zotero: unknown;
  resolution: 'zotero' | 'arc' | 'pending';
}

export interface ZoteroSyncResult {
  status: 'ok' | 'partial' | 'dry_run';
  direction: string;
  dry_run: boolean;
  policy: string;
  library_key: string;
  library_version_before: number;
  library_version_after: number;
  started_at: string;
  finished_at: string;
  pulled: Record<string, number>;
  pushed: Record<string, number | null>;
  conflicts: ZoteroSyncConflict[];
  possible_duplicates: Array<{
    zotero_key: string;
    title: string;
    similar_entry: string;
    similar_title: string;
    basis: string;
    note: string;
  }>;
  notes: string[];
  errors: unknown[];
}

export interface ZoteroSyncJob {
  job_id: string;
  status: 'running' | 'done' | 'error';
  message: string;
  started_at: string;
  request: ZoteroSyncRequest;
  result?: ZoteroSyncResult;
  error?: string;
}

export interface ZoteroParkedConflict {
  item_id: number;
  zotero_key: string;
  entry_id: string;
  kind: EntryKind;
  detected_at: string;
  fields: Array<{ field: string; arc: unknown; zotero: unknown; base: unknown }>;
}

export interface ZoteroResolveResponse {
  item_id: number;
  resolved_with: 'zotero' | 'arc';
  fields: unknown;
}

// ---------------------------------------------------------------------------
// "What should I cite"
// ---------------------------------------------------------------------------

export type CiteMode = 'list' | 'position';

export interface CiteRequest {
  text: string;
  mode: CiteMode;
  context?: string;
  style?: CitationStyle;
  max_results?: number;
  include_references?: boolean;
  exclude_ids?: string[];
  year_min?: number | null;
  year_max?: number | null;
  use_llm?: boolean | null;
  rerank?: boolean | null;
}

export interface CiteEvidence {
  source: 'fulltext' | 'abstract' | 'title';
  quote: string;
  section: string | null;
  chunk_type?: string | null;
  page: number | null; // 1-indexed
  chunk_id: string | null;
  char_start: number | null;
  char_end: number | null;
  score: number;
}

export interface CiteResult {
  rank: number;
  entry_id: string;
  kind: EntryKind;
  full_text_searchable: boolean;
  score: number; // relative: best = 1.0
  scores: Record<string, number>;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  pdf_url: string | null;
  reason: string;
  reason_source: 'extractive' | 'llm';
  role: 'supports' | 'background' | 'method' | 'contrast' | 'related' | null;
  evidence: CiteEvidence[];
  citation: Citation;
}

export interface CiteResponse {
  mode: CiteMode;
  style: CitationStyle;
  query: { chars: number; truncated: boolean };
  results: CiteResult[];
  notes: string[];
  stats: {
    papers_considered: number;
    references_considered: number;
    llm_used: boolean;
    reranked: boolean;
    embedded: boolean;
  };
}
