import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { FORMAT_EXTENSION, FORMAT_LABEL, downloadExport, previewExport, saveBlob } from '../../services/bibliographyApi';
import type { ExportPreview, ExportRequest, FileFormat } from '../../types/bibliography';
import { Badge, Banner, Button, Card, CheckboxField, Stat } from './ui';
import { errorMessage } from './util';
import type { BibliographyTabId } from './tabs';

const SCOPES: Array<{ value: ExportRequest['scope']; label: string; hint: string }> = [
  { value: 'all', label: 'Everything', hint: 'PDF papers and reference-only entries' },
  { value: 'papers', label: 'PDF papers only', hint: 'Entries with a PDF in ARC' },
  { value: 'references', label: 'Reference-only entries only', hint: 'Entries without a PDF' },
];

function RadioCard<T extends string>({
  name,
  value,
  current,
  onSelect,
  label,
  hint,
}: {
  name: string;
  value: T;
  current: T;
  onSelect: (v: T) => void;
  label: string;
  hint?: string;
}) {
  const id = `${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
        current === value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'
      }`}
    >
      <input id={id} type="radio" name={name} value={value} checked={current === value} onChange={() => onSelect(value)} className="mt-1 text-blue-600 focus:outline-none" />
      <span className="text-sm">
        <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
        {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

export function ExportTab({ onNavigate }: { onNavigate: (tab: BibliographyTabId) => void }) {
  const [format, setFormat] = useState<FileFormat>('ris');
  const [scope, setScope] = useState<ExportRequest['scope']>('all');
  const [includeIncomplete, setIncludeIncomplete] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);

  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [previewOf, setPreviewOf] = useState<string | null>(null);
  const [loading, setLoading] = useState<'preview' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const body: ExportRequest = { format, scope, ids: null, include_hidden: includeHidden, include_incomplete: includeIncomplete };
  const key = JSON.stringify(body);
  const stale = preview !== null && previewOf !== key;

  const runPreview = async () => {
    setLoading('preview');
    setError(null);
    setDone(null);
    try {
      setPreview(await previewExport(body));
      setPreviewOf(key);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const runDownload = async () => {
    setLoading('download');
    setError(null);
    setDone(null);
    try {
      const blob = await downloadExport(body);
      const name = `arc-library.${FORMAT_EXTENSION[format]}`;
      saveBlob(blob, name);
      setDone(`Saved ${name} (${(blob.size / 1024).toFixed(0)} KB).`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Export the library as a file for EndNote, Mendeley, Zotero or LaTeX. Papers carry any metadata you filled or corrected, and entries are sorted by first author, year, title.
      </p>

      <Card className="p-4 space-y-4">
        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Format</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['ris', 'bibtex', 'csljson'] as const).map((f) => (
              <RadioCard key={f} name="export-format" value={f} current={format} onSelect={setFormat} label={FORMAT_LABEL[f]} hint={`.${FORMAT_EXTENSION[f]}`} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">2. Scope</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SCOPES.map((o) => (
              <RadioCard key={o.value} name="export-scope" value={o.value} current={scope} onSelect={setScope} label={o.label} hint={o.hint} />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Options</legend>
          <CheckboxField
            checked={includeIncomplete}
            onChange={setIncludeIncomplete}
            label="Include entries whose title is a file name stand-in"
            hint="Left out by default: a citation titled 'c0py00360c' is not usable. The metadata backfill gives these papers real titles."
          />
          <CheckboxField checked={includeHidden} onChange={setIncludeHidden} label="Include hidden entries" hint="Duplicates you accepted and references you removed." />
        </fieldset>

        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Preview, then download</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runPreview()} loading={loading === 'preview'} icon={<Eye className="w-4 h-4" aria-hidden="true" />}>
              Preview what will be exported
            </Button>
            <Button variant="primary" onClick={() => void runDownload()} loading={loading === 'download'} icon={<Download className="w-4 h-4" aria-hidden="true" />}>
              Download {FORMAT_LABEL[format].split(' ')[0]} file
            </Button>
          </div>
        </div>
      </Card>

      {error && <Banner tone="error">{error}</Banner>}
      {done && <Banner tone="success">{done}</Banner>}

      {preview && (
        <Card className="p-4" >
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Preview</h3>
          {stale && (
            <Banner tone="warning" className="mb-3">
              The options changed since this preview. Preview again to refresh the counts.
            </Banner>
          )}
          <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Export preview counts">
            <Stat label="Entries exported" value={preview.exported} />
            <Stat label="Left out: unusable title" value={preview.skipped_unusable_title} tone={preview.skipped_unusable_title > 0 ? 'warn' : undefined} />
          </div>
          {preview.skipped_unusable_title > 0 && (
            <div className="space-y-2">
              {preview.hint && (
                <Banner
                  tone="warning"
                  actions={
                    <Button size="sm" onClick={() => onNavigate('backfill')}>
                      Metadata backfill
                    </Button>
                  }
                >
                  {preview.hint}
                </Banner>
              )}
              {preview.skipped_examples.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Examples left out</p>
                  <ul className="text-sm space-y-1">
                    {preview.skipped_examples.map((ex) => (
                      <li key={ex.entry_id} className="flex flex-wrap items-center gap-2">
                        <code className="px-1 rounded bg-gray-100 dark:bg-gray-700 break-all">{ex.title || '(empty)'}</code>
                        <Badge>{ex.kind === 'paper' ? 'PDF paper' : 'reference'}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
