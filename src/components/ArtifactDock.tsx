import { FileText, Loader2, X } from 'lucide-react';
import { AnswerBody } from './AnswerBody';
import { CopyButton } from './Bibliography/ui';
import { useArtifacts } from './artifactContext';

/**
 * The drafted document, beside the conversation rather than inside it.
 *
 * A methods section the user will paste into a manuscript is not a reply. In
 * the bubble it was wedged between the commentary and the sources, it pushed
 * the conversation out of view, and it scrolled away the moment the next turn
 * arrived — so iterating on it meant hunting back up the thread for the copy
 * you wanted. Here it holds still, scrolls on its own, and the chat keeps its
 * own column.
 *
 * Renders through `AnswerBody`, not a second markdown renderer, so citation
 * chips, claims and entailment badges behave exactly as they do in an answer.
 * A draft is held to the evidence as tightly as an answer is.
 *
 * Hidden below `lg`: at phone and small-tablet widths there is no room for two
 * columns, and `ResponseCard` keeps rendering the draft inline there.
 */
export function ArtifactDock() {
  const { open, close, history, show } = useArtifacts();
  if (!open) return null;

  const others = history.filter(a => a.messageId !== open.messageId);

  return (
    <aside
      aria-label={`Draft: ${open.title}`}
      className="hidden lg:flex w-[40%] max-w-[46rem] min-w-[22rem] shrink-0 flex-col
                 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
    >
      <header className="flex items-center gap-2 px-4 py-2.5 shrink-0 border-b
                         border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40">
        <FileText className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <h2 className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {open.title}
        </h2>
        {open.closed ? (
          <CopyButton text={open.content} label="Copy" size="sm" />
        ) : (
          // No copy button mid-stream: copying half a draft silently gives the
          // user less than they think they have.
          <span className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Writing…
          </span>
        )}
        <button
          onClick={close}
          aria-label="Close the draft"
          title="Close the draft"
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
        </button>
      </header>

      {/* The draft's own scroll: the conversation beside it keeps its position. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <AnswerBody
          content={open.content}
          citations={open.citations}
          claims={open.claims}
          entailment={open.entailment}
          entailmentPending={open.entailmentPending}
        />
      </div>

      {others.length > 0 && (
        <footer className="shrink-0 border-t border-gray-200 dark:border-gray-800
                           px-3 py-2 bg-gray-50 dark:bg-gray-950/40">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-500 mb-1">
            Earlier drafts
          </p>
          <div className="flex flex-wrap gap-1.5">
            {others.map(a => (
              <button
                key={a.messageId}
                onClick={() => show(a.messageId)}
                className="max-w-full truncate rounded-md border border-gray-200 dark:border-gray-700
                           px-2 py-1 text-xs text-gray-700 dark:text-gray-300
                           hover:bg-white dark:hover:bg-gray-800 transition-colors"
                title={a.title}
              >
                {a.title}
              </button>
            ))}
          </div>
        </footer>
      )}
    </aside>
  );
}
