import { useMemo, useState } from 'react';
import { ArrowLeft, ScatterChart, X } from 'lucide-react';
import { RankedBars, YearHistogram } from './charts';
import { firstAuthor, formatCount, formatPercent, formatYear } from './format';
import { ASK_CAP, askPaperIds, distinctCounts, groupLabel, groupMembers, membersByCentroid, type CitedInfo, type GroupRef, type MapModel } from './mapModel';
import type { MapTokens } from './tokens';
import { AskArcButton, IconButton, SectionHeading } from './ui';

interface GroupPanelProps {
  model: MapModel;
  group: GroupRef;
  tokens: MapTokens;
  cited: CitedInfo | null;
  onSelectPaper: (index: number) => void;
  onOpenGroup: (group: GroupRef) => void;
  onOpenPassages: (ids: string[], title: string, subtitle: string) => void;
  onHoverPaper: (index: number | null) => void;
  onAsk: (paperIds: string[]) => void;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
}

const PAGE = 40;

/** Topic panel: what a topic cluster holds, when it was written, how much ARC has used it. */
export function GroupPanel({ model, group, tokens, cited, onSelectPaper, onOpenGroup, onOpenPassages, onHoverPaper, onAsk, onClose, onBack, backLabel }: GroupPanelProps) {
  const [shown, setShown] = useState(PAGE);
  const cluster = model.clusterById.get(group.id);
  const members = groupMembers(model, group);
  const label = groupLabel(model, group);
  const sorted = useMemo(() => membersByCentroid(model, group), [model, group]);
  const years = useMemo(() => Int16Array.from(members, (i) => model.year[i]), [members, model]);
  const subtopics = useMemo(() => {
    if (!cluster || cluster.level !== 'coarse') return [];
    return model.fine
      .filter((f) => f.parent === cluster.id && f.members.length > 0)
      .sort((x, y) => y.members.length - x.members.length)
      .map((f) => ({ key: f.id, label: f.label, count: f.members.length }));
  }, [cluster, model]);
  // copies count once (a copy group shares one citation count)
  const counts = useMemo(() => distinctCounts(model, members, cited), [model, members, cited]);
  const parent = cluster?.parent ? model.clusterById.get(cluster.parent) : undefined;
  const kindLabel = cluster?.level === 'fine' ? 'Subtopic' : 'Topic';
  const nearest = sorted.slice(0, 12).map((i) => model.papers[i].id);
  // Ask ARC: representatives only, the ASK_CAP nearest the topic's center
  const askIds = askPaperIds(model, sorted, ASK_CAP);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 px-2 py-1.5 dark:border-gray-700">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{backLabel ?? 'Back'}</span>
          </button>
        ) : (
          <span className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{kindLabel}</span>
        )}
        <span className="flex-1" />
        <IconButton label="Close (Esc)" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          {onBack && <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{kindLabel}</div>}
          <h2 className="mt-0.5 text-base font-semibold leading-snug text-gray-900 dark:text-gray-100">{label}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {formatCount(members.length)} papers
            {parent && (
              <>
                {' '}
                · part of{' '}
                <button
                  type="button"
                  onClick={() => onOpenGroup({ kind: 'cluster', id: parent.id })}
                  className="rounded text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:decoration-gray-600"
                >
                  {parent.label}
                </button>
              </>
            )}
          </p>
          {cluster && cluster.terms.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1" aria-label="Top terms">
              {cluster.terms.map((t) => (
                <li key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>

        {cited && (
          <section aria-label="Cited by ARC">
            <SectionHeading>Cited by ARC</SectionHeading>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatPercent(counts.distinct ? counts.cited / counts.distinct : 0)}</span>
              <span className="relative h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${counts.distinct ? (counts.cited / counts.distinct) * 100 : 0}%`, background: tokens.series[0] }} />
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400" title="Copies of a paper count once">
                {formatCount(counts.cited)} of {formatCount(counts.distinct)} distinct
              </span>
            </div>
          </section>
        )}

        <section aria-label="Years">
          <SectionHeading>Papers per year</SectionHeading>
          <YearHistogram years={years} tokens={tokens} />
        </section>

        {subtopics.length > 0 && (
          <section aria-label="Subtopics">
            <SectionHeading>Subtopics</SectionHeading>
            <RankedBars rows={subtopics} onSelect={(id) => onOpenGroup({ kind: 'cluster', id })} />
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <AskArcButton ids={askIds} total={members.length} onAsk={onAsk} subsetNote="nearest this topic’s center" />
          <button
            type="button"
            disabled={nearest.length === 0}
            onClick={() =>
              onOpenPassages(nearest, `Passages near the center of “${label}”`, `The ${nearest.length} papers nearest the center of this ${kindLabel.toLowerCase()} on the map.`)
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ScatterChart className="h-4 w-4" /> Passage map ({nearest.length} nearest the center)
          </button>
        </div>

        <section aria-label="Papers">
          <SectionHeading>Papers, nearest the center first</SectionHeading>
          <ul className="-mx-2" onMouseLeave={() => onHoverPaper(null)}>
            {sorted.slice(0, shown).map((i) => {
              const q = model.papers[i];
              const a = cited?.answers[i] ?? 0;
              return (
                <li key={q.id} onMouseEnter={() => onHoverPaper(i)}>
                  <button
                    type="button"
                    onClick={() => onSelectPaper(i)}
                    onFocus={() => onHoverPaper(i)}
                    onBlur={() => onHoverPaper(null)}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-gray-800/70"
                  >
                    <span className="block text-sm leading-snug text-gray-900 line-clamp-2 dark:text-gray-100">{q.title || q.id}</span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {formatYear(q.year)} · {firstAuthor(q.authors ?? [], q.n_authors ?? 0)}
                      {a > 0 ? ` · cited in ${formatCount(a)}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {sorted.length > shown && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE * 2)}
              className="mt-2 text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
            >
              Show more ({formatCount(sorted.length - shown)} remaining)
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
