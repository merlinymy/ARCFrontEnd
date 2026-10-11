// Query Types matching backend classification
export type QueryType =
  | 'factual'
  | 'framing'
  | 'methods'
  | 'summary'
  | 'comparative'
  | 'novelty'
  | 'limitations'
  | 'general';

// Chunk types from the document
export type ChunkType = 'abstract' | 'section' | 'fine' | 'table' | 'caption' | 'full';

// Entity types
export interface Entity {
  text: string;
  type: 'chemical' | 'protein' | 'method' | 'organism' | 'metric' | 'other';
}

// A resolved in-text figure reference inside a source's chunk_text.
// Offsets are into `chunk_text` as received (the backend clips any ref whose
// span falls past the truncation point), so they can be sliced directly.
// Unresolved mentions never appear here: an absent ref is plain prose, which
// is what keeps this feature from producing dead links.
export interface FigureRef {
  start: number;
  end: number;
  text: string;
  figure_id: string;
  label: string | null;
  page: number | null;
  inferred: boolean;
}

// Source from the backend
export interface Source {
  paper_title: string;
  paper_id: string;
  section_name: string | null;
  subsection_name: string | null;
  chunk_type: ChunkType;
  chunk_text: string;
  relevance_score: number;
  // Provenance: 1-indexed pages the verbatim span covers
  page_start?: number | null;
  page_end?: number | null;
  // The figure this source *is* (caption and table chunks)
  figure_id?: string | null;
  figure_kind?: 'figure' | 'table' | null;
  figure_label?: string | null;
  // The *figure's* page and rectangle, not the caption's
  figure_page?: number | null;
  figure_bbox?: number[] | null;
  has_figure_image?: boolean;
  // Figures this source *mentions*
  figure_refs?: FigureRef[];
}

// One figure or table of a paper, from GET /papers/{id}/figures
export interface PaperFigure {
  figure_id: string;
  kind: 'figure' | 'table';
  label: string | null;
  label_source: string | null;
  page: number | null;
  bbox: number[] | null;
  bbox_is_image: boolean;
  caption: string;
  footnote: string;
  has_image: boolean;
  /**
   * Route path relative to the API root, matching the existing `pdf_url`
   * convention -- NOT a fetchable URL on its own. Use `getFigureImageUrl()`,
   * which prepends API_BASE; a raw value here breaks under the /api proxy
   * prefix exactly the way the two hardcoded hosts in PaperCard.tsx did.
   */
  image_url: string | null;
  n_rows: number | null;
  n_cols: number | null;
}

export interface PaperFigureList {
  paper_id: string;
  figures: PaperFigure[];
  total: number;
  images_available: boolean;
  schema_version: number | null;
}

// Citation verification check result
export interface CitationCheck {
  citation_id: number;
  claim: string;
  confidence: number;
  is_valid: boolean;
  explanation: string;
}

// Query response from backend
export interface QueryResponse {
  answer: string;
  sources: Source[];
  question: string;
  query_type: string;
  expanded_query: string;
  retrieval_count: number;
  reranked_count: number;
  warnings: string[];
  citation_checks: CitationCheck[];
  mode: AnswerMode;
  response_mode: ResponseMode;
  used_general_knowledge: boolean;
  used_web_search: boolean;
}

// Message in a conversation
export interface Message {
  id: string;
  type: 'query' | 'response' | 'web_search';
  content: string;
  timestamp: Date;
  metadata?: {
    queryType?: QueryType;
    expandedQuery?: string;
    entities?: Entity[];
    sources?: Source[];
    citationScore?: number;
    retrievalCount?: number;
    rerankedCount?: number;
    latency?: number;
    warnings?: string[];
    citationChecks?: CitationCheck[];
    // Web search specific
    isWebSearch?: boolean;
    webSearchSources?: Array<{ url: string; title: string }>;
  };
}

