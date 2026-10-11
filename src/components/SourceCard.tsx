import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Copy,
  ExternalLink,
  Check,
  Image as ImageIcon,
  BookOpen,
} from 'lucide-react';
import type { Citation, Claim, FigureRef, Source, ChunkType } from '../types';
import { useApp } from '../context/AppContext';
import { FigureView, FigureLightbox } from './FigureView';
import { EntailmentBadge, EntailmentPending } from './EntailmentBadge';
import {
  citationPage,
  formatBookLine,
  formatLocation,
  locationNote,
  pdfHighlightFromCitation,
  type EntailmentIndex,
} from '../lib/citations';

interface SourceCardProps {
  source: Source;
  /**
   * Label shown in the number column. For a W3 answer the citation ids that
   * point at this source; for a pre-W3 answer the `[Source N]` number.
   */
  badges?: Array<number | string>;
  /** Citations that came from this source: their quotes are shown under the header. */
  citations?: Citation[];
  claims?: Claim[];
  entailment?: EntailmentIndex;
  entailmentPending?: boolean;
  /** Relevance bar. Meaningless for whole-paper sources (long-context). */
  showScore?: boolean;
}

const CHUNK_TYPE_COLORS: Record<ChunkType, string> = {
  abstract: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  section: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  fine: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  table: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  caption: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  full: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400',
  document: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
};

const CHUNK_TYPE_LABELS: Record<ChunkType, string> = {
  abstract: 'Abstract',
  section: 'Section',
  fine: 'Fine chunk',
  table: 'Table',
  caption: 'Caption',
  full: 'Full document',
  document: 'Read in full',
};

/**
 * Renders chunk text with its resolved figure references as buttons.
 *
 * Every entry in `figure_refs` resolved to a real object on the backend --
 * unresolved mentions are dropped there, not styled differently here. So the
 * two states are "link" and "ordinary text", and there is no third state where
 * a reference looks clickable and does nothing.
 */
