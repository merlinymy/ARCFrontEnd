import { useRef, type KeyboardEvent } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, Crosshair, ExternalLink, GitCompareArrows, ScatterChart, X } from 'lucide-react';
import type { LibraryMapPaperDetail } from '../../types';
import {
  CAPTIONS_ONLY_NOTE,
  FLAG_HELP,
  FLAG_LABEL,
  LENS_HELP,
  LENS_LABEL,
  copiesLabel,
  firstAuthor,
  formatAuthors,
  formatCount,
  formatDate,
  formatMaybeCount,
  formatYear,
  type ShownLens,
} from './format';
import { FLAG_ORDER, askPaperIds, hasFlag, type CitedInfo, type GroupRef, type MapModel } from './mapModel';
import { describeError, paperDetailStore, type ResourceState } from './resource';
import { AskArcButton, IconButton, ScoreBar, SectionHeading, Spinner } from './ui';

interface PaperPanelProps {
  model: MapModel;
  index: number;
  detail: ResourceState<LibraryMapPaperDetail> | undefined;
  lens: ShownLens;
  lenses: ShownLens[];
  cited: CitedInfo | null;
  onLensChange: (lens: ShownLens) => void;
  onHoverPaper: (index: number | null) => void;
  onSelectPaper: (index: number) => void;
  onCompare: (other: number) => void;
  onOpenPassages: () => void;
  onOpenGroup: (group: GroupRef) => void;
  onOpenPdf: (page: number | null) => void;
  /** open another paper's PDF (a copy) */
  onOpenPaperPdf: (paperId: string) => void;
  onAsk: (paperIds: string[]) => void;
  onLocate: () => void;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
}

