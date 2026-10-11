import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { truncate } from './format';
import { useElementSize } from './hooks';
import type { TipState } from './tip';
import { rampAt, rampGradientCss, textOnFill, type MapTokens } from './tokens';
import { FloatingTip } from './ui';

const GAP = 2;

export interface MatrixHeatmapProps {
  /** accessible name of the grid */
  label: string;
  rowLabels: string[];
  colLabels: string[];
  /** color values, [row][col], on `domain` */
  values: number[][];
  domain: [number, number];
  tokens: MapTokens;
  /** diagonal cells drawn neutral, value as text (topic correlation) */
  neutralDiagonal?: boolean;
  /** text in a cell (drawn only when the cell is large enough) */
  cellText?: (i: number, j: number) => string | null;
  tooltip: (i: number, j: number) => ReactNode;
  /** screen-reader text for a cell */
  describe: (i: number, j: number) => string;
  onCellClick?: (i: number, j: number) => void;
  selected?: [number, number] | null;
  rowTitle?: string;
  colTitle?: string;
  minCell?: number;
  maxCell?: number;
  /** truncate axis labels to this many characters (full label in the tooltip) */
  labelChars?: number;
  legend?: ReactNode;
  formatDomain?: (v: number) => string;
}

/**
 * A square-cell heatmap in one sequential hue. One tab stop: arrow keys move the
 * active cell (aria-activedescendant), Enter opens it. Hover tooltips repeat
 * what the cell's accessible name says, so they enhance and never gate.
 */
