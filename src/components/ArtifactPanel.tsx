import { FileText, Loader2 } from 'lucide-react';
import { AnswerBody } from './AnswerBody';
import { CopyButton } from './Bibliography/ui';
import type { Citation, Claim, EntailmentReport } from '../types';

interface ArtifactPanelProps {
  title: string;
  content: string;
  /** False while the closing tag has not arrived: the draft is still being written. */
  closed: boolean;
  /** Passed straight through so citation chips inside the draft behave as they do in chat. */
  citations: Citation[] | undefined;
  claims?: Claim[];
  entailment?: EntailmentReport | null;
  entailmentPending?: boolean;
}

/**
 * A drafted piece, shown as its own document rather than as chat.
 *
 * The point is the separation: a methods section the user will paste into a
 * manuscript should not look like a reply that scrolls away. It gets a title,
 * a border, and a copy button, and anything the model wanted to *say* about
 * the draft stays outside in the bubble.
 *
 * Renders through `AnswerBody`, not a second markdown renderer, so citation
 * chips, claims and entailment badges work exactly as they do in an answer —
 * a draft is held to the evidence just as tightly, so it must show the same
 * provenance. That works because citations are inline markers resolved by id,
 * not offsets into the whole answer, so lifting the draft out does not break
 * them.
 */
export function ArtifactPanel({
  title,
  content,
  closed,
  citations,
  claims,
  entailment,
  entailmentPending,
}: ArtifactPanelProps) {
  return (
    <section
      aria-label={`Draft: ${title}`}
      className="mt-3 rounded-xl border border-indigo-200 dark:border-indigo-900/60 overflow-hidden"
    >
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/40">
        <FileText className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <h3 className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {closed ? (
          <CopyButton text={content} label="Copy" size="sm" />
        ) : (
          // No copy button mid-stream: copying half a draft silently gives
          // the user less than they think they have.
          <span className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Writing…
          </span>
        )}
      </header>

      <div className="px-4 py-3 bg-white dark:bg-gray-900">
        <AnswerBody
          content={content}
          citations={citations}
          claims={claims}
          entailment={entailment}
          entailmentPending={entailmentPending}
        />
      </div>
    </section>
  );
}