function TextWithFigureRefs({
  text,
  refs,
  onOpen,
}: {
  text: string;
  refs: FigureRef[];
  onOpen: (ref: FigureRef) => void;
}) {
  if (!refs.length) return <>{text}</>;

  const ordered = [...refs]
    .filter((r) => r.start >= 0 && r.end > r.start && r.end <= text.length)
    .sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ordered.forEach((ref, i) => {
    if (ref.start < cursor) return;        // overlapping span: keep the first
    if (ref.start > cursor) parts.push(text.slice(cursor, ref.start));
    parts.push(
      <button
        key={`ref-${i}-${ref.figure_id}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(ref);
        }}
        title={
          ref.label
            ? `Show ${ref.label}${ref.page ? ` (p. ${ref.page})` : ''}`
            : 'Show this figure'
        }
        className="inline text-blue-600 dark:text-blue-400 underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {text.slice(ref.start, ref.end)}
      </button>
    );
    cursor = ref.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/**
 * One quote a source was cited for. It shows the location line, the verbatim
 * passage and (once the check has run) whether the passage supports the claim
 * it was cited for, with the reason printed beside the label.
 */
function CitedPassage({
  citation,
  claims,
  entailment,
  entailmentPending,
}: {
  citation: Citation;
  claims: Claim[];
  entailment?: EntailmentIndex;
  entailmentPending: boolean;
}) {
  const { setViewingPdf } = useApp();
  const location = formatLocation(citation);
  const note = locationNote(citation);
  const labels = entailment?.byCitation.get(citation.id) ?? [];
  const page = citationPage(citation);

  return (
    <li className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 p-3">
      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center justify-center min-w-[1.25rem] px-1.5 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold tabular-nums">
          {citation.id}
        </span>
        {location && <span>{location}</span>}
      </div>
      <blockquote className="mt-2 border-l-2 border-blue-400 dark:border-blue-500 pl-3 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
        {citation.cited_text}
      </blockquote>
      {note && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic">{note}</p>
      )}

      {labels.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {labels.map((label) => {
            const claim = claims[label.claim_index];
            return (
              <li key={`${label.claim_index}:${label.citation_id}`} className="text-xs">
                <EntailmentBadge label={label} showReason />
                {claim?.text && labels.length > 1 && (
                  <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                    For: &ldquo;{claim.text}&rdquo;
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        entailmentPending && (
          <div className="mt-2">
            <EntailmentPending text={'Checking this citation…'} />
          </div>
        )
      )}

      {citation.paper_id && (
        <button
          type="button"
          onClick={() =>
            setViewingPdf(citation.paper_id, page, pdfHighlightFromCitation(citation))
          }
          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          {page ? `Open at p. ${page}` : 'Open PDF'}
        </button>
      )}
    </li>
  );
}

export function SourceCard({
  source,
  badges,
  citations = [],
  claims = [],
  entailment,
  entailmentPending = false,
  showScore = true,
}: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openRef, setOpenRef] = useState<FigureRef | null>(null);
  const { setViewingPdf } = useApp();

  // The figure this source *is*: a caption or table chunk whose crop exists.
  const ownFigure =
    source.figure_id && source.has_figure_image ? source.figure_id : null;
  // Figures this source *mentions*, already resolved by the backend.
  const figureRefs = source.figure_refs ?? [];
  // Where "View in Paper" should land: the figure's page for a caption, the
  // span's own first page otherwise.
  const jumpPage = source.figure_page ?? source.page_start ?? null;

  // Handle sources without relevance_score (e.g., web search sources)
  const hasRelevanceScore =
    showScore && source.relevance_score !== undefined && source.relevance_score !== null;
  const scorePercent = hasRelevanceScore ? Math.round(source.relevance_score * 100) : 0;
  const chunkType = (source.chunk_type as ChunkType) || 'section';
  const bookLine = formatBookLine(source);
  const hasText = source.chunk_text.length > 0;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(source.chunk_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      {/* Header */}
      <div
        className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          {/* Citation ids (or "not cited") and score */}
          <div className="flex flex-col items-center shrink-0 min-w-[2rem]">
            {badges && badges.length > 0 ? (
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                <span className="sr-only">Cited as </span>
                {badges.map((b) => `[${b}]`).join(' ')}
              </span>
            ) : (
              <span className="text-sm text-gray-300 dark:text-gray-600" title="Retrieved, not cited">
                <span aria-hidden="true">&ndash;</span>
                <span className="sr-only">Not cited</span>
              </span>
            )}
            {hasRelevanceScore && (
              <>
                <div className="mt-1 w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {source.relevance_score.toFixed(2)}
                </span>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {source.paper_title}
              </span>
            </div>

            {bookLine && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                <BookOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{bookLine}</span>
              </div>
            )}

            {source.section_name && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                § {source.section_name}
                {source.subsection_name && (
                  <span className="text-gray-400 dark:text-gray-500">
                    {' › '}{source.subsection_name}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${CHUNK_TYPE_COLORS[chunkType] ?? CHUNK_TYPE_COLORS.section}`}
              >
                {CHUNK_TYPE_LABELS[chunkType] ?? chunkType}
              </span>
              {source.page_start != null && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  p.&nbsp;{source.page_start}
                  {source.page_end != null && source.page_end !== source.page_start
                    ? `-${source.page_end}`
                    : ''}
                </span>
              )}
              {source.figure_label && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">
                  <ImageIcon className="w-3 h-3" />
                  {source.figure_label}
                </span>
              )}
            </div>
          </div>

          {/* Expand toggle */}
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide the retrieved passage' : 'Show the retrieved passage'}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* The quotes this source was cited for: always visible, they are the point. */}
      {citations.length > 0 && (
        <ul className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2">
          {citations.map((citation) => (
            <CitedPassage
              key={citation.id}
              citation={citation}
              claims={claims}
              entailment={entailment}
              entailmentPending={entailmentPending}
            />
          ))}
        </ul>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
          {/* The figure itself, when this source is a caption or a table and a
              crop was persisted. Shown before the text, because for a figure
              source the image *is* the content and the caption is the index. */}
          {ownFigure && (
            <FigureView
              paperId={source.paper_id}
              figureId={ownFigure}
              label={source.figure_label}
              page={source.figure_page}
              className="mb-3"
            />
          )}

          {hasText ? (
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
              <p className="whitespace-pre-wrap">
                <TextWithFigureRefs
                  text={source.chunk_text}
                  refs={figureRefs}
                  onOpen={setOpenRef}
                />
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No retrieved text for this source: it was cited from the uploaded PDF.
            </p>
          )}

          <div className="flex items-center gap-2 mt-3">
            {hasText && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setViewingPdf(source.paper_id, jumpPage);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {jumpPage ? `View in Paper (p. ${jumpPage})` : 'View in Paper'}
            </button>
          </div>
        </div>
      )}

      {/* An in-text "Figure 3" the user clicked: the figure, not the page. */}
      {openRef && (
        <FigureLightbox
          paperId={source.paper_id}
          figureId={openRef.figure_id}
          label={openRef.label}
          page={openRef.page}
          onClose={() => setOpenRef(null)}
        />
      )}
    </div>
  );
}
