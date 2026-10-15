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
    servedModel?: string | null;
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
  // Whether this turn sees the user's profile. Per message; not a stored preference.
  useProfile: boolean;
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

export type AppPage = 'chat' | 'library' | 'bibliography' | 'prompts' | 'health' | 'profile' | 'projects' | 'writing';

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
  useProfile: true,
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
