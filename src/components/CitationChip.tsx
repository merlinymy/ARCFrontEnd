import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FileText, ExternalLink, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAnswerContext } from './answerContext';
import { EntailmentBadge, EntailmentIcon, EntailmentPending } from './EntailmentBadge';
import type { Citation, EntailmentLabel, Source } from '../types';
import {
  ENTAILMENT_PILL_CLASS,
  ENTAILMENT_TEXT,
  citationPage,
  formatBookLine,
  formatLocation,
  locationNote,
  pdfHighlightFromCitation,
} from '../lib/citations';

// ---------------------------------------------------------------------------
// Popover plumbing shared by both chip kinds
// ---------------------------------------------------------------------------

/**
 * Hover and keyboard focus show the popover; a tap on a touch screen pins it
 * (there is no hover on a phone, and a tap must not open the PDF before the
 * reader has seen what is being cited). A click with a mouse or the keyboard
 * runs `onActivate` instead.
 */
function useChipPopover(onActivate: (() => void) | null) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pointerType = useRef<string>('mouse');
  const closeTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const close = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    setPinned(false);
  }, []);
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Escape, a tap outside a pinned popover, and scrolling away all close it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointerDown = (e: globalThis.PointerEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    const onScroll = (e: Event) => {
      // Scrolling inside the popover (a long quote) must not dismiss it.
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      if (!pinned) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, pinned, close]);

  const buttonProps = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      pointerType.current = e.pointerType;
    },
    onPointerEnter: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType !== 'mouse') return;
      cancelClose();
      setOpen(true);
    },
    onPointerLeave: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType !== 'mouse' || pinned) return;
      scheduleClose();
    },
    onFocus: (e: React.FocusEvent<HTMLButtonElement>) => {
      // Only keyboard focus: a mouse click also focuses a button, and must not
      // open a popover that the click is about to replace with the PDF.
      let keyboard = true;
      try {
        keyboard = e.currentTarget.matches(':focus-visible');
      } catch {
        // very old engines: treat focus as keyboard focus
      }
      if (keyboard) {
        cancelClose();
        setOpen(true);
      }
    },
    onBlur: (e: React.FocusEvent<HTMLButtonElement>) => {
      if (pinned) return;
      if (popoverRef.current?.contains(e.relatedTarget as Node | null)) return;
      scheduleClose();
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape') close();
    },
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      const touch = pointerType.current === 'touch' || pointerType.current === 'pen';
      // detail === 0 is a keyboard-initiated click, whatever the last pointer was.
      if (touch && e.detail !== 0) {
        if (pinned) close();
        else {
          cancelClose();
          setOpen(true);
          setPinned(true);
        }
        return;
      }
      if (onActivate) {
        close();
        onActivate();
      }
    },
  };

  const popoverProps = {
    onPointerEnter: cancelClose,
    onPointerLeave: () => {
      if (!pinned) scheduleClose();
    },
  };

  // Refs are returned apart from the state so that reading `ui.open` during
  // render is not mistaken for reading a ref.
  const ui = { open, pinned, id, close, buttonProps, popoverProps };
  const refs = { anchorRef, popoverRef };
  return [ui, refs] as const;
}

/** Place a fixed-position box above (else below) its anchor, kept on screen. */
function useAnchoredPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  popoverRef: React.RefObject<HTMLElement | null>
) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    // Mounted only while open (see PopoverBody), so `pos` starts empty each time.
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      const pop = popoverRef.current;
      if (!anchor || !pop) return;
      const a = anchor.getBoundingClientRect();
      const p = pop.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      let top = a.top - p.height - gap;
      if (top < margin) top = a.bottom + gap;
      if (top + p.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - p.height - margin);
      }
      let left = a.left + a.width / 2 - p.width / 2;
      left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - p.width - margin));
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef, popoverRef]);

  return pos;
}

type PopoverUi = ReturnType<typeof useChipPopover>[0];
type PopoverBodyProps = {
  ui: PopoverUi;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  label: string;
  children: ReactNode;
};

