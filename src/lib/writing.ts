/**
 * Pure helpers for the writing surface (docs/W6_WRITING.md of the backend).
 * No JSX here, so the components that use them stay fast-refresh friendly.
 */
import type { Citation, Claim, Message, QueryType } from '../types';
import type { ConversationMessage } from '../services/api';
import { formatLocation } from './citations';
import type {
  AimsWriting,
  IntroCitationsWriting,
  JournalsWriting,
  OutlineWriting,
  QuestionsWriting,
  WritingPayload,
  WritingResponse,
  WritingSupport,
  WritingTask,
  WritingText,
} from '../types/writing';
import { WRITING_TASKS, WRITING_TASK_LABEL } from '../types/writing';

// ---------------------------------------------------------------------------
// Narrowing
// ---------------------------------------------------------------------------

/** The structured result, or null when the server could not recover the structure (render `answer` then). */
export function parsedWriting(r: WritingResponse): Exclude<WritingPayload, { parsed: false }> | null {
  if (r.answer_status !== 'ok' || !r.writing || r.writing.parsed !== true) return null;
  return r.writing as Exclude<WritingPayload, { parsed: false }>;
}

export const isOutline = (w: WritingPayload): w is OutlineWriting => w.task === 'outline';
export const isQuestions = (w: WritingPayload): w is QuestionsWriting => w.task === 'questions';
export const isAims = (w: WritingPayload): w is AimsWriting => w.task === 'aims';
export const isIntro = (w: WritingPayload): w is IntroCitationsWriting => w.task === 'intro_citations';
export const isJournals = (w: WritingPayload): w is JournalsWriting => w.task === 'journals';

export function isWritingTask(value: unknown): value is WritingTask {
  return WRITING_TASKS.some((t) => t.task === value);
}

// ---------------------------------------------------------------------------
// Citations and claims of one parsed line
// ---------------------------------------------------------------------------

/**
 * The claims a parsed line owns, in order. `AnswerBody` finds the label for the
 * k-th marker of its text in `claims[k]`; for one line of a longer answer that
 * list is the line's own `claim_indexes`, which keep their real `index`, so the
 * entailment labels (keyed by the real index) still match.
 */
export function claimsForText(text: Pick<WritingText, 'claim_indexes'>, claims: Claim[]): Claim[] {
  const byIndex = new Map(claims.map((c) => [c.index, c]));
  return text.claim_indexes.map((i) => byIndex.get(i)).filter((c): c is Claim => Boolean(c));
}

export const SUPPORT_LABEL: Record<WritingSupport, string> = {
  library: 'Supported by the library',
  general_knowledge: 'General knowledge, not from your library',
  none: 'No library support',
};

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

