import type { Message, Citation, Claim, EntailmentReport, QueryType, Source } from '../types';
import type { ConversationMessage } from '../services/api';

/**
 * Turn a stored conversation message into the shape the thread renders.
 *
 * Stored assistant metadata is snake_case (docs/W3_ANSWER_PIPELINE.md section
 * 14); live messages are built camelCase in AppContext. This is the one place
 * the stored form is mapped, so a reopened thread renders exactly like a live
 * one.
 *
 * `citations` is left undefined for a pre-W3 message, which is what makes the
 * renderer fall back to `[Source N]` handling for it (section 3.4).
 */
export function messageFromStored(msg: ConversationMessage): Message {
  const base = {
    id: String(msg.id),
    content: msg.content,
    timestamp: new Date(msg.created_at),
  };

  if (msg.role === 'user') {
    return { ...base, type: 'query' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (msg.metadata ?? {}) as Record<string, any>;

  if (m.message_type === 'web_search') {
    return {
      ...base,
      type: 'web_search',
      metadata: { isWebSearch: true, webSearchSources: m.sources },
    };
  }

  const citations: Citation[] | undefined = Array.isArray(m.citations) ? m.citations : undefined;
  const claims: Claim[] | undefined = Array.isArray(m.claims)
    ? m.claims
    : citations
    ? []
    : undefined;

  return {
    ...base,
    type: 'response',
    metadata: {
      messageId: msg.id,
      queryType: (m.query_type ?? m.queryType) as QueryType | undefined,
      expandedQuery: m.expanded_query ?? m.expandedQuery,
      sources: m.sources as Source[] | undefined,
      retrievalCount: m.retrieval_count ?? m.retrievalCount,
      rerankedCount: m.reranked_count ?? m.rerankedCount,
      warnings: m.warnings,
      // Pre-W3 only; kept for completeness, never rendered.
      citationChecks: m.citationChecks ?? m.citation_checks,
      citations,
      claims,
      answerStatus: m.answer_status ?? (m.refused ? 'refused' : undefined),
      servedModel: m.served_model ?? null,
      fallbackUsed: Boolean(m.fallback_used),
      stopReason: m.stop_reason ?? null,
      retrievalMode: m.retrieval_mode,
      longContext: m.long_context,
      hybridFallback: Boolean(m.hybrid_fallback),
      history: m.history,
      profileUsed: Boolean(m.profile_used),
      deep: m.deep ?? null,
      mode: m.mode,
      entailment: (m.entailment as EntailmentReport | null | undefined) ?? null,
      entailmentPending: false,
    },
  };
}
