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
export type ChunkType = 'abstract' | 'section' | 'fine' | 'table' | 'caption' | 'full' | 'document';

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
  // W3: the indexed chunk this source is
  chunk_id?: string | null;
  // W3: book chunks only (all null for papers)
  doc_kind?: string | null;
  book_title?: string | null;
  chapter_index?: number | null;
  chapter_label?: string | null;
  chapter_title?: string | null;
  chapter_authors?: string[] | null;
  chapter_doi?: string | null;
  printed_page_start?: number | null;
  printed_page_end?: number | null;
}

// ---------------------------------------------------------------------------
// W3 answer pipeline: citations, claims, entailment
// ---------------------------------------------------------------------------

/**
 * How a citation's page and box were obtained.
 *   record         exact, through the paper record
 *   record_search  the cited text was found in the record by string search
 *   chunk          only the chunk's own page and box (imprecise)
 *   pdf_page       native PDF citation; page only
 *   none           no location
 */
export type LocationSource = 'record' | 'record_search' | 'chunk' | 'pdf_page' | 'none';

/** A rectangle on one page. bbox is [x0, y0, x1, y1] in per-mille of the page, top-left origin. */
export interface PageHighlight {
  /** 1-indexed PDF page */
  page: number;
  bbox: number[];
}

/**
 * One distinct cited passage. The answer text refers to it with a marker
 * `⟦id⟧`. `cited_text` is verbatim, extracted by the API from the document.
 */
export interface Citation {
  id: number;
  /** Index into the same response's `sources`; null for a whole-PDF citation. */
  source_index: number | null;
  paper_id: string | null;
  paper_title: string | null;
  chunk_id: string | null;
  cited_text: string;
  doc_char_start: number | null;
  doc_char_end: number | null;
  /** 1-indexed PDF pages of the first and last block of the span; may be null. */
  page: number | null;
  page_end: number | null;
  bbox: number[] | null;
  highlights: PageHighlight[];
  location_source: LocationSource;
  section_name: string | null;
  /** Ready-made label from the server ("p. 4, Results", "Ch. 4, p. 103"). */
  locator: string | null;
  // Book fields; null for papers.
  doc_kind: string | null;
  book_title: string | null;
  chapter_index: number | null;
  chapter_label: string | null;
  chapter_title: string | null;
  chapter_authors: string[] | null;
  chapter_doi: string | null;
  printed_page: number | null;
  printed_page_start: number | null;
  printed_page_end: number | null;
}

/** One cited stretch of the answer, in order; entailment labels attach to it. */
export interface Claim {
  index: number;
  text: string;
  citation_ids: number[];
}

export type EntailmentLabelValue = 'supported' | 'partially_supported' | 'unsupported';

/** One (claim, citation) pair as judged by the entailment pass. */
export interface EntailmentLabel {
  claim_index: number;
  citation_id: number;
  label: EntailmentLabelValue;
  reason: string;
}

export interface EntailmentReport {
  /** ok | partial (some pairs not judged) | error (no labels) | skipped */
  status: 'ok' | 'partial' | 'error' | 'skipped';
  model: string | null;
  labels: EntailmentLabel[];
  summary: Partial<Record<EntailmentLabelValue | 'unchecked', number>>;
  error: string | null;
  latency_ms: number;
}

export type AnswerStatus = 'ok' | 'refused' | 'error' | 'incomplete';
export type RetrievalMode = 'retrieval' | 'long_context' | 'agentic';

/** What was replayed from the stored thread. `{}` when unauthenticated. */
export interface HistoryInfo {
  messages?: number;
  total_turns?: number;
  included_turns?: number;
  trimmed_turns?: number;
  skipped_turns?: number;
  est_tokens?: number;
}

/** `{}` unless `paper_ids` was sent. */
export interface LongContextInfo {
  used?: boolean;
  reason?: string;
  papers?: Array<{ paper_id: string; title: string; est_tokens: number }>;
  est_tokens?: number;
}

export interface DeepToolCall {
  name: string;
  input: Record<string, unknown>;
  passages: number;
}

