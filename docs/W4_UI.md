# W4 UI: the bibliography screens

Frontend for the backend contract in `ARC-w4/docs/W4_BIBLIOGRAPHY.md` (branch `feat/w4-bibliography`).
Branch `feat/w4-ui`, from `main` @ a70b825.

**Status.** It type-checks (`npx tsc -b --noEmit`), builds (`npm run build`) and passes `eslint` on the new files.
It has **not been run**: no dev server, browser, backend or tests, by instruction. Expect first-contact bugs, most
likely in the parts that depend on exact response shapes (listed under "Risks").

## Where it lives

A new **Bibliography** page, reached from the header nav and the sidebar (collapsed and expanded). One screen,
seven tabs (`role="tablist"`, arrow keys / Home / End move between them):

| Tab | What it does | Contract |
|---|---|---|
| Library | `GET /library`: PDF papers and reference-only entries in one list, search, kind filter, "missing any of" filter (metadata quality), sort, pagination, hidden toggle. Coverage stats and a nudge to the backfill when most papers lack a DOI. Add a reference, edit metadata, remove a reference. | 7.1 |
| Import | Five numbered steps: upload, report (readable or JSON, plus Markdown/JSON download), optional Crossref enrichment (polled), cleaned-file download (RIS / BibTeX / CSL-JSON), commit. Earlier imports can be reopened. | 7.2 |
| Export | Format, scope, options, a preview (`/export/preview`) and the download. | 7.3 |
| Duplicates | Groups with winner, reasons, evidence, per-group accept / reject / undo, batch accept / reject, and a bulk "same file / re-upload at 98%+" action. "Similar, your call" review pairs with no accept button. | 7.4 |
| Metadata backfill | Status, thresholds, crossref stats, report by band (accept / review / verified / no match / no evidence / error), per-item current vs Crossref vs what will be written, select and apply. The lookup itself is a backend script: the tab shows the command when no report exists. | 7.5 |
| Zotero | Connect (key, library type and id), status, sync options (direction, dry run, opt-in push, max push, policy), job progress, result, parked conflicts with resolve, disconnect. | 7.6 |
| What should I cite | List mode and position mode, ranked results with the verbatim quote, section, page, "Open PDF at p. N", formatted citation, copy buttons, flags. | 7.7 |

The old **Library** page (`LibraryPage.tsx`, `GET /papers`) is untouched and still the page behind "Library". It does
not know about reference-only entries; the Bibliography > Library tab does. Whether to replace one with the other is
left to whoever merges (see "Not done").

## Files

New:

* `src/types/bibliography.ts`: every request and response type from section 7 (snake_case, as the backend sends them).
* `src/services/bibliographyApi.ts`: all `/bibliography` calls. Imports `API_BASE`, `getAuthHeaders` and `ApiError`
  from `api.ts`. Downloads fetch a blob with the bearer token and `saveBlob()` it (a plain `<a href>` would 403).
* `src/components/Bibliography/`
  * `BibliographyPage.tsx` the tab shell. `index.ts` exports it.
  * `LibraryTab.tsx`, `ImportTab.tsx` (+ `ImportReportView.tsx`), `ExportTab.tsx`, `DedupeTab.tsx`, `BackfillTab.tsx`,
    `ZoteroTab.tsx`, `CiteTab.tsx`.
  * `EntryDialogs.tsx` entry detail / edit / remove, and create-a-reference. Used by the Library, Duplicates, Zotero tabs.
  * `ui.tsx` shared Button, Badge, Banner, Modal (focus trap, Escape, focus restore), ConfirmDialog, Pager, ShowMore,
    Collapsible, CopyButton, CitationText. `util.ts`, `hooks.ts` (`useDebounced`, `usePolling`), `tabs.ts`,
    `useCiteStyles.ts` (fetches `GET /cite/styles` once).

Edited (navigation only):

* `src/services/api.ts`: `export` added to `API_BASE` and `getAuthHeaders` (2 lines; nothing else).
* `src/types/index.ts`, `src/context/AppContext.tsx`: `'bibliography'` added to the `activePage` union (4 occurrences, no logic).
* `src/App.tsx`: import and one render line.
* `src/components/Header.tsx`: one nav item (the header is where the page nav is; `Sidebar.tsx` alone would not do).
* `src/components/Sidebar.tsx`: a Bibliography button in the collapsed and the expanded sidebar.

No dependency was added.

## Decisions

* **Not-searchable is always visible.** Every reference-only entry carries an amber "Reference only, not searchable by
  content" badge (library rows, dialogs, duplicate members, citation results). PDF papers carry a green one.
* **Nothing is added until commit.** The import screen opens with a banner saying so, the steps are numbered with commit
  last, and commit is behind a confirmation that states the count. After commit the banner turns into the result.
* **Accepting only hides.** The Duplicates tab opens with a banner saying accepting never deletes a file; each Accept button reads
  "Accept: hide N duplicates"; the bulk confirmation repeats it; every decision has an Undo.
* **Downloads** use fetch + blob + `saveBlob()`; file names are chosen client-side (`arc-library.ris|bib|json`,
  `<import>-cleaned.<ext>`, `<import>-report.json|md`) because `Content-Disposition` is not readable.
* **Errors.** `bibliographyApi.ts` has its own error reader: `api.ts`'s `handleResponse` would show FastAPI's 422 `detail`
  array and the import `{message, warnings}` object as "[object Object]". It still throws `ApiError`.
