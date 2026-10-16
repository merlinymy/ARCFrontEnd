import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Check, Copy, Info, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cardClass, copyText, decodeEntities, focusRing } from './util';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary:
    'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className = '', disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing} ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'
      } ${buttonVariants[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badges, banners, spinner
// ---------------------------------------------------------------------------

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

const badgeTones: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
};

export function Badge({ tone = 'gray', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

const bannerTones: Record<'info' | 'success' | 'warning' | 'error', { box: string; icon: ReactNode }> = {
  info: {
    box: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
    icon: <Info className="w-5 h-5 shrink-0" aria-hidden="true" />,
  },
  success: {
    box: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
    icon: <CheckCircle className="w-5 h-5 shrink-0" aria-hidden="true" />,
  },
  warning: {
    box: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100',
    icon: <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />,
  },
  error: {
    box: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100',
    icon: <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />,
  },
};

export function Banner({
  tone = 'info',
  title,
  children,
  actions,
  className = '',
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const t = bannerTones[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 p-3 rounded-lg border text-sm ${t.box} ${className}`}>
      {t.icon}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {actions && <div className="shrink-0 flex items-start gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400" role="status">
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 text-gray-500 dark:text-gray-400">
      {icon && <div className="mb-3 opacity-50" aria-hidden="true">{icon}</div>}
      <p className="text-base font-medium text-gray-700 dark:text-gray-300">{title}</p>
      {children && <div className="mt-1 text-sm max-w-md">{children}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${cardClass} ${className}`}>{children}</div>;
}

export function SectionTitle({ children, id, hint }: { children: ReactNode; id?: string; hint?: ReactNode }) {
  return (
    <div className="mb-2">
      <h3 id={id} className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {children}
      </h3>
      {hint && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// A number with a caption, for summary rows.
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 min-w-[7rem]">
      <div className={`text-lg font-semibold ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

export function CheckboxField({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      />
      <div className="text-sm">
        <label htmlFor={id} className={`text-gray-800 dark:text-gray-200 ${disabled ? 'opacity-60' : ''}`}>
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-gray-500 dark:text-gray-400">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  description,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  description?: string;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus moves into the dialog on open and returns to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  const width = size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg';
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`w-full ${width} max-h-[90vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-xl outline-none`}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className={`p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 ${focusRing}`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">{children}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function Pager({
  offset,
  limit,
  total,
  onChange,
  disabled,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
  disabled?: boolean;
}) {
  if (total <= limit) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 py-3">
      <p className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
        Showing {from.toLocaleString()}-{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" icon={<ChevronLeft className="w-4 h-4" aria-hidden="true" />} disabled={disabled || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <Button size="sm" disabled={disabled || offset + limit >= total} onClick={() => onChange(offset + limit)}>
          Next
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

// Renders the first `step` items, with a button to reveal more. Import reports
// can hold thousands of rows; this keeps the page responsive without a library.
export function ShowMore<T>({
  items,
  step = 50,
  render,
  empty,
  noun = 'items',
}: {
  items: T[];
  step?: number;
  render: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
  noun?: string;
}) {
  const [shown, setShown] = useState(step);
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <>
      {items.slice(0, shown).map(render)}
      {items.length > shown && (
        <div className="pt-2">
          <Button size="sm" onClick={() => setShown((n) => n + step)}>
            Show {Math.min(step, items.length - shown).toLocaleString()} more {noun} ({(items.length - shown).toLocaleString()} hidden)
          </Button>
        </div>
      )}
    </>
  );
}

export function Collapsible({
  title,
  count,
  children,
  defaultOpen = false,
  hint,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: string;
}) {
  return (
    <details open={defaultOpen} className={`group ${cardClass}`}>
      <summary className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none rounded-lg ${focusRing}`}>
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {title}
          {count !== undefined && <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{count.toLocaleString()}</span>}
        </span>
        {hint && <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">{hint}</span>}
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700/60">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------

export function CopyButton({ text, label = 'Copy', getText, size = 'sm', ariaLabel }: { text?: string; label?: string; getText?: () => Promise<string>; size?: 'sm' | 'md'; ariaLabel?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed' | 'busy'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = useCallback(async () => {
    setState('busy');
    let ok = false;
    try {
      ok = await copyText(getText ? getText() : text ?? '');
    } catch {
      ok = false;
    }
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }, [getText, text]);

  return (
    <Button size={size} onClick={onClick} loading={state === 'busy'} aria-label={ariaLabel} icon={state === 'copied' ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Could not copy to the clipboard' : ''}
      </span>
    </Button>
  );
}

// The citation `html` holds only <i> and <b> and is otherwise escaped. It is
// rendered as React elements instead of with dangerouslySetInnerHTML, so
// nothing outside those two tags can ever become markup.
export function CitationText({ html, text }: { html?: string; text: string }) {
  if (!html) return <>{text}</>;
  const parts = html.split(/(<\/?[ib]>)/i);
  const out: ReactNode[] = [];
  let italic = false;
  let bold = false;
  parts.forEach((part, i) => {
    const tag = part.toLowerCase();
    if (tag === '<i>') italic = true;
    else if (tag === '</i>') italic = false;
    else if (tag === '<b>') bold = true;
    else if (tag === '</b>') bold = false;
    else if (part) {
      let node: ReactNode = decodeEntities(part.replace(/<[^>]*>/g, ''));
      if (italic) node = <i key={`i${i}`}>{node}</i>;
      if (bold) node = <b key={`b${i}`}>{node}</b>;
      out.push(<span key={i}>{node}</span>);
    }
  });
  return <>{out}</>;
}
