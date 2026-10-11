import { useRef, useState, type KeyboardEvent } from 'react';
import type { SectionRole } from '../../types';
import type { StripCell } from './barcode';
import { useElementSize } from './hooks';
import { formatPercent, sectionCode, sectionLabel } from './format';
import { RoleLegend } from './RoleLegend';
import { useTip } from './tip';
import { rampAt, rampGradientCss, textOnFill, type MapTokens } from './tokens';
import { FloatingTip } from './ui';

/** marginal section strips: one role-colored cell per row (paper A) / column (paper B) */
const STRIP = 6;
const STRIP_GAP = 4;

/** Fixed domain so colors mean the same thing in every comparison. */
const LO = 0.2;
const HI = 1.0;

function cellColor(v: number, tokens: MapTokens): string {
  return rampAt(tokens.heatRamp, (Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO));
}

export function SectionHeatmap({
  rows,
  cols,
  values,
  tokens,
  rowStrip,
  colStrip,
  roleLabel,
}: {
  rows: string[];
  cols: string[];
  values: Array<Array<number | null>>;
  tokens: MapTokens;
  /** paper A's sections, aligned with the rows */
  rowStrip: StripCell[];
  /** paper B's sections, aligned with the columns */
  colStrip: StripCell[];
  roleLabel: Record<SectionRole, string>;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const { tip, bind } = useTip();
  const [active, setActive] = useState<[number, number]>([0, 0]);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  if (!rows.length || !cols.length) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Nothing to compare: {!rows.length && !cols.length ? 'neither paper has' : !rows.length ? 'paper A has' : 'paper B has'} labeled
        section chunks.
      </p>
    );
  }

  const rowLabelW = width < 420 ? 84 : 128;
  const lead = rowLabelW + STRIP + STRIP_GAP;
  const cellW = Math.max(30, Math.min(64, Math.floor((Math.max(0, width - lead - 4) - 2 * (cols.length - 1)) / cols.length)));
  const cellH = Math.max(26, Math.min(34, Math.round(cellW * 0.62)));
  const showValues = cellW >= 36;
  const shortCols = cellW < 72;

  const focusCell = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(rows.length - 1, r));
    const cc = Math.max(0, Math.min(cols.length - 1, c));
    setActive([rr, cc]);
    cellRefs.current.get(`${rr}:${cc}`)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, r: number, c: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [r, c + 1],
      ArrowLeft: [r, c - 1],
      ArrowDown: [r + 1, c],
      ArrowUp: [r - 1, c],
      Home: [r, 0],
      End: [r, cols.length - 1],
    };
    const to = moves[e.key];
    if (to) {
      e.preventDefault();
      focusCell(to[0], to[1]);
    }
  };

  return (
    <div>
      <div ref={ref} className="w-full overflow-x-auto">
        <div role="grid" aria-label="Section by section similarity: rows are paper A, columns are paper B" className="inline-block">
          <div role="row" className="flex" style={{ paddingLeft: lead }}>
            {cols.map((c, j) => (
              <div
                key={`${c}-${j}`}
                role="columnheader"
                aria-label={`B: ${sectionLabel(c)}`}
                title={sectionLabel(c)}
                className="truncate px-0.5 pb-1 text-center text-[11px] font-medium text-gray-600 dark:text-gray-400"
                style={{ width: cellW, marginLeft: j ? 2 : 0 }}
              >
                {shortCols ? sectionCode(c) || sectionLabel(c).slice(0, 4) : sectionLabel(c)}
              </div>
            ))}
          </div>
          <div className="flex" style={{ paddingLeft: lead, marginBottom: STRIP_GAP }} aria-hidden>
            {cols.map((c, j) => {
              const cell = colStrip[j];
              return (
                <div
                  key={`${c}-${j}`}
                  {...bind(stripTip('B', cell, roleLabel))}
                  style={{
                    width: cellW,
                    height: STRIP,
                    marginLeft: j ? 2 : 0,
                    background: cell ? tokens.roleFill[cell.role] : tokens.hairline,
                    boxShadow: cell && tokens.roleBorder[cell.role] ? `inset 0 0 0 1px ${tokens.roleBorder[cell.role]}` : undefined,
                    borderTopLeftRadius: j === 0 ? 3 : 0,
                    borderBottomLeftRadius: j === 0 ? 3 : 0,
                    borderTopRightRadius: j === cols.length - 1 ? 3 : 0,
                    borderBottomRightRadius: j === cols.length - 1 ? 3 : 0,
                  }}
                />
              );
            })}
          </div>
          {rows.map((r, i) => (
            <div key={`${r}-${i}`} role="row" className="flex items-center" style={{ marginTop: i ? 2 : 0 }}>
              <div
                role="rowheader"
                title={sectionLabel(r)}
                className="truncate pr-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300"
                style={{ width: rowLabelW }}
              >
                {sectionLabel(r)}
              </div>
              <div
                aria-hidden
                {...bind(stripTip('A', rowStrip[i], roleLabel))}
                className="shrink-0"
                style={{
                  width: STRIP,
                  height: cellH,
                  marginRight: STRIP_GAP,
                  background: rowStrip[i] ? tokens.roleFill[rowStrip[i].role] : tokens.hairline,
                  boxShadow: rowStrip[i] && tokens.roleBorder[rowStrip[i].role] ? `inset 0 0 0 1px ${tokens.roleBorder[rowStrip[i].role]}` : undefined,
                  borderTopLeftRadius: i === 0 ? 3 : 0,
                  borderTopRightRadius: i === 0 ? 3 : 0,
                  borderBottomLeftRadius: i === rows.length - 1 ? 3 : 0,
                  borderBottomRightRadius: i === rows.length - 1 ? 3 : 0,
                }}
              />
              {cols.map((c, j) => {
                const v = values[i]?.[j];
                const has = typeof v === 'number' && Number.isFinite(v);
                const fill = has ? cellColor(v, tokens) : tokens.surface;
                const clamped = has && v < LO;
                const isActive = active[0] === i && active[1] === j;
                return (
                  <div
                    key={`${c}-${j}`}
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${i}:${j}`, el);
                      else cellRefs.current.delete(`${i}:${j}`);
                    }}
                    role="gridcell"
                    tabIndex={isActive ? 0 : -1}
                    aria-label={`A ${sectionLabel(r)} (${roleLabel[rowStrip[i]?.role ?? 'unlabeled']}) and B ${sectionLabel(c)} (${roleLabel[colStrip[j]?.role ?? 'unlabeled']}): ${has ? `cosine ${v.toFixed(3)}` : 'no value'}`}
                    onKeyDown={(e) => onKeyDown(e, i, j)}
                    onClick={() => setActive([i, j])}
                    {...bind(
                      <span>
                        <span className="font-semibold">{has ? v.toFixed(3) : '—'}</span> cosine
                        <br />
                        A: {sectionLabel(r)} · B: {sectionLabel(c)}
                        {clamped && (
                          <>
                            <br />
                            Below {LO.toFixed(1)}: drawn at the scale floor
                          </>
                        )}
                      </span>
                    )}
                    className="flex shrink-0 items-center justify-center rounded-[3px] text-[11px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900"
                    style={{
                      width: cellW,
                      height: cellH,
                      marginLeft: j ? 2 : 0,
                      background: fill,
                      boxShadow: has ? undefined : `inset 0 0 0 1px ${tokens.hairline}`,
                      color: has ? textOnFill(fill) : tokens.inkSecondary,
                    }}
                  >
                    {has ? (showValues ? v.toFixed(2) : '') : '—'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-2">
          <span className="tabular-nums">{LO.toFixed(1)}</span>
          <span className="h-2.5 w-28 rounded-sm" style={{ background: rampGradientCss(tokens.heatRamp) }} aria-hidden />
          <span className="tabular-nums">{HI.toFixed(1)}</span>
        </span>
        <span>Cosine of mean section vectors · fixed scale 0.2–1.0, lower values drawn at 0.2</span>
      </div>
      <div className="mt-2">
        <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">Edge strips: each section’s role (A down the rows, B across the columns)</div>
        <RoleLegend tokens={tokens} roleLabel={roleLabel} />
      </div>
      <FloatingTip tip={tip} />
    </div>
  );
}

function stripTip(side: 'A' | 'B', cell: StripCell | undefined, roleLabel: Record<SectionRole, string>) {
  if (!cell) return null;
  return (
    <span>
      <span className="font-semibold">
        {side}: {sectionLabel(cell.section)}
      </span>
      <br />
      {roleLabel[cell.role]}
      {cell.share > 0 ? ` · ${formatPercent(cell.share)} of the paper’s text` : ''}
    </span>
  );
}
