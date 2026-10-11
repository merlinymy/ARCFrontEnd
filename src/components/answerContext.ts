import { createContext, useContext } from 'react';
import type { Citation, Claim, Source } from '../types';
import type { EntailmentIndex } from '../lib/citations';

/**
 * What a citation chip needs from the answer it sits in. Chips are created by
 * the markdown renderer, far from the message, so they read it from context
 * instead of being threaded through `components` (which would make the
 * renderer's component map change, and every chip remount, on each streamed
 * chunk).
 */
export interface AnswerContextValue {
  /** W3 answers: citations by id. */
  citations: Map<number, Citation>;
  claims: Claim[];
  entailment: EntailmentIndex;
  /** Entailment has been promised and has not arrived. */
  entailmentPending: boolean;
  /** Pre-W3 answers: `[Source N]` indexes this list (1-based). */
  legacySources: Source[];
}

export const AnswerContext = createContext<AnswerContextValue>({
  citations: new Map(),
  claims: [],
  entailment: { byPair: new Map(), byCitation: new Map() },
  entailmentPending: false,
  legacySources: [],
});

export function useAnswerContext(): AnswerContextValue {
  return useContext(AnswerContext);
}
