import { createContext, useContext } from 'react';
import type { Citation, Claim, EntailmentReport } from '../types';

/**
 * One drafted piece, with everything needed to render it away from its message.
 *
 * The citations travel with it. A draft is held to the evidence as tightly as
 * an answer, so lifting it out of the bubble must not cost it its provenance —
 * that works because citations are inline markers resolved by id, not offsets
 * into the whole answer.
 */
export interface OpenArtifact {
  /** The message the draft came from; also the identity used for replacement. */
  messageId: string;
  title: string;
  content: string;
  /** False while the closing tag has not arrived: still being written. */
  closed: boolean;
  citations: Citation[] | undefined;
  claims?: Claim[];
  entailment?: EntailmentReport | null;
  entailmentPending?: boolean;
}

export interface ArtifactContextValue {
  /** What the dock is showing, or null when it is closed. */
  open: OpenArtifact | null;
  /**
   * A message reports the draft it holds, or null once it has none.
   *
   * Called from an effect on every streamed chunk, so it must be cheap and
   * stable: the provider ignores a report that changes nothing.
   */
  publish: (artifact: OpenArtifact | null) => void;
  /** Show a draft the user clicked, which may be an older turn's. */
  show: (messageId: string) => void;
  close: () => void;
  /** Drafts this conversation has produced, oldest first. */
  history: OpenArtifact[];
}

const noop = () => {};

export const ArtifactContext = createContext<ArtifactContextValue>({
  open: null,
  publish: noop,
  show: noop,
  close: noop,
  history: [],
});

export function useArtifacts(): ArtifactContextValue {
  return useContext(ArtifactContext);
}