function PopoverBody({ ui, anchorRef, popoverRef, label, children }: PopoverBodyProps) {
  const { pinned, id, popoverProps } = ui;
  const pos = useAnchoredPosition(true, anchorRef, popoverRef);
  return createPortal(
    <div
      ref={popoverRef}
      id={id}
      // A pinned popover holds a button, so it is a (non-modal) dialog; a hover
      // one is a description of the chip.
      role={pinned ? 'dialog' : 'tooltip'}
      aria-label={pinned ? label : undefined}
      {...popoverProps}
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // Measured before it is shown, so it never flashes at 0,0.
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="z-[70] w-[min(28rem,calc(100vw-16px))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xl p-3 text-sm leading-relaxed"
    >
      {children}
    </div>,
    document.body
  );
}

function ChipPopover(props: PopoverBodyProps) {
  return props.ui.open ? <PopoverBody {...props} /> : null;
}

const CHIP_BASE =
  'inline-flex items-center gap-0.5 align-baseline mx-0.5 px-1.5 min-w-[1.25rem] justify-center rounded-md border text-[11px] leading-5 font-semibold tabular-nums cursor-pointer select-none transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-800';

const CHIP_NEUTRAL =
  'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50';

// ---------------------------------------------------------------------------
// W3 chip: ⟦n⟧
// ---------------------------------------------------------------------------

interface CitationChipProps {
  /** `citations[].id`, from the marker. */
  id: number;
  citation: Citation | undefined;
  /** The label for this exact (claim, citation) pair, when the marker could be tied to its claim. */
  label: EntailmentLabel | null;
}

/**
 * A citation marker as a small button. Hover or keyboard focus shows the
 * verbatim quote, the paper and where in it; clicking opens the PDF at that
 * page with the passage highlighted; on a touch screen a tap shows the quote
 * and the popover carries the button that opens the PDF.
 */
