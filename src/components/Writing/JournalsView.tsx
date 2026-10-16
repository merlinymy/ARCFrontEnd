import { ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { percent } from '../../lib/writing';
import type { JournalEvidenceLevel, JournalPaper, JournalsWriting } from '../../types/writing';
import { Badge, Banner, Button, Collapsible } from '../Bibliography/ui';
import { doiUrl, focusRing } from '../Bibliography/util';

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4';

const LEVEL_LABEL: Record<JournalEvidenceLevel, string> = {
  none: 'No evidence',
  thin: 'Thin evidence',
  limited: 'Limited evidence',
  reasonable: 'Reasonable evidence',
};

const LEVEL_TONE: Record<JournalEvidenceLevel, 'red' | 'amber' | 'blue' | 'green'> = {
  none: 'red',
  thin: 'amber',
  limited: 'blue',
  reasonable: 'green',
};

function PaperLine({ p }: { p: JournalPaper }) {
  return (
    <li className="text-sm text-gray-700 dark:text-gray-300 break-words">
      {p.title || '(untitled)'}
      {p.year ? ` (${p.year})` : ''}
      {p.kind === 'reference' ? ', reference only' : ''}
      {p.doi && (
        <>
          {' '}
          <a href={doiUrl(p.doi)} target="_blank" rel="noreferrer" className={`text-blue-600 dark:text-blue-400 hover:underline rounded ${focusRing}`}>
            {p.doi}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </>
      )}
    </li>
  );
}

export function JournalsView({ w }: { w: JournalsWriting }) {
  const { setActivePage } = useApp();
  const e = w.evidence;
  const weak = e.level === 'none' || e.level === 'thin';

  return (
    <div className="space-y-4">
      {/* The evidence level comes first and is stated in words: everything below is only as good as this. */}
      <section aria-label="How much evidence this rests on" className={`${card} ${weak ? 'border-amber-400 dark:border-amber-600' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={LEVEL_TONE[e.level]}>{LEVEL_LABEL[e.level]}</Badge>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.statement}</p>
        </div>
        {weak && (
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-100" role="note">
            {e.level === 'none'
              ? 'No related entry in the library records a journal, so nothing can be suggested.'
              : `Thin evidence: fewer than ${e.thin_below} related entries record a journal, or the leading journal rests on a single paper. Treat this as a lead to check, not a recommendation.`}
          </p>
        )}
        {e.missing_journal > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {e.missing_journal} related {e.missing_journal === 1 ? 'entry records' : 'entries record'} no journal and {e.missing_journal === 1 ? 'is' : 'are'} not counted. Filling venues in the bibliography improves this.
            </p>
            <Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />} onClick={() => setActivePage('bibliography')}>
              Open the bibliography
            </Button>
          </div>
        )}
      </section>

      {w.limits.length > 0 && (
        <Banner tone="info" title="What this is not">
          <ul className="list-disc pl-5 space-y-0.5">
            {w.limits.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Banner>
      )}
      {w.notes.length > 0 && (
        <Banner tone="info">
          <ul className="list-disc pl-5">
            {w.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Banner>
      )}

      {w.suggestions.length > 0 && (
        <section aria-labelledby="journals-heading" className="space-y-2">
          <h3 id="journals-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Journals of the related papers
          </h3>
          <ol className="list-none p-0 space-y-2">
            {w.suggestions.map((s) => (
              <li key={s.journal} className={card}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-semibold" aria-label={`Rank ${s.rank}`}>
                    {s.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100 break-words">{s.journal}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {s.n_papers} related {s.n_papers === 1 ? 'paper' : 'papers'}, {percent(s.share)} of the relevance weight among entries that record a journal
                      {s.years && s.years.length > 0 ? `, published ${s.years[0] === s.years[s.years.length - 1] ? s.years[0] : `${s.years[0]} to ${s.years[s.years.length - 1]}`}` : ''}.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{s.basis}</p>
                    {s.variants.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Also recorded as: {s.variants.join('; ')}</p>}
                    {s.papers.length > 0 && (
                      <details className="mt-1">
                        <summary className={`text-sm text-blue-600 dark:text-blue-400 cursor-pointer rounded ${focusRing}`}>
                          The {s.papers.length} {s.papers.length === 1 ? 'paper' : 'papers'} behind this
                        </summary>
                        <ul className="mt-1 list-disc pl-5 space-y-0.5">
                          {s.papers.map((p) => (
                            <PaperLine key={p.entry_id} p={p} />
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {w.missing_journal_examples.length > 0 && (
        <Collapsible title="Related entries with no journal recorded" count={w.missing_journal_examples.length} hint="examples">
          <ul className="list-disc pl-5 space-y-0.5">
            {w.missing_journal_examples.map((p) => (
              <PaperLine key={p.entry_id} p={p} />
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}
