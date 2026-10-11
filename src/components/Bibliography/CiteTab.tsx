import { useCallback, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Quote, Search, TextSelect } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { exportText, formatCitations, recommendCitations } from '../../services/bibliographyApi';
import type { CitationStyle, CiteEvidence, CiteMode, CiteRequest, CiteResponse, CiteResult } from '../../types/bibliography';
import { SearchabilityBadge } from './EntryDialogs';
import { Badge, Banner, Button, Card, CitationText, CopyButton, EmptyState, Spinner } from './ui';
import { authorsLine, doiUrl, errorMessage, focusRing, inputClass, labelClass, splitSentences } from './util';
import { STYLE_LABEL, useCiteStyles } from './useCiteStyles';

const ROLE_LABEL: Record<string, string> = {
  supports: 'supports the claim',
  background: 'background',
  method: 'method',
  contrast: 'contrast',
  related: 'related',
};

const SECTION_MAX = 6000;

function triState(value: '' | 'on' | 'off'): boolean | null | undefined {
  if (value === 'on') return true;
  if (value === 'off') return false;
  return undefined;
}

function EvidenceItem({ ev, result, onOpenPdf }: { ev: CiteEvidence; result: CiteResult; onOpenPdf: (page: number) => void }) {
  const where = [ev.source === 'fulltext' ? ev.section : ev.source === 'abstract' ? 'abstract' : 'title', ev.page ? `p. ${ev.page}` : null].filter(Boolean).join(', ');
  return (
    <figure className="border-l-4 border-blue-300 dark:border-blue-700 pl-3 py-1">
      <blockquote className="text-sm text-gray-800 dark:text-gray-200 italic break-words">&ldquo;{ev.quote}&rdquo;</blockquote>
      <figcaption className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {ev.source === 'fulltext' ? 'Verbatim from the paper' : ev.source === 'abstract' ? 'From the abstract' : 'From the title'}
          {where ? `: ${where}` : ''}
        </span>
        {ev.source === 'fulltext' && result.kind === 'paper' && ev.page && (
          <Button size="sm" icon={<FileText className="w-3.5 h-3.5" aria-hidden="true" />} onClick={() => onOpenPdf(ev.page as number)} aria-label={`Open the PDF of ${result.title} at page ${ev.page}`}>
            Open PDF at p. {ev.page}
          </Button>
        )}
      </figcaption>
    </figure>
  );
}

