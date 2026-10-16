import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Sparkles, Loader2, Globe, BookOpen, Upload, Settings, Wrench } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ResponseCard } from './ResponseCard';
import { describeToolCall } from '../lib/deep';
import type { PipelineStepInfo, RunProgress } from '../types';

// Seconds since `startedAt`, ticking once a second. A deep run can take
// minutes; a running clock is what tells the reader it is working, not stuck.
function useElapsedSeconds(startedAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

const RECENT_CALLS_SHOWN = 4;

// What a long run is doing: papers read whole, or a deep stance's tool loop.
export function RunDetails({ run, deepMode }: { run: RunProgress | null; deepMode: boolean }) {
  const elapsed = useElapsedSeconds(run?.startedAt);
  if (!run) return null;

  const deep = run.deep;
  const calls = deep?.toolCalls ?? [];
  const recent = calls.slice(-RECENT_CALLS_SHOWN);
  const hidden = calls.length - recent.length;

  return (
    <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-700 space-y-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {deepMode || deep ? (
            <span className="inline-flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-blue-500" aria-hidden="true" />
              {deep?.finalTurn
                ? 'Writing the final answer'
                : calls.length > 0
                ? 'Working through the library'
                : 'Starting a multi-step run'}
            </span>
          ) : run.longContext?.used ? (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-teal-500" aria-hidden="true" />
              Reading {run.longContext.papers === 1 ? 'the full paper' : `${run.longContext.papers} papers in full`}
            </span>
          ) : null}
        </span>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{formatElapsed(elapsed)}</span>
      </div>

      {(deepMode || deep) && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This stance searches the library over several steps before it answers, so it takes
          longer than a plain question: often a minute or more.
          {calls.length > 0 && (
            <>
              {' '}
              {calls.length} lookup{calls.length === 1 ? '' : 's'} so far
              {deep && deep.passagesFound > 0 ? `, ${deep.passagesFound} passages found` : ''}
              {deep && deep.pauses > 0 ? `, paused ${deep.pauses}\u00d7` : ''}.
            </>
          )}
        </p>
      )}

      {recent.length > 0 && (
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
          {hidden > 0 && <li className="text-gray-400 dark:text-gray-500">{"\u2026"} {hidden} earlier</li>}
          {recent.map((call, i) => (
            <li key={hidden + i} className="truncate">
              {describeToolCall(call.name, call.input)}
              {call.passages > 0 && ` \u2014 ${call.passages} passage${call.passages === 1 ? '' : 's'}`}
            </li>
          ))}
        </ul>
      )}

      {run.longContext && !run.longContext.used && run.longContext.reason && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Searching the selected papers instead of reading them whole: {run.longContext.reason}
        </p>
      )}
    </div>
  );
}

