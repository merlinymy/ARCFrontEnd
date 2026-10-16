// Types for the writing surface (W6). Mirrors docs/W6_WRITING.md of the backend branch
// feat/w6-writing, sections 3.1 to 3.8. Field names are the backend's (snake_case) on purpose:
// these objects are shown, not re-shaped.

import type {
  AnswerMode,
  AnswerStatus,
  Citation,
  Claim,
  DeepInfo,
  EntailmentReport,
  HistoryInfo,
  LongContextInfo,
  ResponseMode,
  RetrievalMode,
  Source,
  EffortLevel,
} from './index';
import type { Citation as BibCitation, CiteEvidence, CitationStyle, EntryKind } from './bibliography';

export type WritingTask = 'outline' | 'questions' | 'aims' | 'intro_citations' | 'journals';

/** `generate` tasks call the answer model (W3); `retrieve` tasks are W4's recommender, no model call. */
export const WRITING_TASKS: Array<{
  task: WritingTask;
  /** URL segment under /writing */
  path: string;
  label: string;
  kind: 'generate' | 'retrieve';
  summary: string;
  inputLabel: string;
  inputHint: string;
}> = [
  {
    task: 'outline',
    path: 'outline',
    label: 'Section outline',
    kind: 'generate',
    summary: 'An outline of the paper, one claim per point, each tied to the library papers that support it.',
    inputLabel: 'Your notes, draft or topic',
    inputHint: 'Paste whatever you have: bullet notes, a rough draft, or a paragraph on the topic.',
  },
  {
    task: 'questions',
    path: 'questions',
    label: 'Questions this paper must answer',
    kind: 'generate',
    summary: 'Reviewer-style questions your draft has to answer, worst first, with what the library offers for each.',
    inputLabel: 'Your draft or summary of the work',
    inputHint: 'The more of the actual claims and numbers you include, the sharper the questions.',
  },
  {
    task: 'aims',
    path: 'aims',
    label: 'Specific Aims skeleton',
    kind: 'generate',
    summary: 'An NIH-style skeleton: problem, gap, hypothesis, aims, expected outcomes. A skeleton, not a finished page.',
    inputLabel: 'Your idea, notes or topic',
    inputHint: 'If you leave the hypothesis open, the model proposes one and says so under the gaps.',
  },
  {
    task: 'intro_citations',
    path: 'intro-citations',
    label: 'Introduction citations',
    kind: 'retrieve',
    summary: 'Which library references to cite at which sentence of an introduction, with formatted citations. No model call by default.',
    inputLabel: 'Your introduction',
    inputHint: 'Paragraphs (every sentence is a position) or an outline with one line per position.',
  },
  {
    task: 'journals',
    path: 'journals',
    label: 'Target-journal suggestions',
    kind: 'retrieve',
    summary: 'Where the library papers most related to your text were published. A tally of what the library records, not a judgement of fit.',
    inputLabel: 'Your abstract, topic or draft',
    inputHint: 'The papers in your library closest to this text are tallied by journal.',
  },
];

export const WRITING_TASK_LABEL: Record<WritingTask, string> = Object.fromEntries(
  WRITING_TASKS.map((t) => [t.task, t.label])
) as Record<WritingTask, string>;

// ---------------------------------------------------------------------------
// Parsed pieces of the three model-backed tasks
// ---------------------------------------------------------------------------

export type WritingSupport = 'library' | 'general_knowledge' | 'none';

/** One parsed line. `text` keeps the ⟦n⟧ markers (they index the response's `citations`); `plain` has none. */
export interface WritingText {
  text: string;
  plain: string;
  citation_ids: number[];
  paper_ids: string[];
  papers: Array<{ paper_id: string; paper_title: string }>;
  /** Indexes into the response's `claims`, hence into `entailment.labels[].claim_index`. */
  claim_indexes: number[];
  support: WritingSupport;
}

export interface OutlinePoint extends WritingText {
  index: number;
}

