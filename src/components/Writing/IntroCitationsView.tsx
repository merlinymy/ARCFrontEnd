import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatCitations } from '../../services/bibliographyApi';
import { pdfHighlightFromCitation } from '../../lib/citations';
import type { Citation as BibCitation, CitationStyle, CiteEvidence } from '../../types/bibliography';
import type { IntroCitationsWriting, IntroListedReference, IntroReference, WritingResponse } from '../../types/writing';
import { SearchabilityBadge } from '../Bibliography/EntryDialogs';
import { STYLE_LABEL, useCiteStyles } from '../Bibliography/useCiteStyles';
import { Badge, Banner, Button, CitationText, CopyButton, Spinner } from '../Bibliography/ui';
import { authorsLine, errorMessage, inputClass, labelClass } from '../Bibliography/util';
import { GapsBox } from './StructuredViews';

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4';

const ROLE_LABEL: Record<string, string> = {
  supports: 'supports the claim',
  background: 'background',
  method: 'method',
  contrast: 'contrast',
  related: 'related',
};

function Evidence({ ev, entry, r }: { ev: CiteEvidence; entry: IntroReference; r: WritingResponse }) {
  const { setViewingPdf } = useApp();
  const where = [ev.source === 'fulltext' ? ev.section : ev.source === 'abstract' ? 'abstract' : 'title', ev.page ? `p. ${ev.page}` : null]
    .filter(Boolean)
    .join(', ');
  const canOpen = ev.source === 'fulltext' && entry.kind === 'paper' && ev.page;
  const open = () => {
    // The W3 citation for the quoted passage carries the boxes to highlight.
    const citation = r.citations.find((c) => c.id === entry.citation_id && (!ev.chunk_id || c.chunk_id === ev.chunk_id));
    setViewingPdf(entry.entry_id, ev.page, citation ? pdfHighlightFromCitation(citation) : null);
  };
  return (
    <figure className="border-l-4 border-blue-300 dark:border-blue-700 pl-3 py-1">
      <blockquote className="text-sm text-gray-800 dark:text-gray-200 italic break-words">&ldquo;{ev.quote}&rdquo;</blockquote>
      <figcaption className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {ev.source === 'fulltext' ? 'Verbatim from the paper' : ev.source === 'abstract' ? 'From the abstract' : 'From the title'}
          {where ? `: ${where}` : ''}
        </span>
        {canOpen && (
          <Button size="sm" icon={<FileText className="w-3.5 h-3.5" aria-hidden="true" />} onClick={open} aria-label={`Open the PDF at page ${ev.page}`}>
            Open PDF at p. {ev.page}
          </Button>
        )}
      </figcaption>
    </figure>
  );
}

