import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, RefreshCw, Undo2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { decideDuplicates, decideDuplicatesBatch, downloadDedupeMarkdown, getDedupeReport, saveBlob } from '../../services/bibliographyApi';
import type { DedupeDecisionRequest, DedupeGroup, DedupeKind, DedupeMember, DedupeReport, DedupeReportQuery } from '../../types/bibliography';
import { EntryDetailDialog, SearchabilityBadge } from './EntryDialogs';
import { Badge, Banner, Button, Card, CheckboxField, Collapsible, ConfirmDialog, EmptyState, Pager, Spinner, Stat } from './ui';
import { authorsLine, errorMessage, focusRing, formatBytes, inputClass, labelClass, percent } from './util';
import type { BibliographyTabId } from './tabs';

const PAGE_SIZE = 25;
const BULK_MIN_CONFIDENCE = 0.98;

const KIND_LABEL: Record<DedupeKind, string> = {
  alias: 'Same file, different id',
  suffix: 'Re-upload (_2, _3)',
  doi: 'Same DOI',
  pmid: 'Same PMID',
  title: 'Similar title',
};

const FLAG_LABEL: Record<string, string> = {
  doi_titles_differ: 'same DOI but the titles differ (paper and its supplementary information?)',
  different_dois: 'different DOIs',
  size_equal: 'same file size',
  bytes_identical: 'files are byte-identical',
  title_match: 'titles match',
  preprint_pair: 'preprint and published version',
  first_author_differs: 'first author differs',
  year_differs: 'year differs',
  alias: 'Unicode alias',
};

type Decision = DedupeGroup['decision'];

function decisionBadge(decision: Decision) {
  if (decision === 'accepted') return <Badge tone="green">accepted: duplicates hidden</Badge>;
  if (decision === 'rejected') return <Badge tone="gray">rejected: not duplicates</Badge>;
  if (decision === 'partial') return <Badge tone="amber">partly decided</Badge>;
  return <Badge tone="blue">pending</Badge>;
}