// Conversation
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  // Response stance this thread was last used in; restored on select.
  mode?: AnswerMode;
}

// Paper in the library
export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  filename: string;
  pageCount: number;
  indexedAt?: Date;
  chunkCount: number;
  chunkStats: Record<string, number>;
  status: 'indexed' | 'indexing' | 'error' | 'pending';
  errorMessage?: string;
  pdfUrl: string;
  progress?: number;
  fileSizeBytes: number;
}

// Paper list response from API with pagination
export interface PaperListResponse {
  papers: Paper[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// Upload progress event for SSE
export interface UploadProgressEvent {
  type: 'progress' | 'complete' | 'error';
  step?: string;
  data?: Record<string, unknown>;
  message?: string;
  paper_id?: string;
  filename?: string;
  status?: string;
  chunks?: number;
}

// Upload response
export interface UploadResponse {
  paper_id: string;
  filename: string;
  status: string;
  message: string;
  chunks: number;
}

// Batch upload types
export type UploadTaskStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'indexing'
  | 'complete'
  | 'error';

export interface UploadTask {
  taskId: string;
  batchId: string;
  filename: string;
  paperId?: string;
  status: UploadTaskStatus;
  currentStep?: string;
  progressPercent: number;
  errorMessage?: string;
  priority: number;
  fileSize: number;
  createdAt?: string;
  file?: File; // Local reference before upload
}

export interface BatchUpload {
  batchId: string;
  tasks: UploadTask[];
  isMinimized: boolean;
  createdAt: Date;
  skippedDuplicates?: number;
}

export interface BatchUploadInitResponse {
  batchId: string;
  tasks: UploadTask[];
}

export interface BatchStatusResponse {
  batchId: string;
  tasks: UploadTask[];
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  pending: number;
}

// SSE events for batch upload
export interface BatchUploadSSEEvent {
  type: 'status' | 'task_progress' | 'task_complete' | 'task_error' | 'batch_complete';
  taskId?: string;
  batchId?: string;
  status?: string;
  currentStep?: string;
  progressPercent?: number;
  paperId?: string;
  chunks?: number;
  errorMessage?: string;
  succeeded?: number;
  failed?: number;
  total?: number;
  // For initial status event
  tasks?: UploadTask[];
  completed?: number;
  inProgress?: number;
  pending?: number;
}

// Delete response
export interface DeleteResponse {
  paper_id: string;
  pdf_deleted: boolean;
  chunks_deleted: number;
  message: string;
}

// Response mode for detail level
export type ResponseMode = 'concise' | 'detailed';

// Response stance - what kind of reply the user wants this turn.
// Orthogonal to retrieval (query type) and to effort (how hard the model thinks).
export type AnswerMode =
  | 'ask'
  | 'brainstorm'
  | 'develop'
  | 'refine'
  | 'critique'
  | 'draft';

export const ANSWER_MODES: AnswerMode[] = [
  'ask',
  'brainstorm',
  'develop',
  'refine',
  'critique',
  'draft',
];

export const ANSWER_MODE_LABELS: Record<AnswerMode, string> = {
  ask: 'Ask',
  brainstorm: 'Brainstorm',
  develop: 'Develop',
  refine: 'Refine',
  critique: 'Critique',
  draft: 'Draft',
};

export const ANSWER_MODE_DESCRIPTIONS: Record<AnswerMode, string> = {
  ask: 'Answer the question, conversationally, leading with the answer.',
  brainstorm: 'Generate possibilities and directions - what has been tried, what has not.',
  develop: 'Take a stated idea and build it out into something workable.',
  refine: 'Tighten an existing idea and sharpen how it is framed.',
  critique: 'Argue against it and find the weaknesses a reviewer would.',
  draft: 'Start turning it into writing - an outline, a section, a set of aims.',
};

// How much care the model spends on the answer (depth, not creativity)
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Query options for advanced settings
export interface QueryOptions {
  queryType: QueryType | 'auto';
  topK: number;
  effort: EffortLevel;
  mode: AnswerMode; // Response stance - selects the prompt's stance modifier
  paperFilter: string[];
  sectionFilter: string | null;
  enableHyde: boolean;
  enableExpansion: boolean;
  enableCitationCheck: boolean;
  maxChunksPerPaper: number | 'auto'; // 'auto' lets system decide based on context
  responseMode: ResponseMode; // 'concise' for brief, 'detailed' for comprehensive
  enableGeneralKnowledge: boolean; // Allow LLM general knowledge beyond RAG sources
  enableWebSearch: boolean; // Allow Claude to search the web
  enablePdfUpload: boolean; // Send actual PDF files to Claude (32MB limit, 100 pages max)
}

// Health status for services
export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  connected?: boolean;
  collection_exists?: boolean;
  total_vectors?: number;
  error?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  services: {
    qdrant?: ServiceHealth;
    voyage_ai?: ServiceHealth;
    cohere?: ServiceHealth;
    anthropic?: ServiceHealth;
  };
}

// Cache statistics
export interface CacheStats {
  embedding_cache?: {
    hits: number;
    misses: number;
    size: number;
    max_size: number;
  };
  search_cache?: {
    hits: number;
    misses: number;
    size: number;
    max_size: number;
  };
  hyde_cache?: {
    hits: number;
    misses: number;
    size: number;
    max_size: number;
  };
}

// Analytics statistics for dashboard
export interface EntityStat {
  name: string;
  count: number;
}

export interface AnalyticsStats {
  query_type_distribution: Record<string, number>;
  citation_stats: {
    avg_score: number;
    verified_rate: number;
    partial_rate: number;
    failed_rate: number;
    total_checked: number;
  };
  latency_stats: {
    query_processing_ms: number;
    embedding_ms: number;
    retrieval_ms: number;
    reranking_ms: number;
    generation_ms: number;
    total_avg_ms: number;
  };
  entity_stats: {
    chemicals: EntityStat[];
    proteins: EntityStat[];
    methods: EntityStat[];
    organisms: EntityStat[];
    metrics: EntityStat[];
  };
  total_queries: number;
}

// Statistics response
export interface StatsResponse {
  collection_name: string;
  total_vectors: number;
  vector_dimension: number;
  embedding_model: string;
  llm_model: string;
  cache_stats: CacheStats;
  conversation_stats: {
    turns: number;
    papers_discussed: string[];
  };
  analytics?: AnalyticsStats;
}

// Pipeline step for visualization
export interface PipelineStep {
  step: number;
  name: string;
  duration: number;
  cached?: boolean;
  details?: string;
  status: 'completed' | 'skipped' | 'pending' | 'failed';
  error?: string;
}

// Pipeline step names for streaming progress
export type PipelineStepName =
  | 'rewriting'
  | 'entities'
  | 'classification'
  | 'expansion'
  | 'hyde'
  | 'retrieval'
  | 'reranking'
  | 'generation'
  | 'thinking_chunk'
  | 'answer_chunk'
  | 'answer_complete'
  | 'citation_verified'
  | 'verification'
  | 'web_search'
  | 'web_search_progress'
  | 'web_search_chunk';

// Streaming citation verification result
export interface StreamingCitationCheck {
  citation_id: number;
  claim: string;
  confidence: number;
  is_valid: boolean;
  explanation: string;
}

// Step info for display
export interface PipelineStepInfo {
  name: PipelineStepName;
  label: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'failed';
  data?: Record<string, unknown>;
  error?: string;
}

// All pipeline steps for streaming display
export const PIPELINE_STEPS: Array<{ name: PipelineStepName; label: string; description: string }> = [
  { name: 'rewriting', label: 'Query Rewriting', description: 'Correcting spelling and formatting' },
  { name: 'entities', label: 'Entity Extraction', description: 'Identifying key terms' },
  { name: 'classification', label: 'Classification', description: 'Determining query type' },
  { name: 'expansion', label: 'Query Expansion', description: 'Adding synonyms' },
  { name: 'hyde', label: 'HyDE Embedding', description: 'Generating hypothetical document' },
  { name: 'retrieval', label: 'Retrieval', description: 'Searching documents' },
  { name: 'reranking', label: 'Reranking', description: 'Ranking by relevance' },
  { name: 'generation', label: 'Generation', description: 'Creating answer' },
  { name: 'verification', label: 'Verification', description: 'Checking citations' },
  { name: 'web_search', label: 'Web Search', description: 'Searching the web for additional context' },
];

// Streaming state for progressive response building
export interface StreamingState {
  messageId: string;
  conversationId: string;
  content: string;
  citationChecks: CitationCheck[];
  isStreaming: boolean;
}

// App state
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export interface AppState {
  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // Papers
  papers: Paper[];
  indexingQueue: Paper[];
  // Pagination state for papers
  totalPapers: number;
  hasMorePapers: boolean;
  isLoadingMorePapers: boolean;

  // Query state
  currentQuery: string;
  queryOptions: QueryOptions;
  isLoading: boolean;
  streamingResponse: string | null;
  pipelineProgress: PipelineStepInfo[] | null;

  // System
  health: HealthStatus | null;
  stats: StatsResponse | null;

  // UI
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  pipelineExpanded: boolean;
  activePage: 'chat' | 'library' | 'prompts' | 'health' | 'map';
  selectedPaperId: string | null;
  viewingPdfId: string | null;
  //: Page to open the PDF viewer at, 1-indexed. Null means page 1.
  viewingPdfPage: number | null;
  webSearchProgress: string | null; // Current web search progress message
  thinkingProgress: string | null; // Summarized model reasoning streamed during generation
  toasts: ToastMessage[]; // Toast notifications

  // Batch upload
  activeBatchUpload: BatchUpload | null;
  isUploadPanelOpen: boolean;
  isUploadPanelMinimized: boolean;

  // Streaming state for LLM response
  streamingState: StreamingState | null;
}

// Default query options
export const DEFAULT_QUERY_OPTIONS: QueryOptions = {
  queryType: 'auto',
  topK: 15,
  effort: 'high',
  mode: 'ask',
  paperFilter: [],
  sectionFilter: null,
  enableHyde: true,
  enableExpansion: true,
  enableCitationCheck: true,
  maxChunksPerPaper: 'auto',
  responseMode: 'detailed',
  enableGeneralKnowledge: true,
  enableWebSearch: false,
  enablePdfUpload: false,
};

// System prompts types for customization.
// Grouped base / stance / addendums since the 16 query-type prompts were
// replaced by one base prompt plus a stance modifier.
export interface SystemPromptsData {
  defaults: Record<PromptGroup, Record<string, string>>;
  custom: Partial<Record<PromptGroup, Record<string, string>>> | null;
  prompt_types: Record<PromptGroup, string[]>;
}

// Editable prompt group
export type PromptGroup = 'base' | 'stance' | 'addendums';

// Labels for the editable slots inside the 'base' group
export const BASE_PROMPT_LABELS: Record<string, string> = {
  base: 'Base prompt (invariants)',
  concise: 'Length dial - Concise',
  detailed: 'Length dial - Detailed',
};

// Query type labels for UI display. Query type now only steers retrieval;
// it no longer selects a prompt.
export const QUERY_TYPE_LABELS: Record<string, string> = {
  factual: 'Factual',
  framing: 'Framing',
  methods: 'Methods',
  summary: 'Summary',
  comparative: 'Comparative',
  novelty: 'Novelty',
  limitations: 'Limitations',
  general: 'General',
};

// Addendum labels for UI display
export const ADDENDUM_LABELS: Record<string, string> = {
  general_knowledge: 'General Knowledge',
  web_search: 'Web Search',
  pdf_upload: 'PDF Upload',
};

// =============================================================================
// Library Map (interface contract v2.0 -- GET /library-map*)
// =============================================================================
// Similarity scores are cosine similarity on the original vectors, rounded to 3
// decimals; never derived from 2-D distance (the layout is a projection).
// v2.0 dropped structure analysis (xy.structure, archetype, the structure lens).
// Those keys stay optional here so a v1 payload still parses; the UI ignores them.

/** Section roles, in fixed order -- this order is also the color slot order. */
export type SectionRole = 'background' | 'methods' | 'findings' | 'back_matter' | 'unlabeled';

/** Neighbor lenses. `structure` is v1 only (dropped in v2.0); the UI ignores it. */
export type MapLens = 'content' | 'structure' | 'introduction' | 'methods' | 'results' | 'discussion';

/** v1 structure type; dropped in v2.0 (kept only so a v1 payload type-checks). */
export type ArchetypeId = 'imrad' | 'combined_rd' | 'no_methods' | 'unstructured';

/** v2.0-I: "needs attention" flags */
export type PaperFlag = 'duplicate' | 'captions_only' | 'filename_title' | 'suspicious_year';

export interface LibraryMapHeader {
  schema_version: number;
  built_at: string;
  collection: string;
  embedding_profile: string;
  embedding_model: string;
  n_papers: number;
  n_points_read: number;
  n_papers_skipped: number;
  lenses: MapLens[];
  /** v2.0: ["content"] */
  layouts: string[];
  params: {
    k_neighbors: number;
    seed: number;
    n_clusters_fine: number;
    n_clusters_coarse: number;
  };
  build_seconds: number;
  /** v1.1: stats for roles predicted from content where no heading was detected; null when disabled */
  role_inference?: RoleInferenceStats | null;
  /** v1.2: near-identical copies (content cosine >= threshold, union-find groups) */
  duplicates?: DuplicateStats | null;
  /** v2.0-I: papers per flag */
  flags?: Partial<Record<PaperFlag, number>>;
}

/** v1.2 header.duplicates */
export interface DuplicateStats {
  threshold: number;
  groups: number;
  papers: number;
  redundant: number;
}

/** v1.2: which vector placed the paper on the content map */
export type ContentSource = 'full' | 'pooled' | 'fine' | 'captions';

/** v1.1 header.role_inference */
export interface RoleInferenceStats {
  method: string;
  holdout_accuracy: number;
  per_role_recall: Partial<Record<SectionRole, number>>;
  n_train: number;
  n_inferred: number;
  n_left_unlabeled: number;
}

export interface LibraryMapRole {
  id: SectionRole;
  label: string;
  sections: Array<string | null>;
}

export interface PaperStructureCounts {
  /** null while the collection has no page provenance (v1.1) */
  pages: number | null;
  chunks: number;
  captions: number;
  tables: number;
  tokens: number;
}

/**
 * [role, token_share, section_name, inferred], in reading order; shares sum to
 * 1 (±0.01). Used only by the compare view's section strips (v2.0-H).
 */
export type BarcodeEntry = [SectionRole, number, string | null, (0 | 1)?];

export interface LibraryMapPaper {
  id: string;
  title: string;
  /** First three authors only; `n_authors` is the full count. */
  authors: string[];
  n_authors: number;
  year: number | null;
  /** normalized into [0, 1] x [0, 1]; v2.0 has `content` only */
  xy: { content: [number, number]; structure?: [number, number] | null };
  cluster: { fine: string; coarse: string };
  counts: PaperStructureCounts;
  barcode?: BarcodeEntry[];
  /** Lenses this paper has a vector for. */
  lenses: MapLens[];
  /** v1.2: ids of this paper's near-identical copies; key present only when non-empty */
  duplicates?: string[];
  /** v1.2: "captions" means the position comes from figure captions only */
  content_source?: ContentSource;
  /** v2.0-I: present only when non-empty */
  flags?: PaperFlag[];
  /** v1 only (dropped in v2.0) */
  archetype?: ArchetypeId;
}

export interface LibraryMapCluster {
  /** "c*" coarse, "f*" fine */
  id: string;
  level: 'coarse' | 'fine';
  parent: string | null;
  label: string;
  terms: string[];
  size: number;
}

/** Content-lens link, undirected, i < j, indexes into papers[]. */
export type LibraryMapEdge = [number, number, number];

/** v2.0-J: [i][j] = share of the top-10 content-neighbor slots of topic i's papers that land in topic j */
export interface TopicCorrelationLevel {
  /** display order: seriated (hierarchical-clustering leaf order) */
  ids: string[];
  neighbor_share: number[][];
}

export interface TopicCorrelation {
  coarse: TopicCorrelationLevel;
  fine: TopicCorrelationLevel;
}

export interface LibraryMapResponse {
  header: LibraryMapHeader;
  roles: LibraryMapRole[];
  papers: LibraryMapPaper[];
  clusters: LibraryMapCluster[];
  edges: LibraryMapEdge[];
  /** v2.0-J */
  topic_correlation?: TopicCorrelation;
}

export interface MapNeighbor {
  paper_id: string;
  score: number;
}

export interface PaperStructureSegment {
  section: string | null;
  role: SectionRole;
  share: number;
  tokens: number;
  /** 1-indexed, nullable */
  page_start: number | null;
  page_end: number | null;
  /** At most 8 distinct values, in order of appearance. */
  subsections: string[];
  /** v1.1: role predicted from content (no heading detected) */
  inferred?: boolean;
}

export interface PaperSections {
  composition: Record<SectionRole, number>;
  segments: PaperStructureSegment[];
  counts: PaperStructureCounts;
}

/** GET /library-map/papers/{paper_id} */
export interface LibraryMapPaperDetail {
  paper_id: string;
  /** A lens key is present only if this paper has that lens. Best first, self and copies excluded. */
  neighbors: Partial<Record<MapLens, MapNeighbor[]>>;
  /** v1.2: this paper's near-identical copies (always present in v1.2, may be []) */
  duplicates?: MapNeighbor[];
  /** v2.0-H: sections (v1 called this object `structure`) */
  sections?: PaperSections;
  structure?: PaperSections;
}

/** v2.0-K: GET /library-map/footprint (auth required) */
export interface LibraryMapFootprint {
  computed_at: string;
  n_conversations: number;
  /** answers with >= 1 source */
  n_answers: number;
  papers: Record<string, { answers: number; last_cited: string }>;
}

export type PassageChunkType = 'abstract' | 'fine' | 'table' | 'caption';

export interface ComparePassage {
  chunk_id: string;
  chunk_type: PassageChunkType;
  section: string | null;
  role: SectionRole;
  page: number | null;
  /** <= 600 chars, header-stripped, verbatim otherwise */
  text: string;
  /** v1.1: role predicted from content (no heading detected) */
  role_inferred?: boolean;
}

export interface ComparePassagePair {
  score: number;
  a: ComparePassage;
  b: ComparePassage;
}

/** GET /library-map/compare?a=&b= */
export interface LibraryMapCompare {
  a: string;
  b: string;
  /** null if either paper lacks the lens; v2.0 has no `structure` key */
  scores: Partial<Record<MapLens, number | null>>;
  /** values[i][j] = cosine(mean A section rows[i], mean B section cols[j]) */
  section_matrix: {
    rows: string[];
    cols: string[];
    values: Array<Array<number | null>>;
  };
  passage_pairs: ComparePassagePair[];
}

export interface PassagePoint {
  chunk_id: string;
  paper_id: string;
  /** normalized like the map layouts */
  x: number;
  y: number;
  role: SectionRole;
  section: string | null;
  chunk_type: PassageChunkType;
  page: number | null;
  /** <= 280 chars snippet */
  text: string;
  /** v1.1: role predicted from content (no heading detected) */
  role_inferred?: boolean;
}

/** GET /library-map/passages?ids=&max_per_paper=&include_captions= */
export interface LibraryMapPassages {
  papers: string[];
  /** "tsne" when n >= 30, else "pca" */
  method: 'tsne' | 'pca' | string;
  seconds: number;
  points: PassagePoint[];
  /** passages dropped by the cap, per paper; zeros omitted */
  truncated: Record<string, number>;
}

// ---- v2.1: Engineering view (paper layout, for whoever tunes extraction) ----

export type UndeterminedCause = 'no_body_text' | 'mostly_unlabeled' | 'methods_without_findings';

export interface LibraryMapArchetype {
  id: ArchetypeId;
  label: string;
  description: string;
}

/**
 * header.role_inference of the engineering payload: the build's full evaluation
 * report (shape as the backend writes it; every part optional because a disabled
 * or skipped run reports less).
 */
export interface RoleInferenceReport {
  enabled: boolean;
  mode?: string;
  method?: string;
  n_labelled?: number;
  n_targets?: number;
  labelled_by_role?: Partial<Record<SectionRole, number>>;
  holdout?: {
    n_train?: number;
    n_test?: number;
    n_test_papers?: number;
    accuracy?: number;
    per_role_recall?: Partial<Record<SectionRole, number>>;
    /** rows = true role, columns = predicted role */
    confusion?: { labels: string[]; rows_true_cols_predicted: number[][] };
    curve?: Array<{ threshold: number; coverage: number; accuracy: number | null }>;
  };
  threshold?: number;
  threshold_rule?: string;
  /** unseen-heading transfer tests: trained without these headings, tested on them */
  transfer?: Record<string, { n: number; accuracy: number; predicted?: Record<string, number> }>;
  transfer_min?: number | null;
  targets?: {
    n: number;
    n_inferred: number;
    n_left_unlabeled: number;
    inferred_by_role?: Record<string, number>;
    by_section?: Record<string, number>;
  };
  silver_check?: { n_chunks: number; note?: string; agreement_all?: number; coverage_at_threshold?: number; agreement_at_threshold?: number | null };
  gate?: { passed: boolean; reason: string; holdout_min?: number; transfer_min?: number };
}

export interface EngineeringHeader {
  collection: string;
  embedding_model: string;
  built_at: string;
  payload_shape: 'pre_w2' | 'w2' | 'mixed' | string;
  n_points: number;
  points_by_chunk_type: Record<string, number>;
  /** points per section_name; "(none)" = points without one */
  section_names: Record<string, number>;
  /** share of non-full points with any page */
  page_coverage: number;
  content_source: Partial<Record<ContentSource, number>>;
  archetype_counts: Partial<Record<ArchetypeId, number>>;
  undetermined_causes: Partial<Record<UndeterminedCause, number>>;
  role_inference: RoleInferenceReport | null;
}

export interface EngineeringPaper {
  id: string;
  /** the STRUCTURE layout (UMAP of structure vectors); null when the paper has no structure vector */
  xy: [number, number] | null;
  archetype: ArchetypeId;
  cause: UndeterminedCause | null;
  /** null when cause is no_body_text */
  unlabeled_share: number | null;
  barcode: BarcodeEntry[];
  chunks: Record<string, number>;
  content_source: ContentSource;
}

/** GET /library-map/engineering?collection= (papers in the researcher map's order) */
export interface LibraryMapEngineering {
  header: EngineeringHeader;
  archetypes: LibraryMapArchetype[];
  roles: LibraryMapRole[];
  papers: EngineeringPaper[];
}

/** GET /library-map/collections */
export interface LibraryMapCollections {
  collections: Array<{ collection: string; embedding_model: string | null; built_at: string | null; n_papers: number | null; active: boolean }>;
}
