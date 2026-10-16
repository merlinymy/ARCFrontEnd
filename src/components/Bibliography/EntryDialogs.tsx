import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { createReference, formatCitations, getEntry, removeReference, updateEntry } from '../../services/bibliographyApi';
import type { BibRecord, CitationStyle, EntryDetail, EntryFieldsInput, PossibleDuplicate, Citation } from '../../types/bibliography';
import { Badge, Banner, Button, CitationText, ConfirmDialog, CopyButton, Modal, Spinner } from './ui';
import { MISSING_LABEL, authorToLine, doiUrl, errorMessage, formatDateTime, inputClass, labelClass, parseAuthorLines, parseKeywords } from './util';
import { STYLE_LABEL, useCiteStyles } from './useCiteStyles';

// ---------------------------------------------------------------------------
// Shared badge row: is the full text in ARC or not?
// ---------------------------------------------------------------------------

export function SearchabilityBadge({ searchable }: { searchable: boolean }) {
  return searchable ? (
    <Badge tone="green" title="The PDF is indexed: ARC can search its text and cite passages from it">
      <FileText className="w-3 h-3" aria-hidden="true" />
      PDF, full text searchable
    </Badge>
  ) : (
    <Badge tone="amber" title="Reference only: no PDF in ARC, so it is not searchable by content and cannot ground an answer">
      Reference only, not searchable by content
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// The edit / create form
// ---------------------------------------------------------------------------

const ENTRY_TYPES = ['article', 'book', 'chapter', 'conference', 'thesis', 'report', 'preprint', 'patent', 'webpage', 'other'];

interface FormValues {
  title: string;
  authors: string;
  year: string;
  journal: string;
  journal_abbrev: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  doi: string;
  pmid: string;
  pmcid: string;
  entry_type: string;
  url: string;
  keywords: string;
  abstract: string;
  notes: string;
}

const EMPTY_FORM: FormValues = {
  title: '',
  authors: '',
  year: '',
  journal: '',
  journal_abbrev: '',
  volume: '',
  issue: '',
  pages: '',
  publisher: '',
  doi: '',
  pmid: '',
  pmcid: '',
  entry_type: 'article',
  url: '',
  keywords: '',
  abstract: '',
  notes: '',
};

function formFromRecord(rec: BibRecord): FormValues {
  return {
    title: rec.title ?? '',
    authors: (rec.authors ?? []).map(authorToLine).join('\n'),
    year: rec.year ? String(rec.year) : '',
    journal: rec.journal ?? '',
    journal_abbrev: rec.journal_abbrev ?? '',
    volume: rec.volume ?? '',
    issue: rec.issue ?? '',
    pages: rec.pages ?? '',
    publisher: rec.publisher ?? '',
    doi: rec.doi ?? '',
    pmid: rec.pmid ?? '',
    pmcid: rec.pmcid ?? '',
    entry_type: rec.entry_type || 'article',
    url: rec.url ?? '',
    keywords: (rec.keywords ?? []).join(', '),
    abstract: rec.abstract ?? '',
    notes: rec.notes ?? '',
  };
}

type FieldKey = keyof FormValues;

// Builds the request body. For an edit only changed fields are sent (the API
// changes exactly the fields it receives); for a create every non-empty field.
function buildPayload(values: FormValues, initial: FormValues | null, allowNotes: boolean): { payload: EntryFieldsInput; error?: string } {
  const payload: EntryFieldsInput = {};
  const changed = (k: FieldKey) => (initial ? values[k].trim() !== initial[k].trim() : values[k].trim() !== '');
  const text = (k: Exclude<FieldKey, 'authors' | 'year' | 'keywords' | 'notes'>) => {
    if (changed(k)) (payload as Record<string, unknown>)[k] = values[k].trim();
  };
  (['title', 'journal', 'journal_abbrev', 'volume', 'issue', 'pages', 'publisher', 'doi', 'pmid', 'pmcid', 'url', 'abstract', 'entry_type'] as const).forEach(text);
  if (initial ? values.authors.trim() !== initial.authors.trim() : values.authors.trim()) payload.authors = parseAuthorLines(values.authors);
  if (initial ? values.keywords.trim() !== initial.keywords.trim() : values.keywords.trim()) payload.keywords = parseKeywords(values.keywords);
  if (allowNotes && changed('notes')) payload.notes = values.notes.trim();
  if (changed('year')) {
    const y = values.year.trim();
    if (y === '') payload.year = null;
    else if (/^\d{4}$/.test(y)) payload.year = Number(y);
    else return { payload, error: 'Year must be four digits, for example 2019.' };
  }
  return { payload };
}

function EntryForm({
  idPrefix,
  values,
  onChange,
  allowNotes,
  titleRequired,
}: {
  idPrefix: string;
  values: FormValues;
  onChange: (key: FieldKey, value: string) => void;
  allowNotes: boolean;
  titleRequired: boolean;
}) {
  const field = (key: FieldKey, label: string, opts: { hint?: string; type?: string; inputMode?: 'numeric'; className?: string; required?: boolean } = {}) => (
    <div className={opts.className}>
      <label htmlFor={`${idPrefix}-${key}`} className={labelClass}>
        {label}
        {opts.required && (
          <span className="text-red-600" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        id={`${idPrefix}-${key}`}
        type={opts.type ?? 'text'}
        inputMode={opts.inputMode}
        required={opts.required}
        value={values[key]}
        onChange={(e) => onChange(key, e.target.value)}
        aria-describedby={opts.hint ? `${idPrefix}-${key}-hint` : undefined}
        className={inputClass}
      />
      {opts.hint && (
        <p id={`${idPrefix}-${key}-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {opts.hint}
        </p>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
      {field('title', 'Title', { className: 'sm:col-span-6', required: titleRequired })}
      <div className="sm:col-span-6">
        <label htmlFor={`${idPrefix}-authors`} className={labelClass}>
          Authors
        </label>
        <textarea
          id={`${idPrefix}-authors`}
          rows={3}
          value={values.authors}
          onChange={(e) => onChange('authors', e.target.value)}
          aria-describedby={`${idPrefix}-authors-hint`}
          className={inputClass}
        />
        <p id={`${idPrefix}-authors-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          One author per line, as "Family, Given" or "Given Family".
        </p>
      </div>
      {field('year', 'Year', { inputMode: 'numeric', className: 'sm:col-span-2' })}
      <div className="sm:col-span-4">
        <label htmlFor={`${idPrefix}-entry_type`} className={labelClass}>
          Type
        </label>
        <select id={`${idPrefix}-entry_type`} value={values.entry_type} onChange={(e) => onChange('entry_type', e.target.value)} className={inputClass}>
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {field('journal', 'Journal or container title', { className: 'sm:col-span-4' })}
      {field('journal_abbrev', 'Journal abbreviation', { className: 'sm:col-span-2' })}
      {field('volume', 'Volume', { className: 'sm:col-span-2' })}
      {field('issue', 'Issue', { className: 'sm:col-span-2' })}
      {field('pages', 'Pages', { className: 'sm:col-span-2' })}
      {field('publisher', 'Publisher', { className: 'sm:col-span-6' })}
      {field('doi', 'DOI', { className: 'sm:col-span-3', hint: 'A DOI URL is converted to the bare DOI.' })}
      {field('pmid', 'PMID', { className: 'sm:col-span-1' })}
      {field('pmcid', 'PMCID', { className: 'sm:col-span-2' })}
      {field('url', 'URL', { className: 'sm:col-span-6', type: 'url' })}
      {field('keywords', 'Keywords', { className: 'sm:col-span-6', hint: 'Separate with commas or semicolons.' })}
      <div className="sm:col-span-6">
        <label htmlFor={`${idPrefix}-abstract`} className={labelClass}>
          Abstract
        </label>
        <textarea id={`${idPrefix}-abstract`} rows={4} value={values.abstract} onChange={(e) => onChange('abstract', e.target.value)} className={inputClass} />
      </div>
      {allowNotes && (
        <div className="sm:col-span-6">
          <label htmlFor={`${idPrefix}-notes`} className={labelClass}>
            Notes
          </label>
          <textarea id={`${idPrefix}-notes`} rows={2} value={values.notes} onChange={(e) => onChange('notes', e.target.value)} className={inputClass} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create a reference by hand
// ---------------------------------------------------------------------------

export function ReferenceFormDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (entry: EntryDetail) => void }) {
  const { showToast } = useApp();
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ entry: EntryDetail; of: PossibleDuplicate } | null>(null);

  const submit = async () => {
    if (!values.title.trim()) {
      setError('A title is required.');
      return;
    }
    const { payload, error: invalid } = buildPayload(values, null, true);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createReference({ ...payload, title: values.title.trim() });
      onCreated(created);
      if (created.possible_duplicate_of) {
        // Keep the dialog open so the warning is read; the entry exists already.
        setDuplicate({ entry: created, of: created.possible_duplicate_of });
      } else {
        showToast({ type: 'success', message: 'Reference added to the library' });
        onClose();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (duplicate) {
    return (
      <Modal title="Reference added" onClose={onClose} footer={<Button variant="primary" onClick={onClose} data-autofocus>Done</Button>}>
        <Banner tone="warning" title="This may already be in your library">
          It looks like <strong>{duplicate.of.title}</strong> ({duplicate.of.basis}, {duplicate.of.level} match). The new reference was saved anyway. If they are the same
          work, review it under Duplicates, or remove the new one.
        </Banner>
      </Modal>
    );
  }

  return (
    <Modal
      title="Add a reference"
      size="lg"
      description="A reference-only entry has no PDF. It appears in the library, exports and 'What should I cite', but is not searchable by content."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Add reference
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <EntryForm idPrefix="new-ref" values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} allowNotes titleRequired />
        {error && (
          <Banner tone="error" className="mt-3">
            {error}
          </Banner>
        )}
        {/* lets Enter in a text input submit */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Add
        </button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Entry details, edit, remove
// ---------------------------------------------------------------------------

function CitationPanel({ entryId, initial }: { entryId: string; initial: Citation }) {
  const { styles, default: defaultStyle } = useCiteStyles();
  const [style, setStyle] = useState<CitationStyle | null>(null);
  const [citation, setCitation] = useState<Citation>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = style ?? initial.style ?? defaultStyle;

  useEffect(() => {
    setCitation(initial);
    setStyle(null);
  }, [initial]);

  const choose = async (next: CitationStyle) => {
    setStyle(next);
    setLoading(true);
    setError(null);
    try {
      const res = await formatCitations([entryId], next);
      const hit = res.citations.find((c) => c.entry_id === entryId);
      if (!hit) throw new Error('No citation returned for this entry');
      setCitation(hit.citation);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby={`cite-${entryId}`} className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <h3 id={`cite-${entryId}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Formatted citation
        </h3>
        <div className="flex items-center gap-2">
          <label htmlFor={`cite-style-${entryId}`} className="text-sm text-gray-600 dark:text-gray-300">
            Style
          </label>
          <select id={`cite-style-${entryId}`} value={active} onChange={(e) => void choose(e.target.value as CitationStyle)} className={`${inputClass} !w-auto !py-1`}>
            {styles.map((s) => (
              <option key={s} value={s}>
                {STYLE_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {citation.quality === 'partial' && (
        <Banner tone="warning" className="mb-2">
          Citation incomplete: missing {citation.missing.join(', ') || 'some fields'}. Fix the metadata before using this in a manuscript.
        </Banner>
      )}
      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-200" aria-busy={loading}>
        {loading ? <Spinner label="Formatting" /> : <CitationText html={citation.html} text={citation.text} />}
      </div>
      {error && (
        <Banner tone="error" className="mt-2">
          {error}
        </Banner>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <CopyButton text={citation.text} label="Copy citation" />
        <CopyButton text={citation.in_text} label="Copy in-text form" />
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 pt-0.5">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900 dark:text-gray-100 break-words">{children}</dd>
    </div>
  );
}

export function EntryDetailDialog({
  entryId,
  onClose,
  onChanged,
  startInEdit = false,
}: {
  entryId: string;
  onClose: () => void;
  onChanged?: () => void;
  startInEdit?: boolean;
}) {
  const { showToast, setViewingPdf } = useApp();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const detail = await getEntry(entryId);
      setEntry(detail);
      return detail;
    } catch (e) {
      setLoadError(errorMessage(e));
      return null;
    }
  }, [entryId]);

  useEffect(() => {
    let alive = true;
    void load().then((detail) => {
      if (alive && detail && startInEdit) {
        setValues(formFromRecord(detail.record));
        setEditing(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [load, startInEdit]);

  const initialValues = useMemo(() => (entry ? formFromRecord(entry.record) : null), [entry]);
  const isReference = entry?.kind === 'reference';

  const save = async () => {
    if (!entry || !initialValues) return;
    const { payload, error } = buildPayload(values, initialValues, isReference);
    if (error) {
      setSaveError(error);
      return;
    }
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }
    if (payload.title !== undefined && !payload.title) {
      setSaveError('The title cannot be empty.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateEntry(entry.entry_id, payload);
      setEntry(updated);
      setEditing(false);
      showToast({ type: 'success', message: 'Metadata saved' });
      onChanged?.();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    setRemoving(true);
    try {
      await removeReference(entry.entry_id);
      showToast({ type: 'success', message: 'Reference removed from the library' });
      onChanged?.();
      onClose();
    } catch (e) {
      setConfirmRemove(false);
      setSaveError(errorMessage(e));
    } finally {
      setRemoving(false);
    }
  };

  const rec = entry?.record;
  const sources = entry ? Object.entries(entry.metadata_sources ?? {}) : [];

  return (
    <>
      <Modal
        title={editing ? 'Edit metadata' : 'Library entry'}
        size="lg"
        onClose={onClose}
        footer={
          entry &&
          (editing ? (
            <>
              <Button onClick={() => { setEditing(false); setSaveError(null); }} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={saving}>
                Save changes
              </Button>
            </>
          ) : (
            <>
              {isReference && (
                <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" aria-hidden="true" />} onClick={() => setConfirmRemove(true)} className="mr-auto">
                  Remove reference
                </Button>
              )}
              {entry.paper && (
                <Button
                  icon={<FileText className="w-4 h-4" aria-hidden="true" />}
                  onClick={() => {
                    setViewingPdf(entry.entry_id);
                    onClose();
                  }}
                >
                  Open PDF
                </Button>
              )}
              <Button
                variant="primary"
                icon={<Pencil className="w-4 h-4" aria-hidden="true" />}
                onClick={() => {
                  setValues(formFromRecord(entry.record));
                  setEditing(true);
                }}
              >
                Edit metadata
              </Button>
            </>
          ))
        }
      >
        {!entry && !loadError && <Spinner label="Loading entry" />}
        {loadError && (
          <Banner tone="error" title="Could not load this entry" actions={<Button size="sm" onClick={() => void load()}>Retry</Button>}>
            {loadError}
          </Banner>
        )}
        {entry && rec && !editing && (
          <>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 break-words">{rec.title || '(untitled)'}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SearchabilityBadge searchable={entry.full_text_searchable} />
              {entry.reference && <Badge>from {entry.reference.source}</Badge>}
              {entry.zotero_key && <Badge tone="purple">Zotero {entry.zotero_key}</Badge>}
              {entry.reference?.hidden && <Badge tone="red">removed or hidden</Badge>}
            </div>
            {!entry.full_text_searchable && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                There is no PDF behind this entry, so ARC cannot search its content or quote it in answers. It can still be cited, exported and found by title, keywords and abstract.
              </p>
            )}
            {entry.missing.length > 0 && (
              <Banner tone="warning" className="mt-3" title="Metadata quality: incomplete">
                Missing {entry.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}. Edit the entry, or run the metadata backfill to fill papers from Crossref.
              </Banner>
            )}
            {saveError && (
              <Banner tone="error" className="mt-3">
                {saveError}
              </Banner>
            )}
            <dl className="mt-3">
              <Row label="Authors">{rec.authors.length > 0 ? rec.authors.map(authorToLine).join('; ') : null}</Row>
              <Row label="Year">{rec.year}</Row>
              <Row label="Type">{rec.entry_type}</Row>
              <Row label="Journal">{[rec.journal, rec.journal_abbrev && `(${rec.journal_abbrev})`].filter(Boolean).join(' ')}</Row>
              <Row label="Volume / issue / pages">{[rec.volume && `vol. ${rec.volume}`, rec.issue && `no. ${rec.issue}`, rec.pages && `pp. ${rec.pages}`].filter(Boolean).join(', ')}</Row>
              <Row label="Publisher">{rec.publisher}</Row>
              <Row label="DOI">
                {rec.doi && (
                  <a href={doiUrl(rec.doi)} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                    {rec.doi}
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </Row>
              <Row label="PMID">{rec.pmid}</Row>
              <Row label="PMCID">{rec.pmcid}</Row>
              <Row label="arXiv">{rec.arxiv_id}</Row>
              <Row label="URL">{rec.url}</Row>
              <Row label="Keywords">{rec.keywords.length > 0 ? rec.keywords.join(', ') : null}</Row>
              <Row label="Notes">{rec.notes}</Row>
              <Row label="File">{entry.paper?.filename}</Row>
              <Row label="Indexed">{entry.paper ? `${entry.paper.chunk_count} chunks, ${formatDateTime(entry.paper.indexed_at)}` : null}</Row>
              <Row label="Added">{entry.reference ? formatDateTime(entry.reference.created_at) : null}</Row>
            </dl>
            {rec.abstract && (
              <details className="mt-3">
                <summary className="text-sm font-medium cursor-pointer text-gray-700 dark:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Abstract</summary>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{rec.abstract}</p>
              </details>
            )}
            {sources.length > 0 && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Fields set outside the PDF: {sources.map(([field, source]) => `${field} (${source})`).join(', ')}.
              </p>
            )}
            <CitationPanel entryId={entry.entry_id} initial={entry.citation} />
          </>
        )}
        {entry && editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            noValidate
          >
            {!isReference && (
              <Banner tone="info" className="mb-3">
                This paper has a PDF. Edits are stored as an overlay on top of the indexed metadata: the PDF and its search index are not changed.
              </Banner>
            )}
            <EntryForm idPrefix={`edit-${entry.entry_id}`} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} allowNotes={isReference} titleRequired />
            {saveError && (
              <Banner tone="error" className="mt-3">
                {saveError}
              </Banner>
            )}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
              Save
            </button>
          </form>
        )}
      </Modal>
      {confirmRemove && entry && (
        <ConfirmDialog title="Remove this reference?" confirmLabel="Remove reference" danger busy={removing} onConfirm={() => void remove()} onCancel={() => setConfirmRemove(false)}>
          <p>
            <strong>{entry.record.title}</strong> will disappear from the library, exports and citation suggestions.
          </p>
          <p>The record is kept (hidden), so a Zotero sync does not bring it back. PDF papers cannot be removed from here.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