function MemberLine({ member, onDetails }: { member: DedupeMember; onDetails: () => void }) {
  const { setViewingPdf } = useApp();
  const meta = [authorsLine(member.authors, 2), member.year].filter(Boolean).join(', ');
  return (
    <div className="min-w-0 flex-1 text-sm">
      <button type="button" onClick={onDetails} className={`text-left font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 break-words rounded ${focusRing}`}>
        {member.title || '(untitled)'}
      </button>
      {meta && <p className="text-gray-600 dark:text-gray-400 break-words">{meta}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <SearchabilityBadge searchable={member.full_text_searchable} />
        {member.kind === 'paper' && !member.pdf_opens && (
          <Badge tone="red" title="The PDF cannot be opened using this entry's id (for example a Unicode-normalisation alias)">
            PDF does not open from this id
          </Badge>
        )}
        {member.doi && <Badge>{member.doi}</Badge>}
        {member.suffix && <Badge>suffix {member.suffix}</Badge>}
        {!member.title_usable && <Badge tone="amber">title is a file name</Badge>}
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">
        {[
          member.filename && `file ${member.filename}`,
          member.kind === 'paper' && `${member.chunk_count} chunks`,
          formatBytes(member.size_bytes),
          member.cited_in_answers > 0 && `cited in ${member.cited_in_answers} ${member.cited_in_answers === 1 ? 'answer' : 'answers'}`,
          `metadata completeness ${member.metadata_completeness}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {member.kind === 'paper' && member.pdf_opens && (
        <Button size="sm" className="mt-1" onClick={() => setViewingPdf(member.entry_id)} aria-label={`Open PDF: ${member.title}`}>
          Open PDF
        </Button>
      )}
    </div>
  );
}

function GroupCard({
  group,
  winner,
  onWinner,
  selected,
  onSelect,
  busy,
  onDecide,
  onDetails,
}: {
  group: DedupeGroup;
  winner: string;
  onWinner: (id: string) => void;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  busy: boolean;
  onDecide: (action: 'accept' | 'reject' | 'undo') => void;
  onDetails: (id: string) => void;
}) {
  const losers = group.members.filter((m) => m.entry_id !== winner);
  const proposed = winner === group.proposed_winner;
  const decided = group.decision === 'accepted' || group.decision === 'rejected';
  return (
    <li className={`bg-white dark:bg-gray-800 border rounded-lg ${selected ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/60">
        {!decided && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select group: ${group.members[0]?.title ?? group.group_id}`}
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        )}
        <Badge tone="purple">{KIND_LABEL[group.kind] ?? group.kind}</Badge>
        <Badge tone={group.confidence >= 0.98 ? 'green' : group.confidence >= 0.9 ? 'blue' : 'amber'} title="How sure the matcher is that these are the same work">
          confidence {percent(group.confidence)}
        </Badge>
        {decisionBadge(group.decision)}
        <span className="text-xs text-gray-500 dark:text-gray-400">{group.members.length} entries</span>
        {group.flags
          .filter((f) => f !== group.kind)
          .map((f) => (
            <Badge key={f} tone={f === 'different_dois' || f === 'doi_titles_differ' || f.endsWith('differs') ? 'amber' : 'gray'}>
              {FLAG_LABEL[f] ?? f.replace(/_/g, ' ')}
            </Badge>
          ))}
      </div>

      <fieldset className="px-4 py-3">
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keep one entry visible; the others are hidden</legend>
        <ul className="space-y-2">
          {group.members.map((m) => {
            const isWinner = m.entry_id === winner;
            const id = `winner-${group.group_id}-${m.entry_id}`;
            return (
              <li key={m.entry_id} className={`flex gap-3 p-2.5 rounded-lg border ${isWinner ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="pt-0.5">
                  <input
                    id={id}
                    type="radio"
                    name={`winner-${group.group_id}`}
                    checked={isWinner}
                    disabled={decided || busy}
                    onChange={() => onWinner(m.entry_id)}
                    className="h-4 w-4 text-green-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label htmlFor={id} className="mb-1 inline-block">
                    {isWinner ? <Badge tone="green">Keep</Badge> : <Badge tone="gray">Hide</Badge>}
                    {m.entry_id === group.proposed_winner && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">proposed</span>}
                    <span className="sr-only">: {m.title}</span>
                  </label>
                  <div className="flex gap-3">
                    <MemberLine member={m} onDetails={() => onDetails(m.entry_id)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 space-y-1" aria-label="Why this entry is proposed">
          {proposed ? (
            group.winner_reasons.map((r) => (
              <p key={r.loser_id} className="flex gap-1.5">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-600" aria-hidden="true" />
                <span>{r.reason}</span>
              </p>
            ))
          ) : (
            <p className="text-amber-800 dark:text-amber-200">You chose a different entry to keep than the one proposed. The reasons above no longer apply: check the details before accepting.</p>
          )}
        </div>

        {group.evidence.length > 0 && (
          <details className="mt-2">
            <summary className={`text-sm text-gray-600 dark:text-gray-400 cursor-pointer rounded ${focusRing}`}>Evidence these are the same work ({group.evidence.length})</summary>
            <ul className="mt-1 text-xs text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-0.5">
              {group.evidence.map((e, i) => (
                <li key={i}>
                  {e.kind}, score {e.score.toFixed(2)}: {e.basis}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!decided && (
            <>
              <Button variant="primary" size="sm" loading={busy} icon={<Check className="w-3.5 h-3.5" aria-hidden="true" />} onClick={() => onDecide('accept')}>
                Accept: hide {losers.length === 1 ? '1 duplicate' : `${losers.length} duplicates`}
              </Button>
              <Button size="sm" disabled={busy} icon={<X className="w-3.5 h-3.5" aria-hidden="true" />} onClick={() => onDecide('reject')}>
                Reject: not duplicates
              </Button>
            </>
          )}
          {decided && (
            <Button size="sm" loading={busy} icon={<Undo2 className="w-3.5 h-3.5" aria-hidden="true" />} onClick={() => onDecide('undo')}>
              {group.decision === 'accepted' ? 'Undo: show the hidden entries again' : 'Undo: propose this group again'}
            </Button>
          )}
        </div>
      </fieldset>
    </li>
  );
}

export function DedupeTab({ version, onChanged, onNavigate }: { version: number; onChanged: () => void; onNavigate: (tab: BibliographyTabId) => void }) {
  const { showToast, refreshPapers } = useApp();
  const [decision, setDecision] = useState<'pending' | 'accepted' | 'rejected' | 'all'>('pending');
  const [kind, setKind] = useState<DedupeKind | ''>('');
  const [verifyBytes, setVerifyBytes] = useState(false);
  const [offset, setOffset] = useState(0);

  const [report, setReport] = useState<DedupeReport | null>(null);
  const [groups, setGroups] = useState<DedupeGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [winners, setWinners] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyGroups, setBusyGroups] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [bulkPlan, setBulkPlan] = useState<DedupeGroup[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      if (refresh) setComputing(true);
      const query: DedupeReportQuery = { decision, kind: kind || undefined, offset, limit: PAGE_SIZE, refresh, verify_bytes: verifyBytes };
      try {
        const res = await getDedupeReport(query);
        if (id !== requestId.current) return;
        setReport(res);
        setGroups(res.groups);
        setTotal(res.total_groups_matching);
        setSelected(new Set());
      } catch (e) {
        if (id === requestId.current) setError(errorMessage(e));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setComputing(false);
        }
      }
    },
    [decision, kind, offset, verifyBytes]
  );

  useEffect(() => {
    setOffset(0);
  }, [decision, kind, verifyBytes]);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Another tab changed the library (an import, Zotero sync or backfill can change what is a duplicate), so
  // reload. Changes made by this tab are already applied locally and must not trigger a reload: the server drops
  // its cached report on every decision, and the next load would recompute it.
  const seenVersion = useRef(version);
  const ownChange = useRef(false);
  useEffect(() => {
    if (seenVersion.current === version) return;
    seenVersion.current = version;
    if (ownChange.current) {
      ownChange.current = false;
      return;
    }
    void load(false);
  }, [version, load]);

  const notifyDecision = useCallback(() => {
    ownChange.current = true;
    onChanged();
    // A decision hides (or restores) papers: the app's cached paper list, which the library page, the
    // sidebar count and the PDF viewer read, must be fetched again.
    void refreshPapers();
  }, [onChanged, refreshPapers]);

  const winnerOf = useCallback((g: DedupeGroup) => winners[g.group_id] ?? g.proposed_winner, [winners]);

  const requestFor = useCallback(
    (g: DedupeGroup, action: DedupeDecisionRequest['action']): DedupeDecisionRequest => {
      const winner = winnerOf(g);
      return { group_id: g.group_id, kind: g.kind, action, winner_id: winner, loser_ids: g.members.filter((m) => m.entry_id !== winner).map((m) => m.entry_id) };
    },
    [winnerOf]
  );

  // The server drops its cached report on every decision, so reloading after each click would recompute the
  // whole report. The visible list is updated locally instead; "Recompute" refreshes it on request.
  const applyLocally = useCallback(
    (ids: string[], action: DedupeDecisionRequest['action']) => {
      const next: Decision = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : null;
      const idSet = new Set(ids);
      setGroups((cur) => {
        const updated = cur.map((g) => (idSet.has(g.group_id) ? { ...g, decision: next } : g));
        // A group that no longer matches the filter leaves the list.
        return updated.filter((g) => {
          if (!idSet.has(g.group_id)) return true;
          if (decision === 'all') return true;
          if (decision === 'pending') return g.decision === null || g.decision === 'partial';
          return g.decision === decision;
        });
      });
      setTotal((t) => (decision === 'all' ? t : Math.max(0, t - ids.length)));
      setSelected((cur) => {
        const n = new Set(cur);
        ids.forEach((i) => n.delete(i));
        return n;
      });
    },
    [decision]
  );

  const decideOne = async (g: DedupeGroup, action: DedupeDecisionRequest['action']) => {
    setBusyGroups((s) => new Set(s).add(g.group_id));
    try {
      await decideDuplicates(requestFor(g, action));
      applyLocally([g.group_id], action);
      showToast({
        type: 'success',
        message: action === 'accept' ? 'Duplicates hidden. No file was deleted.' : action === 'reject' ? 'Group rejected: it will not be proposed again' : 'Decision undone',
      });
      notifyDecision();
    } catch (e) {
      showToast({ type: 'error', message: errorMessage(e) });
    } finally {
      setBusyGroups((s) => {
        const n = new Set(s);
        n.delete(g.group_id);
        return n;
      });
    }
  };

  const runBatch = async (targets: DedupeGroup[], action: 'accept' | 'reject') => {
    setBatchBusy(true);
    const applied: string[] = [];
    const failed: string[] = [];
    try {
      for (let i = 0; i < targets.length; i += 100) {
        const chunk = targets.slice(i, i + 100);
        const res = await decideDuplicatesBatch(chunk.map((g) => requestFor(g, action)));
        applied.push(...res.applied.map((a) => a.group_id));
        failed.push(...res.errors.map((er) => `${er.group_id}: ${er.error}`));
      }
    } catch (e) {
      failed.push(errorMessage(e));
    }
    if (applied.length > 0) {
      applyLocally(applied, action);
      notifyDecision();
    }
    showToast({
      type: failed.length ? 'warning' : 'success',
      message: `${applied.length} ${applied.length === 1 ? 'group' : 'groups'} ${action === 'accept' ? 'accepted (duplicates hidden)' : 'rejected'}${failed.length ? `; ${failed.length} failed: ${failed[0]}` : ''}`,
      duration: failed.length ? 8000 : 4000,
    });
    setBatchBusy(false);
    setBulkPlan(null);
  };

  // "Accept every alias/suffix group at >= 98%" needs all groups, not just this page.
  const planBulk = async () => {
    setBulkLoading(true);
    setError(null);
    try {
      const found: DedupeGroup[] = [];
      for (const k of ['alias', 'suffix'] as const) {
        let off = 0;
        for (;;) {
          const res = await getDedupeReport({ decision: 'pending', kind: k, offset: off, limit: 500, verify_bytes: verifyBytes });
          found.push(...res.groups);
          off += res.groups.length;
          if (res.groups.length === 0 || off >= res.total_groups_matching) break;
        }
      }
      const eligible = found.filter((g) => g.confidence >= BULK_MIN_CONFIDENCE && !g.flags.includes('different_dois'));
      if (eligible.length === 0) showToast({ type: 'info', message: 'No pending alias or re-upload groups at 98% confidence or above' });
      else setBulkPlan(eligible);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBulkLoading(false);
    }
  };

  const selectedGroups = useMemo(() => groups.filter((g) => selected.has(g.group_id)), [groups, selected]);
  const selectable = useMemo(() => groups.filter((g) => g.decision !== 'accepted' && g.decision !== 'rejected'), [groups]);
  const allSelected = selectable.length > 0 && selectable.every((g) => selected.has(g.group_id));
  const sum = report?.summary;

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Accepting hides duplicates. It never deletes a file.">
        An accepted duplicate disappears from the library, exports and citation suggestions, and its missing fields (for example a DOI) are copied into the entry you keep. Its PDF, its search index and its record all stay, and you can undo any
        decision. Rejecting a group means "these are different works": it is not proposed again. Nothing here has happened until you press Accept.
      </Banner>

      {error && (
        <Banner tone="error" title="Could not load the duplicate report" actions={<Button size="sm" onClick={() => void load(false)}>Retry</Button>}>
          {error}
        </Banner>
      )}

      <Card className="p-4">
        <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" onSubmit={(e) => e.preventDefault()} aria-label="Duplicate report options">
          <div>
            <label htmlFor="dedupe-decision" className={labelClass}>
              Show groups that are
            </label>
            <select id="dedupe-decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)} className={inputClass}>
              <option value="pending">Pending (not yet decided)</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label htmlFor="dedupe-kind" className={labelClass}>
              Kind of evidence
            </label>
            <select id="dedupe-kind" value={kind} onChange={(e) => setKind(e.target.value as DedupeKind | '')} className={inputClass}>
              <option value="">All kinds</option>
              {(Object.keys(KIND_LABEL) as DedupeKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
            <Button icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />} loading={computing} onClick={() => void load(true)}>
              Recompute report
            </Button>
            <Button
              icon={<Download className="w-4 h-4" aria-hidden="true" />}
              onClick={async () => {
                try {
                  saveBlob(await downloadDedupeMarkdown(), 'arc-duplicates.md');
                } catch (e) {
                  showToast({ type: 'error', message: errorMessage(e) });
                }
              }}
            >
              Download (Markdown)
            </Button>
          </div>
          <div className="md:col-span-4">
            <CheckboxField
              checked={verifyBytes}
              onChange={setVerifyBytes}
              label="Compare re-uploaded files byte by byte"
              hint="Proves that name_2.pdf is identical to name.pdf. It reads the PDFs, so the report takes much longer."
            />
          </div>
        </form>
      </Card>

      {sum && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Duplicate report summary">
          <Stat label="Groups found" value={sum.groups} />
          <Stat label="Redundant entries" value={sum.redundant_entries} />
          <Stat label="Pending" value={sum.pending} />
          <Stat label="Accepted" value={sum.accepted} />
          <Stat label="Rejected" value={sum.rejected} />
          <Stat label="Similar, your call" value={sum.review_pairs} />
        </div>
      )}
      {report && report.unusable_title_count > 0 && (
        <Banner
          tone="warning"
          actions={
            <Button size="sm" onClick={() => onNavigate('backfill')}>
              Metadata backfill
            </Button>
          }
        >
          {report.unusable_title_count.toLocaleString()} entries have a file name instead of a title, so they are never matched on title. They need the metadata backfill, not a merge.
        </Banner>
      )}
      {sum && sum.unverified_suffix_pairs > 0 && !sum.bytes_verified && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {sum.unverified_suffix_pairs} pairs of files named like re-uploads (name_2.pdf) have different sizes and no matching title, so they are not listed as duplicates.
        </p>
      )}

      <section aria-labelledby="dedupe-groups-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="dedupe-groups-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Duplicate groups
          </h3>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Batch actions">
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={selectable.length === 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((g) => g.group_id)) : new Set())}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              Select all on this page
            </label>
            <Button size="sm" variant="primary" disabled={selectedGroups.length === 0 || batchBusy} loading={batchBusy} onClick={() => void runBatch(selectedGroups, 'accept')}>
              Accept selected ({selectedGroups.length})
            </Button>
            <Button size="sm" disabled={selectedGroups.length === 0 || batchBusy} onClick={() => void runBatch(selectedGroups, 'reject')}>
              Reject selected
            </Button>
            <Button size="sm" icon={<Copy className="w-3.5 h-3.5" aria-hidden="true" />} loading={bulkLoading} onClick={() => void planBulk()} disabled={batchBusy}>
              Accept all same-file / re-upload groups at 98%+
            </Button>
          </div>
        </div>

        <div aria-busy={loading}>
          {loading && groups.length === 0 && <Spinner label={computing ? 'Recomputing the report (this can take a few seconds)' : 'Loading the report (the first call computes it and can take a few seconds)'} />}
          {!loading && groups.length === 0 && !error && (
            <EmptyState icon={<Copy className="w-12 h-12" />} title={decision === 'pending' ? 'No pending duplicate groups' : 'No groups match'}>
              {decision === 'pending' ? 'Every group has been decided, or none were found.' : 'Try another filter.'}
            </EmptyState>
          )}
          {groups.length > 0 && (
            <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`} aria-label="Duplicate groups">
              {groups.map((g) => (
                <GroupCard
                  key={g.group_id}
                  group={g}
                  winner={winnerOf(g)}
                  onWinner={(id) => setWinners((w) => ({ ...w, [g.group_id]: id }))}
                  selected={selected.has(g.group_id)}
                  onSelect={(checked) =>
                    setSelected((cur) => {
                      const n = new Set(cur);
                      if (checked) n.add(g.group_id);
                      else n.delete(g.group_id);
                      return n;
                    })
                  }
                  busy={busyGroups.has(g.group_id) || batchBusy}
                  onDecide={(action) => void decideOne(g, action)}
                  onDetails={setOpenId}
                />
              ))}
            </ul>
          )}
          <Pager offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} disabled={loading} />
        </div>
      </section>

      {report && report.review_pairs.length > 0 && (
        <Collapsible title="Similar, your call" count={report.review_pairs.length} hint="Not proposed for merging. Compare them, then handle them by hand.">
          <p className="text-sm text-gray-600 dark:text-gray-400 py-2">These pairs look alike but not enough to merge safely (an added subtitle, a different year). There is no Accept button: open both and decide.</p>
          <ul className="space-y-3">
            {report.review_pairs.map((p, i) => (
              <li key={`${p.a.entry_id}-${p.b.entry_id}-${i}`} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MemberLine member={p.a} onDetails={() => setOpenId(p.a.entry_id)} />
                  <MemberLine member={p.b} onDetails={() => setOpenId(p.b.entry_id)} />
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {p.basis} (score {p.score.toFixed(2)}){p.flags.length ? `; ${p.flags.map((f) => FLAG_LABEL[f] ?? f.replace(/_/g, ' ')).join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {bulkPlan && (
        <ConfirmDialog
          title="Accept these groups?"
          confirmLabel={`Accept ${bulkPlan.length} groups`}
          busy={batchBusy}
          onConfirm={() => void runBatch(bulkPlan, 'accept')}
          onCancel={() => setBulkPlan(null)}
        >
          <p>
            <strong>{bulkPlan.length.toLocaleString()}</strong> pending groups are the same file under two ids, or a re-upload of a file, at {percent(BULK_MIN_CONFIDENCE)} confidence or more. The proposed entry is kept in each; the other{' '}
            <strong>{bulkPlan.reduce((n, g) => n + g.proposed_losers.length, 0).toLocaleString()}</strong> are hidden.
          </p>
          <p>No PDF, search index or record is deleted, and each decision can be undone. Winners you picked by hand on this page are used for the groups on this page.</p>
        </ConfirmDialog>
      )}

      {openId && <EntryDetailDialog entryId={openId} onClose={() => setOpenId(null)} onChanged={onChanged} />}
    </div>
  );
}
