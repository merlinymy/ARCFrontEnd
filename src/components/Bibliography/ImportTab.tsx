import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, FileUp, History, Sparkles, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  FORMAT_EXTENSION,
  commitImport,
  downloadCleaned,
  downloadImportReport,
  enrichImport,
  getImport,
  getImportRecords,
  listImports,
  saveBlob,
  uploadImport,
} from '../../services/bibliographyApi';
import type { FileFormat, ImportCommitResponse, ImportInfo } from '../../types/bibliography';
import { Badge, Banner, Button, Card, CheckboxField, ConfirmDialog, Spinner } from './ui';
import { errorMessage, formatDateTime, inputClass, labelClass, pluralize } from './util';
import { usePolling } from './hooks';
import { ImportReportJson, ImportReportView } from './ImportReportView';
import type { BibliographyTabId } from './tabs';

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <li className="relative">
      <section aria-labelledby={`import-step-${n}`} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 id={`import-step-${n}`} className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              done ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
            }`}
            aria-hidden="true"
          >
            {n}
          </span>
          {title}
          {done && <span className="sr-only">(done)</span>}
        </h3>
        {children}
      </section>
    </li>
  );
}

const FORMAT_BUTTONS: Array<{ format: FileFormat; label: string }> = [
  { format: 'ris', label: 'RIS' },
  { format: 'bibtex', label: 'BibTeX' },
  { format: 'csljson', label: 'CSL-JSON' },
];

export function ImportTab({ onChanged, onNavigate }: { onChanged: () => void; onNavigate: (tab: BibliographyTabId) => void }) {
  const { showToast } = useApp();

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'auto' | FileFormat>('auto');
  const [againstLibrary, setAgainstLibrary] = useState(true);
  const [enrichOnUpload, setEnrichOnUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The import being worked on
  const [info, setInfo] = useState<ImportInfo | null>(null);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [view, setView] = useState<'readable' | 'json'>('readable');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollFailures, setPollFailures] = useState(0);

  // Commit
  const [linkMatches, setLinkMatches] = useState(true);
  const [fillLibrary, setFillLibrary] = useState(true);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);

  // Earlier imports
  const [recent, setRecent] = useState<ImportInfo[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      setRecent((await listImports(10)).imports);
      setRecentError(null);
    } catch (e) {
      setRecentError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // rid -> title, so the report can name records instead of printing r0007.
  const loadTitles = useCallback(async (importId: string) => {
    const map = new Map<string, string>();
    try {
      let offset = 0;
      for (;;) {
        const page = await getImportRecords(importId, offset, 500);
        for (const rec of page.records) map.set(rec.rid, rec.title || '(untitled)');
        offset += page.records.length;
        if (page.records.length === 0 || offset >= page.total) break;
      }
    } catch {
      // titles are a nicety; the report still reads with record ids
    }
    setTitles(map);
  }, []);

  const adopt = useCallback(
    (next: ImportInfo) => {
      setInfo(next);
      setCommitResult(null);
      setActionError(null);
      setPollFailures(0);
      setView('readable');
      if (next.report) void loadTitles(next.import_id);
    },
    [loadTitles]
  );

  const reload = useCallback(
    async (importId: string) => {
      const next = await getImport(importId, true);
      setInfo(next);
      if (next.report) void loadTitles(importId);
      return next;
    },
    [loadTitles]
  );

  // Crossref enrichment runs in the background on the server: poll until it ends.
  const enriching = info?.status === 'enriching';
  usePolling(
    async () => {
      if (!info) return;
      try {
        const next = await getImport(info.import_id, false);
        setPollFailures(0);
        if (next.status === 'enriching') {
          setInfo((cur) => (cur ? { ...cur, status: next.status, progress: next.progress } : cur));
        } else {
          await reload(info.import_id);
          if (next.status === 'ready') showToast({ type: 'success', message: 'Crossref enrichment finished' });
        }
      } catch (e) {
        setPollFailures((n) => n + 1);
        throw e;
      }
    },
    1500,
    enriching && pollFailures < 5
  );

  const onUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const created = await uploadImport(file, { format, againstLibrary, enrich: enrichOnUpload });
      adopt(created);
      void loadRecent();
    } catch (e) {
      setUploadError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const openRecent = async (importId: string) => {
    setBusy('open');
    setUploadError(null);
    try {
      adopt(await getImport(importId, true));
    } catch (e) {
      setUploadError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const startEnrich = async () => {
    if (!info) return;
    setBusy('enrich');
    setActionError(null);
    try {
      const next = await enrichImport(info.import_id);
      setInfo((cur) => (cur ? { ...cur, status: next.status, progress: next.progress, enriched: next.enriched } : cur));
      setPollFailures(0);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const baseName = (info?.filename ?? 'library').replace(/\.[^.]+$/, '');

  const download = async (key: string, filename: string, getBlob: () => Promise<Blob>) => {
    setBusy(key);
    setActionError(null);
    try {
      saveBlob(await getBlob(), filename);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doCommit = async () => {
    if (!info) return;
    setBusy('commit');
    setActionError(null);
    try {
      const result = await commitImport(info.import_id, { link_matches: linkMatches, fill_library_from_import: fillLibrary });
      setCommitResult(result);
      setInfo((cur) => (cur ? { ...cur, committed: true, commit_result: result } : cur));
      setConfirmCommit(false);
      showToast({ type: 'success', message: `Committed: ${result.created} new references` });
      onChanged();
      void loadRecent();
    } catch (e) {
      setConfirmCommit(false);
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setInfo(null);
    setFile(null);
    setCommitResult(null);
    setActionError(null);
    setUploadError(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const titleOf = useCallback((rid: string) => titles.get(rid) ?? rid, [titles]);
  const committed = !!info?.committed;
  const result = commitResult ?? info?.commit_result ?? null;
  const s = info?.summary;

  return (
    <div className="space-y-4">
      {/* The one thing people most need to know about this screen. */}
      {!committed ? (
        <Banner tone="info" title="Nothing is added to your library until you commit">
          Uploading, cleaning, enriching and downloading only work on a copy. Your library changes in step 5, when you press <strong>Commit</strong>.
        </Banner>
      ) : (
        <Banner
          tone="success"
          title="Committed"
          actions={
            <Button size="sm" onClick={() => onNavigate('library')}>
              View library
            </Button>
          }
        >
          {result
            ? `${pluralize(result.created, 'new reference')} added, ${pluralize(result.linked_to_existing, 'record')} linked to entries already in the library, ${pluralize(result.fields_filled_in_existing, 'empty field')} filled in existing entries${result.skipped ? `, ${result.skipped} skipped` : ''}.`
            : 'This import has already been committed.'}
        </Banner>
      )}

      {actionError && (
        <Banner tone="error" actions={<Button size="sm" onClick={() => setActionError(null)}>Dismiss</Button>}>
          {actionError}
        </Banner>
      )}

      <ol className="space-y-3 list-none p-0">
        <Step n={1} title="Upload a RIS, BibTeX or CSL-JSON file" done={!!info}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Export from EndNote, Mendeley or Zotero as RIS, BibTeX or CSL-JSON (EndNote's own .enw and XML are not read: export RIS from EndNote). Up to 50 MB.
          </p>
          {info ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-800 dark:text-gray-200">
                <strong className="break-all">{info.filename}</strong> ({info.format.toUpperCase()}, uploaded {formatDateTime(info.created_at)})
              </p>
              <Button size="sm" onClick={reset} icon={<Upload className="w-3.5 h-3.5" aria-hidden="true" />}>
                Start another import
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void onUpload();
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label htmlFor="import-file" className={labelClass}>
                    File
                  </label>
                  <input
                    id="import-file"
                    ref={fileInput}
                    type="file"
                    accept=".ris,.bib,.bibtex,.json,.txt,text/plain,application/json"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className={`${inputClass} file:mr-3 file:px-3 file:py-1 file:rounded-md file:border-0 file:bg-gray-100 dark:file:bg-gray-600 file:text-sm file:text-gray-700 dark:file:text-gray-100`}
                  />
                </div>
                <div>
                  <label htmlFor="import-format" className={labelClass}>
                    Format
                  </label>
                  <select id="import-format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className={inputClass}>
                    <option value="auto">Detect automatically</option>
                    <option value="ris">RIS</option>
                    <option value="bibtex">BibTeX</option>
                    <option value="csljson">CSL-JSON</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <CheckboxField checked={againstLibrary} onChange={setAgainstLibrary} label="Compare with my ARC library" hint="Flags records that are already in ARC, so committing links them instead of duplicating." />
                <CheckboxField checked={enrichOnUpload} onChange={setEnrichOnUpload} label="Also fill and verify from Crossref" hint="Runs in the background after upload and can take a while for a large file. You can also start it later in step 3." />
              </div>
              {uploadError && <Banner tone="error">{uploadError}</Banner>}
              <Button type="submit" variant="primary" loading={uploading} disabled={!file} icon={<FileUp className="w-4 h-4" aria-hidden="true" />}>
                {uploading ? 'Cleaning...' : 'Upload and clean'}
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-400">This does not add anything to the library.</p>
            </form>
          )}
        </Step>

        {info && (
          <>
            <Step n={2} title="Review the cleaning report" done={info.status !== 'enriching' && !!info.report}>
              {info.parse_warnings.length > 0 && (
                <Banner tone="warning" title={`${pluralize(info.parse_warnings.length, 'warning')} while reading the file`} className="mb-3">
                  <ul className="list-disc pl-5">
                    {info.parse_warnings.slice(0, 10).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {info.parse_warnings.length > 10 && <li>and {info.parse_warnings.length - 10} more (see the JSON report)</li>}
                  </ul>
                </Banner>
              )}
              {info.status === 'error' && (
                <Banner tone="error" title="Enrichment failed" className="mb-3">
                  {info.error ?? 'The server reported an error.'}
                </Banner>
              )}
              {enriching && (
                <Banner tone="info" className="mb-3">
                  <span role="status">
                    <Spinner
                      label={
                        info.progress
                          ? `Enriching from Crossref: ${info.progress.done.toLocaleString()} of ${info.progress.total.toLocaleString()} records`
                          : 'Enriching from Crossref'
                      }
                    />
                  </span>
                  {pollFailures >= 5 && <p className="mt-1">Lost contact with the server. Reload this import from "Earlier imports" below.</p>}
                </Banner>
              )}
              {info.report ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div role="radiogroup" aria-label="Report view" className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                      {(['readable', 'json'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={view === v}
                          onClick={() => setView(v)}
                          className={`px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                            view === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          {v === 'readable' ? 'Readable' : 'JSON'}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        icon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
                        loading={busy === 'report-md'}
                        onClick={() => download('report-md', `${baseName}-report.md`, () => downloadImportReport(info.import_id, 'markdown'))}
                      >
                        Report (Markdown)
                      </Button>
                      <Button
                        size="sm"
                        icon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
                        loading={busy === 'report-json'}
                        onClick={() => download('report-json', `${baseName}-report.json`, () => downloadImportReport(info.import_id, 'json'))}
                      >
                        Report (JSON)
                      </Button>
                    </div>
                  </div>
                  {view === 'readable' ? <ImportReportView report={info.report} titleOf={titleOf} /> : <ImportReportJson report={info.report} />}
                </>
              ) : (
                !enriching && (
                  <div className="flex items-center gap-3">
                    <Spinner label="Loading the report" />
                    <Button size="sm" onClick={() => void reload(info.import_id).catch((e) => setActionError(errorMessage(e)))}>
                      Load report
                    </Button>
                  </div>
                )
              )}
            </Step>

            <Step n={3} title="Optional: fill and verify from Crossref" done={info.enriched}>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Verifies DOIs, fills empty fields and looks up missing DOIs by title with a strict match rule. A new DOI can prove two records are one, so duplicates are checked again afterwards. Crossref is queried at about one request
                per second (faster if the server has a contact address configured), so a large file takes minutes.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void startEnrich()}
                  loading={busy === 'enrich' || enriching}
                  disabled={committed || enriching || !info.report}
                  icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
                >
                  {info.enriched ? 'Run enrichment again' : 'Run enrichment'}
                </Button>
                {info.enriched && <Badge tone="green">enriched</Badge>}
                {committed && <span className="text-sm text-gray-500 dark:text-gray-400">Not available after commit.</span>}
              </div>
            </Step>

            <Step n={4} title="Download the cleaned file">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                The cleaned copy of your whole file, ready to import back into EndNote, Mendeley or Zotero. It includes records already in ARC: it is your cleaned library, not a list of changes.
                {enriching && ' Wait for enrichment to finish to get the enriched version.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {FORMAT_BUTTONS.map(({ format: f, label }) => (
                  <Button
                    key={f}
                    icon={<Download className="w-4 h-4" aria-hidden="true" />}
                    loading={busy === `clean-${f}`}
                    disabled={enriching}
                    onClick={() => download(`clean-${f}`, `${baseName}-cleaned.${FORMAT_EXTENSION[f]}`, () => downloadCleaned(info.import_id, f))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </Step>

            <Step n={5} title="Commit to the library" done={committed}>
              {committed ? (
                <p className="text-sm text-gray-700 dark:text-gray-300">This import was committed. Committing the same import twice is refused by the server.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Each cleaned record becomes a <strong>reference-only entry</strong>: it is listed, exported and suggested for citation, but has no PDF, so it is not searchable by content. A record that already matches an entry in the
                    library by DOI, PMID or an unambiguous title is linked to it instead of added again.
                  </p>
                  <div className="space-y-2 mb-3">
                    <CheckboxField checked={linkMatches} onChange={setLinkMatches} label="Link records that match existing library entries" hint="If off, every record is added as a new reference, even when it duplicates a PDF paper." />
                    <CheckboxField
                      checked={fillLibrary}
                      onChange={setFillLibrary}
                      disabled={!linkMatches}
                      label="Fill empty fields of existing entries from this file"
                      hint="For example, the DOI of a PDF paper that had none. Existing values are never overwritten."
                    />
                  </div>
                  <Button variant="primary" onClick={() => setConfirmCommit(true)} disabled={enriching || !info.report || info.status === 'error'}>
                    Commit {s ? pluralize(s.output_records, 'record') : 'records'} to the library
                  </Button>
                  {enriching && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Commit becomes available when enrichment has finished.</p>}
                </>
              )}
            </Step>
          </>
        )}
      </ol>

      <Card className="p-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
          <History className="w-4 h-4" aria-hidden="true" />
          Earlier imports
        </h3>
        {recentError && <Banner tone="error">{recentError}</Banner>}
        {!recent && !recentError && <Spinner label="Loading" />}
        {recent && recent.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No imports yet.</p>}
        {recent && recent.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {recent.map((r) => (
              <li key={r.import_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-medium break-all">{r.filename}</span>{' '}
                  <span className="text-gray-500 dark:text-gray-400">
                    {r.format.toUpperCase()}, {r.summary?.output_records?.toLocaleString() ?? '?'} records, {formatDateTime(r.created_at)}
                  </span>{' '}
                  {r.committed ? <Badge tone="green">committed</Badge> : <Badge tone="amber">not committed</Badge>}
                </div>
                <Button size="sm" disabled={busy === 'open' || info?.import_id === r.import_id} onClick={() => void openRecent(r.import_id)}>
                  {info?.import_id === r.import_id ? 'Open now' : 'Open'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {confirmCommit && info && s && (
        <ConfirmDialog title="Commit to the library?" confirmLabel="Commit" busy={busy === 'commit'} onConfirm={() => void doCommit()} onCancel={() => setConfirmCommit(false)}>
          <p>
            This adds up to <strong>{pluralize(s.output_records, 'record')}</strong> from <strong>{info.filename}</strong> to your library as reference-only entries.
          </p>
          {linkMatches && s.matched_library_entries > 0 && (
            <p>
              {pluralize(s.matched_library_entries, 'record')} already match library entries and will be linked{fillLibrary ? ', with their empty fields filled' : ''} instead of added.
            </p>
          )}
          <p>An import can be committed only once. Added references can be removed one at a time from the Library tab.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