function PositionReference({ entry, listed, r }: { entry: IntroReference; listed: IntroListedReference | undefined; r: WritingResponse }) {
  const meta = listed ? [authorsLine(listed.authors), listed.year, listed.journal].filter(Boolean).join(' · ') : '';
  return (
    <li className="rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-start gap-2">
        <span
          className="shrink-0 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-full bg-blue-600 text-white text-sm font-semibold tabular-nums"
          aria-label={`Reference ${entry.number}, rank ${entry.rank}`}
        >
          {entry.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 dark:text-gray-100 break-words">{listed?.title || '(untitled)'}</p>
          {meta && <p className="text-sm text-gray-600 dark:text-gray-400 break-words">{meta}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <SearchabilityBadge searchable={entry.kind === 'paper'} />
            {entry.role && <Badge tone="purple">{ROLE_LABEL[entry.role] ?? entry.role}</Badge>}
            <span className="text-xs text-gray-500 dark:text-gray-400" title="Relative to the best result for this sentence (1.0), not a probability">
              rank {entry.rank}, relevance {entry.score.toFixed(2)} (best = 1)
            </span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-800 dark:text-gray-200 break-words">
        <span className="font-medium">Why: </span>
        {entry.reason}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {entry.reason_source === 'llm' ? 'Reason reworded by the model from the retrieved passages.' : 'Reason built from the paper’s own sentences.'}
      </p>
      {entry.evidence.length > 0 && (
        <div className="mt-2 space-y-2" role="group" aria-label="Evidence">
          {entry.evidence.map((ev, i) => (
            <Evidence key={`${ev.chunk_id ?? 'e'}-${i}`} ev={ev} entry={entry} r={r} />
          ))}
        </div>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        In text: {entry.in_text}
        <CopyButton text={entry.in_text} label="Copy in-text" ariaLabel={`Copy in-text citation for reference ${entry.number}`} />
      </p>
    </li>
  );
}

export function IntroCitationsView({
  w,
  r,
  onFormatted,
}: {
  w: IntroCitationsWriting;
  r: WritingResponse;
  /** The references as formatted in the chosen style, for the Markdown export. */
  onFormatted: (formatted: Map<string, string> | undefined) => void;
}) {
  const { styles, default: defaultStyle } = useCiteStyles();
  const [style, setStyle] = useState<CitationStyle | null>(null);
  const [override, setOverride] = useState<Map<string, BibCitation>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const activeStyle = style ?? w.style ?? defaultStyle;
  const byNumber = useMemo(() => new Map(w.references.map((x) => [x.number, x])), [w.references]);
  const citationOf = (ref: IntroListedReference): BibCitation => override.get(ref.entry_id) ?? ref.citation;

  useEffect(() => {
    onFormatted(override.size ? new Map([...override].map(([id, c]) => [id, c.text])) : undefined);
  }, [override, onFormatted]);

  // A new style re-formats the references already found with POST /cite/format; nothing is re-ranked.
  const changeStyle = async (next: CitationStyle) => {
    setStyle(next);
    setError(null);
    if (next === w.style) {
      setOverride(new Map());
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    try {
      const res = await formatCitations(w.references.map((x) => x.entry_id), next);
      if (id === requestId.current) setOverride(new Map(res.citations.map((c) => [c.entry_id, c.citation])));
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  const cited = w.positions.filter((p) => p.needs_citation);
  const unmatched = cited.filter((p) => p.references.length === 0);
  const copyAll = () => Promise.resolve(w.references.map((x) => `${x.number}. ${citationOf(x).text}`).join('\n'));

  return (
    <div className="space-y-4">
      <GapsBox
        title="Sentences with no match in the library"
        gaps={unmatched.map((p) => (p.error ? `${p.text} (failed: ${p.error})` : p.text))}
        empty="Every sentence that needs a citation has at least one reference behind it."
      />

      <p className="text-sm text-gray-600 dark:text-gray-400">
        {w.stats.cited_positions} of {w.stats.positions} positions matched, {w.stats.references} references ({w.stats.reference_only} reference-only, matched on title and abstract
        only){w.stats.reranked ? ', reranked' : ''}
        {w.stats.llm_used ? ', reasons reworded by the model' : ', no model used'}.
      </p>
      {w.notes.length > 0 && (
        <Banner tone="info">
          <ul className="list-disc pl-5">
            {w.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Banner>
      )}

      <section aria-label="Positions" className="space-y-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Where to cite</h3>
        <ol className="list-none p-0 space-y-2">
          {w.positions.map((p) => (
            <li key={p.index} className={card}>
              <p className={`break-words ${p.needs_citation ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{p.text}</p>
              {!p.needs_citation && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Not cited: {p.skip_reason ?? 'not a claim'}.</p>}
              {p.needs_citation && p.references.length === 0 && (
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-200" role="note">
                  {p.error ? `This position failed: ${p.error}` : 'Nothing in the library matched this sentence.'}
                </p>
              )}
              {p.references.length > 0 && (
                <ul className="mt-2 list-none p-0 space-y-2" aria-label={`References for position ${p.index + 1}`}>
                  {p.references.map((entry) => (
                    <PositionReference key={entry.entry_id} entry={entry} listed={byNumber.get(entry.number)} r={r} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="intro-refs-heading" className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 id="intro-refs-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            References ({w.references.length})
          </h3>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="intro-style" className={labelClass}>
                Citation style
              </label>
              <select id="intro-style" value={activeStyle} onChange={(e) => void changeStyle(e.target.value as CitationStyle)} disabled={busy} className={`${inputClass} w-auto`}>
                {styles.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            {w.references.length > 0 && <CopyButton getText={copyAll} label="Copy all" size="md" ariaLabel="Copy all formatted references" />}
          </div>
        </div>
        {busy && <Spinner label={`Re-formatting in ${STYLE_LABEL[activeStyle] ?? activeStyle}`} />}
        {error && <Banner tone="error" className="mt-2">{error}</Banner>}
        {w.references.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">No references were found.</p>
        ) : (
          <ol className="mt-3 list-none p-0 space-y-3">
            {w.references.map((x) => {
              const c = citationOf(x);
              return (
                <li key={x.entry_id} className="flex gap-3">
                  <span className="shrink-0 w-7 text-right tabular-nums text-sm text-gray-500 dark:text-gray-400">{x.number}.</span>
                  <div className="min-w-0 flex-1">
                    {c.quality === 'partial' && (
                      <p className="mb-1 text-sm text-amber-800 dark:text-amber-200" role="note">
                        Citation incomplete: missing {c.missing.join(', ') || 'some fields'}. Fix the metadata before relying on it.
                      </p>
                    )}
                    <p className="text-sm text-gray-900 dark:text-gray-100 break-words">
                      <CitationText html={c.html} text={c.text} />
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <SearchabilityBadge searchable={x.full_text_searchable} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">cited at {x.positions.length === 1 ? 'position' : 'positions'} {x.positions.map((i) => i + 1).join(', ')}</span>
                      <CopyButton text={c.text} label="Copy" ariaLabel={`Copy citation ${x.number}`} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
