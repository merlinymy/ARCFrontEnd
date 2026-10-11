import type { BibAuthor, MissingField } from '../../types/bibliography';

// Shared class names, so every control in the bibliography screens looks like
// the inputs and buttons in LibraryPage.
export const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:opacity-60';

export const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-800';

export const cardClass = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg';

export const MISSING_LABEL: Record<MissingField, string> = {
  title: 'title',
  authors: 'authors',
  year: 'year',
  doi: 'DOI',
  journal: 'journal',
};

export const MISSING_FIELDS: MissingField[] = ['doi', 'year', 'authors', 'journal', 'title'];

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || 'Something went wrong';
  return typeof err === 'string' ? err : 'Something went wrong';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function authorsLine(authors: string[] | undefined, max = 3): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= max) return authors.join(', ');
  return `${authors.slice(0, max).join(', ')}, et al.`;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

export function authorToLine(a: BibAuthor | string): string {
  if (typeof a === 'string') return a;
  if (a.literal) return a.literal;
  if (a.family && a.given) return `${a.family}, ${a.given}`;
  return a.family || a.given || '';
}

export function parseAuthorLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function parseKeywords(text: string): string[] {
  return text
    .split(/[;,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

// Rough sentence splitter for "pick a sentence". It is only used to offer
// choices, never to decide anything, so it favours not splitting on
// abbreviations ("et al.", "Fig. 2", "e.g.") over catching every boundary.
// A private-use character stands in for a protected full stop while splitting.
const DOT = '\uE000';

export function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(/\b(et al|e\.g|i\.e|Fig|Figs|Eq|Eqs|Ref|Refs|vs|approx|Dr|No|cf|ca)\./gi, (m) => m.replaceAll('.', DOT))
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`);
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'([])|\n{2,}/)
    .map((s) => s.replaceAll(DOT, '.').trim())
    .filter((s) => s.length >= 3);
}

// Copy text to the clipboard. The async API needs a secure context; fall back
// to a hidden textarea so it also works over plain http on a LAN. A promise is
// accepted so text that must be fetched first (a BibTeX entry) can still be
// copied inside the click that asked for it: Safari rejects a clipboard write
// that happens after an awaited request, but allows a ClipboardItem that holds
// the pending text.
export async function copyText(text: string | Promise<string>): Promise<boolean> {
  const isPromise = typeof text !== 'string';
  try {
    if (navigator.clipboard && window.isSecureContext) {
      if (isPromise && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        const blob = (text as Promise<string>).then((t) => new Blob([t], { type: 'text/plain' }));
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
        return true;
      }
      await navigator.clipboard.writeText(isPromise ? await text : text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const value = isPromise ? await text : text;
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  const area = document.createElement('textarea');
  area.innerHTML = text;
  return area.value;
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '';
  return `${(value * 100).toFixed(digits)}%`;
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => (v && typeof v === 'object' ? authorToLine(v as BibAuthor) : String(v))).join('; ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
