import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react';
import type { PaperFlag } from '../../types';
import { FLAG_LABEL, PROJECTION_CAVEAT, formatCount, truncate } from './format';
import { CITED_BIN_LABELS, FLAG_ORDER, type CitedInfo, type MapModel } from './mapModel';
import type { ColorBy } from './mapRenderer';
import { rampGradientCss, rgba, type MapTokens } from './tokens';
import { IconButton, InfoTip, Swatch } from './ui';

/** papers carrying at least one of the flags */
function countFlagged(model: MapModel, flags: readonly PaperFlag[]): number {
  let bits = 0;
  for (const f of flags) bits |= 1 << FLAG_ORDER.indexOf(f);
  let c = 0;
  for (let i = 0; i < model.n; i++) if (model.flagBits[i] & bits) c++;
  return c;
}

function RingGlyph({ width, color, size = 12 }: { width: number; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <circle cx="6" cy="6" r={5 - width / 2} fill="none" stroke={color} strokeWidth={width} />
    </svg>
  );
}

interface MapLegendProps {
  model: MapModel;
  tokens: MapTokens;
  colorBy: ColorBy;
  /** label of the highlighted topic (Topic mode paints its members blue) */
  groupLabel: string | null;
  /** lens whose neighbors are ringed and connected, when a paper is selected */
  lensLabel: string | null;
  filtered: boolean;
  cited: CitedInfo | null;
  attentionFlags: readonly PaperFlag[];
  /**
   * Small screens: one line of keys, full width. The selection key and the
   * projection caveat drop out (the panel and the header info tip carry them).
   */
  compact?: boolean;
}

export function MapLegend({ model, tokens, colorBy, groupLabel, lensLabel, filtered, cited, attentionFlags, compact = false }: MapLegendProps) {
  const neutralDot = <Swatch color={rgba(tokens.pointNeutral, tokens.pointNeutralAlpha)} shape="dot" />;
  return (
    <div
      data-map-obstacle
      className={`pointer-events-auto absolute rounded-xl border border-gray-200 bg-white/95 text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300 ${
        compact ? 'bottom-2 left-2 right-2 px-2.5 py-1.5 text-[11px]' : 'bottom-2 left-2 max-w-[calc(100%-4.5rem)] px-3 py-2 text-xs sm:max-w-[26rem]'
      }`}
    >
      {colorBy === 'year' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Color: publication year">
          <span className="inline-flex items-center gap-1.5">
            <span className="tabular-nums">{model.yearMin}</span>
            <span className={`h-2.5 rounded-sm ${compact ? 'w-16' : 'w-24'}`} style={{ background: rampGradientCss(tokens.yearRamp) }} aria-hidden />
            <span className="tabular-nums">{model.yearMax}</span>
          </span>
          {model.noYearCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={tokens.neutral} shape="ring" /> No year{compact ? '' : ` (${formatCount(model.noYearCount)})`}
            </span>
          )}
        </div>
      )}
      {colorBy === 'cited' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Color: answers citing the paper">
          <span className="text-gray-500 dark:text-gray-400">Cited in</span>
          {CITED_BIN_LABELS.map((label, k) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Swatch color={tokens.citedRamp[k]} shape="dot" />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            {neutralDot} Not cited
          </span>
          {!compact && cited && (
            <span className="text-gray-500 dark:text-gray-400">
              {formatCount(cited.citedCount)} distinct papers in {formatCount(cited.nAnswers)} answers (copies count once)
            </span>
          )}
        </div>
      )}
      {colorBy === 'attention' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Color: needs attention">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Swatch color={tokens.series[0]} shape="dot" />
            <span className="truncate">{attentionFlags.length ? attentionFlags.map((f) => FLAG_LABEL[f]).join(', ') : 'No flags selected'}</span>
            {!compact && attentionFlags.length > 0 && (
              <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{formatCount(countFlagged(model, attentionFlags))}</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {neutralDot} Others (faded)
          </span>
        </div>
      )}
      {colorBy === 'topic' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">{neutralDot} Paper</span>
          {groupLabel ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Swatch color={tokens.series[0]} shape="dot" />
              <span className="truncate">{truncate(groupLabel, compact ? 30 : 40)}</span>
            </span>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">{compact ? 'Labels name topics' : 'Labels name topics; hover one to highlight it'}</span>
          )}
        </div>
      )}
      {!compact && (lensLabel || filtered) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600 dark:text-gray-400">
          {lensLabel && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <RingGlyph width={2} color={tokens.ink} /> Selected
              </span>
              <span className="inline-flex items-center gap-1.5">
                <RingGlyph width={1.5} color={tokens.ink} /> Similar ({lensLabel})
              </span>
            </>
          )}
          {filtered && <span>Faded: outside the filters</span>}
        </div>
      )}
      {!compact && (
        <div className="mt-1 flex items-center gap-1 text-gray-500 dark:text-gray-400">
          <span>Near = similar; far apart is not a measure</span>
          <InfoTip text={PROJECTION_CAVEAT} label="How to read this map" />
        </div>
      )}
    </div>
  );
}

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onLocate,
  compact = false,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onLocate?: () => void;
  /** small screens: top-right, clear of the full-width legend (pinch zoom is primary there) */
  compact?: boolean;
}) {
  return (
    <div
      data-map-obstacle
      className={`absolute right-2 flex flex-col gap-0.5 rounded-xl border border-gray-200 bg-white/95 p-0.5 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 ${
        compact ? 'top-2' : 'bottom-2'
      }`}
    >
      <IconButton label="Zoom in (+)" onClick={onZoomIn}>
        <Plus className="h-4 w-4" />
      </IconButton>
      <IconButton label="Zoom out (−)" onClick={onZoomOut}>
        <Minus className="h-4 w-4" />
      </IconButton>
      <IconButton label="Show the whole map (0)" onClick={onReset}>
        <Maximize2 className="h-4 w-4" />
      </IconButton>
      {onLocate && (
        <IconButton label="Center on the selected paper" onClick={onLocate}>
          <Crosshair className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  );
}