export interface OutlineSection {
  index: number;
  heading: string;
  summary: WritingText | null;
  points: OutlinePoint[];
}

export interface WritingCounts {
  points?: number;
  texts?: number;
  library: number;
  general_knowledge: number;
  none: number;
}

export interface OutlineWriting {
  task: 'outline';
  parsed: boolean;
  preamble: string | null;
  sections: OutlineSection[];
  library_gaps: string[];
  missing_sections: string[];
  counts: WritingCounts;
  requested?: Record<string, unknown>;
}

export interface QuestionItem {
  index: number;
  number: number;
  theme: string | null;
  question: string;
  why: WritingText | null;
  library: WritingText | null;
  needs: WritingText | null;
  citation_ids: number[];
  paper_ids: string[];
  /** true: the "What the library offers" line carries a citation; false: none or it says nothing; null: line missing. */
  addressed_by_library: boolean | null;
}

export interface QuestionsWriting {
  task: 'questions';
  parsed: boolean;
  themes: string[];
  questions: QuestionItem[];
  counts: { questions: number; addressed_by_library: number; not_addressed_by_library: number };
  requested?: Record<string, unknown>;
}

export interface AimItem {
  number: number;
  title: string | null;
  objective: WritingText | null;
  rationale: WritingText | null;
  approach: WritingText | null;
  expected_outcome: WritingText | null;
  risk: WritingText | null;
  other: Array<{ label?: string } & Partial<WritingText>>;
}

