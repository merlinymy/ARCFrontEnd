import { useEffect, useId, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  KNOWN_LIMITS_HEADING,
  RELEASES,
  type ChangelogEntry,
  type ChangelogSection,
} from '../changelog';

interface WhatsNewDialogProps {
  onClose: () => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function Entries({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.title}>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.title}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            {entry.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function Section({ section }: { section: ChangelogSection }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{section.heading}</h3>
      {section.intro && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{section.intro}</p>
      )}
      <div className="mt-3">
        <Entries entries={section.entries} />
      </div>
    </section>
  );
}

export function WhatsNewDialog({ onClose }: WhatsNewDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus moves in on open and back to whatever had it on close. Without the
  // return, a keyboard user opening this from the header lands at the top of
  // the page again.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // aria-modal does not stop Tab reaching the page behind in every browser,
      // so keep it inside by wrapping at the ends.
      const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal. A flex column rather than PaperDetailModal's sticky bars: only
          the body scrolls, so the header and the dismiss button never move. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                What&apos;s new
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {RELEASES[0]?.subtitle ?? `Version ${RELEASES[0]?.version ?? ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content. Focusable so a keyboard user can scroll it; with no
            focusable child inside, an overflow box otherwise cannot be. */}
        <div tabIndex={0} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-10 outline-none">
          {/* Every release, newest first. The dialog can be reopened from the
              header whenever, and someone doing that is often after something
              they half-remember from an earlier one. With a single release
              this reads exactly as one release would. */}
          {RELEASES.map((release, index) => (
            <section key={release.version} className="space-y-8">
              {/* The first release needs no banner: the dialog's own title and
                  subtitle already name it. Older ones do. */}
              {index > 0 && (
                <div className="flex items-baseline gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Version {release.version}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{release.date}</span>
                </div>
              )}
              {release.requested && <Section section={release.requested} />}
              {release.sections.map((section) => (
                <Section key={section.heading} section={section} />
              ))}
              {release.knownLimits && release.knownLimits.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-4">
                  <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-3">
                    {KNOWN_LIMITS_HEADING}
                  </h3>
                  <Entries entries={release.knownLimits} />
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
