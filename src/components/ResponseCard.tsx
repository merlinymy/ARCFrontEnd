import { useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Database,
  Filter,
  Tag,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  PauseCircle,
  Globe,
  ExternalLink,
  Image as ImageIcon,
  BookOpen,
  UserRound,
  History as HistoryIcon,
  Wrench,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnswerBody } from './AnswerBody';
import { EntailmentBadge, EntailmentPending } from './EntailmentBadge';
import { SourcesPanel } from './SourcesPanel';
import { FigureView } from './FigureView';
import { Tooltip } from './Tooltip';
import { useApp } from '../context/AppContext';
import type { EntailmentLabelValue, Message, Source } from '../types';
import { ENTAILMENT_PILL_CLASS, ENTAILMENT_TEXT, formatModelName } from '../lib/citations';
import { describeToolCall } from '../lib/deep';

interface ResponseCardProps {
  queryMessage: Message;
  responseMessage: Message;
}

interface CitedFigure {
  key: string;
  paperId: string;
  figureId: string;
  label: string | null;
  page: number | null;
  paperTitle: string;
}

/**
 * Figures among the given sources that have a persisted crop, deduped by
 * (paper, figure) — the same figure arrives as both a caption chunk and a table
 * chunk often enough to matter.
 */
function collectCitedFigures(sources: Source[]): CitedFigure[] {
  const seen = new Set<string>();
  const out: CitedFigure[] = [];
  for (const source of sources) {
    if (!source.figure_id || !source.has_figure_image) continue;
    const key = `${source.paper_id}:${source.figure_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      paperId: source.paper_id,
      figureId: source.figure_id,
      label: source.figure_label ?? null,
      page: source.figure_page ?? null,
      paperTitle: source.paper_title,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Footer notes
// ---------------------------------------------------------------------------

/**
 * One quiet line in the answer's footer: an icon and a few words, with the
 * longer reason on hover and focus. Plain grey on purpose; none of these are
 * errors.
 */
function FooterNote({
  icon,
  label,
  reason,
  tone = 'quiet',
  onClick,
}: {
  icon: ReactNode;
  label: string;
  reason: string;
  tone?: 'quiet' | 'warn';
  onClick?: () => void;
}) {
  const color =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-gray-500 dark:text-gray-400';
  const className = `inline-flex items-center gap-1 text-xs ${color} rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`;
  const body = (
    <>
      {icon}
      {label}
    </>
  );
  return (
    <Tooltip content={reason}>
      {onClick ? (
        <button type="button" onClick={onClick} className={className} aria-label={`${label}. ${reason}`}>
          {body}
        </button>
      ) : (
        <span tabIndex={0} className={className} title={reason}>
          {body}
        </span>
      )}
    </Tooltip>
  );
}

const ICON = 'w-3.5 h-3.5 shrink-0';

function EntailmentSummary({ message }: { message: Message }) {
  const { metadata } = message;
  const citations = metadata?.citations ?? [];
  if (citations.length === 0) return null;

  const report = metadata?.entailment;
  if (!report) {
    return metadata?.entailmentPending ? <EntailmentPending /> : null;
  }

  if (report.status === 'skipped') return null;

  // The check ran but produced nothing: say so, calmly. Never "verified".
  if (report.status === 'error') {
    return (
      <FooterNote
        icon={<AlertCircle className={ICON} aria-hidden="true" />}
        reason={`The citation check did not complete${report.error ? ` (${report.error})` : ''}. The quotes are still exactly what the papers say; they just have not been compared with the claims.`}
        label="Citation check unavailable"
      />
    );
  }

  const counts: Array<[EntailmentLabelValue, number]> = (
    ['supported', 'partially_supported', 'unsupported'] as const
  ).map((label) => [label, report.summary?.[label] ?? 0]);
  const unchecked = report.summary?.unchecked ?? 0;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap text-xs" aria-label="Citation check">
      <span className="text-gray-500 dark:text-gray-400">Citation check:</span>
      {counts
        .filter(([, n]) => n > 0)
        .map(([label, n]) => (
          <span
            key={label}
            className={`inline-flex items-center px-1.5 py-0.5 rounded-full border ${ENTAILMENT_PILL_CLASS[label]}`}
          >
            {n} {ENTAILMENT_TEXT[label].toLowerCase()}
          </span>
        ))}
      {unchecked > 0 && (
        <span className="text-gray-500 dark:text-gray-400">{unchecked} not checked</span>
      )}
    </span>
  );
}

export function AnswerFooter({ message }: { message: Message }) {
  const { setActivePage } = useApp();
  const m = message.metadata;
  if (!m) return null;

  const model = formatModelName(m.servedModel);
  const trimmed = m.history?.trimmed_turns ?? 0;
  const lookups = m.deep?.tool_calls?.length ?? 0;
  const papersRead = m.longContext?.papers?.length ?? 0;

  const notes: ReactNode[] = [];

  if (model) {
    notes.push(
      <FooterNote
        key="model"
        icon={<Cpu className={ICON} aria-hidden="true" />}
        reason={
          m.fallbackUsed
            ? `The first-choice model declined this request${
                m.fallbackFrom ? ` (${formatModelName(m.fallbackFrom) ?? m.fallbackFrom})` : ''
              }, so ${model} wrote the whole answer. Nothing in it comes from the declined attempt.`
            : `This answer was written by ${model}.`
        }
        label={m.fallbackUsed ? `Answered by ${model} (fallback)` : `Answered by ${model}`}
      />
    );
  }

  if (m.retrievalMode === 'long_context') {
    notes.push(
      <FooterNote
        key="long"
        icon={<BookOpen className={ICON} aria-hidden="true" />}
        reason={`The papers you selected fit in the model's context, so it read ${
          papersRead === 1 ? 'the full paper' : papersRead > 1 ? `all ${papersRead} papers in full` : 'them in full'
        } instead of searching for passages.`}
        label="Read the full papers"
      />
    );
  }

  if (m.retrievalMode === 'agentic' && lookups > 0) {
    notes.push(
      <FooterNote
        key="deep"
        icon={<Wrench className={ICON} aria-hidden="true" />}
        reason="This stance searches the library itself, over several steps, before it answers."
        label={`${lookups} library lookup${lookups === 1 ? '' : 's'}`}
      />
    );
  }

  if (m.hybridFallback) {
    notes.push(
      <FooterNote
        key="hybrid"
        tone="warn"
        icon={<AlertTriangle className={ICON} aria-hidden="true" />}
        reason="Keyword matching was unavailable for this question, so retrieval used meaning-based search only. Passages that hinge on an exact term may have been missed."
        label="Search was degraded"
      />
    );
  }

  if (m.stopReason === 'max_tokens') {
    notes.push(
      <FooterNote
        key="cut"
        tone="warn"
        icon={<AlertTriangle className={ICON} aria-hidden="true" />}
        reason="The answer reached its length limit and may be cut off. Ask it to continue."
        label="May be cut off"
      />
    );
  }

  if (trimmed > 0) {
    notes.push(
      <FooterNote
        key="history"
        icon={<HistoryIcon className={ICON} aria-hidden="true" />}
        reason={`${trimmed} earlier turn${trimmed === 1 ? ' is' : 's are'} no longer in the model's context (the thread is still shown in full). Start a new conversation, or put what matters in your profile or a project notebook.`}
        label="Earlier turns trimmed"
      />
    );
  }

  if (m.profileUsed) {
    notes.push(
      <FooterNote
        key="profile"
        icon={<UserRound className={ICON} aria-hidden="true" />}
        reason="Your profile was sent with this question. Click to see exactly what it says."
        onClick={() => setActivePage('profile')}
        label="Used your profile"
      />
    );
  }

  const entailment = <EntailmentSummary message={message} />;

  return (
    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {entailment}
      {notes}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices: a refused, failed or unfinished turn is not an answer
// ---------------------------------------------------------------------------

export function AnswerNotice({ message }: { message: Message }) {
  const m = message.metadata;
  const status = m?.answerStatus ?? 'error';
  const calls = m?.deep?.tool_calls ?? [];

  const { icon, title } =
    status === 'refused'
      ? {
          icon: <ShieldAlert className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />,
          title: 'The model declined to answer this',
        }
      : status === 'incomplete'
      ? {
          icon: <PauseCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />,
          title: 'This run stopped before it finished',
        }
      : {
          icon: <AlertCircle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />,
          title: 'This answer could not be completed',
        };

  const tone =
    status === 'incomplete'
      ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800'
      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700';

  return (
    <div role="note" className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
          {/* Plain text, not markdown: this is a message from the system, and it
              carries no citations. */}
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
            {message.content}
          </p>
          {status === 'incomplete' && calls.length > 0 && (
            <details className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              <summary className="cursor-pointer select-none">
                What it did before stopping ({calls.length} step{calls.length === 1 ? '' : 's'})
              </summary>
              <ul className="mt-2 list-disc pl-5 space-y-0.5">
                {calls.map((call, i) => (
                  <li key={i}>
                    {describeToolCall(call.name, call.input)}
                    {call.passages > 0 && ` (${call.passages} passage${call.passages === 1 ? '' : 's'})`}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {status === 'incomplete' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Nothing here counts as an answer, and it is not carried into the next turn. Ask again,
              or narrow the question.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Web search
// ---------------------------------------------------------------------------

function WebSearchCard({ message }: { message: Message }) {
  const webSearchSources = message.metadata?.webSearchSources || [];
  return (
    <div className="animate-fade-in">
      {/* Web Search Card */}
      <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-800 rounded-lg">
            <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
              Web Search Results
            </h4>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Additional context from the internet
            </p>
          </div>
        </div>

        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Web Search Sources */}
        {webSearchSources.length > 0 && (
          <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800">
            <h5 className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
              Sources ({webSearchSources.length})
            </h5>
            <div className="space-y-2">
              {webSearchSources.map((source, index) => (
                <a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm p-2 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 border border-emerald-100 dark:border-emerald-900 transition-colors group"
                >
                  <ExternalLink className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-emerald-900 dark:text-emerald-100 group-hover:underline truncate">
                    {source.title}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

function AnswerCard({ queryMessage, responseMessage }: ResponseCardProps) {
  const [showPipeline, setShowPipeline] = useState(false);
  const { state } = useApp();

  const { metadata } = responseMessage;
  const status = metadata?.answerStatus ?? 'ok';
  const isNotice = status !== 'ok';

  // Still being written, nothing yet: the thread shows the pipeline progress
  // below; an empty white box above it would only be noise.
  const isStreamingEmpty =
    state.streamingState?.messageId === responseMessage.id && responseMessage.content.length === 0;

  const allSources = useMemo(() => metadata?.sources ?? [], [metadata?.sources]);
  const citations = metadata?.citations;

  // Figures from the sources the answer actually cited (all retrieved sources
  // for a pre-W3 answer, which has no notion of cited). Rendered in the thread
  // so the user can look at the actual plot without leaving the conversation --
  // the image is the evidence, and nothing here interprets it.
  const citedFigures = useMemo(() => {
    if (isNotice) return [];
    if (citations === undefined) return collectCitedFigures(allSources);
    const indexes = new Set(
      citations.map((c) => c.source_index).filter((i): i is number => i != null)
    );
    return collectCitedFigures(allSources.filter((_, i) => indexes.has(i)));
  }, [isNotice, citations, allSources]);

  // The hybrid-search warning is shown as a quiet footer note; do not also list it as a box.
  const warnings = (metadata?.warnings ?? []).filter(
    (w) => !(metadata?.hybridFallback && /^Hybrid search was unavailable/i.test(w))
  );

  const deep = metadata?.deep;
  const tokens = deep?.usage;

  return (
    <div className="animate-fade-in">
      {/* Query Card */}
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
            <Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-gray-900 dark:text-gray-100 font-medium">
              {queryMessage.content}
            </p>

            {metadata?.queryType && (
              <div className="flex items-center gap-4 mt-2 text-sm">
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <Tag className="w-4 h-4" />
                  <span>
                    Query Type:{' '}
                    <span className="font-medium text-blue-600 dark:text-blue-400 uppercase">
                      {metadata.queryType}
                    </span>
                  </span>
                </div>

                {metadata.expandedQuery && (
                  <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-500">
                    <span className="truncate max-w-xs">
                      Expanded: "{metadata.expandedQuery}"
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Answer Card */}
      {!isStreamingEmpty && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          {isNotice ? (
            <AnswerNotice message={responseMessage} />
          ) : (
            <AnswerBody
              content={responseMessage.content}
              citations={citations}
              claims={metadata?.claims}
              entailment={metadata?.entailment}
              entailmentPending={Boolean(metadata?.entailmentPending)}
              legacySources={citations === undefined ? allSources : undefined}
            />
          )}

          {/* Pipeline Warnings */}
          {warnings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                {warnings.map((warning, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-400">
                      {warning}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Still streaming: no footer until the answer is final. */}
          {state.streamingState?.messageId !== responseMessage.id && (
            <AnswerFooter message={responseMessage} />
          )}
        </div>
      )}

      {/* Figures from the cited sources */}
      {citedFigures.length > 0 && (
        <div className="mt-4">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            <ImageIcon className="w-4 h-4 text-gray-400" />
            Figures in the cited sources ({citedFigures.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {citedFigures.map((figure) => (
              <FigureView
                key={figure.key}
                paperId={figure.paperId}
                figureId={figure.figureId}
                label={figure.label}
                caption={figure.paperTitle}
                page={figure.page}
                variant="thumbnail"
              />
            ))}
          </div>
        </div>
      )}

      {/* Sources: each with the passages it was cited for */}
      {!isNotice && allSources.length > 0 && (
        <SourcesPanel
          sources={allSources}
          citations={citations}
          claims={metadata?.claims ?? []}
          entailment={metadata?.entailment}
          entailmentPending={Boolean(metadata?.entailmentPending)}
          retrievalMode={metadata?.retrievalMode}
        />
      )}

      {/* Pipeline Details */}
      <div className="mt-4">
        <button
          onClick={() => setShowPipeline(!showPipeline)}
          aria-expanded={showPipeline}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {showPipeline ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          Pipeline Details
        </button>

        {showPipeline && (
          <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 animate-fade-in">
            <div className="flex flex-wrap gap-4 text-sm">
              {metadata?.retrievalMode && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Search className="w-4 h-4" />
                  <span>
                    Mode:{' '}
                    {metadata.retrievalMode === 'long_context'
                      ? 'read papers in full'
                      : metadata.retrievalMode === 'agentic'
                      ? 'tool loop'
                      : 'retrieval'}
                  </span>
                </div>
              )}

              {metadata?.retrievalCount !== undefined && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Database className="w-4 h-4" />
                  <span>
                    Retrieved: {metadata.retrievalCount}
                  </span>
                </div>
              )}

              {metadata?.rerankedCount !== undefined && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Filter className="w-4 h-4" />
                  <span>
                    Reranked: {metadata.rerankedCount}
                  </span>
                </div>
              )}

              {citations !== undefined && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Cited: {citations.length}</span>
                </div>
              )}

              {metadata?.latency !== undefined && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>
                    Latency: {(metadata.latency / 1000).toFixed(2)}s
                  </span>
                </div>
              )}

              {deep && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Wrench className="w-4 h-4" />
                  <span>
                    {deep.turns} turn{deep.turns === 1 ? '' : 's'}, {deep.tool_calls.length} tool call
                    {deep.tool_calls.length === 1 ? '' : 's'}
                    {deep.pauses > 0 ? `, ${deep.pauses} pause${deep.pauses === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
              )}

              {tokens && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Cpu className="w-4 h-4" />
                  <span>
                    Tokens: {(tokens.input_tokens ?? 0).toLocaleString()} in,{' '}
                    {(tokens.output_tokens ?? 0).toLocaleString()} out
                    {tokens.cache_read_input_tokens
                      ? `, ${tokens.cache_read_input_tokens.toLocaleString()} from cache`
                      : ''}
                  </span>
                </div>
              )}
            </div>

            {deep && deep.tool_calls.length > 0 && (
              <ul className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-0.5">
                {deep.tool_calls.map((call, i) => (
                  <li key={i}>
                    {describeToolCall(call.name, call.input)}
                    {call.passages > 0 && ` — ${call.passages} passage${call.passages === 1 ? '' : 's'}`}
                  </li>
                ))}
              </ul>
            )}

            {/* Every label with its reason, for when the footer's counts are not enough. */}
            {metadata?.entailment && metadata.entailment.labels.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1.5">
                {metadata.entailment.labels.map((label) => (
                  <div
                    key={`${label.claim_index}:${label.citation_id}`}
                    className="flex items-baseline gap-2 text-sm text-gray-600 dark:text-gray-400"
                  >
                    <span className="shrink-0 tabular-nums">[{label.citation_id}]</span>
                    <EntailmentBadge label={label} showReason />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ResponseCard({ queryMessage, responseMessage }: ResponseCardProps) {
  const isWebSearch = responseMessage.type === 'web_search' || responseMessage.metadata?.isWebSearch;
  if (isWebSearch) return <WebSearchCard message={responseMessage} />;
  return <AnswerCard queryMessage={queryMessage} responseMessage={responseMessage} />;
}