export interface AimsWriting {
  task: 'aims';
  parsed: boolean;
  problem: WritingText | null;
  gap: WritingText | null;
  hypothesis: WritingText | null;
  aims: AimItem[];
  outcomes: WritingText | null;
  library_gaps: string[];
  extra_sections: unknown[];
  num_aims: number;
  num_aims_requested: number;
  preamble: string | null;
  counts: WritingCounts;
  requested?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The two retrieval tasks
// ---------------------------------------------------------------------------

export interface IntroReference {
  number: number;
  entry_id: string;
  kind: EntryKind;
  rank: number;
  score: number;
  scores?: Record<string, number>;
  /** Built from the paper's own sentences, or (use_llm) reworded from them. */
  reason: string;
  reason_source: string;
  role: string | null;
  evidence: CiteEvidence[];
  in_text: string;
  /** W3 `citations[].id` of the full-text passage quoted; null for a reference-only entry. */
  citation_id: number | null;
}

export interface IntroPosition {
  index: number;
  text: string;
  kind: string;
  needs_citation: boolean;
  skip_reason: string | null;
  references: IntroReference[];
  error?: string;
}

export interface IntroListedReference {
  number: number;
  entry_id: string;
  kind: EntryKind;
  full_text_searchable: boolean;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  pdf_url: string | null;
  citation: BibCitation;
  /** Indexes of the positions that cite it. */
  positions: number[];
}

export interface IntroCitationsWriting {
  task: 'intro_citations';
  parsed: boolean;
  style: CitationStyle;
  input_kind: string;
  positions: IntroPosition[];
  references: IntroListedReference[];
  notes: string[];
  stats: {
    positions: number;
    cited_positions: number;
    references: number;
    reference_only: number;
    llm_used: boolean;
    reranked: boolean;
  };
  requested?: Record<string, unknown>;
}

export interface JournalPaper {
  entry_id: string;
  kind: EntryKind;
  title: string;
  year: number | null;
  doi: string | null;
  rank: number;
  score: number;
}

export interface JournalSuggestion {
  rank: number;
  journal: string;
  variants: string[];
  n_papers: number;
  /** Fraction (0 to 1) of the relevance weight among entries that record a journal. */
  share: number;
  years: number[] | null;
  papers: JournalPaper[];
  basis: string;
}

export type JournalEvidenceLevel = 'none' | 'thin' | 'limited' | 'reasonable';

export interface JournalsWriting {
  task: 'journals';
  parsed: boolean;
  suggestions: JournalSuggestion[];
  evidence: {
    level: JournalEvidenceLevel;
    statement: string;
    related_considered: number;
    with_journal: number;
    missing_journal: number;
    distinct_journals: number;
    thin_below: number;
  };
  missing_journal_examples: JournalPaper[];
  limits: string[];
  notes: string[];
  requested?: Record<string, unknown>;
}

/** What a failed, refused or unfinished model run stores in place of the structure. */
export interface UnparsedWriting {
  task: WritingTask;
  parsed: false;
  reason?: string;
  requested?: Record<string, unknown>;
}

export type WritingPayload =
  | OutlineWriting
  | QuestionsWriting
  | AimsWriting
  | IntroCitationsWriting
  | JournalsWriting
  | UnparsedWriting;

// ---------------------------------------------------------------------------
// The response (`complete` event minus `type`) and the stream
// ---------------------------------------------------------------------------

export interface WritingResponse {
  task: WritingTask;
  answer: string;
  answer_status: AnswerStatus;
  writing: WritingPayload;
  sources: Source[];
  citations: Citation[];
  claims: Claim[];
  warnings: string[];
  mode: AnswerMode | 'writing' | null;
  effort: EffortLevel | null;
  response_mode: ResponseMode | null;
  used_general_knowledge: boolean;
  served_model: string | null;
  fallback_used: boolean;
  stop_reason: string | null;
  retrieval_mode: RetrievalMode;
  long_context: LongContextInfo;
  hybrid_fallback: boolean;
  history: HistoryInfo;
  profile_used: boolean;
  /** Stream only: true means an `entailment` event follows. */
  entailment_pending: boolean;
  entailment: EntailmentReport | null;
  deep: DeepInfo | null;
  message_id: number | null;
  conversation_id: string | null;
  project_id: string | null;
}

export interface WritingProgressEvent {
  type: 'progress';
  step: string;
  data: Record<string, unknown>;
}

export interface WritingCompleteEvent extends WritingResponse {
  type: 'complete';
}

export interface WritingEntailmentEvent extends EntailmentReport {
  type: 'entailment';
  message_id: number | null;
}

export interface WritingErrorEvent {
  type: 'error';
  message: string;
}

export type WritingStreamEvent =
  | WritingProgressEvent
  | WritingCompleteEvent
  | WritingEntailmentEvent
  | WritingErrorEvent;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface WritingRequestBase {
  text: string;
  title?: string | null;
  paper_ids?: string[] | null;
  project_id?: string | null;
  conversation_id?: string | null;
  persist?: boolean;
}

export interface GenerateRequestBody extends WritingRequestBase {
  effort?: EffortLevel;
  mode?: AnswerMode | null;
  response_mode?: ResponseMode;
  enable_general_knowledge?: boolean;
  use_profile?: boolean;
  enable_citation_check?: boolean | null;
  // outline
  sections?: string[] | null;
  paper_type?: string | null;
  // questions
  audience?: string | null;
  // aims
  num_aims?: number;
  mechanism?: string | null;
}

export interface RetrieveRequestBody extends WritingRequestBase {
  include_references?: boolean;
  year_min?: number | null;
  year_max?: number | null;
  // intro_citations
  style?: CitationStyle | null;
  input_kind?: 'auto' | 'paragraph' | 'outline';
  refs_per_position?: number | null;
  max_positions?: number | null;
  cite_all?: boolean;
  // journals
  max_journals?: number;
}

export type WritingRequestBody = GenerateRequestBody & RetrieveRequestBody;

/** GET /writing/tasks (only the parts the page uses). */
export interface WritingTasksInfo {
  default_outline_sections: string[];
  limits: {
    max_input_chars: number;
    intro_max_positions: number;
    intro_refs_per_position: number;
    journal_related_pool: number;
    journal_thin_evidence_below: number;
    deep_modes_enabled: boolean;
    deep_mode_effort: string;
  };
}
