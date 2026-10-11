import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, Loader2, MessageSquare, X, type LucideIcon } from 'lucide-react';
import type { ArchetypeId } from '../../types';
import { formatScore } from './format';
import { useTip, type TipState } from './tip';
import type { MapTokens } from './tokens';

// ---------------------------------------------------------------- tooltip bubble

export function FloatingTip({ tip }: { tip: TipState | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, tip.x - w / 2));
    el.style.left = `${left}px`;
  }, [tip]);
  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[70] max-w-xs rounded-lg bg-gray-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg dark:bg-gray-700"
      style={{ left: tip.x, top: tip.y, transform: tip.below ? 'translateY(8px)' : 'translateY(calc(-100% - 8px))' }}
    >
      {tip.content}
    </div>,
    document.body
  );
}

export function InfoTip({ text, label = 'About this view' }: { text: string; label?: string }) {
  const { tip, bind } = useTip();
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex rounded-md p-1 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-300"
        {...bind(text)}
      >
        <Info className="h-4 w-4" />
      </button>
      {/* referenced by aria-describedby; hidden so screen readers don't read it twice */}
      <span id={id} hidden>
        {text}
      </span>
      <FloatingTip tip={tip} />
    </>
  );
}

// ---------------------------------------------------------------- controls

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  title?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  compactLabels = false,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** hide option labels below sm when an icon is present */
  compactLabels?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-lg border border-gray-300 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-800"
    >
      {options.map((o, i) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.title ?? o.label}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            <span className={Icon && compactLabels ? 'sr-only sm:not-sr-only' : undefined}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ToggleButton({
  pressed,
  onChange,
  icon: Icon,
  children,
  title,
}: {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={() => onChange(!pressed)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        pressed
          ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
          : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  className = '',
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * "Ask ARC about these papers". `ids` is already deduped to copy representatives
 * and capped; when `total` exceeds it the label says which subset is sent.
 */
export function AskArcButton({
  ids,
  total,
  onAsk,
  subsetNote = 'nearest the center',
  compact = false,
}: {
  ids: string[];
  total?: number;
  onAsk: (ids: string[]) => void;
  subsetNote?: string;
  compact?: boolean;
}) {
  const n = ids.length;
  const capped = total != null && total > n;
  const label =
    n === 1 ? 'Ask ARC about this paper' : capped ? `Ask ARC about the ${n} papers ${subsetNote}` : `Ask ARC about these ${n} papers`;
  return (
    <button
      type="button"
      disabled={!n}
      onClick={() => onAsk(ids)}
      aria-label={label}
      title={capped ? `${label} (of ${total}; ARC takes at most ${n} papers)` : label}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 ${
        compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      }`}
    >
      <MessageSquare className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
      {compact ? 'Ask ARC' : label}
    </button>
  );
}

export function Spinner({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 ${className}`} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? <span className="sr-only">Loading</span>}
    </span>
  );
}

// ---------------------------------------------------------------- marks

/** Number in primary ink plus a thin neutral bar on a fixed 0..1 domain. */
export function ScoreBar({ score, label }: { score: number | null; label?: string }) {
  const w = score == null ? 0 : Math.max(0, Math.min(1, score)) * 100;
  return (
    <span className="flex min-w-0 items-center gap-2" aria-label={label ? `${label}: ${formatScore(score)}` : undefined}>
      <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
        {formatScore(score)}
      </span>
      <span className="relative h-1 min-w-8 flex-1 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
        {score != null && <span className="absolute inset-y-0 left-0 rounded-full bg-gray-500 dark:bg-gray-400" style={{ width: `${w}%` }} />}
      </span>
    </span>
  );
}

export function Swatch({
  color,
  shape = 'square',
  border,
}: {
  color: string;
  shape?: 'square' | 'dot' | 'ring';
  border?: string | null;
}) {
  if (shape === 'ring') {
    return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: color }} />;
  }
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 shrink-0 ${shape === 'dot' ? 'rounded-full' : 'rounded-[2px]'}`}
      style={{ background: color, boxShadow: border ? `inset 0 0 0 1px ${border}` : undefined }}
    />
  );
}

/** Engineering: a paper's layout type (label from the payload's archetypes[]). */
export function ArchetypeBadge({ id, label, tokens, title }: { id: ArchetypeId; label: string; tokens: MapTokens; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
    >
      <Swatch color={tokens.archetype[id] ?? tokens.neutral} shape="dot" />
      {label}
    </span>
  );
}

/** A headline number: label, value, one line of context. */
export function StatTile({
  label,
  value,
  sub,
  help,
  action,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  help?: string;
  action?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400">
        <span className="truncate">{label}</span>
        {help && <InfoTip text={help} label={`About “${label}”`} />}
      </div>
      <div className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{sub}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- overlay

export function OverlayFrame({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center sm:p-4 lg:p-6" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={onClose} />
      <div className="relative flex w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-gray-900 sm:rounded-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id={id} className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{subtitle}</div>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close (Esc)"
            title="Close (Esc)"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function SectionHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{children}</h3>
      {aside}
    </div>
  );
}