function ResultCard({ result, onOpenPdf }: { result: CiteResult; onOpenPdf: (id: string, page: number | null) => void }) {
  const c = result.citation;
  const meta = [authorsLine(result.authors), result.year, result.journal].filter(Boolean).join(' · ');
  return (
    <li className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-semibold" aria-label={`Rank ${result.rank}`}>
          {result.rank}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 break-words">{result.title || '(untitled)'}</h4>
          {meta && <p className="text-sm text-gray-600 dark:text-gray-400 break-words">{meta}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SearchabilityBadge searchable={result.full_text_searchable} />
            {result.doi && (
              <a href={doiUrl(result.doi)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline rounded ${focusRing}`}>
                {result.doi}
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            {result.role && <Badge tone="purple">{ROLE_LABEL[result.role] ?? result.role}</Badge>}
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400" title="Relative to the best result (1.0), not a probability">
              <span className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
                <span className="block h-full bg-blue-500" style={{ width: `${Math.round(Math.max(0, Math.min(1, result.score)) * 100)}%` }} />
              </span>
              relevance {result.score.toFixed(2)} (best = 1)
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-sm text-gray-800 dark:text-gray-200">
          <span className="font-medium">Why: </span>
          {result.reason}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {result.reason_source === 'llm' ? 'Reason written by the model from the retrieved passages; numbers were checked against them.' : 'Reason built from the paper’s own sentences.'}
        </p>
      </div>

      {result.evidence.length > 0 && (
        <div className="mt-3 space-y-2" role="group" aria-label="Evidence">
          {result.evidence.map((ev, i) => (
            <EvidenceItem key={`${ev.chunk_id ?? 'e'}-${i}`} ev={ev} result={result} onOpenPdf={(page) => onOpenPdf(result.entry_id, page)} />
          ))}
        </div>
      )}

      <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Citation ({STYLE_LABEL[c.style] ?? c.style})</p>
        {c.quality === 'partial' && (
          <p className="mb-1.5 text-sm text-amber-800 dark:text-amber-200" role="note">
            Citation incomplete: missing {c.missing.join(', ') || 'some fields'}. Fix the metadata before relying on this string.
          </p>
        )}
        <p className="text-sm text-gray-900 dark:text-gray-100 break-words">
          <CitationText html={c.html} text={c.text} />
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">In text: {c.in_text}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyButton text={c.text} label="Copy citation" ariaLabel={`Copy citation for ${result.title}`} />
          <CopyButton text={c.in_text} label="Copy in-text" ariaLabel={`Copy in-text citation for ${result.title}`} />
          <CopyButton
            label="Copy BibTeX"
            ariaLabel={`Copy BibTeX for ${result.title}`}
            getText={() => exportText({ format: 'bibtex', scope: 'all', ids: [result.entry_id], include_incomplete: true }).then((t) => t.trim())}
          />
        </div>
      </div>
    </li>
  );
}

export function CiteTab() {
  const { setViewingPdf } = useApp();
  const { styles, default: defaultStyle } = useCiteStyles();

  const [mode, setMode] = useState<CiteMode>('list');
  const [text, setText] = useState('');
  const [sentence, setSentence] = useState('');
  const [style, setStyle] = useState<CitationStyle | null>(null);
  const [maxResults, setMaxResults] = useState('');
  const [includeReferences, setIncludeReferences] = useState(true);
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [useLlm, setUseLlm] = useState<'' | 'on' | 'off'>('');
  const [rerank, setRerank] = useState<'' | 'on' | 'off'>('');

  const [response, setResponse] = useState<CiteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formatting, setFormatting] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);

  const activeStyle = style ?? defaultStyle;
  const sentences = useMemo(() => (mode === 'position' ? splitSentences(text) : []), [mode, text]);

  const run = useCallback(
    async (query: string, context: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      const body: CiteRequest = {
        text: query,
        mode,
        style: activeStyle,
        include_references: includeReferences,
      };
      if (mode === 'position' && context.trim() && context.trim() !== query.trim()) body.context = context.trim();
      const max = Number(maxResults);
      if (maxResults.trim() !== '' && Number.isInteger(max) && max >= 1 && max <= 100) body.max_results = max;
      if (/^\d{4}$/.test(yearMin.trim())) body.year_min = Number(yearMin);
      if (/^\d{4}$/.test(yearMax.trim())) body.year_max = Number(yearMax);
      const llm = triState(useLlm);
      if (llm !== undefined) body.use_llm = llm;
      const rr = triState(rerank);
      if (rr !== undefined) body.rerank = rr;
      try {
        const res = await recommendCitations(body);
        if (id === requestId.current) setResponse(res);
      } catch (e) {
        if (id === requestId.current) {
          setError(errorMessage(e));
          setResponse(null);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [mode, activeStyle, includeReferences, maxResults, yearMin, yearMax, useLlm, rerank]
  );

  const canRun = mode === 'list' ? text.trim().length >= 3 : sentence.trim().length >= 3;

  const submit = () => {
    if (!canRun) return;
    void run(mode === 'list' ? text.trim() : sentence.trim(), text);
  };

  const useSelection = () => {
    const el = areaRef.current;
    if (!el) return;
    const picked = el.value.slice(el.selectionStart, el.selectionEnd).trim();
    if (picked) setSentence(picked.replace(/\s+/g, ' '));
  };

  // Changing the style re-formats the current results with POST /cite/format; it does not re-rank.
  const changeStyle = async (next: CitationStyle) => {
    setStyle(next);
    if (!response || response.results.length === 0) return;
    setFormatting(true);
    try {
      const ids = response.results.map((r) => r.entry_id);
      const res = await formatCitations(ids, next);
      const byId = new Map(res.citations.map((c) => [c.entry_id, c.citation]));
      setResponse((cur) => (cur ? { ...cur, style: next, results: cur.results.map((r) => ({ ...r, citation: byId.get(r.entry_id) ?? r.citation })) } : cur));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setFormatting(false);
    }
  };

  const copyAll = () => {
    const lines = (response?.results ?? []).map((r, i) => `${i + 1}. ${r.citation.text}`);
    return Promise.resolve(lines.join('\n'));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-3xl">
        Paste what you are writing and ARC suggests which references in your library to cite, with the passage that supports each one. PDF papers are matched on their full text; reference-only entries are matched on title, keywords
        and abstract only.
      </p>

      <Card className="p-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset>
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">What do you have?</legend>
            <div className="flex flex-col sm:flex-row gap-2">
              {(
                [
                  { value: 'list', label: 'A topic, abstract or paragraph', hint: 'A ranked list of references for the whole text' },
                  { value: 'position', label: 'One sentence that needs a citation', hint: 'The passages that best support that sentence' },
                ] as const
              ).map((o) => (
                <label
                  key={o.value}
                  className={`flex-1 flex items-start gap-2 p-3 rounded-lg border cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                    mode === o.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                  }`}
                >
                  <input type="radio" name="cite-mode" checked={mode === o.value} onChange={() => setMode(o.value)} className="mt-1 text-blue-600 focus:outline-none" />
                  <span className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{o.label}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="cite-text" className={labelClass}>
              {mode === 'list' ? 'Your topic, abstract or draft paragraph' : 'Your paragraph (then choose the sentence to cite)'}
            </label>
            <textarea
              id="cite-text"
              ref={areaRef}
              rows={mode === 'list' ? 6 : 5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby="cite-text-hint"
              className={inputClass}
            />
            <p id="cite-text-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {text.length.toLocaleString()} characters{text.length > SECTION_MAX ? `. Over ${SECTION_MAX.toLocaleString()} characters is cut off by the server.` : '.'}
            </p>
          </div>

          {mode === 'position' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <p id="cite-sentences" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Choose the sentence
                </p>
                <Button size="sm" icon={<TextSelect className="w-3.5 h-3.5" aria-hidden="true" />} onClick={useSelection}>
                  Use the text I highlighted above
                </Button>
              </div>
              {sentences.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sentences appear here as you type. You can also highlight any text in the box and press the button.</p>
              ) : (
                <div role="radiogroup" aria-labelledby="cite-sentences" className="max-h-56 overflow-y-auto space-y-1">
                  {sentences.map((s, i) => (
                    <label
                      key={i}
                      className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                        sentence === s ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                      }`}
                    >
                      <input type="radio" name="cite-sentence" checked={sentence === s} onChange={() => setSentence(s)} className="mt-0.5 text-blue-600 focus:outline-none" />
                      <span className="break-words">{s}</span>
                    </label>
                  ))}
                </div>
              )}
              {sentence && sentences.indexOf(sentence) === -1 && (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Selected text:</span> {sentence}
                </p>
              )}
            </div>
          )}

          <details>
            <summary className={`text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer rounded ${focusRing}`}>Options</summary>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label htmlFor="cite-style" className={labelClass}>
                  Citation style
                </label>
                <select id="cite-style" value={activeStyle} onChange={(e) => void changeStyle(e.target.value as CitationStyle)} className={inputClass}>
                  {styles.map((s) => (
                    <option key={s} value={s}>
                      {STYLE_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cite-max" className={labelClass}>
                  Max results
                </label>
                <input id="cite-max" type="number" min={1} max={100} inputMode="numeric" value={maxResults} onChange={(e) => setMaxResults(e.target.value)} placeholder="default" className={inputClass} />
              </div>
              <div>
                <label htmlFor="cite-year-min" className={labelClass}>
                  Published from
                </label>
                <input id="cite-year-min" inputMode="numeric" maxLength={4} value={yearMin} onChange={(e) => setYearMin(e.target.value)} placeholder="year" className={inputClass} />
              </div>
              <div>
                <label htmlFor="cite-year-max" className={labelClass}>
                  Published up to
                </label>
                <input id="cite-year-max" inputMode="numeric" maxLength={4} value={yearMax} onChange={(e) => setYearMax(e.target.value)} placeholder="year" className={inputClass} />
              </div>
              <div>
                <label htmlFor="cite-llm" className={labelClass}>
                  Reasons written by
                </label>
                <select id="cite-llm" value={useLlm} onChange={(e) => setUseLlm(e.target.value as typeof useLlm)} className={inputClass}>
                  <option value="">Server default</option>
                  <option value="off">Quoting the paper (no model)</option>
                  <option value="on">The fast model, from the passages</option>
                </select>
              </div>
              <div>
                <label htmlFor="cite-rerank" className={labelClass}>
                  Rerank passages
                </label>
                <select id="cite-rerank" value={rerank} onChange={(e) => setRerank(e.target.value as typeof rerank)} className={inputClass}>
                  <option value="">Default for this mode</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div className="col-span-2 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={includeReferences}
                    onChange={(e) => setIncludeReferences(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  Include reference-only entries (matched on title and abstract)
                </label>
              </div>
            </div>
          </details>

          <Button type="submit" variant="primary" loading={loading} disabled={!canRun} icon={<Search className="w-4 h-4" aria-hidden="true" />}>
            {mode === 'list' ? 'Find references to cite' : 'Find citations for this sentence'}
          </Button>
          {mode === 'position' && !sentence && <p className="text-xs text-gray-500 dark:text-gray-400">Choose a sentence first.</p>}
        </form>
      </Card>

      {error && <Banner tone="error" title="Could not get suggestions">{error}</Banner>}

      <div aria-busy={loading} aria-live="polite">
        {loading && <Spinner label="Searching the library" />}
      </div>

      {response && !loading && (
        <section aria-labelledby="cite-results-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="cite-results-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {response.results.length} {response.results.length === 1 ? 'suggestion' : 'suggestions'}
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                {response.stats.papers_considered} PDF papers and {response.stats.references_considered} references considered
                {response.stats.reranked ? ', reranked' : ''}
                {response.stats.llm_used ? ', reasons by the model' : ''}
              </span>
            </h3>
            {response.results.length > 0 && <CopyButton getText={copyAll} label="Copy all citations" size="md" />}
          </div>

          {formatting && <Spinner label={`Re-formatting in ${STYLE_LABEL[activeStyle] ?? activeStyle}`} />}
          {response.query.truncated && <Banner tone="warning">Your text was longer than the server accepts and was cut off. Only the beginning was used.</Banner>}
          {!response.stats.embedded && (
            <Banner tone="warning" title="Full-text search was not used">
              Only reference-only entries could be ranked. PDF papers are missing from these results.
            </Banner>
          )}
          {response.notes.length > 0 && (
            <Banner tone="info">
              <ul className="list-disc pl-5">
                {response.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Banner>
          )}

          {response.results.length === 0 ? (
            <EmptyState icon={<Quote className="w-12 h-12" />} title="Nothing in the library matches this text">
              Try more specific wording, or widen the year range.
            </EmptyState>
          ) : (
            <ol className="space-y-3 list-none p-0" aria-label="Suggested references">
              {response.results.map((r) => (
                <ResultCard key={r.entry_id} result={r} onOpenPdf={(id, page) => setViewingPdf(id, page)} />
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
