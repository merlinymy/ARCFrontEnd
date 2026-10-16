# W3 UI

Frontend for the W3 answer pipeline. The contract is `docs/W3_ANSWER_PIPELINE.md` on the backend branch
`feat/w3-answer-pipeline`. This is a breaking change: it needs that backend. Nothing here has been run, tested or
looked at in a browser; `tsc -b` and `npm run build` pass, and that is all that has been checked.

## What was built

**Citations in the answer.** `⟦n⟧` markers become small buttons ("chips"), in paragraphs, lists, tables, bold and
headings alike. `lib/citations.ts` tags each marker with its position and drops the whitespace before it; a remark
plugin in `AnswerBody.tsx` then replaces marker text in the parsed markdown tree. Hover or keyboard focus shows a
popover with the verbatim `cited_text`, paper title, location line ("p. 7 · Methods", "Ch. 4, p. 103") and the
entailment label. A mouse or keyboard click opens the PDF at the page with the passage highlighted. On touch, a tap pins
the popover, which holds the "Open PDF" button. `[Source N]` is still rendered for stored pre-W3 answers (those without
`metadata.citations`), as a neutral chip, without the old percentages.

**Streaming.** `citation` events fill the message's citations; `answer_reset` clears text and citations (and
records the declining model for `fallback`); `complete.answer` replaces the live text. The input is released at
`complete`, not when the stream closes, so the entailment pass (a few seconds) does not block the next question.

**Confidence.** The percentages and the min-per-source banner are gone. Entailment labels (Supported / Partially
supported / Unsupported, reason in the popover, in the sources panel and on hover) attach per (claim, citation) pair.
Before the event: a quiet "Checking citations…". On `error`: "Citation check unavailable". Never "verified". The footer
shows label counts, not a score.

**PDF viewer.** pdf.js replaces the iframe (lazy chunk). Single-page view with prev/next, page box, arrow keys, zoom,
download (`?download=true`), open in new tab. Highlight boxes come from `highlights[]`, else `bbox`; for `pdf_page` /
`none` only the page is shown. The cited quote is shown above the page, with a note when the location is approximate.
Boxes are drawn as percentages of the page (`bbox/1000`, top-left origin: see "Decisions").

**Sources panel.** Cited sources first, each with its quote(s), location line, book/chapter line and entailment
label(s); uncited retrieved passages sit behind a toggle. Long-context sources are whole papers (no score bar).
Figure thumbnails now come from cited sources only (all sources for old answers).

**Statuses.** `refused` / `error` / `incomplete` render as a notice (plain text, no citations, no sources). A quiet footer
shows "Answered by Opus 5" ("(fallback)" with the reason on hover), "Read the full papers", "Search was degraded"
(hybrid fallback), "May be cut off" (`max_tokens`), "Earlier turns trimmed", "Used your profile".

**Profile page** (`ProfilePage.tsx`): paragraph, facts (add/edit/delete), the exact injected message, size, truncation
and injection-disabled warnings. Per-message `Profile: on/off` switch under the question box (`use_profile`).

**Projects** (`ProjectBar.tsx`, `ProjectsPage.tsx`): switcher above the chat, link/unlink the current conversation,
create/edit/delete projects, read-only notebook viewer (files, contents, delete file). `project_id` is sent with every
query while a project is active.

**Deep modes**: a running clock, lookups so far, passages found, the last four tool calls in plain words, "Writing the
final answer" on `deep_final_turn`, pauses. Finished runs list their tool calls under Pipeline Details.

## Decisions (ambiguities in the contract)

- **`bbox_units` / `bbox_origin`**: the contract doc only says "per-mille of page, top-left origin"; the names live on the
  backend paper record (`per_mille_of_page`, `top_left`). Boxes are therefore drawn as percentages of the rendered page.
  Page rotation is assumed to match between the extractor's raster and pdf.js's viewport. **Unverified.**
- **Which marker belongs to which claim**: the k-th marker follows `claims[k]`. Trusted only when the ids agree;
  otherwise the chip shows no label and the popover lists all labels for that citation.
- **Legacy answers**: detected by `metadata.citations` being absent. Old `citationChecks` are ignored entirely.
- **`message_id` vs local id**: the placeholder keeps its local id; `metadata.messageId` holds the stored id. The
  `entailment` event matches either, so it still lands after a thread switch and reload.
- **Opening a conversation sets the active project** to the one that holds it (or none), so a later question does not
  silently move an old thread into another project.
- **"Clear conversation" now deletes the conversation** (server and local) and is relabelled. Since W3 the clear
  endpoint is a no-op and history is rebuilt from stored messages, so the old button was misleading. Hidden when no
  conversation is open.
- `selectConversation` no longer calls `/conversation/clear`, and skips refetching a thread a stream is writing to.
- The SSE reader now calls the handler outside the JSON-parse `try`, so an `error` event actually fails the query
  (before, the throw was logged as a parse error and swallowed). The placeholder becomes the error notice rather
  than leaving an empty card plus a second error card.
- The model name is formatted from its id (`claude-opus-5-5` → "Opus 5.5"). The fallback model's name is only known if
  the stream sent `answer_reset.from_model`.
- `verification` progress events are ignored; "Verification" was removed from the pipeline step list.

## Not done / unfinished

- **No tests, nothing run.** Behaviour is unverified in a browser, including: popover placement, the markdown plugin,
  pdf.js rendering with the v6 API, the Vite middleware that serves pdf.js data files in dev.
- PDF viewer: single page, no text layer (text cannot be selected), no search, no continuous scroll. A highlight spanning
  pages shows a jump button to the other page.
- Dev-server data files (`/pdfjs/...`) are served by a small plugin in `vite.config.ts`; the build copies them to
  `dist/pdfjs/` (checked: the build emits them).
- Entailment for stored messages whose check never ran shows nothing (cannot be told from "off").
- Projects: no editing of `paper_ids` and no editing of notebook files (viewer is read-only by design).
- Pre-existing lint errors (11) are untouched; none are in new files.
- `Tooltip` (existing) is hover-only; footer notes carry the reason in `title` and `aria-label` as well.
