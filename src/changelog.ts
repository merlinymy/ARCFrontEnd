/**
 * What changed, written for the person using ARC rather than the person
 * building it.
 *
 * Three rules for anything added here. One sentence per change — someone
 * catching up wants to know what is different, not how it was done. Say what
 * is different *for them*: no component names, and no model or library names
 * they would not meet in the interface. And keep the limits section honest,
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

export interface ChangelogEntry {
  title: string;
  body: string;
}

export interface ChangelogSection {
  heading: string;
  /** One line under the heading explaining why the section exists. */
  intro?: string;
  entries: ChangelogEntry[];
}

/** One release. Newest first in {@link RELEASES}. */
export interface Release {
  version: string;
  /** When it shipped, for a reader placing it against their own memory. */
  date: string;
  subtitle?: string;
  /** Present when that release answered requests by name. */
  requested?: ChangelogSection;
  sections: ChangelogSection[];
  knownLimits?: ChangelogEntry[];
}

/** The heading for a release's `knownLimits`. */
export const KNOWN_LIMITS_HEADING = 'Still rough';

/**
 * The ten things the user asked for, from the feedback transcript that
 * started this work (docs/IMPROVEMENT_PLAN_2026-09.md, section 2).
 *
 * Kept in the order they were given, and worded as the outcome rather than
 * the work: a release note is easier to trust when you can find your own
 * request in it and see plainly whether it was answered.
 */
export const REQUESTED: ChangelogSection = {
  heading: 'The ten things you asked for',
  entries: [
    {
      title: '1. Direct quotes you can find in the paper',
      body:
        'Every citation now carries the exact sentence it came from, and clicking ' +
        'it opens the PDF at that page with the sentence highlighted.',
    },
    {
      title: '2. Better recall — "it consistently misses things"',
      body:
        'Passages were being cut mid-sentence in 28,699 places, so searches missed ' +
        'text that was there; papers are now read as whole paragraphs and the ' +
        'entire library has been re-read and re-indexed.',
    },
    {
      title: '3. Keep the numbers, and say where they came from',
      body:
        'Values keep the page and section they were taken from, and tables are read ' +
        'as tables rather than flattened into prose.',
    },
    {
      title: '4. Make the confidence percentage understandable',
      body:
        'The invented percentage is gone: each cited claim is now checked against ' +
        'its own source and marked as supported or not.',
    },
    {
      title: '5. Real memory across sessions',
      body:
        'Follow-up questions understand what you were just discussing, each project ' +
        'keeps its own notebook, and your profile is editable and can be left out ' +
        'of any single question.',
    },
    {
      title: '6. Reference managers',
      body:
        'BibTeX and RIS import and export, with duplicate detection, cleanup, and ' +
        'two-way Zotero sync.',
    },
    {
      title: '7. A conversational voice, not a book report',
      body:
        'Answers reply in a sentence when a sentence will do, instead of building a ' +
        'report around a one-line fact.',
    },
    {
      title: '8. Explicit modes',
      body:
        'Six ways to ask — question, brainstorm, develop, refine, critique and ' +
        'draft — now sitting permanently above the chat box.',
    },
    {
      title: '9. Writing help',
      body:
        'Ask for an outline, specific aims, reviewer questions or a methods section ' +
        'and you get a document beside the chat rather than a chat reply.',
    },
    {
      title: '10. What should I cite?',
      body:
        'Describe what you are writing about and it suggests what to cite from your ' +
        'own library.',
    },
  ],
};

export const SECTIONS: ChangelogSection[] = [
  {
    heading: 'Other things that changed',
    entries: [
      {
        title: 'Figures are part of the answer',
        body:
          'Figures mentioned in the text are clickable and shown without leaving the ' +
          'conversation.',
      },
      {
        title: 'A map of your library',
        body:
          'A visual layout of everything you have, showing how papers group together ' +
          'and which topics connect.',
      },
      {
        title: 'Your references, corrected',
        body:
          'Papers whose titles were filenames now show their real title, authors and ' +
          'journal: 3,505 were filled in and ten that had been credited to the wrong ' +
          'paper were put right.',
      },
      {
        title: 'A faster, more accurate PDF reader',
        body:
          'Tables survive, references are no longer dropped, very long documents no ' +
          'longer fail, and books are split by chapter.',
      },
      {
        title: 'Choose which model answers',
        body:
          'A model control sits next to the chat box, with a warning on any model ' +
          'this library has measured a problem with.',
      },
      {
        title: 'Drafts open beside the chat',
        body:
          'A drafted section gets its own panel that stays put while you keep ' +
          'talking, so asking for a shorter version changes the document in front of ' +
          'you.',
      },
      {
        title: 'See the thinking, and what it cost',
        body:
          'You watch the reasoning as the answer is written, and each answer shows ' +
          'which model wrote it and what the turn cost.',
      },
      {
        title: 'A simpler, calmer interface',
        body:
          'Eleven advanced settings became three, sources start collapsed, and there ' +
          'are colour themes including low-contrast ones.',
      },
      {
        title: 'Your library stays private',
        body:
          'Nothing is readable without signing in, and repeated password guesses are ' +
          'now blocked.',
      },
    ],
  },
];

/**
 * Said plainly, because the reader will meet these anyway and it is better
 * they meet them here.
 */
export const KNOWN_LIMITS: ChangelogEntry[] = [
  {
    title: 'Some papers still show a filename as their title',
    body:
      'About one in ten has neither a readable DOI nor a title on its first page, ' +
      'and looking those up by title is the next piece of work.',
  },
  {
    title: 'A few quotes still start mid-sentence',
    body:
      'Around one in fifty, down from one in five, and what remains is damage in ' +
      'the original PDF that re-reading the file cannot repair.',
  },
  {
    title: 'The library map takes a few minutes to update',
    body:
      'It rebuilds in the background after uploads settle, because it re-lays out ' +
      'the whole library each time.',
  },
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
 * To add a release: write its parts above as their own consts, put a new
 * object at the FRONT of this array, and bump `CHANGELOG_VERSION` — which is
 * what decides whether the dialog interrupts someone who has already
 * dismissed the previous one.
 */
export const RELEASES: Release[] = [
  {
    version: CHANGELOG_VERSION,
    date: 'October 2026',
    subtitle: CHANGELOG_SUBTITLE,
    requested: REQUESTED,
    sections: SECTIONS,
    knownLimits: KNOWN_LIMITS,
  },
];
