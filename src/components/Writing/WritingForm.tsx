import { useId, type ReactNode } from 'react';
import { FolderKanban, Play, Square } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ANSWER_MODES, ANSWER_MODE_LABELS, type AnswerMode, type EffortLevel, type ResponseMode } from '../../types';
import type { CitationStyle } from '../../types/bibliography';
import { WRITING_TASKS, type WritingTask } from '../../types/writing';
import { Button, CheckboxField } from '../Bibliography/ui';
import { focusRing, inputClass, labelClass } from '../Bibliography/util';
import { STYLE_LABEL, useCiteStyles } from '../Bibliography/useCiteStyles';
import { PaperPicker } from './PaperPicker';
import type { WritingFormState } from './form';

const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const DEEP = ['develop', 'critique', 'draft'];
const DEFAULT_STANCE: Partial<Record<WritingTask, AnswerMode>> = { outline: 'draft', questions: 'critique', aims: 'draft' };

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

export function WritingForm({
  task,
  form,
  patch,
  maxChars,
  running,
  onRun,
  onStop,
}: {
  task: WritingTask;
  form: WritingFormState;
  patch: (p: Partial<WritingFormState>) => void;
  maxChars: number;
  running: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  const { state, setActiveProject } = useApp();
  const { styles } = useCiteStyles();
  const spec = WRITING_TASKS.find((t) => t.task === task)!;
  const generate = spec.kind === 'generate';
  const tooLong = form.text.length > maxChars;
  const canRun = form.text.trim().length >= 3 && !tooLong;
  const stance = form.mode || DEFAULT_STANCE[task] || 'draft';
  const deep = generate && DEEP.includes(stance);
  const textId = useId();
  const titleId = useId();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canRun && !running) onRun();
      }}
    >
      <div>
        <label htmlFor={textId} className={labelClass}>
          {spec.inputLabel}
        </label>
        <textarea
          id={textId}
          rows={9}
          value={form.text}
          onChange={(e) => patch({ text: e.target.value })}
          aria-describedby={`${textId}-hint`}
          aria-invalid={tooLong || undefined}
          className={inputClass}
        />
        <p id={`${textId}-hint`} className={`mt-1 text-xs ${tooLong ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}>
          {spec.inputHint} {form.text.length.toLocaleString()} of {maxChars.toLocaleString()} characters{tooLong ? ': too long, shorten it' : ''}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor={titleId} className={labelClass}>
            Working title <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span>
          </label>
          <input id={titleId} value={form.title} maxLength={300} onChange={(e) => patch({ title: e.target.value })} className={inputClass} />
        </div>
        <Field label="Project" hint="The result is saved to this project. A deep run also gets its notebook.">
          {(id) => (
            <div className="relative">
              <FolderKanban className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
              <select id={id} value={state.activeProjectId ?? ''} onChange={(e) => setActiveProject(e.target.value || null)} className={`${inputClass} pl-9`}>
                <option value="">None</option>
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>
      </div>

      {task === 'outline' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Sections" hint="One per line or comma-separated, up to 12. Empty means Introduction, Results, Discussion.">
            {(id) => <textarea id={id} rows={3} value={form.sections} onChange={(e) => patch({ sections: e.target.value })} className={inputClass} />}
          </Field>
          <Field label="Kind of paper" hint='For example "original research article" or "short communication".'>
            {(id) => <input id={id} value={form.paperType} maxLength={100} onChange={(e) => patch({ paperType: e.target.value })} className={inputClass} />}
          </Field>
        </div>
      )}
      {task === 'questions' && (
        <Field label="Audience" hint="The journal, venue or readers the reviewers represent.">
          {(id) => <input id={id} value={form.audience} maxLength={200} onChange={(e) => patch({ audience: e.target.value })} className={inputClass} />}
        </Field>
      )}
      {task === 'aims' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Number of aims">
            {(id) => (
              <select id={id} value={form.numAims} onChange={(e) => patch({ numAims: e.target.value })} className={inputClass}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Funding mechanism" hint='As you would state it, for example "R21". It only labels the skeleton.'>
            {(id) => <input id={id} value={form.mechanism} maxLength={100} onChange={(e) => patch({ mechanism: e.target.value })} className={inputClass} />}
          </Field>
        </div>
      )}
      {task === 'intro_citations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Citation style" hint="The server default when not chosen. You can change it on the result without re-running.">
            {(id) => (
              <select id={id} value={form.style} onChange={(e) => patch({ style: e.target.value as '' | CitationStyle })} className={inputClass}>
                <option value="">Server default</option>
                {styles.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="What the text is">
            {(id) => (
              <select id={id} value={form.inputKind} onChange={(e) => patch({ inputKind: e.target.value as WritingFormState['inputKind'] })} className={inputClass}>
                <option value="auto">Detect (bullets mean an outline)</option>
                <option value="paragraph">Paragraphs: every sentence is a position</option>
                <option value="outline">Outline: every line is a position</option>
              </select>
            )}
          </Field>
        </div>
      )}

      <PaperPicker picked={form.papers} onChange={(papers) => patch({ papers })} papersOnly={generate} />

      <details>
        <summary className={`text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer rounded ${focusRing}`}>Options</summary>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {generate && (
            <>
              <Field label="Stance" hint={deep ? 'Searches the library over several steps: often a minute or more.' : 'One retrieval pass: faster, less thorough.'}>
                {(id) => (
                  <select id={id} value={form.mode} onChange={(e) => patch({ mode: e.target.value as '' | AnswerMode })} className={inputClass}>
                    <option value="">Default ({ANSWER_MODE_LABELS[DEFAULT_STANCE[task] ?? 'draft']})</option>
                    {ANSWER_MODES.map((m) => (
                      <option key={m} value={m}>
                        {ANSWER_MODE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Effort" hint="Deep stances run at xhigh at least.">
                {(id) => (
                  <select id={id} value={form.effort} onChange={(e) => patch({ effort: e.target.value as EffortLevel })} className={inputClass}>
                    {EFFORTS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Length">
                {(id) => (
                  <select id={id} value={form.responseMode} onChange={(e) => patch({ responseMode: e.target.value as ResponseMode })} className={inputClass}>
                    <option value="detailed">Detailed</option>
                    <option value="concise">Concise</option>
                  </select>
                )}
              </Field>
              <Field label="Check the citations">
                {(id) => (
                  <select id={id} value={form.citationCheck} onChange={(e) => patch({ citationCheck: e.target.value as WritingFormState['citationCheck'] })} className={inputClass}>
                    <option value="">Server default</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                )}
              </Field>
              <div className="col-span-2 space-y-2">
                <CheckboxField checked={form.generalKnowledge} onChange={(v) => patch({ generalKnowledge: v })} label="Allow general knowledge" hint="Marked on each point it supports; never given a citation." />
                <CheckboxField checked={form.useProfile} onChange={(v) => patch({ useProfile: v })} label="Use my profile" />
              </div>
            </>
          )}
          {!generate && (
            <>
              <Field label="Published from">
                {(id) => <input id={id} inputMode="numeric" maxLength={4} value={form.yearMin} placeholder="year" onChange={(e) => patch({ yearMin: e.target.value })} className={inputClass} />}
              </Field>
              <Field label="Published up to">
                {(id) => <input id={id} inputMode="numeric" maxLength={4} value={form.yearMax} placeholder="year" onChange={(e) => patch({ yearMax: e.target.value })} className={inputClass} />}
              </Field>
              {task === 'intro_citations' ? (
                <>
                  <Field label="References per position">
                    {(id) => <input id={id} type="number" min={1} max={10} inputMode="numeric" value={form.refsPerPosition} placeholder="default" onChange={(e) => patch({ refsPerPosition: e.target.value })} className={inputClass} />}
                  </Field>
                  <Field label="Most positions to cite" hint="The server caps this too.">
                    {(id) => <input id={id} type="number" min={1} max={100} inputMode="numeric" value={form.maxPositions} placeholder="default" onChange={(e) => patch({ maxPositions: e.target.value })} className={inputClass} />}
                  </Field>
                </>
              ) : (
                <Field label="Most journals to list">
                  {(id) => <input id={id} type="number" min={1} max={25} inputMode="numeric" value={form.maxJournals} placeholder="8" onChange={(e) => patch({ maxJournals: e.target.value })} className={inputClass} />}
                </Field>
              )}
              <div className="col-span-2 space-y-2">
                <CheckboxField checked={form.includeReferences} onChange={(v) => patch({ includeReferences: v })} label="Include reference-only entries" hint="Matched on title and abstract only." />
                {task === 'intro_citations' && <CheckboxField checked={form.citeAll} onChange={(v) => patch({ citeAll: v })} label="Match every sentence" hint="Including very short ones and “we show…”." />}
              </div>
            </>
          )}
          <div className="col-span-2">
            <CheckboxField checked={form.persist} onChange={(v) => patch({ persist: v })} label="Save to history" hint="Stored as a conversation, so it is reachable from the sidebar and the project." />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <Button variant="secondary" icon={<Square className="w-4 h-4" aria-hidden="true" />} onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!canRun} icon={<Play className="w-4 h-4" aria-hidden="true" />}>
            {generate ? 'Write it' : 'Find it'}
          </Button>
        )}
        {running && <span className="text-xs text-gray-500 dark:text-gray-400">Stopping closes the connection; a result not yet saved will not appear in history.</span>}
      </div>
    </form>
  );
}
