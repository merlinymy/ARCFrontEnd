import { formatCount, formatPercent } from './format';
import { useElementSize } from './hooks';
import { useTip } from './tip';
import type { MapTokens } from './tokens';
import { FloatingTip } from './ui';

/** Rounded data-end (top), square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Papers per year: one series, slot-1 blue, no legend box (the heading names it). */
export function YearHistogram({ years, tokens }: { years: ArrayLike<number>; tokens: MapTokens }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const { tip, bind } = useTip();
  let lo = Infinity;
  let hi = -Infinity;
  let none = 0;
  for (let k = 0; k < years.length; k++) {
    const y = years[k];
    if (!y) {
      none++;
      continue;
    }
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const has = Number.isFinite(lo);
  const span = has ? hi - lo + 1 : 0;
  const binSize = span > 48 ? 5 : span > 28 ? 2 : 1;
  const start = has ? Math.floor(lo / binSize) * binSize : 0;
  const nBins = has ? Math.floor((hi - start) / binSize) + 1 : 0;
  const counts = new Array<number>(nBins).fill(0);
  for (let k = 0; k < years.length; k++) {
    const y = years[k];
    if (y) counts[Math.floor((y - start) / binSize)]++;
  }
  const max = Math.max(1, ...counts);
  const plotH = 64;
  const gap = 2;
  const barW = nBins ? Math.min(24, Math.max(1, (width - gap * (nBins - 1)) / nBins)) : 0;
  const used = nBins * barW + Math.max(0, nBins - 1) * gap;
  const offset = Math.max(0, (width - used) / 2);
  const binLabel = (b: number) => (binSize === 1 ? String(start + b * binSize) : `${start + b * binSize}–${start + b * binSize + binSize - 1}`);
  const summary = counts.map((c, b) => `${binLabel(b)}: ${c}`).join(', ');
  return (
    <div>
      <div ref={ref} className="w-full">
        {has && width > 0 ? (
          <svg width={width} height={plotH + 18} role="img" aria-label={`Papers per year. ${summary}${none ? `. No year: ${none}` : ''}`}>
            <line x1={0} x2={width} y1={plotH + 0.5} y2={plotH + 0.5} stroke={tokens.hairline} strokeWidth={1} />
            {counts.map((c, b) => {
              const h = c ? Math.max(2, (c / max) * (plotH - 4)) : 0;
              const x = offset + b * (barW + gap);
              return (
                <g key={b} {...bind(<span><span className="font-semibold">{formatCount(c)}</span> {c === 1 ? 'paper' : 'papers'} · {binLabel(b)}</span>)}>
                  <rect x={x} y={0} width={barW + gap} height={plotH} fill="transparent" />
                  {h > 0 && <path d={barPath(x, plotH - h, barW, h, 4)} fill={tokens.series[0]} />}
                </g>
              );
            })}
            <text x={offset} y={plotH + 14} fontSize={11} fill={tokens.inkSecondary}>
              {start}
            </text>
            <text x={offset + used} y={plotH + 14} fontSize={11} fill={tokens.inkSecondary} textAnchor="end">
              {start + (nBins - 1) * binSize + (binSize - 1)}
            </text>
          </svg>
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400">{has ? '' : 'No publication years.'}</div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{binSize > 1 ? `${binSize}-year bins` : 'Per year'} · peak {formatCount(max)}</span>
        {none > 0 && <span>No year: {formatCount(none)}</span>}
      </div>
      <FloatingTip tip={tip} />
    </div>
  );
}

/** Ranked counts as thin neutral bars (used for "top topics" of a structure type). */
export function RankedBars({
  rows,
  onSelect,
}: {
  rows: Array<{ key: string; label: string; count: number }>;
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onSelect?.(r.key)}
            disabled={!onSelect}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-1.5 py-1 text-left text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-gray-800"
          >
            <span className="truncate text-gray-800 dark:text-gray-200">{r.label}</span>
            <span className="text-xs tabular-nums text-gray-900 dark:text-gray-100">{formatCount(r.count)}</span>
            <span className="col-span-2 h-1 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
              <span className="block h-1 rounded-full bg-gray-500 dark:bg-gray-400" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * A topic's years as a tiny histogram on a SHARED year axis (same bins in every
 * row, so shapes compare); each row is scaled to its own peak -- the Papers column
 * carries the magnitude.
 */
export function YearSparkline({
  counts,
  start,
  binSize,
  noYear,
  tokens,
  width = 120,
  height = 22,
}: {
  counts: readonly number[];
  start: number;
  binSize: number;
  noYear: number;
  tokens: MapTokens;
  width?: number;
  height?: number;
}) {
  const { tip, bind } = useTip();
  const n = counts.length;
  const max = Math.max(1, ...counts);
  const gap = n > 30 ? 0.5 : 1;
  const w = n ? Math.max(1, (width - gap * (n - 1)) / n) : 0;
  const label = (b: number) => (binSize === 1 ? String(start + b) : `${start + b * binSize}–${start + b * binSize + binSize - 1}`);
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={width} height={height} role="img" aria-label={`Papers per year: ${counts.map((c, b) => `${label(b)} ${c}`).filter((_, b) => counts[b] > 0).join(', ')}`}>
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={tokens.hairline} strokeWidth={1} />
        {counts.map((c, b) => {
          const h = c ? Math.max(1.5, (c / max) * (height - 2)) : 0;
          const x = b * (w + gap);
          return (
            <g key={b} {...bind(<span><span className="font-semibold">{formatCount(c)}</span> · {label(b)}</span>)}>
              <rect x={x} y={0} width={w + gap} height={height} fill="transparent" />
              {h > 0 && <rect x={x} y={height - 1 - h} width={w} height={h} fill={tokens.series[0]} />}
            </g>
          );
        })}
      </svg>
      {noYear > 0 && (
        <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400" title={`${noYear} without a year`}>
          +{formatCount(noYear)}
        </span>
      )}
      <FloatingTip tip={tip} />
    </span>
  );
}

/**
 * Horizontal bars for a distribution: label, count and share. One series, so one
 * color (slot-1 blue unless a row carries its own identity color) and no legend box.
 */
export function BarList({
  rows,
  tokens,
  total,
  onSelect,
  selected,
  mono = false,
}: {
  rows: Array<{ key: string; label: string; count: number; color?: string; help?: string; meta?: string }>;
  tokens: MapTokens;
  total?: number;
  onSelect?: (key: string) => void;
  selected?: string | null;
  /** labels are raw pipeline values (section_name keys): monospace */
  mono?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const sum = total ?? rows.reduce((s, r) => s + r.count, 0);
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const active = selected === r.key;
        return (
          <li key={r.key}>
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(r.key)}
              aria-pressed={onSelect ? active : undefined}
              title={r.help}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-x-3 gap-y-1 rounded-md px-1.5 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default ${
                active ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 disabled:hover:bg-transparent dark:hover:bg-gray-800/70'
              }`}
            >
              <span className="truncate text-gray-800 dark:text-gray-200">
                <span className={mono ? 'font-mono text-[13px]' : undefined}>{r.label}</span>
                {r.meta && <span className="text-xs text-gray-500 dark:text-gray-400"> · {r.meta}</span>}
              </span>
              <span className="text-xs tabular-nums text-gray-900 dark:text-gray-100">{formatCount(r.count)}</span>
              <span className="text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">{sum ? formatPercent(r.count / sum) : ''}</span>
              <span className="col-span-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
                <span className="block h-1.5 rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: r.color ?? tokens.series[0] }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Papers per year for the Overview: every paper in scope (neutral) with the
 * subset ARC has cited (slot-1 blue) drawn over it from the same baseline, on one
 * count axis. Copies are counted once in both series.
 */
export function YearDistribution({
  years,
  citedYears,
  tokens,
  height = 150,
}: {
  /** one entry per distinct paper in scope; 0 = no year */
  years: ArrayLike<number>;
  /** the cited subset (same unit); null hides the series */
  citedYears: ArrayLike<number> | null;
  tokens: MapTokens;
  height?: number;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const { tip, bind } = useTip();
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < years.length; k++) {
    const y = years[k];
    if (!y) continue;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const has = Number.isFinite(lo);
  const span = has ? hi - lo + 1 : 0;
  const binSize = span > 60 ? 5 : span > 30 ? 2 : 1;
  const start = has ? Math.floor(lo / binSize) * binSize : 0;
  const nBins = has ? Math.floor((hi - start) / binSize) + 1 : 0;
  const all = new Array<number>(nBins).fill(0);
  const cited = new Array<number>(nBins).fill(0);
  for (let k = 0; k < years.length; k++) if (years[k]) all[Math.floor((years[k] - start) / binSize)]++;
  if (citedYears) for (let k = 0; k < citedYears.length; k++) if (citedYears[k]) cited[Math.floor((citedYears[k] - start) / binSize)]++;
  const max = Math.max(1, ...all);
  const axisW = 36;
  const plotW = Math.max(0, width - axisW);
  const gap = nBins > 40 ? 1 : 2;
  const barW = nBins ? Math.max(1, (plotW - gap * (nBins - 1)) / nBins) : 0;
  const label = (b: number) => (binSize === 1 ? String(start + b) : `${start + b * binSize}–${start + b * binSize + binSize - 1}`);
  const y = (v: number) => height - (v / max) * (height - 8);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const firstLabel = has ? String(start) : '';
  const lastLabel = has ? String(start + (nBins - 1) * binSize + (binSize - 1)) : '';
  return (
    <div>
      <div ref={ref} className="w-full">
        {has && width > 0 ? (
          <svg
            width={width}
            height={height + 18}
            role="img"
            aria-label={`Papers per year (${binSize > 1 ? `${binSize}-year bins` : 'per year'}): ${all
              .map((c, b) => (c ? `${label(b)} ${c}${citedYears ? ` (${cited[b]} cited)` : ''}` : ''))
              .filter(Boolean)
              .join(', ')}`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={axisW} x2={width} y1={y(t) + 0.5} y2={y(t) + 0.5} stroke={tokens.hairline} strokeWidth={1} />
                <text x={axisW - 6} y={y(t)} fontSize={11} fill={tokens.inkSecondary} textAnchor="end" dominantBaseline="middle">
                  {formatCount(t)}
                </text>
              </g>
            ))}
            {all.map((c, b) => {
              const x = axisW + b * (barW + gap);
              const hAll = c ? Math.max(1.5, height - y(c)) : 0;
              const hCited = cited[b] ? Math.max(1.5, height - y(cited[b])) : 0;
              return (
                <g
                  key={b}
                  {...bind(
                    <span>
                      <span className="font-semibold">{label(b)}</span>
                      <br />
                      {formatCount(c)} {c === 1 ? 'paper' : 'papers'}
                      {citedYears ? ` · ${formatCount(cited[b])} cited by ARC` : ''}
                    </span>
                  )}
                >
                  <rect x={x} y={0} width={barW + gap} height={height} fill="transparent" />
                  {hAll > 0 && <path d={barPath(x, height - hAll, barW, hAll, Math.min(3, barW / 2))} fill={tokens.neutral} />}
                  {citedYears && hCited > 0 && <path d={barPath(x, height - hCited, barW, hCited, Math.min(3, barW / 2))} fill={tokens.series[0]} />}
                </g>
              );
            })}
            <text x={axisW} y={height + 14} fontSize={11} fill={tokens.inkSecondary}>
              {firstLabel}
            </text>
            <text x={width} y={height + 14} fontSize={11} fill={tokens.inkSecondary} textAnchor="end">
              {lastLabel}
            </text>
          </svg>
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400">{has ? '' : 'No publication years in scope.'}</div>
        )}
      </div>
      <FloatingTip tip={tip} />
    </div>
  );
}
