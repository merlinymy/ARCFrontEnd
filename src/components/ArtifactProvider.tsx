import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ArtifactContext, type ArtifactContextValue, type OpenArtifact } from './artifactContext';

/**
 * Holds the drafts a conversation has produced, so they outlive their bubble.
 *
 * A draft belongs to the conversation, not to the message that happened to
 * emit it: the next turn is usually "make the methods shorter", and the user
 * expects the document in front of them to change rather than a second copy
 * to appear further down. So the dock keeps showing the latest draft while
 * the thread scrolls, and an older one can be brought back.
 *
 * `publish` is called from a render effect on every streamed chunk. It must
 * therefore be stable and must not set state when nothing changed, or the
 * stream becomes a re-render loop.
 */
export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [byMessage, setByMessage] = useState<OpenArtifact[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  /** The user closed the dock; do not reopen until a *new* draft arrives. */
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const publish = useCallback((artifact: OpenArtifact | null) => {
    if (!artifact) return;
    setByMessage(prev => {
      const at = prev.findIndex(a => a.messageId === artifact.messageId);
      if (at === -1) return [...prev, artifact];
      const current = prev[at];
      // Streaming: content grows every chunk. Bail out when nothing moved, so
      // a re-render that re-reports an unchanged draft costs no state update.
      if (
        current.content === artifact.content &&
        current.title === artifact.title &&
        current.closed === artifact.closed &&
        current.citations === artifact.citations &&
        current.claims === artifact.claims &&
        current.entailment === artifact.entailment &&
        current.entailmentPending === artifact.entailmentPending
      ) {
        return prev;
      }
      const next = prev.slice();
      next[at] = artifact;
      return next;
    });
    // A draft the user has not dismissed takes the dock. Newest wins, which is
    // what "now shorten it" should do.
    setShownId(prev => (prev === artifact.messageId ? prev : artifact.messageId));
    setDismissedId(prev => (prev === artifact.messageId ? prev : null));
  }, []);

  const show = useCallback((messageId: string) => {
    setShownId(messageId);
    setDismissedId(null);
  }, []);

  const close = useCallback(() => {
    setShownId(current => {
      setDismissedId(current);
      return current;
    });
  }, []);

  const value = useMemo<ArtifactContextValue>(() => {
    const found = byMessage.find(a => a.messageId === shownId) ?? null;
    const open = found && found.messageId !== dismissedId ? found : null;
    return { open, publish, show, close, history: byMessage };
  }, [byMessage, shownId, dismissedId, publish, show, close]);

  return <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>;
}
