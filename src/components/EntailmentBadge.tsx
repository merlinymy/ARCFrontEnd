import { Check, Minus, X, Loader2 } from 'lucide-react';
import type { EntailmentLabel, EntailmentLabelValue } from '../types';
import { ENTAILMENT_HELP, ENTAILMENT_PILL_CLASS, ENTAILMENT_TEXT } from '../lib/citations';

export function EntailmentIcon({
  label,
  className = 'w-3 h-3',
}: {
  label: EntailmentLabelValue;
  className?: string;
}) {
  if (label === 'supported') return <Check className={className} aria-hidden="true" />;
  if (label === 'partially_supported') return <Minus className={className} aria-hidden="true" />;
  return <X className={className} aria-hidden="true" />;
}

/**
 * One entailment label for one (claim, citation) pair, in words: Supported,
 * Partially supported, Unsupported. Never a number. The reason is on hover
 * (`title`) and, with `showReason`, printed beside it, which is what keyboard
 * and touch users get.
 */
export function EntailmentBadge({
  label,
  showReason = false,
}: {
  label: EntailmentLabel;
  showReason?: boolean;
}) {
  const reason = label.reason?.trim();
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span
        title={reason ? `${reason}` : ENTAILMENT_HELP[label.label]}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs font-medium ${ENTAILMENT_PILL_CLASS[label.label]}`}
      >
        <EntailmentIcon label={label.label} className="w-3 h-3 shrink-0" />
        {ENTAILMENT_TEXT[label.label]}
      </span>
      {showReason && reason && (
        <span className="text-xs text-gray-600 dark:text-gray-400">{reason}</span>
      )}
    </span>
  );
}

/** The quiet "not yet" state between `complete` and the entailment event. */
export function EntailmentPending({ text = 'Checking citations…' }: { text?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
      role="status"
    >
      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
      {text}
    </span>
  );
}