// Pipeline progress display component
function PipelineProgress({
  steps,
  webSearchProgress,
  thinkingProgress,
  runProgress,
  deepMode,
}: {
  steps: PipelineStepInfo[];
  webSearchProgress?: string | null;
  thinkingProgress?: string | null;
  runProgress?: RunProgress | null;
  deepMode: boolean;
}) {
  const activeStep = steps.find((s) => s.status === 'active');

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-fade-in">
      {/* Web search progress indicator */}
      {webSearchProgress && (
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 -mx-4 -mt-4 px-4 pt-4 rounded-t-xl">
          <Globe className="w-5 h-5 text-blue-500 animate-pulse" />
          <div className="flex-1">
            <div className="font-medium text-blue-700 dark:text-blue-300">
              Searching the web...
            </div>
            <div className="text-sm text-blue-600 dark:text-blue-400 truncate">
              {webSearchProgress}
            </div>
          </div>
        </div>
      )}

      {/* Long-context and deep runs: what is happening, and for how long */}
      <RunDetails run={runProgress ?? null} deepMode={deepMode} />

      {/* What the model is thinking, not which stage of the pipeline it is
          in. The five-step grid that used to be here described a fixed
          retrieve-then-answer pipeline that no longer matches what runs: the
          model chooses its own searches now, so the steps were both wrong and
          uninteresting. The reasoning is the part worth watching. */}
      {!webSearchProgress && (activeStep || thinkingProgress) && (
        <div className="flex items-start gap-3">
          <Loader2 className="w-5 h-5 mt-0.5 shrink-0 text-blue-500 animate-spin" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {thinkingProgress ? 'Thinking' : activeStep?.label}
            </div>
            {thinkingProgress ? (
              // Scrolls within a fixed height: reasoning can run long, and a
              // block that grows without bound pushes the answer off screen.
              <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-gray-500 dark:text-gray-400 italic">
                {thinkingProgress}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {activeStep?.description}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

interface ConversationThreadProps {
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
}

export function ConversationThread({ onScroll }: ConversationThreadProps) {
  const { state, setActivePage, openUploadPanel } = useApp();
  const { conversations, activeConversationId, isLoading, pipelineProgress, streamingState, webSearchProgress, thinkingProgress, runProgress } = state;
  const deepMode = state.queryOptions.mode === 'develop' || state.queryOptions.mode === 'critique' || state.queryOptions.mode === 'draft';
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAnchorVisible, setIsAnchorVisible] = useState(true);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  // Use Intersection Observer to track if anchor is visible
  useEffect(() => {
    const anchor = anchorRef.current;
    const container = scrollRef.current;
    if (!anchor || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Anchor is visible = user is at/near bottom
        setIsAnchorVisible(entries[0].isIntersecting);
      },
      {
        root: container,
        threshold: 0,
        rootMargin: '0px 0px 150px 0px', // 150px buffer at bottom
      }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  // Track manual scroll to detect user intent
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let lastScrollTop = container.scrollTop;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const scrollingUp = currentScrollTop < lastScrollTop;

      // User scrolled up = they want to stay where they are
      if (scrollingUp) {
        setIsAtBottom(false);
      }
      // User scrolled down to where anchor is visible = re-enable auto-scroll
      else if (isAnchorVisible) {
        setIsAtBottom(true);
      }

      lastScrollTop = currentScrollTop;

      // Report scroll position to parent
      onScroll?.(container.scrollTop, container.scrollHeight, container.clientHeight);
    };

    // Initial call to set scroll state
    onScroll?.(container.scrollTop, container.scrollHeight, container.clientHeight);

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isAnchorVisible, onScroll]);

  // Reset state when conversation changes
  useEffect(() => {
    setIsAtBottom(true);
    setIsAnchorVisible(true);
  }, [activeConversationId]);

  // Auto-scroll only when: streaming, user is at bottom, but anchor scrolled out of view
  useEffect(() => {
    if (streamingState?.isStreaming && isAtBottom && !isAnchorVisible && anchorRef.current) {
      anchorRef.current.scrollIntoView({ behavior: 'instant', block: 'end' });
    }
  }, [streamingState?.content, isAtBottom, isAnchorVisible]);

  // Empty state
  if (!activeConversation || activeConversation.messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-lg">
          <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            A'Lester's Research Chatbot
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Ask questions about your indexed research papers. Get accurate
            answers with source citations and full RAG pipeline transparency.
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setActivePage('library')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm"
            >
              <BookOpen className="w-4.5 h-4.5" />
              <span className="font-medium text-sm">Library</span>
            </button>
            <button
              onClick={openUploadPanel}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm"
            >
              <Upload className="w-4.5 h-4.5" />
              <span className="font-medium text-sm">Upload</span>
            </button>
            <button
              onClick={() => setActivePage('prompts')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm"
            >
              <Settings className="w-4.5 h-4.5" />
              <span className="font-medium text-sm">Prompts</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Group messages into query and all associated responses (RAG + web search)
  const messageGroups: {
    query: typeof activeConversation.messages[0];
    responses: typeof activeConversation.messages
  }[] = [];

  let i = 0;
  while (i < activeConversation.messages.length) {
    const message = activeConversation.messages[i];

    if (message.type === 'query') {
      // Found a query, collect all following responses
      const responses: typeof activeConversation.messages = [];
      let j = i + 1;

      // Collect all responses (both 'response' and 'web_search' types) until next query or end
      while (j < activeConversation.messages.length && activeConversation.messages[j].type !== 'query') {
        responses.push(activeConversation.messages[j]);
        j++;
      }

      messageGroups.push({ query: message, responses });
      i = j; // Move to next query
    } else {
      i++; // Skip orphaned response messages (shouldn't happen)
    }
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-4 md:p-6">
      {/* Disable scroll anchoring on content so browser doesn't auto-jump */}
      <div className="max-w-4xl mx-auto space-y-8" style={{ overflowAnchor: 'none' }}>
        {messageGroups.map(({ query, responses }) => (
          <div key={query.id} className="space-y-4">
            {responses.length > 0 ? (
              // Render all responses for this query
              responses.map((response) => (
                <ResponseCard key={response.id} queryMessage={query} responseMessage={response} />
              ))
            ) : (
              /* Loading state for pending response with pipeline progress */
              <div className="animate-fade-in">
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                      <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {query.content}
                    </p>
                  </div>
                </div>

                {/* Pipeline progress or simple loading */}
                {pipelineProgress ? (
                  <PipelineProgress steps={pipelineProgress} webSearchProgress={webSearchProgress} thinkingProgress={thinkingProgress} runProgress={runProgress} deepMode={deepMode} />
                ) : (
                  <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Processing your query...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Show loading state when isLoading but no pending message */}
        {isLoading && messageGroups.length > 0 && messageGroups[messageGroups.length - 1].responses.length > 0 && (
          pipelineProgress ? (
            <PipelineProgress steps={pipelineProgress} webSearchProgress={webSearchProgress} thinkingProgress={thinkingProgress} runProgress={runProgress} deepMode={deepMode} />
          ) : (
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-600 dark:text-gray-400">
                  Processing your query...
                </span>
              </div>
            </div>
          )
        )}
      </div>
      {/* Scroll anchor - used by Intersection Observer to detect if user is at bottom */}
      <div ref={anchorRef} style={{ height: '1px', overflowAnchor: 'auto' }} />
    </div>
  );
}