export function PaperPanel({
  model,
  index,
  detail,
  lens,
  lenses,
  cited,
  onLensChange,
  onHoverPaper,
  onSelectPaper,
  onCompare,
  onOpenPassages,
  onOpenGroup,
  onOpenPdf,
  onOpenPaperPdf,
  onAsk,
  onLocate,
  onClose,
  onBack,
  backLabel,
}: PaperPanelProps) {
  const p = model.papers[index];
  const tabRefs = useRef<Partial<Record<ShownLens, HTMLButtonElement | null>>>({});
  const coarse = model.coarseOf[index] >= 0 ? model.coarse[model.coarseOf[index]] : undefined;
  const fine = model.fineOf[index] >= 0 ? model.fine[model.fineOf[index]] : undefined;
  const loaded = detail?.status === 'success' ? detail.data : undefined;
  const error = detail?.status === 'error' ? describeError(detail.error) : null;
  const counts = (loaded?.sections ?? loaded?.structure)?.counts ?? p.counts;
  // copies: ids from the map payload (instant), extended by the detail's list once loaded
  const copyIds = new Set<string>([...(p.duplicates ?? []), ...(loaded?.duplicates ?? []).map((d) => d.paper_id)]);
  copyIds.delete(p.id);
  // v1.2 excludes copies server-side; filtering here too keeps an older artifact honest
  const neighbors = (loaded?.neighbors[lens] ?? []).filter((n) => model.idToIndex.has(n.paper_id) && !copyIds.has(n.paper_id));
  const copies = [...copyIds].map((id) => model.idToIndex.get(id)).filter((j): j is number => j != null);
  const copyThreshold = model.data.header?.duplicates?.threshold ?? 0.999;
  const flags = FLAG_ORDER.filter((f) => hasFlag(model, index, f));
  const answers = cited?.answers[index] ?? 0;
  const neighborIdx = neighbors.map((n) => model.idToIndex.get(n.paper_id)).filter((j): j is number => j != null);
  const askIds = askPaperIds(model, [index, ...neighborIdx]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = lenses[(at + delta + lenses.length) % lenses.length];
    onLensChange(next);
    tabRefs.current[next]?.focus();
  };

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
          <span className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Paper</span>
        )}
        <span className="flex-1" />
        <IconButton label="Center on the map" onClick={onLocate}>
          <Crosshair className="h-4 w-4" />
        </IconButton>
        <IconButton label="Close (Esc)" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <h2 className="text-base font-semibold leading-snug text-gray-900 dark:text-gray-100">{p.title || p.id}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{formatAuthors(p.authors ?? [], p.n_authors ?? 0)}</p>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            {formatYear(p.year)}
            {cited && (
              <span className="text-gray-600 dark:text-gray-400">
                {' '}
                · {answers
                  ? `Cited in ${formatCount(answers)} ${answers === 1 ? 'answer' : 'answers'}${copies.length ? ' (this file or a copy)' : ''}${cited.lastCited[index] ? `, last ${formatDate(cited.lastCited[index])}` : ''}`
                  : 'Not cited by ARC yet'}
              </span>
            )}
          </p>
          {(coarse || fine) && (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              {coarse && (
                <button
                  type="button"
                  onClick={() => onOpenGroup({ kind: 'cluster', id: coarse.id })}
                  className="rounded px-1 text-left text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:decoration-gray-600"
                >
                  {coarse.label}
                </button>
              )}
              {coarse && fine && <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden />}
              {fine && (
                <button
                  type="button"
                  onClick={() => onOpenGroup({ kind: 'cluster', id: fine.id })}
                  className="rounded px-1 text-left text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:decoration-gray-600"
                >
                  {fine.label}
                </button>
              )}
            </div>
          )}
          {p.content_source === 'captions' && (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">{CAPTIONS_ONLY_NOTE}</p>
          )}
          {flags.length > 0 && (
            <ul className="mt-2 space-y-1" aria-label="Needs attention">
              {flags.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
                  <span>
                    <span className="font-medium">{FLAG_LABEL[f]}</span> — {FLAG_HELP[f]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {copies.length > 0 && (
          <section aria-label="Copies in your library">
            <SectionHeading>{copiesLabel(copies.length)} in your library</SectionHeading>
            <p className="mb-1.5 text-xs text-gray-600 dark:text-gray-400">
              Near-identical files (content cosine ≥ {copyThreshold}). They sit on the same spot on the map and are left out of every neighbor list.
            </p>
            <ul className="-mx-2">
              {copies.map((j) => {
                const q = model.papers[j];
                return (
                  <li key={q.id} className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/70">
                    <button
                      type="button"
                      onClick={() => onSelectPaper(j)}
                      className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className="block truncate text-sm text-gray-900 dark:text-gray-100">{q.title || q.id}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {formatYear(q.year)} · {firstAuthor(q.authors ?? [], q.n_authors ?? 0)} · id {q.id}
                        {hasFlag(model, j, 'duplicate') ? '' : ' · kept as the representative'}
                      </span>
                    </button>
                    <IconButton label="Open this copy’s PDF" onClick={() => onOpenPaperPdf(q.id)}>
                      <ExternalLink className="h-4 w-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-label="Paper">
          <dl className="grid grid-cols-4 gap-2">
            {(
              [
                ['Pages', counts.pages],
                ['Chunks', counts.chunks],
                ['Captions', counts.captions],
                ['Tables', counts.tables],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-800">
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">{label}</dt>
                <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatMaybeCount(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenPdf(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              <ExternalLink className="h-4 w-4" /> Open PDF
            </button>
            <button
              type="button"
              onClick={onOpenPassages}
              disabled={!loaded}
              title="Passages of this paper and its 5 nearest content neighbors"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ScatterChart className="h-4 w-4" /> Passage map
            </button>
          </div>
        </section>

        <section aria-label="Similar papers">
          <SectionHeading>Similar papers</SectionHeading>
          {error ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
              {error.status === 404 ? 'This paper is not in the map’s neighbor index (it may have been added after the map was built).' : error.message}
              {error.status !== 404 && (
                <button
                  type="button"
                  onClick={() => paperDetailStore.load(p.id, true)}
                  className="ml-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Neighbor lens" className="-mx-1 flex flex-wrap gap-1">
                {lenses.map((l, i) => (
                  <button
                    key={l}
                    ref={(el) => {
                      tabRefs.current[l] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`lens-tab-${l}`}
                    aria-selected={l === lens}
                    aria-controls="lens-panel"
                    tabIndex={l === lens ? 0 : -1}
                    onClick={() => onLensChange(l)}
                    onKeyDown={(e) => onTabKey(e, i)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      l === lens
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {LENS_LABEL[l]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{LENS_HELP[lens]} Lines on the map connect this paper to these neighbors.</p>
              <div role="tabpanel" id="lens-panel" aria-labelledby={`lens-tab-${lens}`} className="mt-2">
                {!loaded ? (
                  <Spinner label="Loading neighbors…" />
                ) : neighbors.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No neighbors under this lens.</p>
                ) : (
                  <ul className="-mx-2" onMouseLeave={() => onHoverPaper(null)}>
                    {neighbors.map((n) => {
                      const j = model.idToIndex.get(n.paper_id);
                      if (j == null) return null;
                      const q = model.papers[j];
                      return (
                        <li key={n.paper_id} className="group flex items-start gap-1 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/70" onMouseEnter={() => onHoverPaper(j)}>
                          <button
                            type="button"
                            onClick={() => onSelectPaper(j)}
                            onFocus={() => onHoverPaper(j)}
                            onBlur={() => onHoverPaper(null)}
                            className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            <span className="block text-sm leading-snug text-gray-900 line-clamp-2 dark:text-gray-100">{q.title || q.id}</span>
                            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              {formatYear(q.year)} · {firstAuthor(q.authors ?? [], q.n_authors ?? 0)}
                            </span>
                          </button>
                          <span className="w-[6.5rem] shrink-0 pt-0.5">
                            <ScoreBar score={n.score} label={`${LENS_LABEL[lens]} similarity`} />
                          </span>
                          <IconButton label={`Compare with “${q.title}”`} onClick={() => onCompare(j)}>
                            <GitCompareArrows className="h-4 w-4" />
                          </IconButton>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {loaded && (
                <div className="mt-3">
                  <AskArcButton ids={askIds} onAsk={onAsk} />
                  {askIds.length > 1 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This paper and its {LENS_LABEL[lens].toLowerCase()} neighbors.</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
