import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import {
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Square,
  PenLine,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useRouteHint } from '../lib/useRouteHint';
import { InfoTooltip } from './Tooltip';
import { ModelPicker } from './ModelPicker';
import {
  ANSWER_MODES,
  ANSWER_MODE_LABELS,
  ANSWER_MODE_DESCRIPTIONS,
} from '../types';
import type { AnswerMode, EffortLevel } from '../types';

const EFFORT_OPTIONS: { value: EffortLevel; label: string }[] = [
  { value: 'low', label: 'Low (fastest)' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High (recommended)' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max (slowest)' },
];

export function QueryInput() {
  const { state, dispatch, submitQuery, stopQuery } = useApp();
  const { currentQuery, queryOptions, isLoading } = state;
  const isDeepMode =
    queryOptions.mode === 'develop' || queryOptions.mode === 'critique' || queryOptions.mode === 'draft';
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Asks the server what it would do with what is in the box, debounced.
  const routeHint = useRouteHint(currentQuery, queryOptions.mode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea with a max of 104px (about 4 lines)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '32px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 104)}px`;
    }
  }, [currentQuery]);

  const handleSubmit = () => {
    if (currentQuery.trim() && !isLoading) {
      // Auto-collapse advanced options on submit
      setShowAdvanced(false);
      submitQuery(currentQuery);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-4 max-h-[60vh] overflow-y-auto shrink-0">
      <div className="max-w-4xl mx-auto">
        {/* Caught before it is sent, not corrected after. A pinned stance
            always wins at the router, so this message would be answered as a
            question — costing the user a turn of the wrong shape and another
            ask. Switching here costs nothing, and the router's own reason is
            quoted so the hint explains itself instead of asserting. */}
        {routeHint?.stance && !isLoading && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/60
                          bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
            <PenLine className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="flex-1 min-w-0 text-xs text-amber-900 dark:text-amber-200">
              This reads as a request to write, but the {ANSWER_MODE_LABELS[queryOptions.mode]}{' '}
              stance will answer it as a question. {routeHint.reason}
            </p>
            <button
              onClick={() =>
                dispatch({ type: 'SET_QUERY_OPTIONS', payload: { mode: routeHint.stance! } })
              }
              className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white
                         hover:bg-amber-700 transition-colors"
            >
              Switch to {ANSWER_MODE_LABELS[routeHint.stance]}
            </button>
          </div>
        )}

        {/* Main input area */}
        <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
          <textarea
            ref={textareaRef}
            value={currentQuery}
            onChange={(e) =>
              dispatch({ type: 'SET_CURRENT_QUERY', payload: e.target.value })
            }
            onKeyDown={handleKeyDown}
            placeholder="Ask about your research papers..."
            className="flex-1 py-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none min-h-8 max-h-26 scrollbar-none"
            rows={1}
            disabled={isLoading}
          />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-2 hidden sm:inline">
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
            </span>
            {isLoading && (
              <button
                type="button"
                onClick={stopQuery}
                aria-label="Stop"
                title="Stop. What has been written so far stays."
                className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Square className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!currentQuery.trim() || isLoading}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Always visible, outside Advanced Options: the two things that decide
            what comes back. The stance changes the shape of the answer and the
            model changes who writes it — neither is an advanced tweak. The
            stance especially: the composer hint asks you to reconsider it, and
            that is useless when the control is behind a toggle. */}
        <div className="mt-2">
          {/* One row: stance on the left, model pushed to the right by
              `ml-auto`. `items-start` so the modes stay put when the model's
              panel opens underneath it instead of re-centring the row. */}
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {ANSWER_MODES.map((value: AnswerMode) => (
                <button
                  key={value}
                  title={ANSWER_MODE_DESCRIPTIONS[value]}
                  onClick={() =>
                    dispatch({ type: 'SET_QUERY_OPTIONS', payload: { mode: value } })
                  }
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    queryOptions.mode === value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {ANSWER_MODE_LABELS[value]}
                </button>
              ))}
              {/* No "Mode" heading: the labels say what they are, and a
                  persistent row should cost as little height as it can. */}
              <InfoTooltip content="What kind of reply you want. Ask answers the question. Brainstorm generates possibilities. Develop builds out an idea you state. Refine tightens one. Critique argues against it. Draft turns it into writing. This changes how the answer is written, not which papers are searched." />
            </div>

            <div className="ml-auto">
              <ModelPicker />
            </div>
          </div>

          {/* Below the row, not in it: these change with the stance, and the
              latency warning is what stops someone picking Develop and waiting
              a minute without knowing why. */}
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {ANSWER_MODE_DESCRIPTIONS[queryOptions.mode]}
          </p>
          {isDeepMode && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This mode searches your library itself, over several steps, and can use a project
              notebook. It takes longer than Ask: often a minute or more.
            </p>
          )}
        </div>

        {/* Below the controls it expands, not above them: a toggle that sits
            over the thing it reveals pushes that thing down the page every
            time it is opened. */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {showAdvanced ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          Advanced Options
        </button>

        {/* Advanced options panel */}
        {showAdvanced && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-fade-in">
            {/* Answer depth and web search */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div className="w-full sm:w-64">
                <label
                  htmlFor="answer-depth"
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Answer Depth
                  <InfoTooltip content="How much care the model spends on the answer. Low is fastest and cheapest, good for simple lookups. High is the recommended balance. Extra high and Max reason longer and read the sources more carefully, at higher latency and cost. This is a depth setting, not a creativity setting." />
                </label>
                <select
                  id="answer-depth"
                  value={queryOptions.effort}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_QUERY_OPTIONS',
                      payload: { effort: e.target.value as EffortLevel },
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EFFORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={queryOptions.enableWebSearch}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_QUERY_OPTIONS',
                        payload: { enableWebSearch: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                  />
                  <Search className="w-4 h-4 text-blue-500" aria-hidden="true" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Web Search</span>
                </label>
                <InfoTooltip content="Allow Claude to search the web for additional context. Web results will appear in the General Knowledge section." />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
