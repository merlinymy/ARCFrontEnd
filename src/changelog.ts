/**
 * What changed, written for the person using ARC rather than the person
 * building it.
 *
 * Rules for anything added here. **One sentence, starting with a verb** —
 * "Added…", "Improved…", "Replaced…". Someone catching up wants to know what
 * is different, not how it was done or who asked for it. Say what is
 * different *for them*: no component names, and no model or library names
 * they would not meet in the interface. And keep the last section honest,
 * because a release note that only lists wins teaches the reader to skip the
 * next one.
 *
 * `CHANGELOG_VERSION` is what gates the dialog. Bump it when there is
 * something worth interrupting someone for, and only then: every bump shows
 * the dialog again to a person who has already dismissed it.
 */

export const CHANGELOG_VERSION = '2.0.0';

/** Shown under the title, so the reader knows what period this covers. */
export const CHANGELOG_SUBTITLE =
  'Everything since version 1.1, released in March';

/** One bullet. A sentence, not a heading and a paragraph. */
export type ChangelogEntry = string;

export interface ChangelogSection {
  heading: string;
  entries: ChangelogEntry[];
}

/** One release. Newest first in {@link RELEASES}. */
export interface Release {
  version: string;
  /** When it shipped, for a reader placing it against their own memory. */
  date: string;
  subtitle?: string;
  sections: ChangelogSection[];
  knownLimits?: ChangelogEntry[];
}

/** The heading for a release's `knownLimits`. */
export const KNOWN_LIMITS_HEADING = 'Still rough';

/**
 * The ten things the user asked for, from the feedback transcript that
 * started this work (docs/IMPROVEMENT_PLAN_2026-09.md, section 2).
 *
 * Kept in the order they were given, but written as plain changes rather than
 * as answers to a request — the reader knows what they asked for.
 */
export const REQUESTED: ChangelogSection = {
  heading: 'What you asked for',
  entries: [
    'Added a direct quote to every citation, so you can find the exact sentence in the paper and open the PDF at it.',
    'Improved recall by rechunking the whole library — passages were being cut mid-sentence in 28,699 places, hiding text that was there.',
    'Kept numbers tied to the page and section they came from, and tables are now read as tables rather than flattened into prose.',
    'Replaced the confidence percentage with a real check of each claim against its own source.',
    'Added memory across sessions: conversations that follow on, a notebook per project, and a profile you can edit or leave out.',
    'Added BibTeX and RIS import and export, with duplicate detection and two-way Zotero sync.',
    'Changed the voice to answer in a sentence when a sentence will do, instead of building a report around every fact.',
    'Added six ways to ask — question, brainstorm, develop, refine, critique and draft — above the chat box.',
    'Added writing help for outlines, specific aims, reviewer questions and draft sections.',
    'Added citation suggestions: describe what you are writing and it finds what to cite from your library.',
  ],
};

export const SECTIONS: ChangelogSection[] = [
  {
    heading: 'Also changed',
    entries: [
      'Replaced the PDF reader with one about four times faster that keeps tables, no longer drops references, and can handle books.',
      'Corrected 3,505 references that showed a filename instead of a title, and fixed ten credited to the wrong paper.',
      'Added a map of your library showing how papers group together and which topics connect.',
      'Made figures clickable and visible without leaving the conversation.',
      'Added a model picker, with a warning on any model this library has measured trouble with.',
      'Moved drafts into their own panel beside the chat, so they stay put while you keep talking.',
      'Added the reasoning as it happens, and what each answer cost.',
      'Reduced eleven advanced settings to three, collapsed sources by default, and added colour themes.',
      'Closed the app to anyone not signed in, and blocked repeated password guesses.',
    ],
  },
];

/**
 * Said plainly, because the reader will meet these anyway and it is better
 * they meet them here.
 */
export const KNOWN_LIMITS: ChangelogEntry[] = [
  'Some papers still show a filename as their title — about one in ten has neither a readable DOI nor a title on its first page.',
  'A few quotes still start mid-sentence, around one in fifty, down from one in five; what remains is damage in the original PDF.',
  'The library map takes a few minutes to catch up after an upload, because it redraws the whole library each time.',
];

/**
 * Every release, newest first.
 *
 * A list rather than one current release, because the dialog can be reopened
 * from the header at any time and the reader may be looking for something
 * they half-remember from two releases ago. With one release this renders
 * exactly as a single release would; the shape is here so the next one is an
 * addition rather than a rewrite.
 *
 * To add a release: write its sections above as their own consts, put a new
 * object at the FRONT of this array, and bump `CHANGELOG_VERSION` — which is
 * what decides whether the dialog interrupts someone who has already
 * dismissed the previous one.
 */
export const RELEASES: Release[] = [
  {
    version: CHANGELOG_VERSION,
    date: 'October 2026',
    subtitle: CHANGELOG_SUBTITLE,
    sections: [REQUESTED, ...SECTIONS],
    knownLimits: KNOWN_LIMITS,
  },
];