/** "Gaps in the library" for the tasks that have them (outline, aims). */
export function libraryGaps(w: WritingPayload): string[] {
  if (isOutline(w) || isAims(w)) return w.library_gaps ?? [];
  return [];
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

/** `text ⟦1,3⟧` becomes `text [1, 3]`: readable outside ARC, where a marker means nothing. */
export function markersToBrackets(text: string): string {
  return text.replace(/[ \t]*⟦(\d+(?:,\d+)*)⟧/g, (_m, ids: string) => ` [${ids.split(',').join(', ')}]`);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function sourcesAppendix(citations: Citation[]): string {
  if (citations.length === 0) return '';
  const lines = citations.map((c) => {
    const where = formatLocation(c);
    const title = c.paper_title || 'Untitled paper';
    const quote = c.cited_text ? `: “${oneLine(c.cited_text)}”` : '';
    return `- [${c.id}] ${title}${where ? ` (${where})` : ''}${quote}`;
  });
  return `\n\n## Sources cited\n\n${lines.join('\n')}`;
}

function introMarkdown(w: IntroCitationsWriting, formatted?: Map<string, string>): string {
  const lines: string[] = [];
  for (const p of w.positions) {
    const nums = p.references.map((r) => r.number);
    lines.push(`- ${p.text}${nums.length ? ` [${nums.join(', ')}]` : p.needs_citation ? ' (no match in the library)' : ''}`);
  }
  lines.push('', '## References', '');
  for (const r of w.references) {
    lines.push(`${r.number}. ${formatted?.get(r.entry_id) ?? r.citation.text}`);
  }
  return lines.join('\n');
}

function journalsMarkdown(w: JournalsWriting): string {
  const lines: string[] = [`**${w.evidence.statement}** (evidence: ${w.evidence.level})`, ''];
  if (w.suggestions.length === 0) lines.push('No journal could be suggested from the library.');
  for (const s of w.suggestions) {
    const years = s.years && s.years.length ? `, ${s.years.join(' to ')}` : '';
    lines.push(`${s.rank}. ${s.journal}: ${s.basis}${years}`);
  }
  if (w.limits.length) {
    lines.push('', '## Limits', '');
    for (const l of w.limits) lines.push(`- ${l}`);
  }
  return lines.join('\n');
}

/**
 * The result as Markdown for pasting elsewhere. The three model tasks export the
 * answer as written (markers turned into `[n]`) plus the passages it cites; the
 * two retrieval tasks are built from their structure.
 */
export function writingToMarkdown(r: WritingResponse, formatted?: Map<string, string>): string {
  const title = `# ${WRITING_TASK_LABEL[r.task] ?? 'Writing result'}\n\n`;
  const w = parsedWriting(r);
  if (w && isIntro(w)) return title + introMarkdown(w, formatted) + '\n';
  if (w && isJournals(w)) return title + journalsMarkdown(w) + '\n';
  return title + markersToBrackets(r.answer).trim() + sourcesAppendix(r.citations) + '\n';
}

// ---------------------------------------------------------------------------
// Messages: the same result as a conversation message
// ---------------------------------------------------------------------------

/** The result as the message shape `ResponseCard` parts (the answer footer, the notice) take. */
export function messageFromResponse(r: WritingResponse): Message {
  return {
    id: `writing-${r.message_id ?? 'live'}`,
    type: 'response',
    content: r.answer,
    timestamp: new Date(),
    metadata: {
      messageId: r.message_id,
      queryType: 'general' as QueryType,
      sources: r.sources,
      warnings: r.warnings,
      citations: r.citations ?? [],
      claims: r.claims ?? [],
      answerStatus: r.answer_status,
      servedModel: r.served_model,
      fallbackUsed: r.fallback_used,
      stopReason: r.stop_reason,
      retrievalMode: r.retrieval_mode,
      longContext: r.long_context,
      hybridFallback: r.hybrid_fallback,
      history: r.history,
      profileUsed: r.profile_used,
      deep: r.deep,
      entailment: r.entailment,
      entailmentPending: r.entailment_pending,
    },
  };
}

/**
 * Rebuild a result from a stored assistant message (docs section 4: its
 * `metadata` is W3's assistant metadata plus `writing`). Null when the message
 * is not a writing result.
 */
export function responseFromStored(msg: ConversationMessage, conversationId: string): WritingResponse | null {
  if (msg.role !== 'assistant') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (msg.metadata ?? {}) as Record<string, any>;
  const w = m.writing as WritingPayload | undefined;
  if (!w || !isWritingTask(w.task)) return null;
  return {
    task: w.task,
    answer: msg.content,
    answer_status: m.answer_status ?? 'ok',
    writing: w,
    sources: Array.isArray(m.sources) ? m.sources : [],
    citations: Array.isArray(m.citations) ? m.citations : [],
    claims: Array.isArray(m.claims) ? m.claims : [],
    warnings: Array.isArray(m.warnings) ? m.warnings : [],
    mode: m.mode ?? null,
    effort: null,
    response_mode: null,
    used_general_knowledge: false,
    served_model: m.served_model ?? null,
    fallback_used: Boolean(m.fallback_used),
    stop_reason: m.stop_reason ?? null,
    retrieval_mode: m.retrieval_mode ?? 'retrieval',
    long_context: m.long_context ?? {},
    hybrid_fallback: Boolean(m.hybrid_fallback),
    history: m.history ?? {},
    profile_used: Boolean(m.profile_used),
    entailment_pending: false,
    entailment: m.entailment ?? null,
    deep: m.deep ?? null,
    message_id: msg.id,
    conversation_id: conversationId,
    project_id: null,
  };
}

/**
 * Conversations a writing run created are titled "<task label>: <head>" (docs
 * section 4). The conversation list carries no metadata, so that prefix is how
 * the history list picks them out.
 */
export function writingTaskOfTitle(title: string): WritingTask | null {
  for (const t of WRITING_TASKS) {
    if (title.startsWith(`${t.label}: `)) return t.task;
  }
  return null;
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
