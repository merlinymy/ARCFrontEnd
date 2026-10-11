import type { SectionRole } from '../../types';
import { labelWidth, type BarcodeSegmentView } from './barcode';
import { useElementSize } from './hooks';
import { INFERRED_NOTE, NO_BODY_TEXT, formatPages, formatPercent, sectionCode, sectionLabel } from './format';
import { useTip } from './tip';
import { INFERRED_OPACITY, rgba, textOnFill, type MapTokens } from './tokens';
import { FloatingTip } from './ui';

const GAP = 2;

/**
 * Engineering view: a paper's sections as a strip in reading order -- width =
 * share of tokens, color = section role, inferred roles in the same hue at
 * reduced emphasis. 2 px surface gaps separate segments; short codes are printed
 * only when they fit with padding; every segment has a tooltip.
 */
export function SectionBarcode({
  segments,
  tokens,
  roleLabel,
  size = 'full',
  label = 'Section layout',
  showRaw = false,
}: {
  segments: BarcodeSegmentView[];
  tokens: MapTokens;
  roleLabel: Record<SectionRole, string>;
  /** 'full' segments are focusable with tooltips; 'mini' (list rows) are hover-only */
  size?: 'full' | 'mini';
  label?: string;
  /** Engineering: also name the raw section_name value the pipeline stored */
  showRaw?: boolean;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const { tip, bind } = useTip();
  const full = size === 'full';
  const height = full ? 22 : 8;
  const radius = full ? 4 : 3;
  const usable = Math.max(0, width - GAP * Math.max(0, segments.length - 1));
  if (!segments.length) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded border border-gray-300 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400 ${full ? 'h-[22px]' : 'h-2'}`}
        role="img"
        aria-label={`${label}: ${NO_BODY_TEXT}`}
        title={NO_BODY_TEXT}
      >
        {full ? NO_BODY_TEXT : null}
      </div>
    );
  }
  return (
    <>
      <div
        ref={ref}
        role={full ? 'list' : 'img'}
        aria-label={
          full
            ? label
            : `${label}: ${segments.map((s) => `${sectionLabel(s.section)} ${formatPercent(s.share)}${s.inferred ? ' (role inferred)' : ''}`).join(', ')}`
        }
        className="flex w-full"
        style={{ gap: GAP, height }}
      >
        {segments.map((s, i) => {
          const fill = tokens.roleFill[s.role];
          const border = tokens.roleBorder[s.role];
          const code = full ? sectionCode(s.section) : '';
          const showCode = code !== '' && labelWidth(code) + 10 <= usable * s.share;
          const pages = formatPages(s.pageStart, s.pageEnd);
          const raw = showRaw ? (s.section ?? 'null') : null;
          const description = `${sectionLabel(s.section)}${raw ? ` (${raw})` : ''}, ${roleLabel[s.role]}${s.inferred ? ' (inferred from content, no heading detected)' : ''}, ${formatPercent(s.share)} of text${pages ? `, ${pages}` : ''}`;
          return (
            <div
              key={i}
              role={full ? 'listitem' : undefined}
              tabIndex={full ? 0 : undefined}
              aria-label={full ? description : undefined}
              {...bind(
                <div>
                  <div className="font-semibold">{sectionLabel(s.section)}</div>
                  {raw && <div className="font-mono text-[11px] text-gray-300">section_name: {raw}</div>}
                  <div className="text-gray-300">
                    {roleLabel[s.role]} · {formatPercent(s.share)} of text
                    {pages ? ` · ${pages}` : ''}
                  </div>
                  {s.inferred ? (
                    <div className="mt-0.5 text-gray-300">{INFERRED_NOTE}</div>
                  ) : (
                    raw && <div className="mt-0.5 text-gray-300">Role from the section name (not inferred)</div>
                  )}
                  {s.subsections && s.subsections.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-gray-300">
                      {s.subsections.map((sub) => (
                        <li key={sub}>{sub}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              className="flex min-w-[2px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900"
              style={{
                flexGrow: s.share,
                flexShrink: 1,
                flexBasis: 0,
                // inferred: same hue at reduced emphasis; the 2 px gaps stay the surface color
                background: s.inferred ? rgba(fill, INFERRED_OPACITY) : fill,
                boxShadow: border ? `inset 0 0 0 1px ${border}` : undefined,
                borderTopLeftRadius: i === 0 ? radius : 0,
                borderBottomLeftRadius: i === 0 ? radius : 0,
                borderTopRightRadius: i === segments.length - 1 ? radius : 0,
                borderBottomRightRadius: i === segments.length - 1 ? radius : 0,
              }}
            >
              {showCode && (
                <span className="select-none text-[11px] font-semibold leading-none" style={{ color: s.inferred ? tokens.ink : textOnFill(fill) }} aria-hidden>
                  {code}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <FloatingTip tip={tip} />
    </>
  );
}
