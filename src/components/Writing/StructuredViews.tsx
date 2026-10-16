import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AnswerBody } from '../AnswerBody';
import { EntailmentBadge } from '../EntailmentBadge';
import { Badge, Banner } from '../Bibliography/ui';
import { claimsForText, SUPPORT_LABEL } from '../../lib/writing';
import type {
  AimItem,
  AimsWriting,
  OutlineWriting,
  QuestionItem,
  QuestionsWriting,
  WritingCounts,
  WritingResponse,
  WritingText,
} from '../../types/writing';

// ---------------------------------------------------------------------------
// One parsed line: its text with citation chips, how it is supported, its labels
// ---------------------------------------------------------------------------

/** The text of one parsed line. Its `⟦n⟧` markers become the same citation chips an answer has. */
export function Line({ text, r }: { text: WritingText; r: WritingResponse }) {
  return (
    <AnswerBody
      content={text.text}
      citations={r.citations}
      claims={claimsForText(text, r.claims)}
      entailment={r.entailment}
      entailmentPending={r.entailment_pending}
    />
  );
}

export function SupportBadge({ support }: { support: WritingText['support'] }) {
  if (support === 'library') return null;
  return <Badge tone={support === 'none' ? 'amber' : 'gray'}>{SUPPORT_LABEL[support]}</Badge>;
}

/** The entailment labels of this line's claims, in words (the chips also carry them, in colour and icon). */
function LineLabels({ text, r }: { text: WritingText; r: WritingResponse }) {
  const labels = (r.entailment?.labels ?? []).filter((l) => text.claim_indexes.includes(l.claim_index));
  if (labels.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 list-none p-0" aria-label="Citation check for this line">
      {labels.map((l) => (
        <li key={`${l.claim_index}:${l.citation_id}`} className="inline-flex items-baseline gap-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="tabular-nums">[{l.citation_id}]</span>
          <EntailmentBadge label={l} />
        </li>
      ))}
    </ul>
  );
}

function Point({ text, r }: { text: WritingText; r: WritingResponse }) {
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">
          <Line text={text} r={r} />
        </div>
        <SupportBadge support={text.support} />
      </div>
      <LineLabels text={text} r={r} />
    </li>
  );
}

