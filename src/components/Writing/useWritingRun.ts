import { useCallback, useEffect, useRef, useState } from 'react';
import { reduceRun, type RunEvent } from '../../context/AppContext';
import { streamWriting } from '../../services/writingApi';
import type { Citation, RunProgress } from '../../types';
import type { WritingRequestBody, WritingResponse, WritingStreamEvent, WritingTask } from '../../types/writing';

const DEEP_STANCES = ['develop', 'critique', 'draft'];

export interface WritingRunState {
  running: boolean;
  task: WritingTask | null;
  /** The deep stance's tool loop and the papers read whole, for the existing `RunDetails` display. */
  run: RunProgress | null;
  deepMode: boolean;
  thinking: string;
  /** The answer as it is written (model tasks), with the citations that arrived ahead of its markers. */
  streamText: string;
  streamCitations: Citation[];
  /** intro_citations: how many positions are matched. */
  positions: { done: number; total: number } | null;
  /** journals: the related-papers step. */
  related: string | null;
  result: WritingResponse | null;
  /** The result was opened from history, not run now. */
  fromHistory: boolean;
  error: string | null;
  stopped: boolean;
}

const IDLE: WritingRunState = {
  running: false,
  task: null,
  run: null,
  deepMode: false,
  thinking: '',
  streamText: '',
  streamCitations: [],
  positions: null,
  related: null,
  result: null,
  fromHistory: false,
  error: null,
  stopped: false,
};

/**
 * One writing run at a time: streams `/writing/<task>/stream`, keeps the
 * progress the page shows, and holds the finished result. The state lives in
 * the page, which App keeps mounted once opened, so leaving the page does not
 * lose a run that is still going.
 */
export function useWritingRun(onSaved?: () => void) {
  const [state, setState] = useState<WritingRunState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  // Signing out unmounts everything: stop streaming to nobody.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async (task: WritingTask, body: WritingRequestBody) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...IDLE, running: true, task, run: reduceRun(null, { kind: 'start' }) });

    // A superseded run (a newer one started, or a stored result was opened) must not touch the state.
    const patch = (fn: (s: WritingRunState) => Partial<WritingRunState>) => {
      if (abortRef.current !== controller) return;
      setState((s) => ({ ...s, ...fn(s) }));
    };
    const runEvent = (event: RunEvent) => patch((s) => ({ run: reduceRun(s.run, event) }));

    let answered = false;
    let entailmentExpected = false;
    let entailmentArrived = false;
    let thinking = '';

    const handle = (event: WritingStreamEvent) => {
      if (event.type === 'error') throw new Error(event.message);

      if (event.type === 'complete') {
        answered = true;
        entailmentExpected = Boolean(event.entailment_pending);
        const { type: _type, ...response } = event;
        void _type;
        patch(() => ({
          running: false,
          run: null,
          thinking: '',
          streamText: '',
          streamCitations: [],
          result: response as WritingResponse,
        }));
        if (event.message_id != null) onSavedRef.current?.();
        return;
      }

      if (event.type === 'entailment') {
        entailmentArrived = true;
        const { type: _type, message_id: _id, ...report } = event;
        void _type;
        void _id;
        patch((s) =>
          s.result
            ? { result: { ...s.result, entailment: { ...report, labels: report.labels ?? [], summary: report.summary ?? {}, error: report.error ?? null }, entailment_pending: false } }
            : {}
        );
        return;
      }

      const step = event.step;
      const data = event.data ?? {};

      switch (step) {
        case 'writing': {
          if (data.status === 'starting') {
            const stance = typeof data.stance === 'string' ? data.stance : '';
            patch(() => ({ deepMode: DEEP_STANCES.includes(stance) }));
          }
          return;
        }
        case 'answer_chunk':
          if (typeof data.chunk === 'string') {
            const chunk = data.chunk;
            patch((s) => ({ streamText: s.streamText + chunk }));
            if (thinking) {
              thinking = '';
              patch(() => ({ thinking: '' }));
            }
          }
          return;
        case 'thinking_chunk':
          if (typeof data.chunk === 'string') {
            thinking += data.chunk;
            const text = thinking;
            patch(() => ({ thinking: text }));
          }
          return;
        case 'citation':
          patch((s) => ({ streamCitations: [...s.streamCitations, data as unknown as Citation] }));
          return;
        case 'answer_reset':
          // Deep-run narration before a tool call: discard the text and citations so far.
          // (A refusal fallback sends no reset: the fallback model continues from the partial.)
          patch(() => ({ streamText: '', streamCitations: [] }));
          if (data.reason === 'tool_use') runEvent({ kind: 'narration_reset' });
          return;
        case 'memory':
          runEvent({ kind: 'history', trimmedTurns: Number(data.trimmed_turns ?? 0) });
          return;
        case 'long_context':
          runEvent({
            kind: 'long_context',
            used: Boolean(data.used),
            reason: typeof data.reason === 'string' ? data.reason : undefined,
            papers: Array.isArray(data.papers) ? data.papers.length : 0,
          });
          return;
        case 'tool_call':
          runEvent({
            kind: 'tool_call',
            call: {
              name: String(data.name ?? 'tool'),
              input: (data.input as Record<string, unknown>) ?? {},
              passages: Number(data.passages ?? 0),
            },
          });
          return;
        case 'sources_added':
          runEvent({ kind: 'passages', count: Array.isArray(data.sources) ? data.sources.length : 0 });
          return;
        case 'pause_turn':
          runEvent({ kind: 'pause', pauses: Number(data.pauses ?? 0) });
          return;
        case 'deep_final_turn':
          runEvent({ kind: 'final_turn' });
          return;
        case 'positions':
          patch(() => ({ positions: { done: 0, total: Number(data.to_cite ?? data.count ?? 0) } }));
          return;
        case 'position':
          patch((s) => ({ positions: { done: Number(data.done ?? 0), total: Number(data.total ?? s.positions?.total ?? 0) } }));
          return;
        case 'related':
          patch(() => ({
            related:
              data.status === 'complete'
                ? `Compared ${Number(data.considered ?? 0)} related entries`
                : `Finding the ${Number(data.pool ?? 0)} most related entries`,
          }));
          return;
        default:
          return; // retrieval, generation, verification, ... : the page shows no step grid
      }
    };

    try {
      await streamWriting(task, body, handle, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        patch(() => ({ running: false, run: null, thinking: '', stopped: !answered }));
      } else {
        const message = error instanceof Error ? error.message : 'The request failed.';
        patch((s) => ({ running: false, run: null, thinking: '', error: answered ? null : message, result: s.result }));
      }
    } finally {
      // The result is on screen but the check never reported (the connection dropped).
      if (answered && entailmentExpected && !entailmentArrived && !controller.signal.aborted) {
        patch((s) =>
          s.result
            ? {
                result: {
                  ...s.result,
                  entailment_pending: false,
                  entailment: {
                    status: 'error',
                    model: null,
                    labels: [],
                    summary: {},
                    error: 'The connection closed before the check finished.',
                    latency_ms: 0,
                  },
                },
              }
            : {}
        );
      }
      patch((s) => (s.running ? { running: false, run: null } : {}));
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Show a stored result (from history). */
  const show = useCallback((result: WritingResponse) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ ...IDLE, task: result.task, result, fromHistory: true });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE);
  }, []);

  return { state, start, stop, show, reset };
}
