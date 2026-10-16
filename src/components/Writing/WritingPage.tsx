import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, PenLine } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AnswerBody } from '../AnswerBody';
import { RunDetails } from '../ConversationThread';
import { Banner, Card } from '../Bibliography/ui';
import { errorMessage } from '../Bibliography/util';
import { getConversation } from '../../services/api';
import { getWritingTasks } from '../../services/writingApi';
import { responseFromStored, writingTaskOfTitle } from '../../lib/writing';
import { WRITING_TASKS, WRITING_TASK_LABEL, type WritingTask } from '../../types/writing';
import { DEFAULT_FORM, buildRequest, type WritingFormState } from './form';
import { WritingForm } from './WritingForm';
import { WritingResult } from './WritingResult';
import { useWritingRun } from './useWritingRun';

const FALLBACK_MAX_CHARS = 20000;
const RECENT_SHOWN = 8;

/** Progress of a run in flight: the existing deep-run display, plus what the two retrieval tasks report. */
function Progress({ run, task }: { run: ReturnType<typeof useWritingRun>['state']; task: WritingTask }) {
  const generate = task === 'outline' || task === 'questions' || task === 'aims';
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700" aria-busy="true">
      <RunDetails run={run.run} deepMode={run.deepMode} />
      <div className="flex items-start gap-3" role="status" aria-live="polite">
        <Loader2 className="w-5 h-5 mt-0.5 shrink-0 text-blue-500 animate-spin" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {generate
              ? run.streamText
                ? 'Writing'
                : run.deepMode
                ? 'Reading the library'
                : 'Retrieving and writing'
              : task === 'intro_citations'
              ? run.positions && run.positions.total > 0
                ? `Matched ${run.positions.done} of ${run.positions.total} positions`
                : 'Splitting the text into positions'
              : run.related ?? 'Starting'}
          </p>
          {run.thinking && (
            <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm text-gray-500 dark:text-gray-400 italic">{run.thinking}</p>
          )}
        </div>
      </div>
      {run.streamText && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">The draft as it is written (structure follows when it is done)</p>
          <div className="max-h-72 overflow-y-auto">
            <AnswerBody content={run.streamText} citations={run.streamCitations} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The writing helpers: a section outline, the questions a paper must answer, a
 * Specific Aims skeleton, introduction citations and target-journal suggestions.
 * Model-backed ones stream through `/writing/<task>/stream`; every result is
 * stored as a conversation, so it is also in the sidebar and in its project.
 */
export function WritingPage() {
  const { state, refreshConversations, refreshProjects, showToast } = useApp();
  const [task, setTask] = useState<WritingTask>('outline');
  const [form, setForm] = useState<WritingFormState>(DEFAULT_FORM);
  const [maxChars, setMaxChars] = useState(FALLBACK_MAX_CHARS);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const onSaved = useCallback(() => {
    void refreshConversations();
    void refreshProjects();
  }, [refreshConversations, refreshProjects]);
  const { state: run, start, stop, show } = useWritingRun(onSaved);

  useEffect(() => {
    let alive = true;
    getWritingTasks()
      .then((info) => {
        if (alive && info.limits?.max_input_chars) setMaxChars(info.limits.max_input_chars);
      })
      .catch(() => undefined); // the documented default stands
    return () => {
      alive = false;
    };
  }, []);

  const patch = useCallback((p: Partial<WritingFormState>) => setForm((f) => ({ ...f, ...p })), []);
  const spec = WRITING_TASKS.find((t) => t.task === task)!;

  const onRun = () => {
    void start(task, buildRequest(task, form, state.activeProjectId));
  };

  // Writing conversations are titled "<task label>: ..."; within a project, only that project's.
  const recent = useMemo(() => {
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    return state.conversations
      .filter((c) => writingTaskOfTitle(c.title) !== null)
      .filter((c) => !project || project.conversation_ids.includes(c.id))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [state.conversations, state.projects, state.activeProjectId]);
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const open = async (id: string) => {
    setOpeningId(id);
    try {
      const conv = await getConversation(id);
      const stored = [...(conv.messages ?? [])].reverse().map((m) => responseFromStored(m, id)).find(Boolean);
      if (!stored) {
        showToast({ type: 'warning', message: 'That conversation holds no writing result. Open it in the chat instead.' });
        return;
      }
      setTask(stored.task);
      show(stored);
    } catch (e) {
      showToast({ type: 'error', message: errorMessage(e) });
    } finally {
      setOpeningId(null);
    }
  };

  const shown = showAllRecent ? recent : recent.slice(0, RECENT_SHOWN);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <PenLine className="w-8 h-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Writing</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Outlines, reviewer questions, aims, introduction citations and journals, grounded in your library</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <fieldset>
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">What do you want?</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {WRITING_TASKS.map((t) => (
                <label
                  key={t.task}
                  className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                    task === t.task ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                  }`}
                >
                  <input type="radio" name="writing-task" checked={task === t.task} onChange={() => setTask(t.task)} className="mt-1 text-blue-600 focus:outline-none" />
                  <span className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{t.label}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{t.summary}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Card className="p-4">
            <WritingForm task={task} form={form} patch={patch} maxChars={maxChars} running={run.running} onRun={onRun} onStop={stop} />
          </Card>

          {run.running && run.task && <Progress run={run} task={run.task} />}
          {run.error && (
            <Banner tone="error" title={`${spec.label} failed`}>
              {run.error}
            </Banner>
          )}
          {run.stopped && <Banner tone="info">Stopped. Nothing was kept from this run.</Banner>}

          {run.result && <WritingResult key={`${run.result.message_id ?? 'live'}-${run.result.task}-${run.result.answer.length}`} r={run.result} fromHistory={run.fromHistory} />}

          <section aria-labelledby="recent-writing" className="space-y-2">
            <h2 id="recent-writing" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Recent writing{activeProject ? ` in ${activeProject.name}` : ''}
            </h2>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {activeProject ? 'None in this project yet.' : 'Nothing yet. Results are saved to history, and appear here and in the sidebar.'}
              </p>
            ) : (
              <ul className="list-none p-0 space-y-1">
                {shown.map((c) => {
                  const t = writingTaskOfTitle(c.title);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => void open(c.id)}
                        disabled={openingId !== null}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        {openingId === c.id ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" /> : <MessageSquare className="w-4 h-4 shrink-0 opacity-60" aria-hidden="true" />}
                        <span className="truncate flex-1">{c.title}</span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{t ? WRITING_TASK_LABEL[t] : ''} · {c.updatedAt.toLocaleDateString()}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {recent.length > RECENT_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAllRecent((v) => !v)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {showAllRecent ? 'Show fewer' : `Show all ${recent.length}`}
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
