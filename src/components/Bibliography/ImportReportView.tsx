import { useMemo, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { ImportRecordRef, ImportReport } from '../../types/bibliography';
import { Badge, Banner, Button, Collapsible, ShowMore, Stat } from './ui';
import { MISSING_LABEL, displayValue, doiUrl, percent } from './util';

const ISSUE_LABEL: Record<string, string> = {
  missing_title: 'no title',
  missing_authors: 'no authors',
  missing_year: 'no year',
  missing_journal: 'no journal',
};

function issueLabel(issue: string): string {
  if (issue.startsWith('invalid_doi:')) return `invalid DOI "${issue.slice('invalid_doi:'.length)}"`;
  return ISSUE_LABEL[issue] ?? issue.replace(/_/g, ' ');
}

function sourceLabel(source: string): string {
  if (source.startsWith('duplicate:')) return `from duplicate ${source.slice('duplicate:'.length)}`;
  if (source.startsWith('normalization:')) return `normalised (${source.slice('normalization:'.length)})`;
  if (source.startsWith('crossref:')) return `Crossref ${source.slice('crossref:'.length)}`;
  return source;
}

function RecordLine({ rec }: { rec: ImportRecordRef }) {
  const bits = [rec.first_author, rec.year].filter(Boolean).join(', ');
  return (
    <span className="break-words">
      <span className="text-gray-900 dark:text-gray-100">{rec.title || '(untitled)'}</span>
      {bits && <span className="text-gray-500 dark:text-gray-400"> · {bits}</span>}
      {rec.doi && (
        <>
          {' '}
          <a href={doiUrl(rec.doi)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            {rec.doi}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </>
      )}
      <span className="text-xs text-gray-400"> [{rec.rid}, entry {rec.source_index + 1} in the file]</span>
    </span>
  );
}

const itemClass = 'py-2 border-b border-gray-100 dark:border-gray-700/60 last:border-0 text-sm';

// The cleaning report as four lists the user can act on, plus the extras
// (library matches, problems, enrichment). Long lists reveal 50 rows at a time.
export function ImportReportView({ report, titleOf }: { report: ImportReport; titleOf: (rid: string) => string }) {
  const s = report.summary;
  const enrichmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of report.enrichment ?? []) counts[e.status] = (counts[e.status] ?? 0) + 1;
    return counts;
  }, [report.enrichment]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cleaning summary">
        <Stat label="Records in the file" value={s.input_records} />
        <Stat label="Records after cleaning" value={s.output_records} />
        <Stat label="Duplicates merged" value={s.duplicates_merged} />
        <Stat label="Fields filled" value={s.fields_filled} />
        <Stat label="Conflicts flagged" value={s.conflicts_flagged} tone={s.conflicts_flagged > 0 ? 'warn' : undefined} />
        <Stat label="Possible duplicates (not merged)" value={s.pairs_needing_review} tone={s.pairs_needing_review > 0 ? 'warn' : undefined} />
        <Stat label="Already in the library" value={s.matched_library_entries} />
        <Stat label="With problems" value={s.records_with_problems} tone={s.records_with_problems > 0 ? 'warn' : undefined} />
      </div>

      <Collapsible title="Duplicates merged" count={report.duplicate_groups.length} defaultOpen={report.duplicate_groups.length > 0 && report.duplicate_groups.length <= 20} hint="Records that were the same work and became one">
        <ShowMore
          items={report.duplicate_groups}
          noun="groups"
          empty={<p className="text-sm text-gray-500 dark:text-gray-400 pt-2">No duplicates were found in this file.</p>}
          render={(g) => (
            <div key={g.group_id} className={itemClass}>
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <Badge tone="green">kept</Badge>
                <RecordLine rec={g.kept} />
              </div>
              <ul className="ml-4 space-y-0.5">
                {g.merged.map((m) => (
                  <li key={m.rid} className="flex gap-1.5">
                    <Badge tone="gray">merged in</Badge>
                    <RecordLine rec={m} />
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Matched on {g.basis} (confidence {percent(g.confidence)}
                {g.edges[0]?.basis ? `: ${g.edges.map((e) => e.basis).join('; ')}` : ''})
              </p>
            </div>
          )}
        />
      </Collapsible>

      <Collapsible title="Fields filled" count={report.fields_filled.length} hint="Empty fields completed from a merged duplicate, normalisation or Crossref">
        <ShowMore
          items={report.fields_filled}
          noun="rows"
          empty={<p className="text-sm text-gray-500 dark:text-gray-400 pt-2">Nothing was filled.</p>}
          render={(f, i) => (
            <div key={`${f.rid}-${f.field}-${i}`} className={itemClass}>
              <span className="font-medium text-gray-900 dark:text-gray-100">{MISSING_LABEL[f.field as keyof typeof MISSING_LABEL] ?? f.field}</span>
              <span className="text-gray-500 dark:text-gray-400"> of </span>
              <span className="break-words">{titleOf(f.rid)}</span>
              <span className="text-gray-500 dark:text-gray-400"> set to </span>
              <code className="px-1 rounded bg-gray-100 dark:bg-gray-700 break-all">{displayValue(f.value)}</code>
              <span className="text-xs text-gray-500 dark:text-gray-400"> ({sourceLabel(f.source)})</span>
            </div>
          )}
        />
      </Collapsible>

      <Collapsible title="Conflicts" count={report.conflicts.length} defaultOpen={report.conflicts.length > 0 && report.conflicts.length <= 20} hint="Merged records disagreed: what was kept, what was discarded">
        <ShowMore
          items={report.conflicts}
          noun="conflicts"
          empty={<p className="text-sm text-gray-500 dark:text-gray-400 pt-2">No conflicting values.</p>}
          render={(c, i) => (
            <div key={`${c.rid}-${c.field}-${i}`} className={itemClass}>
              <p className="break-words">
                <span className="font-medium">{c.field}</span> of {titleOf(c.rid)}
              </p>
              <p className="text-xs mt-0.5">
                <Badge tone="green">kept</Badge> <code className="px-1 rounded bg-gray-100 dark:bg-gray-700">{displayValue(c.kept)}</code>{' '}
                <Badge tone="red">discarded</Badge> <code className="px-1 rounded bg-gray-100 dark:bg-gray-700">{displayValue(c.other)}</code>{' '}
                <span className="text-gray-500 dark:text-gray-400">
                  from {c.other_source}; {c.resolution.replace(/_/g, ' ')}
                </span>
              </p>
            </div>
          )}
        />
      </Collapsible>

      <Collapsible title="Possible duplicates not merged" count={report.review_pairs.length} defaultOpen={report.review_pairs.length > 0 && report.review_pairs.length <= 20} hint="Similar, but not sure enough to merge: your call">
        <ShowMore
          items={report.review_pairs}
          noun="pairs"
          empty={<p className="text-sm text-gray-500 dark:text-gray-400 pt-2">No uncertain pairs.</p>}
          render={(p, i) => (
            <div key={`${p.a.rid}-${p.b.rid}-${i}`} className={itemClass}>
              <p>
                <RecordLine rec={p.a} />
              </p>
              <p className="mt-0.5">
                <RecordLine rec={p.b} />
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {p.basis} (score {p.score.toFixed(2)}){p.flags.length > 0 ? `; ${p.flags.join(', ').replace(/_/g, ' ')}` : ''}. {p.action}.
              </p>
            </div>
          )}
        />
      </Collapsible>

      {report.library_matches.length > 0 && (
        <Collapsible title="Already in your library" count={report.library_matches.length} hint="On commit these are linked, not duplicated">
          <ShowMore
            items={report.library_matches}
            noun="matches"
            render={(m, i) => (
              <div key={`${m.rid}-${i}`} className={itemClass}>
                <span className="break-words">{titleOf(m.rid)}</span>
                <span className="text-gray-500 dark:text-gray-400"> matches </span>
                <span className="break-words font-medium">{m.library_title}</span>{' '}
                <Badge tone={m.has_pdf ? 'green' : 'amber'}>{m.has_pdf ? 'PDF paper' : 'reference only'}</Badge>
                <span className="text-xs text-gray-500 dark:text-gray-400"> ({m.basis})</span>
              </div>
            )}
          />
        </Collapsible>
      )}

      <Collapsible title="Records with problems" count={report.problems.length} hint="Missing or invalid fields that the cleaner could not fix">
        <ShowMore
          items={report.problems}
          noun="records"
          empty={<p className="text-sm text-gray-500 dark:text-gray-400 pt-2">No problems.</p>}
          render={(p) => (
            <div key={p.rid} className={itemClass}>
              <span className="break-words">{p.title || '(untitled)'}</span>
              <span className="text-xs text-gray-400"> [{p.rid}]</span>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {p.issues.map((issue) => (
                  <Badge key={issue} tone="amber">
                    {issueLabel(issue)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        />
      </Collapsible>

      {Object.keys(enrichmentCounts).length > 0 && (
        <Collapsible title="Crossref enrichment" count={report.enrichment.length} defaultOpen>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Object.entries(enrichmentCounts).map(([status, n]) => (
              <Badge key={status} tone={status === 'enriched' ? 'green' : 'gray'}>
                {status.replace(/_/g, ' ')}: {n.toLocaleString()}
              </Badge>
            ))}
          </div>
        </Collapsible>
      )}

      {Object.keys(report.normalizations ?? {}).length > 0 && (
        <Collapsible title="Normalisations applied" count={Object.keys(report.normalizations).length}>
          <ul className="text-sm pt-2 space-y-0.5">
            {Object.entries(report.normalizations).map(([name, n]) => (
              <li key={name}>
                {name.replace(/_/g, ' ')}: <strong>{n.toLocaleString()}</strong>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

const JSON_PREVIEW_LIMIT = 200_000;

export function ImportReportJson({ report }: { report: ImportReport }) {
  const [full, setFull] = useState(false);
  const text = useMemo(() => JSON.stringify(report, null, 2), [report]);
  const clipped = !full && text.length > JSON_PREVIEW_LIMIT;
  return (
    <div>
      <pre tabIndex={0} aria-label="Cleaning report as JSON" className="max-h-[32rem] overflow-auto p-3 text-xs rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
        {clipped ? text.slice(0, JSON_PREVIEW_LIMIT) : text}
      </pre>
      {clipped && (
        <Banner tone="info" className="mt-2" actions={<Button size="sm" icon={<ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />} onClick={() => setFull(true)}>Show all</Button>}>
          Showing the first {JSON_PREVIEW_LIMIT.toLocaleString()} of {text.length.toLocaleString()} characters. Download the JSON report to get all of it.
        </Banner>
      )}
    </div>
  );
}