export function CitationChip({ id, citation, label }: CitationChipProps) {
  const { setViewingPdf } = useApp();
  const { entailment, entailmentPending } = useAnswerContext();

  const canOpen = Boolean(citation?.paper_id);
  const open = useCallback(() => {
    if (!citation?.paper_id) return;
    setViewingPdf(citation.paper_id, citationPage(citation), pdfHighlightFromCitation(citation));
  }, [citation, setViewingPdf]);

  const [popover, refs] = useChipPopover(canOpen ? open : null);

  // A citation can be cited more than once; when this marker could not be tied
  // to its claim, list every label the citation got rather than guessing one.
  const allLabels = entailment.byCitation.get(id) ?? [];
  const shownLabels = label ? [label] : allLabels;

  if (!citation) {
    // Never show raw marker characters: a marker whose citation is unknown
    // (should not happen) is a plain, non-interactive number.
    return (
      <span
        className={`${CHIP_BASE} cursor-default bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600`}
        aria-label={`Citation ${id}, details unavailable`}
      >
        {id}
      </span>
    );
  }

  const location = formatLocation(citation);
  const bookLine = formatBookLine(citation);
  const note = locationNote(citation);
  const title = citation.paper_title || 'Untitled paper';

  const ariaLabel = [
    `Citation ${id}: ${title}`,
    location,
    label ? ENTAILMENT_TEXT[label.label] : null,
  ]
    .filter(Boolean)
    .join(', ');

  const chipClass = label ? `${CHIP_BASE} ${ENTAILMENT_PILL_CLASS[label.label]}` : `${CHIP_BASE} ${CHIP_NEUTRAL}`;

  return (
    <>
      <button
        ref={refs.anchorRef}
        type="button"
        className={chipClass}
        aria-label={ariaLabel}
        aria-describedby={popover.open ? popover.id : undefined}
        aria-expanded={popover.pinned ? true : undefined}
        {...popover.buttonProps}
      >
        {label && <EntailmentIcon label={label.label} className="w-2.5 h-2.5 shrink-0" />}
        {id}
      </button>

      {/* The refs are only handed to the popover, which reads them in an effect. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      <ChipPopover ui={popover} anchorRef={refs.anchorRef} popoverRef={refs.popoverRef} label={`Citation ${id}`}>
        {citation.cited_text && (
          <blockquote className="border-l-2 border-blue-400 dark:border-blue-500 pl-3 text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
            {citation.cited_text}
          </blockquote>
        )}

        <div className="mt-2 flex items-start gap-1.5 font-medium text-gray-900 dark:text-gray-100">
          <FileText className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="break-words">{title}</span>
        </div>
        {bookLine && (
          <div className="mt-0.5 flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{bookLine}</span>
          </div>
        )}
        {location && (
          <div className="mt-0.5 pl-[1.375rem] text-xs text-gray-600 dark:text-gray-400">{location}</div>
        )}
        {note && (
          <div className="mt-1 pl-[1.375rem] text-xs text-gray-500 dark:text-gray-400 italic">{note}</div>
        )}

        {(shownLabels.length > 0 || (entailmentPending && !label)) && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
            {shownLabels.map((l) => (
              <div key={`${l.claim_index}:${l.citation_id}`}>
                <EntailmentBadge label={l} showReason />
              </div>
            ))}
            {shownLabels.length === 0 && entailmentPending && <EntailmentPending />}
          </div>
        )}

        {canOpen && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            {popover.pinned ? (
              <button
                type="button"
                onClick={() => {
                  popover.close();
                  open();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                {citation.page ? `Open PDF at p. ${citation.page}` : 'Open PDF'}
              </button>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {citation.page ? `Click to open the PDF at p. ${citation.page}` : 'Click to open the PDF'}
              </span>
            )}
          </div>
        )}
      </ChipPopover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pre-W3 chip: [Source N]
// ---------------------------------------------------------------------------

/**
 * Old stored answers still say `[Source N]`, N being 1-based into the message's
 * stored sources. They have no verbatim quote and no check result (the old
 * confidence percentages are deliberately not shown), so this chip offers what
 * the source has: its title, section, and the start of the retrieved text.
 */
export function LegacySourceChip({ n }: { n: number }) {
  const { setViewingPdf } = useApp();
  const { legacySources } = useAnswerContext();
  const source: Source | undefined = legacySources[n - 1];

  const page = source?.page_start ?? null;
  const open = useCallback(() => {
    if (source?.paper_id) setViewingPdf(source.paper_id, page);
  }, [source, page, setViewingPdf]);
  const [popover, refs] = useChipPopover(source?.paper_id ? open : null);

  if (!source) {
    return (
      <span
        className={`${CHIP_BASE} cursor-default bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600`}
        aria-label={`Source ${n}, details unavailable`}
      >
        Source {n}
      </span>
    );
  }

  const snippet =
    source.chunk_text.length > 300 ? `${source.chunk_text.slice(0, 300)}…` : source.chunk_text;

  return (
    <>
      <button
        ref={refs.anchorRef}
        type="button"
        className={`${CHIP_BASE} ${CHIP_NEUTRAL}`}
        aria-label={`Source ${n}: ${source.paper_title}${page ? `, page ${page}` : ''}`}
        aria-describedby={popover.open ? popover.id : undefined}
        {...popover.buttonProps}
      >
        Source {n}
      </button>
      {/* The refs are only handed to the popover, which reads them in an effect. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      <ChipPopover ui={popover} anchorRef={refs.anchorRef} popoverRef={refs.popoverRef} label={`Source ${n}`}>
        <div className="flex items-start gap-1.5 font-medium">
          <FileText className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="break-words">{source.paper_title}</span>
        </div>
        {(source.section_name || page) && (
          <div className="mt-0.5 pl-[1.375rem] text-xs text-gray-600 dark:text-gray-400">
            {[page ? `p. ${page}` : null, source.section_name].filter(Boolean).join(' · ')}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
          {snippet}
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
          An older answer: this is the passage the model was given, not a checked quote.
        </p>
        {source.paper_id && popover.pinned && (
          <button
            type="button"
            onClick={() => {
              popover.close();
              open();
            }}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            Open PDF
          </button>
        )}
      </ChipPopover>
    </>
  );
}
