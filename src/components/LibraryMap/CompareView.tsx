import { useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { ComparePassage, SectionRole } from '../../types';
import { stripCells } from './barcode';
import {
  INFERRED_NOTE,
  LENS_HELP,
  LENS_LABEL,
  LENS_ORDER,
  firstAuthor,
  formatScore,
  formatYear,
  sectionLabel,
} from './format';
import { askPaperIds, type MapModel } from './mapModel';
import { PassageMap } from './PassageMap';
import { compareKey, compareStore, describeError, paperDetailStore, useResource } from './resource';
import { SectionHeatmap } from './SectionHeatmap';
import { useTip } from './tip';
import { INFERRED_OPACITY, rgba, type MapTokens } from './tokens';
import { AskArcButton, FloatingTip, OverlayFrame, ScoreBar, SectionHeading, Spinner, Swatch } from './ui';

interface CompareViewProps {
  model: MapModel;
  a: number;
  b: number;
  tokens: MapTokens;
  reducedMotion: boolean;
  onClose: () => void;
  onOpenPdf: (paperId: string, page: number | null) => void;
  onAsk: (paperIds: string[]) => void;
}

function PaperMark({ side, tokens }: { side: 'A' | 'B'; tokens: MapTokens }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
      <Swatch color={tokens.inkSecondary} shape={side === 'A' ? 'dot' : 'ring'} />
      {side}
    </span>
  );
}

function PassageSide({
  side,
  passage,
  tokens,
  roleLabel,
  onOpen,
}: {
  side: 'A' | 'B';
  passage: ComparePassage;
  tokens: MapTokens;
  roleLabel: Record<SectionRole, string>;
  onOpen: () => void;
}) {
  const { tip, bind } = useTip();
  const role = passage.role in tokens.roleFill ? passage.role : 'unlabeled';
  const fill = tokens.roleFill[role];
  const page = passage.page;
  return (
    <div className="min-w-0">
      <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{passage.text}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <PaperMark side={side} tokens={tokens} />
        <button
          type="button"
          onClick={onOpen}
          {...bind(
            <span>
              {sectionLabel(passage.section)} · {roleLabel[role]}
              {passage.role_inferred && (
                <>
                  <br />
                  {INFERRED_NOTE}
                </>
              )}
              <br />
              Open the PDF {page != null ? `at p. ${page}` : 'at its start (no page information)'}
            </span>
          )}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label={`${sectionLabel(passage.section)}${passage.role_inferred ? ', role inferred' : ''}. Open paper ${side} ${page != null ? `at page ${page}` : 'at its start'}`}
        >
          <Swatch color={passage.role_inferred ? rgba(fill, INFERRED_OPACITY) : fill} border={tokens.roleBorder[role]} />
          <span className={passage.role_inferred ? 'italic' : undefined}>{sectionLabel(passage.section)}</span>
          {page != null && <span className="tabular-nums text-gray-500 dark:text-gray-400">· p. {page}</span>}
          <ExternalLink className="h-3 w-3 text-gray-400" aria-hidden />
        </button>
      </div>
      <FloatingTip tip={tip} />
    </div>
  );
}