function Counts({ counts }: { counts: WritingCounts }) {
  const total = counts.points ?? counts.texts ?? counts.library + counts.general_knowledge + counts.none;
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      {total} {total === 1 ? 'line' : 'lines'}: {counts.library} supported by the library, {counts.general_knowledge} from general knowledge, {counts.none} with no library support.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Gaps in the library
// ---------------------------------------------------------------------------

/** Prominent on purpose: what the library cannot yet support is the most useful thing a draft learns. */
export function GapsBox({ title = 'Gaps in the library', gaps, empty }: { title?: string; gaps: string[]; empty: string }) {
  if (gaps.length === 0) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400" role="note">
        {empty}
      </p>
    );
  }
  return (
    <section aria-label={title} className="rounded-lg border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-4">
      <h3 className="flex items-center gap-2 text-base font-semibold text-amber-900 dark:text-amber-100">
        <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
        {title} ({gaps.length})
      </h3>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-amber-950 dark:text-amber-50">
        {gaps.map((g, i) => (
          <li key={i} className="break-words">
            {g}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Heading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-base font-semibold text-gray-900 dark:text-gray-100">
      {children}
    </h3>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4';

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export function OutlineView({ w, r }: { w: OutlineWriting; r: WritingResponse }) {
  return (
    <div className="space-y-4">
      <GapsBox gaps={w.library_gaps} empty="The model listed no gaps in the library for this outline." />
      <Counts counts={w.counts} />
      {w.missing_sections.length > 0 && (
        <Banner tone="warning" title="Sections the model did not produce">
          {w.missing_sections.join(', ')}
        </Banner>
      )}
      {w.sections.map((s) => (
        <section key={s.index} aria-labelledby={`outline-${s.index}`} className={card}>
          <Heading id={`outline-${s.index}`}>{s.heading}</Heading>
          {s.summary && (
            <div className="mt-1 text-gray-700 dark:text-gray-300 italic">
              <Line text={s.summary} r={r} />
            </div>
          )}
          <ul className="mt-2 list-none p-0 divide-y divide-gray-100 dark:divide-gray-700/60">
            {s.points.map((p) => (
              <Point key={p.index} text={p} r={r} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

function AddressedBadge({ value }: { value: boolean | null }) {
  if (value === true) return <Badge tone="green">Addressed by the library</Badge>;
  if (value === false) return <Badge tone="amber">Not addressed by the library</Badge>;
  return <Badge>Library not assessed</Badge>;
}

function QuestionCard({ q, r }: { q: QuestionItem; r: WritingResponse }) {
  return (
    <li className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-gray-900 dark:text-gray-100 break-words min-w-0 flex-1">
          <span className="tabular-nums">{q.number}. </span>
          {q.question}
        </p>
        <AddressedBadge value={q.addressed_by_library} />
      </div>
      <div className="mt-3 space-y-2.5">
        {q.why && (
          <Labelled label="Why a reviewer asks">
            <Line text={q.why} r={r} />
          </Labelled>
        )}
        {q.library && (
          <Labelled label="What the library offers">
            <Line text={q.library} r={r} />
            <LineLabels text={q.library} r={r} />
          </Labelled>
        )}
        {q.needs && (
          <Labelled label="What the draft needs">
            <Line text={q.needs} r={r} />
          </Labelled>
        )}
      </div>
    </li>
  );
}

export function QuestionsView({ w, r }: { w: QuestionsWriting; r: WritingResponse }) {
  const unanswered = w.questions.filter((q) => q.addressed_by_library === false);
  // Questions come worst-first, grouped by theme in the order the themes first appear.
  const themes = w.themes.length ? w.themes : Array.from(new Set(w.questions.map((q) => q.theme ?? '')));
  const groups = themes
    .map((theme) => ({ theme, items: w.questions.filter((q) => (q.theme ?? '') === theme) }))
    .filter((g) => g.items.length > 0);
  const ungrouped = w.questions.filter((q) => !themes.includes(q.theme ?? ''));
  if (ungrouped.length) groups.push({ theme: '', items: ungrouped });

  return (
    <div className="space-y-4">
      <GapsBox
        title="Questions the library cannot answer yet"
        gaps={unanswered.map((q) => q.question)}
        empty="Every question has something in the library behind it."
      />
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {w.counts.questions} questions: {w.counts.addressed_by_library} addressed by the library, {w.counts.not_addressed_by_library} not. Listed worst first within each theme.
      </p>
      {groups.map((g, gi) => (
        <section key={gi} aria-label={g.theme || 'Other questions'} className="space-y-2">
          {g.theme && <Heading>{g.theme}</Heading>}
          <ol className="list-none p-0 space-y-2">
            {g.items.map((q) => (
              <QuestionCard key={q.index} q={q} r={r} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aims
// ---------------------------------------------------------------------------

function AimCard({ a, r }: { a: AimItem; r: WritingResponse }) {
  const fields: Array<[string, WritingText | null]> = [
    ['Objective', a.objective],
    ['Rationale', a.rationale],
    ['Approach', a.approach],
    ['Expected outcome', a.expected_outcome],
    ['Risk and alternatives', a.risk],
  ];
  return (
    <li className={card}>
      <Heading>
        Aim {a.number}
        {a.title ? `: ${a.title}` : ''}
      </Heading>
      <div className="mt-2 space-y-2.5">
        {fields.map(
          ([label, t]) =>
            t && (
              <Labelled key={label} label={label}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <Line text={t} r={r} />
                  </div>
                  <SupportBadge support={t.support} />
                </div>
                <LineLabels text={t} r={r} />
              </Labelled>
            )
        )}
      </div>
    </li>
  );
}

export function AimsView({ w, r }: { w: AimsWriting; r: WritingResponse }) {
  const single: Array<[string, WritingText | null]> = [
    ['Problem', w.problem],
    ['Gap', w.gap],
    ['Central hypothesis', w.hypothesis],
  ];
  return (
    <div className="space-y-4">
      <GapsBox gaps={w.library_gaps} empty="The model listed no gaps in the library for these aims." />
      <p className="text-sm text-gray-600 dark:text-gray-400">
        A skeleton to write from, not a finished page: it makes no claims about page limits, funding mechanisms or review criteria.
        {w.num_aims !== w.num_aims_requested && ` ${w.num_aims_requested} aims were requested; ${w.num_aims} came back.`}
      </p>
      <Counts counts={w.counts} />
      <div className={`${card} space-y-3`}>
        {single.map(
          ([label, t]) =>
            t && (
              <Labelled key={label} label={label}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <Line text={t} r={r} />
                  </div>
                  <SupportBadge support={t.support} />
                </div>
                <LineLabels text={t} r={r} />
              </Labelled>
            )
        )}
      </div>
      <ol className="list-none p-0 space-y-2" aria-label="Aims">
        {w.aims.map((a) => (
          <AimCard key={a.number} a={a} r={r} />
        ))}
      </ol>
      {w.outcomes && (
        <div className={card}>
          <Labelled label="Expected outcomes and impact">
            <Line text={w.outcomes} r={r} />
            <LineLabels text={w.outcomes} r={r} />
          </Labelled>
        </div>
      )}
    </div>
  );
}
