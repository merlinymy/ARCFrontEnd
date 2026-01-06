import { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Filter,
  Tag,
  AlertTriangle,
  Globe,
  ExternalLink,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SourceCard } from './SourceCard';
import { Tooltip } from './Tooltip';
import { useApp } from '../context/AppContext';
import type { Message, CitationCheck } from '../types';

interface ResponseCardProps {
  queryMessage: Message;
  responseMessage: Message;
}

// Citation check status
type CitationStatus = 'checking' | 'verified' | 'partial' | 'weak' | 'not_verified';

// Get citation status from check data
function getCitationStatus(check: CitationCheck | undefined, isChecking: boolean): CitationStatus {
  if (isChecking && !check) {
    return 'checking';
  }
  if (!check) {
    return 'not_verified';
  }
  if (check.confidence >= 0.7) {
    return 'verified';
  } else if (check.confidence >= 0.3) {
    return 'partial';
  } else {
    return 'weak';
  }
}

// Get citation status color classes
function getCitationStyle(check: CitationCheck | undefined, isChecking: boolean = false): {
  bg: string;
  text: string;
  border: string;
  label: string;
  animate: boolean;
} {
  const status = getCitationStatus(check, isChecking);

  switch (status) {
    case 'checking':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-300 dark:border-blue-700',
        label: 'Checking...',
        animate: true,
      };
    case 'verified':
      return {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-400',
        border: 'border-green-300 dark:border-green-700',
        label: 'Verified',
        animate: false,
      };
    case 'partial':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-300 dark:border-amber-700',
        label: 'Partially supported',
        animate: false,
      };
    case 'weak':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-300 dark:border-red-700',
        label: 'Weak support',
        animate: false,
      };
    default:
      return {
        bg: 'bg-gray-100 dark:bg-gray-700',
        text: 'text-gray-700 dark:text-gray-300',
        border: 'border-gray-300 dark:border-gray-600',
        label: 'Not verified',
        animate: false,
      };
  }
}

