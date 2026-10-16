import { useMemo, useState } from 'react';
import { SourceCard } from './SourceCard';
import type { Citation, Claim, EntailmentReport, RetrievalMode, Source } from '../types';
import { indexEntailment } from '../lib/citations';

interface SourcesPanelProps {
  sources: Source[];
  /** Undefined for a stored pre-W3 answer. */
  citations: Citation[] | undefined;
  claims: Claim[];
  entailment: EntailmentReport | null | undefined;
  entailmentPending: boolean;
  retrievalMode: RetrievalMode | undefined;
}

interface Entry {
  key: string;
  source: Source;
  citations: Citation[];
}

/** A source for a citation that has none: a whole-PDF citation (`source_index` null). */
function sourceFromCitation(c: Citation): Source {
  return {
    paper_title: c.paper_title ?? 'Uploaded PDF',
    paper_id: c.paper_id ?? '',
    section_name: c.section_name,
    subsection_name: null,
    chunk_type: 'document',
    chunk_text: '',
    relevance_score: 0,
    page_start: c.page,
    page_end: c.page_end,
    doc_kind: c.doc_kind,
    book_title: c.book_title,
    chapter_label: c.chapter_label,
    chapter_title: c.chapter_title,
  };
}

const COLLAPSED_UNCITED = 3;

/**
 * The sources of one answer.
 *
 * A W3 answer's evidence is its citations, so the panel leads with the sources
 * that were actually cited, each with the verbatim passage(s) it was cited for,
 * their location and their entailment labels. Retrieved passages that were not
 * cited are still listed (they are what the model had in front of it), but
 * below, behind a toggle.
 *
 * A stored pre-W3 answer has no citations: it keeps the old list, in the order
 * its `[Source N]` numbers refer to.
 */
export function SourcesPanel({
  sources,
  citations,
  claims,
  entailment,
  entailmentPending,
  retrievalMode,
}: SourcesPanelProps) {
  const [showUncited, setShowUncited] = useState(false);
  const index = useMemo(() => indexEntailment(entailment), [entailment]);
  const wholePapers = retrievalMode === 'long_context';

  const { cited, uncited } = useMemo(() => {
    const bySource = new Map<number, Citation[]>();
    const orphan = new Map<string, Citation[]>();
    for (const c of citations ?? []) {
      if (c.source_index != null && sources[c.source_index]) {
        const list = bySource.get(c.source_index);
        if (list) list.push(c);
        else bySource.set(c.source_index, [c]);
      } else {
        const key = c.paper_id ?? `citation-${c.id}`;
        const list = orphan.get(key);
        if (list) list.push(c);
        else orphan.set(key, [c]);
      }
    }
    const cited: Entry[] = [
      ...[...bySource.entries()].map(([i, list]) => ({
        key: `source-${i}`,
        source: sources[i],
        citations: list,
      })),
      ...[...orphan.entries()].map(([key, list]) => ({
        key: `pdf-${key}`,
        source: sourceFromCitation(list[0]),
        citations: list,
      })),
    ].sort((a, b) => a.citations[0].id - b.citations[0].id);
    const uncited: Entry[] = sources
      .map((source, i) => ({ key: `source-${i}`, source, citations: [] as Citation[], i }))
      .filter(({ i }) => !bySource.has(i));
    return { cited, uncited };
  }, [citations, sources]);

  // Pre-W3 answers: the old list, unsorted so `[Source N]` matches position N.
  if (citations === undefined) {
    if (sources.length === 0) return null;
    return <LegacyList sources={sources} />;
  }

  if (cited.length === 0 && uncited.length === 0) return null;

  const heading =
    cited.length > 0
      ? `${wholePapers ? 'Papers read in full' : 'Sources'} (${cited.length} cited${
          !wholePapers && uncited.length > 0 ? `, ${sources.length} retrieved` : ''
        })`
      : `Sources (${sources.length} retrieved, none cited)`;
  const visibleUncited = showUncited ? uncited : [];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{heading}</h4>
      </div>

      {cited.length > 0 && (
        <div className="space-y-2">
          {cited.map((entry) => (
            <SourceCard
              key={entry.key}
              source={entry.source}
              badges={entry.citations.map((c) => c.id)}
              citations={entry.citations}
              claims={claims}
              entailment={index}
              entailmentPending={entailmentPending}
              showScore={!wholePapers}
            />
          ))}
        </div>
      )}

      {uncited.length > 0 && (
        <div className="mt-3">
          {visibleUncited.length > 0 && (
            <div className="space-y-2 mb-2">
              {visibleUncited.map((entry) => (
                <SourceCard key={entry.key} source={entry.source} showScore={!wholePapers} />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowUncited(!showUncited)}
            aria-expanded={showUncited}
            className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {showUncited
              ? 'Hide passages that were not cited'
              : `Show ${uncited.length} retrieved passage${uncited.length > 1 ? 's' : ''} that ${
                  uncited.length > 1 ? 'were' : 'was'
                } not cited`}
          </button>
        </div>
      )}
    </div>
  );
}

function LegacyList({ sources }: { sources: Source[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sources : sources.slice(0, COLLAPSED_UNCITED);
  const hidden = sources.length - COLLAPSED_UNCITED;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Sources ({sources.length} retrieved)
        </h4>
      </div>
      <div className="space-y-2">
        {visible.map((source, i) => (
          <SourceCard key={i} source={source} badges={[i + 1]} />
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          {showAll ? 'Show less' : `Show ${hidden} more source${hidden > 1 ? 's' : ''}...`}
        </button>
      )}
    </div>
  );
}
