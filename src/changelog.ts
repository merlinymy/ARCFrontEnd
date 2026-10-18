/**
 * Patch notes.
 *
 * Standard sections, in this order: Added, Improved, Fixed, Changed, Known
 * issues. One sentence per bullet, starting with what it is rather than with
 * a verb of ours — "Direct quotes on every citation", not "We added direct
 * quotes". No narrative, no framing about who asked for what, no component or
 * model names the reader would not meet in the interface.
 *
 * Keep the Known issues section. A release note that only lists wins teaches
 * the reader to skip the next one.
 *
 * `CHANGELOG_VERSION` gates the dialog: bump it only when there is something
 * worth interrupting someone for, because every bump shows the dialog again
 * to a person who has already dismissed it.
 */

export const CHANGELOG_VERSION = '2.0.0';

/** Shown under the title, so the reader knows what period this covers. */
export const CHANGELOG_SUBTITLE = 'Changes since version 1.1 (March 2026)';

/** One bullet. A sentence, not a heading and a paragraph. */
export type ChangelogEntry = string;

export interface ChangelogSection {
  heading: string;
  entries: ChangelogEntry[];
}

/** One release. Newest first in {@link RELEASES}. */
export interface Release {
  version: string;
  date: string;
  subtitle?: string;
  sections: ChangelogSection[];
  knownLimits?: ChangelogEntry[];
}

export const KNOWN_LIMITS_HEADING = 'Known issues';

const V2_SECTIONS: ChangelogSection[] = [
  {
    heading: 'Added',
    entries: [
      'Direct quotes on every citation, with click-through to the highlighted sentence in the PDF.',
      'A support check on each cited claim, replacing the old confidence percentage.',
      'Library map showing how papers group together and which topics connect.',
      'BibTeX and RIS import and export, with duplicate detection and two-way Zotero sync.',
      'Citation suggestions drawn from your own library.',
      'Writing help for outlines, specific aims, reviewer questions and draft sections.',
      'Six response modes: question, brainstorm, develop, refine, critique and draft.',
      'Memory across sessions, with per-project notebooks and an editable profile.',
      'Model selection, with guidance on each model.',
      'Clickable figures, shown without leaving the conversation.',
      'Colour themes, including low-contrast options.',
    ],
  },
  {
    heading: 'Improved',
    entries: [
      'Search recall, by rechunking the entire library — passages had been cut mid-sentence in 28,699 places.',
      'PDF reading: around four times faster, keeps tables, no longer drops references, and handles books.',
      'Reference quality: 3,505 papers that showed a filename now show their real title, authors and journal.',
      'Answer length, which now fits the question instead of building a report around every fact.',
      'Numbers keep the page and section they came from.',
    ],
  },
  {
    heading: 'Fixed',
    entries: [
      'Ten papers were credited to a different paper entirely.',
      'Citations could open the PDF one page early.',
      'A second scrollbar appeared on the chat page.',
      'Long answers could stop early without saying so.',
      'A conversation interrupted mid-answer could not be reopened.',
      'Search missed papers whose sections were never detected.',
    ],
  },
  {
    heading: 'Changed',
    entries: [
      'Sources are collapsed by default.',
      'Drafts open in a panel beside the chat rather than inside it.',
      'Response mode and model sit above the chat box, not in Advanced Options.',
      'Advanced Options is down from eleven settings to three.',
      'Signing in is required for everything, and repeated password attempts are blocked.',
    ],
  },
];

const V2_KNOWN_ISSUES: ChangelogEntry[] = [
  'About one paper in ten still shows a filename as its title, where the PDF carries neither a DOI nor a title on its first page.',
  'About one quote in fifty still starts mid-sentence, down from one in five; the rest is damage in the original PDF.',
  'The library map takes a few minutes to catch up after an upload.',
];

/**
 * Every release, newest first.
 *
 * A list rather than one current release, because the dialog can be reopened
 * from the header at any time and the reader may be after something they
 * half-remember from two releases ago. With one release this renders exactly
 * as a single release would; the shape is here so the next is an addition
 * rather than a rewrite.
 *
 * To add a release: write its sections above as their own consts, put a new
 * object at the FRONT of this array, and bump `CHANGELOG_VERSION`.
 */
export const RELEASES: Release[] = [
  {
    version: CHANGELOG_VERSION,
    date: 'October 2026',
    subtitle: CHANGELOG_SUBTITLE,
    sections: V2_SECTIONS,
    knownLimits: V2_KNOWN_ISSUES,
  },
];
