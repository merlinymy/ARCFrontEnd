import type { SectionRole } from '../../types';
import { ROLE_ORDER, inferenceSummary } from './format';
import { INFERRED_OPACITY, rgba, type MapTokens } from './tokens';
import { InfoTip, Swatch } from './ui';

/** Key for section-role colors (passage map, compare section strips). */
export function RoleLegend({
  tokens,
  roleLabel,
  showInferred = false,
  inferenceAccuracy,
}: {
  tokens: MapTokens;
  roleLabel: Record<SectionRole, string>;
  /** add the "inferred" key (lighter = role predicted from content) */
  showInferred?: boolean;
  inferenceAccuracy?: number | null;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400" aria-label="Section roles">
      {ROLE_ORDER.map((r) => (
        <li key={r} className="inline-flex items-center gap-1.5">
          <Swatch color={tokens.roleFill[r]} border={tokens.roleBorder[r]} />
          {roleLabel[r]}
        </li>
      ))}
      {showInferred && (
        <li className="inline-flex items-center gap-1">
          <span className="inline-flex gap-px" aria-hidden>
            <Swatch color={rgba(tokens.roleFill.background, INFERRED_OPACITY)} />
            <Swatch color={rgba(tokens.roleFill.methods, INFERRED_OPACITY)} />
          </span>
          <span>Inferred</span>
          <InfoTip text={inferenceSummary(inferenceAccuracy)} label="About inferred roles" />
        </li>
      )}
    </ul>
  );
}
