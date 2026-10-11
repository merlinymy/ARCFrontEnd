# W6 UI: the writing page, and one library

Frontend for `ARC-w6/docs/W6_WRITING.md` (backend branch `feat/w6-writing`). Branch `feat/w6-ui`, from
`integration/ui-2026-10` @ 2770463 (W3 answer UI and W4 bibliography UI included).

**Status.** `npx tsc -b --noEmit` and `npm run build` pass; `eslint` is clean on the new files. Not run: no dev
server, browser, backend or tests, by instruction. Expect first-contact bugs where the code leans on exact response
shapes (see "Risks").

## What was built

**Writing page** (header, collapsed and expanded sidebar). Pick one of the five tasks, paste text, optionally choose
papers and the active project, run.

* Outline, questions, aims run through `POST /writing/<task>/stream`. Progress reuses the chat's deep-run display
  (`RunDetails`: elapsed clock, tool-call list, papers read whole), the summarised reasoning, and the draft as it is
  written (`AnswerBody`, citations arriving ahead of their markers). Stop aborts the fetch.
* Intro citations and journals use the same stream (no model call): "matched 3 of 9 positions" / "comparing N related
  entries".
* **Result.** If `writing.parsed`, a structured view; otherwise the `answer` as written with its chips and a
  "Shown as written" note. A refused / failed / incomplete run shows the chat's notice. Every parsed line is its text
  with citation chips (`AnswerBody`: same hover quote, click opens the PDF at the page with the highlight), a
  "No library support" / "General knowledge" badge, and its entailment labels in words. The chat's answer footer
  (model, fallback, lookups, citation-check counts) and `SourcesPanel` sit below.
* **Gaps in the library** is an amber box at the top of outline and aims. Questions: "Questions the library cannot
  answer yet" (derived from `addressed_by_library === false`). Intro: "Sentences with no match in the library".
* **Intro citations**: per position its sentence, ranked references (reason, verbatim evidence quotes, "Open PDF at
  p. N" with the W3 highlight when the citation id matches, in-text copy), then the numbered reference list with
  formatted citations, copy per item and all, and a style picker (`useCiteStyles`) that re-formats through
  `POST /bibliography/cite/format` without re-running.
* **Journals**: evidence level and `statement` first, in words; a "thin evidence" note when `thin`/`none`; `limits`
  always shown; per journal count, share, years, the papers behind it; the entries with no journal, with a link to
  the bibliography.
* **Copy as Markdown**: outline/questions/aims export the answer with `⟦n⟧` turned into `[n]` plus a "Sources cited"
  appendix; intro and journals are built from their structure (intro uses the chosen citation style).
* **History**: results are saved as conversations (`persist`, default on, a checkbox in Options). They are in the
  sidebar and in the project's conversation list (open in chat, rendered as ordinary answers), and the page's
  "Recent writing" list (scoped to the active project) reopens one as the structured view
  (`GET /conversations/{id}`, last assistant message with `metadata.writing`).

**Unified library.** `LibraryPage` keeps its PDF grid, search, figures, upload unchanged and gains a "Show" select
(both / PDF only / reference-only only) and a "Reference-only entries" section from `GET /bibliography/library?kind=reference`,
with the same `SearchabilityBadge` ("Reference only, not searchable by content"), DOI, source, a Details button that
opens the bibliography's entry dialog, paging. The dedupe tab now calls `refreshPapers()` after every decision.

## Files

New: `types/writing.ts`, `services/writingApi.ts`, `lib/writing.ts`, `components/LibraryReferences.tsx`,
`components/Writing/` (`WritingPage`, `WritingForm`, `PaperPicker`, `WritingResult`, `StructuredViews`,
`IntroCitationsView`, `JournalsView`, `useWritingRun`, `form.ts`, `index.ts`).

Edited (small): `services/api.ts` (the SSE read loop of `queryPapersStream` extracted to an exported
`postEventStream`, behaviour unchanged; it also takes an abort signal), `context/AppContext.tsx` (`export` on
`reduceRun` / `RunEvent`), `ConversationThread.tsx` (`export RunDetails`), `ResponseCard.tsx` (`export AnswerFooter`,
`AnswerNotice`), `types/index.ts` (`'writing'` page), `App.tsx`, `Header.tsx`, `Sidebar.tsx`, `LibraryPage.tsx`,
`Bibliography/DedupeTab.tsx`.

## Decisions

* **State outlives the page.** `App` keeps `WritingPage` mounted (hidden) once opened, so a run of several minutes
  survives a look at the library. Run state is local to the page (`useWritingRun`), not in `AppContext`: the chat's
  streaming state is tied to one conversation thread and its placeholder message.
* **`answer_reset`** (backend commit a856530): handled as "discard streamed text and citations"; nothing reads
  `from_model` / `to_model`. The fallback model is shown from `served_model` / `fallback_used` (via `AnswerFooter`).
* **Paper picker** searches `GET /bibliography/library` (duplicates hidden). Model tasks take PDF papers only
  (reference ids would find nothing in `/query`-style retrieval), so it lists papers and drops any chosen
  reference-only entries with a note; the retrieval tasks take both.
* **Per-line labels.** `AnswerBody` pairs the k-th marker of a text with `claims[k]`; for one line the claims passed
  are its own `claim_indexes` (real indexes kept), so labels still match and a mismatch degrades to no label.
* **Recent writing** is recognised by the conversation title prefix `"<task label>: "` (W6 doc section 4), because the
  conversation list carries no metadata.
* New runs always start a new conversation; `conversation_id` (continuing a thread) is not exposed.
* PDF papers in the library page still come from `GET /papers`; see below.

## Not done / risks

* `GET /papers` does not hide dedupe losers (checked in `ARC-w6/backend/api/main.py`: no hidden filter). So after
  accepting a duplicate, `refreshPapers()` re-fetches but the PDF grid, the sidebar count and `state.papers` still
  include the hidden paper; the bibliography library and the reference section do hide it. Fixing that needs
  `/papers` to filter (backend) or the grid to move to `/bibliography/library`, which lacks `file_size_bytes` and
  `indexed_at` that `PaperCard` and the "Send PDFs" size check use.
* Writing messages opened from the sidebar or a project render in the chat as plain answers (chips, labels, no
  structure, no Markdown export); there is no "open in Writing" link from the chat.
* Not exposed: `exclude_ids`, `use_llm`, `rerank`, `conversation_id`.
* Untested against real model output: the parsed shapes follow the contract; `AimItem.other` and `extra_sections`
  are typed loosely and not rendered. The `hidden` wrapper in `App.tsx` relies on Tailwind 4's `[hidden]` preflight
  rule (present in the built CSS).
* Semantic search on the library page still reaches PDFs only; while it is active the reference section is filtered
  by the same words on title, author, journal, DOI.