export function MatrixHeatmap({
  label,
  rowLabels,
  colLabels,
  values,
  domain,
  tokens,
  neutralDiagonal = false,
  cellText,
  tooltip,
  describe,
  onCellClick,
  selected = null,
  rowTitle,
  colTitle,
  minCell = 12,
  maxCell = 44,
  labelChars = 28,
  legend,
  formatDomain = (v) => v.toFixed(2),
}: MatrixHeatmapProps) {
  const uid = useId();
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<[number, number]>([0, 0]);
  const [focused, setFocused] = useState(false);
  const [tip, setTip] = useState<TipState | null>(null);
  const nr = rowLabels.length;
  const nc = colLabels.length;
  const rowLabelW = Math.max(72, Math.min(190, Math.round(width * 0.28)));
  const cell = Math.max(minCell, Math.min(maxCell, Math.floor((Math.max(0, width - rowLabelW - 8) - GAP * (nc - 1)) / Math.max(1, nc))));
  const longest = Math.min(labelChars, Math.max(0, ...colLabels.map((c) => c.length)));
  const headerH = Math.min(150, Math.max(40, Math.round(longest * 6.4) + 10));
  const [d0, d1] = domain;

  const showTipAt = (el: Element, i: number, j: number) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 96;
    setTip({ x: r.left + r.width / 2, y: below ? r.bottom : r.top, below, content: tooltip(i, j) });
  };

  // event delegation: one handler for every cell
  const cellFromEvent = (e: PointerEvent<HTMLDivElement>): [Element, number, number] | null => {
    const el = (e.target as Element | null)?.closest?.('[data-cell]');
    if (!el) return null;
    const i = Number(el.getAttribute('data-i'));
    const j = Number(el.getAttribute('data-j'));
    return Number.isInteger(i) && Number.isInteger(j) ? [el, i, j] : null;
  };

  const body = useMemo(() => {
    const showText = cell >= 26;
    const span = d1 - d0 || 1;
    const fillOf = (i: number, j: number): string => {
      if (neutralDiagonal && i === j) return tokens.hairline;
      const v = values[i]?.[j];
      if (typeof v !== 'number' || !Number.isFinite(v)) return tokens.surface;
      return rampAt(tokens.heatRamp, (v - d0) / span);
    };
    return rowLabels.map((rl, i) => (
      <div key={`${i}-${rl}`} role="row" className="flex items-center" style={{ marginTop: i ? GAP : 0 }}>
        <div
          role="rowheader"
          title={rl}
          className="shrink-0 truncate pr-2 text-right text-gray-700 dark:text-gray-300"
          // rows are exactly one cell tall, so the grid stays square whatever the label size
          style={{ width: rowLabelW, height: cell, lineHeight: `${cell}px`, fontSize: cell < 16 ? 10 : 12 }}
        >
          {truncate(rl, labelChars)}
        </div>
        {colLabels.map((cl, j) => {
          const fill = fillOf(i, j);
          const text = showText ? (cellText?.(i, j) ?? null) : null;
          const isSel = selected != null && selected[0] === i && selected[1] === j;
          return (
            <div
              key={`${j}-${cl}`}
              id={`${uid}-${i}-${j}`}
              role="gridcell"
              aria-label={describe(i, j)}
              aria-selected={isSel}
              data-cell=""
              data-i={i}
              data-j={j}
              className="flex shrink-0 items-center justify-center rounded-[2px] text-[10px] tabular-nums"
              style={{
                width: cell,
                height: cell,
                marginLeft: j ? GAP : 0,
                background: fill,
                color: textOnFill(fill),
                boxShadow: isSel ? `0 0 0 2px ${tokens.ink}` : undefined,
                cursor: onCellClick ? 'pointer' : undefined,
              }}
            >
              {text}
            </div>
          );
        })}
      </div>
    ));
  }, [rowLabels, colLabels, values, d0, d1, tokens, cell, rowLabelW, selected, neutralDiagonal, labelChars, uid, describe, cellText, onCellClick]);

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const [i, j] = active;
    const to: Record<string, [number, number]> = {
      ArrowRight: [i, j + 1],
      ArrowLeft: [i, j - 1],
      ArrowDown: [i + 1, j],
      ArrowUp: [i - 1, j],
      Home: [i, 0],
      End: [i, nc - 1],
    };
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCellClick?.(i, j);
      return;
    }
    const next = to[e.key];
    if (!next) return;
    e.preventDefault();
    const ni = Math.max(0, Math.min(nr - 1, next[0]));
    const nj = Math.max(0, Math.min(nc - 1, next[1]));
    setActive([ni, nj]);
    const el = document.getElementById(`${uid}-${ni}-${nj}`);
    if (el) showTipAt(el, ni, nj);
  };

  if (!nr || !nc) return <p className="text-sm text-gray-600 dark:text-gray-400">Nothing to show.</p>;
  const [ai, aj] = active;

  return (
    <div>
      <div ref={ref} className="w-full overflow-x-auto">
        <div className="inline-block">
          {colTitle && (
            <div className="text-xs text-gray-500 dark:text-gray-400" style={{ paddingLeft: rowLabelW }}>
              {colTitle}
            </div>
          )}
          <div className="flex items-end" style={{ paddingLeft: rowLabelW, height: headerH }} aria-hidden>
            {colLabels.map((cl, j) => (
              <div
                key={`${j}-${cl}`}
                title={cl}
                className="flex shrink-0 justify-center overflow-hidden text-xs text-gray-700 dark:text-gray-300"
                style={{ width: cell, marginLeft: j ? GAP : 0, height: headerH }}
              >
                <span
                  className="block truncate pb-1"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: headerH, fontSize: cell < 16 ? 10 : 12, lineHeight: `${Math.min(cell, 16)}px` }}
                >
                  {truncate(cl, labelChars)}
                </span>
              </div>
            ))}
          </div>
          <div
            role="grid"
            aria-label={label}
            aria-rowcount={nr}
            aria-colcount={nc}
            tabIndex={0}
            aria-activedescendant={`${uid}-${ai}-${aj}`}
            onKeyDown={move}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setTip(null);
            }}
            onPointerOver={(e) => {
              const hit = cellFromEvent(e);
              if (hit) showTipAt(hit[0], hit[1], hit[2]);
            }}
            onPointerLeave={() => setTip(null)}
            onClick={(e) => {
              const el = (e.target as Element | null)?.closest?.('[data-cell]');
              if (!el) return;
              const i = Number(el.getAttribute('data-i'));
              const j = Number(el.getAttribute('data-j'));
              if (!Number.isInteger(i) || !Number.isInteger(j)) return;
              setActive([i, j]);
              onCellClick?.(i, j);
            }}
            className="relative rounded focus-visible:outline-none"
          >
            {body}
            {focused && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-[3px] ring-2 ring-blue-500"
                style={{ left: rowLabelW + aj * (cell + GAP) - 1, top: ai * (cell + GAP) - 1, width: cell + 2, height: cell + 2 }}
              />
            )}
          </div>
          {rowTitle && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{rowTitle}</div>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-2">
          <span className="tabular-nums">{formatDomain(d0)}</span>
          <span className="h-2.5 w-28 rounded-sm" style={{ background: rampGradientCss(tokens.heatRamp) }} aria-hidden />
          <span className="tabular-nums">{formatDomain(d1)}</span>
        </span>
        {legend}
      </div>
      <FloatingTip tip={tip} />
    </div>
  );
}