* **Backfill selection is explicit.** Apply sends `paper_ids` = exactly the checked papers and `decisions` = `accept` for each,
  so the result is what was ticked whatever the band. "Select every change in this band" pages through the report (500 per
  call) to collect ids, so "apply all accepted" does not need the user to tick thousands of rows.
* **Duplicates are updated locally after a decision.** The server drops its cached report on each decision, so reloading
  would recompute it every click. The list is edited in place; "Recompute report" reloads on request. Changes made in
  other tabs reload this one.
* **Citation style change re-formats** the current results via `POST /cite/format` (no re-ranking).
* **Clipboard.** `copyText` accepts a promise, using `ClipboardItem` where available, so "Copy BibTeX" (which must fetch
  the entry first) still works inside the click in Safari. Falls back to a hidden textarea on plain http.
* **Citation `html`** is rendered as React nodes (only `<i>` and `<b>` honoured, entities decoded), never with
  `dangerouslySetInnerHTML`.
* **Tabs stay mounted** once visited (hidden), so an unfinished import, typed paragraph or running sync survives a tab
  switch. A `version` counter, bumped when a tab changes the library, makes the others reload.
* **Accessibility.** Every control has a visible label or `aria-label`; tabs, radio groups and segmented controls use roles
  and arrow keys; dialogs trap focus, close on Escape and return focus; focus rings are visible (`focus-visible`);
  progress and results are in `aria-live` regions; tables have captions and `scope`; lists of results are real lists.

## Where the contract was ambiguous, and what was chosen

1. **Clearing a field** (PATCH): only changed fields are sent; a cleared text field is sent as `""`, a cleared year as `null`.
   The contract does not say whether the overlay treats `""` as "clear" or "ignore" for a PDF paper.
2. **Undo on a rejected group.** `undo` is documented as "un-hide"; the Undo button on a *rejected* group sends it too
   ("propose this group again"), assuming it resets the decision. The decisions list has an `undone` status, which suggests it does.
3. **Group winner chosen by hand.** The request needs `winner_id` and `loser_ids`; losers are all other members. The "reasons"
   shown are for the proposed winner, so they are replaced with a warning when another member is picked.
4. **Bulk "98%+" action.** The contract says "a bulk action using the batch endpoint". It fetches every pending `alias` and
   `suffix` group (500 per page), keeps `confidence >= 0.98` and drops any flagged `different_dois`, shows the count, then
   batches in chunks of 100.
5. **Backfill apply** (`paper_ids` + `decisions`): relies on `paper_ids` restricting the run and `decisions: accept`
   overriding the band, as `eligible_items` in `metadata_backfill.py` does. Per-row "Reject" is the unchecked box; the
   file's own `decision: reject` is only displayed.
6. **Zotero `last_sync_summary`** is typed loosely (`pulled` / `pushed` count objects) and shown if it has that shape.
   The `api_key_hint` is displayed as returned ("key ending ...9f3a"); the key itself is never held after submit.
7. **Disconnect under `source: environment`.** The server's `DELETE /zotero/connect` only forgets the database key, so the
   dialog says the connection stays active while `.env` supplies a key.
8. **Position mode.** The contract suggests "select a sentence". The UI offers a sentence list (rough regex splitter) and a
   "use the text I highlighted" button; the whole paragraph goes as `context`.
9. **Commit options** `link_matches` and `fill_library_from_import` are checkboxes; `record_ids` (commit a subset) is not exposed.
10. **Import `enrich` while `enriching`.** Polling stops after five consecutive failed polls (the server forgets job state on
    restart) and tells the user to reopen the import from "Earlier imports".
11. **Copy BibTeX** calls `POST /export` with `ids` and `include_incomplete: true`, so an entry with a file-name title still copies.

## Risks (things to look at first when this is run)

* Shapes the contract describes only in prose or with illustrative JSON: `enrichment[]` items, `report.thresholds`,
  `components`, `conflicts` in a backfill item, `errors[]` in a sync result, `last_sync_summary`. These are typed loosely and
  rendered defensively, but have not been seen for real.
* `GET /imports` summary objects are assumed to carry `summary`, `committed` and `format`.
* The first `GET /dedupe/report` computes the report (seconds); the tab shows a spinner but has no timeout handling.
* Large lists: import report sections reveal 50 rows at a time; the JSON view is cut at 200,000 characters (the download is complete).
* Lookbehind in the sentence splitter needs Safari 16.4+.

## Not done / left for later

* No tests, by instruction.
* The **old Library page** is unchanged and still lists only PDF papers. Making it the unified list, or redirecting it to the
  Bibliography tab, is a small follow-up (and `AppContext.papers` does not refresh after a dedupe hides a paper).
* **Selecting entries in the Library to export or cite** (`ids` in `/export`, `/cite/format` for many rows) is not wired; only
  the citation results use `ids`. The detail dialog formats one entry's citation in any style.
* **Commit a subset** of an import (`record_ids`), and **side-by-side comparison** of two entries for review pairs (the rows
  show both with a Details button each).
* **Run backfill from the UI** needs a backend job endpoint (contract section 10, item 4); the tab shows the command.
* **Overlay -> chat citations** and **hidden-ids in retrieval** are backend items (contract section 10, items 1 and 2).
* `exclude_ids` for recommendations has no UI.
* Paper deletion is not offered here (the contract says papers cannot be removed through this API).
