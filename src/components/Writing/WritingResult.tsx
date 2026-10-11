import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AnswerBody } from '../AnswerBody';
import { AnswerFooter, AnswerNotice } from '../ResponseCard';
import { SourcesPanel } from '../SourcesPanel';
import { Banner, CopyButton } from '../Bibliography/ui';
import { isAims, isIntro, isJournals, isOutline, isQuestions, messageFromResponse, parsedWriting, writingToMarkdown } from '../../lib/writing';
import { WRITING_TASK_LABEL, type WritingResponse } from '../../types/writing';
import { AimsView, OutlineView, QuestionsView } from './StructuredViews';
import { IntroCitationsView } from './IntroCitationsView';
import { JournalsView } from './JournalsView';

/**
 * One finished result: the structured view when the server recovered the
 * structure, the answer as written when it did not, a notice when the run was
 * refused, failed or unfinished. Keyed by the caller per result, so the
 * citation-style choice and the like start fresh with each one.
 */
export function WritingResult({ r, fromHistory }: { r: WritingResponse; fromHistory: boolean }) {
  const [formatted, setFormatted] = useState<Map<string, string> | undefined>();
  const message = useMemo(() => messageFromResponse(r), [r]);
  const w = parsedWriting(r);
  const generates = r.task === 'outline' || r.task === 'questions' || r.task === 'aims';

  // The journals result repeats its evidence statement as a warning; it is shown in the evidence box.
  const warnings = r.warnings.filter((x) => !(w && isJournals(w) && x === w.evidence.statement));

  return (
    <section aria-labelledby="writing-result-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="writing-result-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {WRITING_TASK_LABEL[r.task]}
          </h2>
          {fromHistory && <p className="text-xs text-gray-500 dark:text-gray-400">Opened from history. Run it again to refresh it against the current library.</p>}
        </div>
        {r.answer_status === 'ok' && <CopyButton text={writingToMarkdown(r, formatted)} label="Copy as Markdown" size="md" />}
      </div>

      {warnings.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 space-y-1" role="status">
          {warnings.map((x, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{x}</span>
            </div>
          ))}
        </div>
      )}

      {r.answer_status !== 'ok' ? (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <AnswerNotice message={message} />
        </div>
      ) : w ? (
        <>
          {isOutline(w) && <OutlineView w={w} r={r} />}
          {isQuestions(w) && <QuestionsView w={w} r={r} />}
          {isAims(w) && <AimsView w={w} r={r} />}
          {isIntro(w) && <IntroCitationsView w={w} r={r} onFormatted={setFormatted} />}
          {isJournals(w) && <JournalsView w={w} />}
        </>
      ) : (
        <>
          <Banner tone="warning" title="Shown as written">
            The structure could not be recovered from the model’s answer, so it is shown as it came, with its citations.
            {r.writing && 'reason' in r.writing && r.writing.reason ? ` (${r.writing.reason})` : ''}
          </Banner>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <AnswerBody content={r.answer} citations={r.citations} claims={r.claims} entailment={r.entailment} entailmentPending={r.entailment_pending} />
          </div>
        </>
      )}

      {generates && r.answer_status === 'ok' && <AnswerFooter message={message} />}
      {generates && r.answer_status === 'ok' && r.sources.length > 0 && (
        <SourcesPanel
          sources={r.sources}
          citations={r.citations}
          claims={r.claims}
          entailment={r.entailment}
          entailmentPending={r.entailment_pending}
          retrievalMode={r.retrieval_mode}
        />
      )}
    </section>
  );
}