/** Deep stances (develop / critique / draft) only. */
export interface DeepInfo {
  turns: number;
  tool_calls: DeepToolCall[];
  pauses: number;
  notebook: boolean;
  incomplete: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * The `budget` the backend attaches to an answer (`services/token_budget.py`
 * `build_budget`). Only the fields the UI reads are typed. `model` is the model
 * that served the turn, so prices are for it, not for the one asked for.
 */
export interface TurnBudget {
  model?: string | null;
  /** False when the price table has no row for `model`: its cost is unknown. */
  known_model?: boolean;
  /**
   * What the turn cost, from the response's own usage counters. Null when the
   * model is unpriced or no usage came back; absent while `actual` is null.
   * `estimate.cost_usd` is an input-only upper bound and is deliberately not typed.
   */
  actual?: { cost_usd?: number | null; priced?: boolean } | null;
}

/** Live progress of a deep run, built from `tool_call`, `sources_added`, `pause_turn`, `deep_final_turn`. */
export interface DeepRunProgress {
  toolCalls: DeepToolCall[];
  passagesFound: number;
  pauses: number;
  /** Set when the last permitted turn runs with tools disabled. */
  finalTurn: boolean;
  /** Narration dropped because the model went on to call a tool. */
  narrationResets: number;
}

/** Live progress of the current run, reset on each submit. */
export interface RunProgress {
  /** Set when the `long_context` progress event arrived. */
  longContext: { used: boolean; reason?: string; papers: number } | null;
  /** True once a deep-stance event has been seen (or the mode is deep). */
  deep: DeepRunProgress | null;
  /** History trimmed from the model's context this turn. */
  trimmedTurns: number;
  startedAt: number;
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

// Pre-W3 citation check, kept only so old stored messages still type-check.
// New answers use `EntailmentReport`; nothing renders this any more.
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
  mode: AnswerMode;
  response_mode: ResponseMode;
  used_general_knowledge: boolean;
  used_web_search: boolean;
  // W3
  answer_status: AnswerStatus;
  citations: Citation[];
  claims: Claim[];
  served_model: string | null;
  fallback_used: boolean;
  stop_reason: string | null;
  retrieval_mode: RetrievalMode;
  long_context: LongContextInfo;
  hybrid_fallback: boolean;
  history: HistoryInfo;
  profile_used: boolean;
  message_id: number | null;
  deep: DeepInfo | null;
  budget?: TurnBudget | null;
  /** /query computes entailment before returning; null when the check is off. */
  entailment: EntailmentReport | null;
}

// Message in a conversation
export interface Message {
  id: string;
  type: 'query' | 'response' | 'web_search';
  content: string;
  timestamp: Date;
  metadata?: {
    /** Stored assistant message id on the server; null/undefined if not persisted. */
    messageId?: number | null;
    queryType?: QueryType;
    expandedQuery?: string;
    entities?: Entity[];
    sources?: Source[];
    retrievalCount?: number;
    rerankedCount?: number;
    latency?: number;
    warnings?: string[];
    /** Pre-W3 only. Ignored by the renderer. */
    citationChecks?: CitationCheck[];
    // W3. `citations` being an array (even empty) is what marks a message as
    // W3; its absence marks a stored pre-W3 message whose text carries
    // `[Source N]`.
    citations?: Citation[];
    claims?: Claim[];
    answerStatus?: AnswerStatus;
    /**
     * Set when the stream ended before the server's `complete` event: the text
     * is whatever had arrived. 'dropped' = the connection closed under us;
     * 'stopped' = the user pressed Stop. Never set on a server-final answer.
     */
    cutOff?: 'dropped' | 'stopped';
    servedModel?: string | null;
    /** Absent on messages stored before the backend sent it, and on null (accounting failed). */
    budget?: TurnBudget | null;
    /** Model that declined before a fallback took over, when the stream said so. */
    fallbackFrom?: string | null;
    fallbackUsed?: boolean;
    stopReason?: string | null;
    retrievalMode?: RetrievalMode;
    longContext?: LongContextInfo;
    hybridFallback?: boolean;
    history?: HistoryInfo;
    profileUsed?: boolean;
    deep?: DeepInfo | null;
    mode?: AnswerMode;
    /** Entailment labels; null/undefined until the pass finishes. */
    entailment?: EntailmentReport | null;
    /** True from `complete` until the `entailment` event arrives. */
    entailmentPending?: boolean;
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

const EFFORT_LEVELS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** A stored preference is untrusted: only a known level may become the effort. */
export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === 'string' && EFFORT_LEVELS.includes(value);
}

// Query options for the chat Advanced Options panel. The panel exposes three
// controls: mode, effort and web search. Everything else about retrieval and
// the answer pipeline (result counts, chunks per paper, query type, HyDE,
// expansion, citation check, general knowledge, length) is left to the
// backend's own defaults, so none of it is sent with a query.
export interface QueryOptions {
  effort: EffortLevel;
  mode: AnswerMode; // Response stance - selects the prompt's stance modifier
  paperFilter: string[];
  sectionFilter: string | null;
  enableWebSearch: boolean; // Allow Claude to search the web
  enablePdfUpload: boolean; // Send actual PDF files to Claude (32MB limit, 100 pages max)
  // Whether this turn sees the user's profile. Per message; not a stored preference.
  useProfile: boolean;
  // The answer model the user picked, by registry name. null = they have not
  // chosen, and the query then carries no `answer_model` at all so the server
  // uses its own configured model and fallback. Not the same as the default's name.
  answerModel: string | null;
}

// One pickable answer model, as GET /models describes it. The list comes from
// the server so a model added or retired there reaches the picker unchanged.
export interface AnswerModelInfo {
  name: string;
  label: string;
  model: string;
  blurb: string;
  // What this library measured about the model, or null. Shown to the user
  // when they choose; never a reason to hide the model.
  caution: string | null;
  has_fallback: boolean;
  fallback: string | null;
  is_default: boolean;
}

export interface AnswerModelsResponse {
  // Registry name of the configured model, or null when it is not in the registry.
  default: string | null;
  configured_model: string;
  models: AnswerModelInfo[];
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
  /** The model *requested* for answers. */
  llm_model: string;
  llm_model_fallback?: string | null;
  /** The model that served the most recent answer in this server process. */
  served_model?: string | null;
  /** Stored assistant answers per serving model (durable). */
  served_models?: Record<string, number>;
  served_models_this_process?: Record<string, number>;
  cache_stats: CacheStats;
  conversation_stats: {
    enabled?: boolean;
    source?: string;
    turns?: number;
    papers_discussed?: string[];
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
  | 'verification'
  | 'memory'
  | 'long_context'
  | 'citation'
  | 'answer_reset'
  | 'tool_call'
  | 'sources_added'
  | 'pause_turn'
  | 'deep_final_turn'
  | 'web_search'
  | 'web_search_progress'
  | 'web_search_chunk';

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
  { name: 'web_search', label: 'Web Search', description: 'Searching the web for additional context' },
];

// Streaming state for progressive response building
export interface StreamingState {
  messageId: string;
  conversationId: string;
  content: string;
  /** Citations received so far, in arrival order. A marker in `content` is only ever
   *  rendered after its citation has arrived (the server sends the citation first). */
  citations: Citation[];
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

export type AppPage = 'chat' | 'library' | 'bibliography' | 'prompts' | 'health' | 'profile' | 'projects' | 'writing' | 'map';

/** What the PDF viewer should draw over the page it opens at. */
export interface PdfHighlight {
  highlights: PageHighlight[];
  /** The verbatim cited passage, shown beside the page. */
  quote: string | null;
  locationSource: LocationSource | null;
  /** Last page of the span, when it runs over a page break. */
  pageEnd: number | null;
  /** "p. 7 · Methods" */
  locator: string | null;
}

// ---------------------------------------------------------------------------
// Profile (memory)
// ---------------------------------------------------------------------------

export interface MemoryFact {
  id: number;
  fact: string;
  category?: string | null;
  created_at: string;
}

export interface ProfileResponse {
  paragraph: string;
  facts: MemoryFact[];
  /** Exactly what the model receives each turn ('' when the profile is empty). */
  injected_message: string;
  injected_chars: number;
  est_tokens: number;
  /** The profile exceeds max_chars; later facts are left out of the message. */
  truncated: boolean;
  facts_included: number;
  max_chars: number;
  /** Server switch; false means nothing is injected whatever is stored. */
  injection_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Projects and notebooks
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  description: string | null;
  paper_ids: string[];
  open_questions: string[];
  conversation_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface NotebookFileInfo {
  path: string;
  size: number;
  modified: number;
}

export interface NotebookListing {
  files: NotebookFileInfo[];
  total_bytes: number;
  max_bytes: number;
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
  activePage: AppPage;
  selectedPaperId: string | null;
  viewingPdfId: string | null;
  //: Page to open the PDF viewer at, 1-indexed. Null means page 1.
  viewingPdfPage: number | null;
  // What to highlight on that page (a citation's boxes and quote), or null.
  viewingPdfHighlight: PdfHighlight | null;
  webSearchProgress: string | null; // Current web search progress message
  thinkingProgress: string | null; // Summarized model reasoning streamed during generation
  runProgress: RunProgress | null; // Long-context / deep-run progress for the query in flight

  // Projects
  projects: Project[];
  activeProjectId: string | null;
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
  effort: 'high',
  mode: 'ask',
  paperFilter: [],
  sectionFilter: null,
  enableWebSearch: false,
  enablePdfUpload: false,
  useProfile: true,
  answerModel: null,
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
