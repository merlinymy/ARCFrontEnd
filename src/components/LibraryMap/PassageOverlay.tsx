import { PROJECTION_CAVEAT, formatYear, truncate } from './format';
import { askPaperIds, type MapModel } from './mapModel';
import { PassageMap } from './PassageMap';
import type { MapTokens } from './tokens';
import { AskArcButton, OverlayFrame } from './ui';

interface PassageOverlayProps {
  model: MapModel;
  ids: string[];
  title: string;
  subtitle?: string;
  tokens: MapTokens;
  reducedMotion: boolean;
  onClose: () => void;
  onOpenPdf: (paperId: string, page: number | null) => void;
  onSelectPaper: (index: number) => void;
  onAsk: (paperIds: string[]) => void;
}

export function PassageOverlay({ model, ids, title, subtitle, tokens, reducedMotion, onClose, onOpenPdf, onSelectPaper, onAsk }: PassageOverlayProps) {
  const indices = ids.map((id) => model.idToIndex.get(id)).filter((i): i is number => i != null);
  return (
    <OverlayFrame title={title} subtitle={subtitle ?? 'Every passage is a point; passages that read alike sit together. Click a point to open the PDF.'} onClose={onClose}>
      <div className="space-y-4 p-4 sm:p-5">
        <PassageMap
          model={model}
          ids={ids}
          tokens={tokens}
          variant="set"
          roleLabel={model.roleLabel}
          onOpenPdf={onOpenPdf}
          reducedMotion={reducedMotion}
          height="min(560px, 62vh)"
        />
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Papers in this view</h3>
            <AskArcButton ids={askPaperIds(model, indices)} onAsk={onAsk} />
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {ids.map((id) => {
              const i = model.idToIndex.get(id);
              const p = i == null ? undefined : model.papers[i];
              return (
                <li key={id} className="min-w-0">
                  <button
                    type="button"
                    disabled={i == null}
                    onClick={() => i != null && onSelectPaper(i)}
                    className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-gray-800 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-200 dark:hover:bg-gray-800"
                    title="Show on the map"
                  >
                    {truncate(p?.title ?? id, 110)} <span className="text-gray-500 dark:text-gray-400">· {formatYear(p?.year)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{PROJECTION_CAVEAT}</p>
        </div>
      </div>
    </OverlayFrame>
  );
}