export function CompareView({ model, a, b, tokens, reducedMotion, onClose, onOpenPdf, onAsk }: CompareViewProps) {
  const pa = model.papers[a];
  const pb = model.papers[b];
  const state = useResource(compareStore, compareKey(pa.id, pb.id));
  const detailA = useResource(paperDetailStore, pa.id);
  const detailB = useResource(paperDetailStore, pb.id);
  const [hoverPair, setHoverPair] = useState<number | null>(null);
  const data = state?.status === 'success' ? state.data : undefined;
  const error = state?.status === 'error' ? describeError(state.error) : null;
  const ids = useMemo(() => [pa.id, pb.id], [pa.id, pb.id]);
  const highlight = useMemo(() => {
    const pair = hoverPair != null ? data?.passage_pairs[hoverPair] : undefined;
    return pair ? new Set([pair.a.chunk_id, pair.b.chunk_id]) : null;
  }, [hoverPair, data]);
  // section strips aligned with the heatmap: detail sections when loaded, else the map barcode
  const sectionsOf = (d: typeof detailA) => (d?.status === 'success' ? (d.data.sections ?? d.data.structure)?.segments : undefined);
  const rowStrip = stripCells(data?.section_matrix?.rows ?? [], sectionsOf(detailA), pa.barcode, model.sectionRole);
  const colStrip = stripCells(data?.section_matrix?.cols ?? [], sectionsOf(detailB), pb.barcode, model.sectionRole);
  const askIds = askPaperIds(model, [a, b]);

  const header = (side: 'A' | 'B', index: number) => {
    const p = model.papers[index];
    return (
      <div className="min-w-0 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
        <div className="flex items-start gap-2">
          <PaperMark side={side} tokens={tokens} />
          <div className="min-w-0 flex-1">
            <div className="font-medium leading-snug text-gray-900 dark:text-gray-100">{p.title || p.id}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              <span>{formatYear(p.year)}</span>
              <span>·</span>
              <span>{firstAuthor(p.authors ?? [], p.n_authors ?? 0)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenPdf(p.id, null)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ExternalLink className="h-4 w-4" /> Open PDF
          </button>
        </div>
      </div>
    );
  };

  const missingFor = (lens: (typeof LENS_ORDER)[number]) => {
    const aHas = pa.lenses?.includes(lens);
    const bHas = pb.lenses?.includes(lens);
    if (!aHas && !bHas) return 'neither paper has this section';
    if (!aHas) return 'paper A has no vector for this lens';
    if (!bHas) return 'paper B has no vector for this lens';
    return 'not available';
  };

  return (
    <OverlayFrame title="Compare two papers" subtitle="Why these papers are (or aren't) similar. Every score is cosine similarity on the original vectors." onClose={onClose}>
      <div className="space-y-6 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          {header('A', a)}
          {header('B', b)}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="cmp-scores">
            <SectionHeading>
              <span id="cmp-scores">Similarity by lens</span>
            </SectionHeading>
            {!data && !error && <Spinner label="Reading both papers from the vector store…" />}
            {error && (
              <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {error.status === 503 ? 'Vector store unavailable' : error.status === 404 ? 'Not in the library map' : 'Could not compare these papers'}
                </p>
                <p className="mt-1">
                  {error.status === 503
                    ? 'The comparison reads both papers live from Qdrant. Start the vector store and retry.'
                    : error.status === 404
                      ? 'One of these papers is not in the map, or the map has not been built.'
                      : error.message}
                </p>
                <button
                  type="button"
                  onClick={() => compareStore.load(compareKey(pa.id, pb.id), true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:hover:bg-gray-800"
                >
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              </div>
            )}
            {data && (
              <ul className="space-y-2">
                {LENS_ORDER.map((lens) => {
                  const v = data.scores?.[lens] ?? null;
                  return (
                    <li key={lens} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3" title={LENS_HELP[lens]}>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{LENS_LABEL[lens]}</span>
                      {v == null ? (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          <span className="inline-block w-10 text-right font-medium text-gray-900 dark:text-gray-100">{formatScore(null)}</span>{' '}
                          <span className="ml-2 text-xs">{missingFor(lens)}</span>
                        </span>
                      ) : (
                        <ScoreBar score={v} label={LENS_LABEL[lens]} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4">
              <AskArcButton ids={askIds} onAsk={onAsk} />
            </div>
          </section>

          <section aria-labelledby="cmp-matrix">
            <SectionHeading>
              <span id="cmp-matrix">Section × section similarity</span>
            </SectionHeading>
            {data ? (
              <SectionHeatmap
                rows={data.section_matrix?.rows ?? []}
                cols={data.section_matrix?.cols ?? []}
                values={data.section_matrix?.values ?? []}
                tokens={tokens}
                rowStrip={rowStrip}
                colStrip={colStrip}
                roleLabel={model.roleLabel}
              />
            ) : error ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Unavailable until the comparison loads.</p>
            ) : (
              <Spinner />
            )}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="cmp-pairs" className="min-w-0">
            <SectionHeading>
              <span id="cmp-pairs">Passages that make them similar</span>
            </SectionHeading>
            {!data && (error ? <p className="text-sm text-gray-500 dark:text-gray-400">Unavailable until the comparison loads.</p> : <Spinner />)}
            {data && data.passage_pairs.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400">No matching passages (captions are excluded from pairs).</p>
            )}
            {data && data.passage_pairs.length > 0 && (
              <ol className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.passage_pairs.map((pair, i) => (
                  <li
                    key={`${pair.a.chunk_id}-${pair.b.chunk_id}-${i}`}
                    onMouseEnter={() => setHoverPair(i)}
                    onMouseLeave={() => setHoverPair(null)}
                    onFocus={() => setHoverPair(i)}
                    onBlur={() => setHoverPair(null)}
                    className={`grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] ${hoverPair === i ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`}
                  >
                    <PassageSide side="A" passage={pair.a} tokens={tokens} roleLabel={model.roleLabel} onOpen={() => onOpenPdf(pa.id, pair.a.page ?? null)} />
                    <div className="text-center sm:pt-0.5">
                      <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatScore(pair.score)}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">cosine</div>
                    </div>
                    <PassageSide side="B" passage={pair.b} tokens={tokens} roleLabel={model.roleLabel} onOpen={() => onOpenPdf(pb.id, pair.b.page ?? null)} />
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-labelledby="cmp-passages" className="min-w-0">
            <SectionHeading>
              <span id="cmp-passages">Passage map: A + B</span>
            </SectionHeading>
            <div className="lg:sticky lg:top-0">
              <PassageMap
                model={model}
                ids={ids}
                tokens={tokens}
                variant="compare"
                roleLabel={model.roleLabel}
                highlightChunks={highlight}
                onOpenPdf={onOpenPdf}
                reducedMotion={reducedMotion}
                height="min(420px, 60vh)"
              />
            </div>
          </section>
        </div>
      </div>
    </OverlayFrame>
  );
}