// Component to render a single citation with verification status
function CitationBadge({
  citationId,
  check,
  isChecking = false,
}: {
  citationId: number;
  check: CitationCheck | undefined;
  isChecking?: boolean;
}) {
  const style = getCitationStyle(check, isChecking);
  const confidence = check ? Math.round(check.confidence * 100) : null;

  const tooltipContent = check ? (
    <span className="block max-w-xs">
      <span className="block font-medium mb-1">
        {style.label} ({confidence}% confidence)
      </span>
      <span className="block text-xs opacity-80">{check.explanation}</span>
    </span>
  ) : isChecking ? (
    <span className="block">Verifying citation...</span>
  ) : (
    <span className="block max-w-xs">
      <span className="block font-medium mb-1">Source {citationId}</span>
      <span className="block text-xs opacity-80">
        This citation references Source {citationId} from the retrieved documents.
        {' '}Enable citation verification in settings to check accuracy.
      </span>
    </span>
  );

  return (
    <Tooltip content={tooltipContent}>
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border cursor-help ${style.bg} ${style.text} ${style.border} ${style.animate ? 'animate-pulse' : ''}`}
      >
        Source {citationId}
        {confidence !== null && (
          <span className="ml-1 opacity-70">{confidence}%</span>
        )}
        {style.animate && (
          <span className="ml-1">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </span>
        )}
      </span>
    </Tooltip>
  );
}

// Build citation check map from array
function buildCitationCheckMap(
  citationChecks: CitationCheck[] | undefined
): Map<number, CitationCheck> {
  const checkMap = new Map<number, CitationCheck>();
  if (citationChecks) {
    for (const check of citationChecks) {
      // Group checks by citation_id, keep the one with lowest confidence (most concerning)
      const existing = checkMap.get(check.citation_id);
      if (!existing || check.confidence < existing.confidence) {
        checkMap.set(check.citation_id, check);
      }
    }
  }
  return checkMap;
}

// Process text content to replace citation patterns with styled badges
function processTextWithCitations(
  text: string,
  checkMap: Map<number, CitationCheck>,
  isCheckingCitations: boolean = false
): React.ReactNode[] {
  // Pattern to match various citation formats:
  // - [Source 8, Source 9, Source 10] - multiple sources with "Source" prefix
  // - [Source 8] - single source with "Source" prefix
  // - [8, 9, 10] - multiple numbers
  // - [8] - single number
  const citationPattern = /\[((?:Source\s*)?\d+(?:\s*,\s*(?:Source\s*)?\d+)*)\]/gi;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = citationPattern.exec(text)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Parse citation IDs - extract all numbers from the match
    // This handles "Source 8, Source 9" and "8, 9" formats
    const numberPattern = /\d+/g;
    const ids: number[] = [];
    let numMatch;
    while ((numMatch = numberPattern.exec(match[1])) !== null) {
      ids.push(parseInt(numMatch[0], 10));
    }

    // Add citation badges
    ids.forEach((id, idx) => {
      if (idx > 0) parts.push(', ');
      const check = checkMap.get(id);
      // If checking is in progress and we don't have a check for this citation yet, show checking state
      const showChecking = isCheckingCitations && !check;
      parts.push(
        <CitationBadge
          key={`cite-${keyCounter++}-${id}`}
          citationId={id}
          check={check}
          isChecking={showChecking}
        />
      );
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Process React children recursively to highlight citations
function processChildrenWithCitations(
  children: React.ReactNode,
  checkMap: Map<number, CitationCheck>,
  isCheckingCitations: boolean = false
): React.ReactNode {
  if (typeof children === 'string') {
    return processTextWithCitations(children, checkMap, isCheckingCitations);
  }

  if (Array.isArray(children)) {
    return children.map((child, idx) => {
      if (typeof child === 'string') {
        return <span key={idx}>{processTextWithCitations(child, checkMap, isCheckingCitations)}</span>;
      }
      return child;
    });
  }

  return children;
}

// Create custom markdown components that highlight citations
function createCitationComponents(checkMap: Map<number, CitationCheck>, isCheckingCitations: boolean = false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processChildren = (props: any) => processChildrenWithCitations(props.children, checkMap, isCheckingCitations);

  return {
    // Process text in paragraphs
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...props}>{processChildrenWithCitations(props.children, checkMap, isCheckingCitations)}</p>
    ),
    // Process text in list items
    li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
      <li {...props}>{processChildrenWithCitations(props.children, checkMap, isCheckingCitations)}</li>
    ),
    // Process text in strong/bold
    strong: (props: React.HTMLAttributes<HTMLElement>) => (
      <strong {...props}>{processChildren(props)}</strong>
    ),
    // Process text in em/italic
    em: (props: React.HTMLAttributes<HTMLElement>) => (
      <em {...props}>{processChildren(props)}</em>
    ),
  };
}

export function ResponseCard({ queryMessage, responseMessage }: ResponseCardProps) {
  const [showAllSources, setShowAllSources] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const { state } = useApp();

  const { metadata } = responseMessage;

  // Check if this is a web search message - do this first!
  const isWebSearch = responseMessage.type === 'web_search' || metadata?.isWebSearch;

  // Render web search message differently (early return)
  if (isWebSearch) {
    const webSearchSources = metadata?.webSearchSources || [];
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
              {responseMessage.content}
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

  // Regular RAG response - compute all the necessary data
  const citationChecks = metadata?.citationChecks;

  // Determine if citation checking is in progress for this message
  // Only show checking animation if citation verification is enabled
  const isCheckingCitations = useMemo(() => {
    if (!state.streamingState) return false;
    if (state.streamingState.messageId !== responseMessage.id) return false;
    // Only show checking animation if citation checking was enabled for this query
    if (!state.queryOptions.enableCitationCheck) return false;
    return state.streamingState.isStreaming && responseMessage.content.length > 0;
  }, [state.streamingState, responseMessage.id, responseMessage.content.length, state.queryOptions.enableCitationCheck]);

  // Sort sources by relevance score (highest first)
  const sources = [...(metadata?.sources ?? [])].sort(
    (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)
  );
  const visibleSources = showAllSources ? sources : sources.slice(0, 3);
  const hiddenCount = sources.length - 3;

  // Build citation check map for quick lookup
  const citationCheckMap = useMemo(() => {
    return buildCitationCheckMap(citationChecks);
  }, [citationChecks]);

  // Check if there are any failed citations (< 30% confidence)
  const failedCitations = useMemo(() => {
    if (!citationChecks) return [];
    return citationChecks.filter((c) => c.confidence < 0.3);
  }, [citationChecks]);

  // Create custom markdown components that highlight citations
  const citationComponents = useMemo(() => {
    return createCitationComponents(citationCheckMap, isCheckingCitations);
  }, [citationCheckMap, isCheckingCitations]);

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
      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {/* Failed Citations Warning Banner */}
        {failedCitations.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-red-700 dark:text-red-400">
                  {failedCitations.length} citation{failedCitations.length > 1 ? 's' : ''} may not be fully supported by sources
                </span>
                <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                  Hover over highlighted citations to see verification details
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="markdown-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={citationComponents}
          >
            {responseMessage.content}
          </ReactMarkdown>
        </div>

        {/* Pipeline Warnings */}
        {metadata?.warnings && metadata.warnings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              {metadata.warnings.map((warning, index) => (
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
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Sources ({sources.length} retrieved)
            </h4>
          </div>

          <div className="space-y-2">
            {visibleSources.map((source, index) => (
              <SourceCard key={index} source={source} index={index} />
            ))}
          </div>

          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllSources(!showAllSources)}
              className="mt-3 w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              {showAllSources
                ? 'Show less'
                : `Show ${hiddenCount} more source${hiddenCount > 1 ? 's' : ''}...`}
            </button>
          )}
        </div>
      )}

      {/* Pipeline Details */}
      <div className="mt-4">
        <button
          onClick={() => setShowPipeline(!showPipeline)}
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

              {sources.length > 0 && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Cited: {sources.length}</span>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
