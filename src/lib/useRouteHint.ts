import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { AnswerMode, RoutePreview } from '../types';

/** Long enough that the box has settled, short enough to beat the send. */
const DEBOUNCE_MS = 400;

/**
 * Below this the message cannot yet be a clear request, and asking on every
 * early keystroke is noise — "dr" is not a drafting request.
 */
const MIN_CHARS = 12;

/** A preview, and the exact text it describes. */
interface Answered {
  forText: string;
  forMode: AnswerMode;
  preview: RoutePreview;
}

/**
 * Whether what is in the composer would be answered rather than written.
 *
 * Returns null unless there is something worth saying, so the caller renders
 * the hint or nothing without branching on anything else.
 *
 * The result carries the text it was computed for and is compared against the
 * current text on render, rather than being cleared by the effect. That keeps
 * a stale hint from lingering over edited text *and* avoids setting state in
 * the effect body, which would cost a second render on every keystroke.
 *
 * Deliberately silent on failure: this is an optional nicety in front of a
 * send that works regardless, and a composer showing an error because a
 * preview call failed would be worse than one that says nothing.
 */
export function useRouteHint(question: string, mode: AnswerMode): RoutePreview | null {
  const [answered, setAnswered] = useState<Answered | null>(null);
  const text = question.trim();

  useEffect(() => {
    if (text.length < MIN_CHARS) return;

    // Abort rather than let a slow early call land after a later one and
    // flip the hint back to a stale answer.
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .previewRoute(text, mode, controller.signal)
        .then(preview => setAnswered({ forText: text, forMode: mode, preview }))
        .catch(() => {
          /* aborted, offline, or the server said no: say nothing */
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, mode]);

  if (!answered || answered.forText !== text || answered.forMode !== mode) return null;
  return answered.preview.suggest_write ? answered.preview : null;
}
