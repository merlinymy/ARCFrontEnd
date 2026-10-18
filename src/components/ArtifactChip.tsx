import { FileText, Loader2 } from 'lucide-react';
import { useArtifacts } from './artifactContext';

/**
 * What a draft leaves behind in the conversation once the document itself
 * moved to the dock.
 *
 * It has to say three things: that a draft exists, which one it is, and
 * whether it is still being written — because when the dock is showing a
 * *later* draft, this chip may be the only thing on screen telling the user
 * this turn produced one at all. Clicking it brings that draft back.
 */
export function ArtifactChip({
  title,
  closed,
  messageId,
}: {
  title: string;
  closed: boolean;
  messageId: string;
}) {
  const { open, show } = useArtifacts();
  const isShowing = open?.messageId === messageId;

  return (
    <button
      onClick={() => show(messageId)}
      aria-current={isShowing || undefined}
      className={`mt-3 w-full flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left
                  transition-colors ${
                    isShowing
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/40'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
    >
      <FileText className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {title}
        </span>
        <span className="block text-xs text-gray-500 dark:text-gray-400">
          {closed ? (isShowing ? 'Shown beside the chat' : 'Draft — click to open') : 'Writing…'}
        </span>
      </span>
      {!closed && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
      )}
    </button>
  );
}
