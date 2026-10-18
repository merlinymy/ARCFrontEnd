/**
 * What changed, written for the person using ARC rather than the person
 * building it.
 *
 * Two rules for anything added here. Say what is different *for them* — not
 * which component changed, and never a library or model name unless they
 * would see it in the interface. And keep the honest section honest: a
 * release note that only lists wins teaches the reader to skip it.
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

/** The heading for {@link KNOWN_LIMITS}; see the note there. */
export const KNOWN_LIMITS_HEADING = 'Known limits';

/**
 * The things the owner asked for by name, answered in their own terms.
 *
 * This section exists because a release note is easier to trust when you can
 * find your own request in it, including the parts that did not land the way
 * they were asked for.
 */
export const REQUESTED: ChangelogSection = {
  heading: 'What you asked for',
  intro: 'Ten requests, and what came of each.',
  entries: [
    {
      title: '1. "Do a full audit — fix anything that is a problem"',
      body:
        'The app used to answer anyone who knew its address. Your whole library ' +
        'was readable without logging in, and one request could have deleted the ' +
        'corpus. Everything is now closed unless you are signed in, your password ' +
        'is yours rather than a shipped default, repeated login guesses are ' +
        'throttled, and the database and search index only accept connections ' +
        'from this machine.',
    },
    {
      title: '2. "Citations quote the paper but do not match the claim"',
      body:
        'This turned out to be the biggest problem in the app. Passages were being ' +
        'cut wherever a figure, a table or a page break interrupted the text, so a ' +
        'quote could stop mid-sentence and continue somewhere the app never looked. ' +
        'It was happening in 28,699 places. Papers are now read as whole paragraphs ' +
        'first: quotes that break mid-sentence fell from one in five to fewer than ' +
        'one in fifty. Every paper was re-read and re-indexed.',
    },
    {
      title: '3. "Let me choose which model answers"',
      body:
        'There is now a model control next to the chat box. Each option says what ' +
        'it is good for, and carries a warning where this library has measured a ' +
        'problem — Opus 5.5 declines most peptide and cell-biology questions, so ' +
        'the note tells you before you pick it rather than after.',
    },
    {
      title: '4. "Put the draft beside the chat, not inside it"',
      body:
        'A drafted section now opens in its own panel next to the conversation. It ' +
        'stays put while you keep talking, so asking for a shorter version changes ' +
        'the document in front of you instead of adding another copy further down.',
    },
    {
      title: '5. "Show the thinking, not the machinery"',
      body:
        'While an answer is being written you see the reasoning as it happens, ' +
        'instead of a list of internal pipeline steps. The query-type and ' +
        'expanded-query lines are gone, and sources start collapsed so the answer ' +
        'is the first thing you read.',
    },
    {
      title: '6. "The advanced options are overwhelming"',
      body:
        'Eleven settings became three. Response style and model now sit permanently ' +
        'above the chat box where you can see them, instead of behind a toggle. ' +
        'There are also colour themes, including calmer low-contrast ones.',
    },
    {
      title: '7. "Make it feel like Claude when I ask for writing"',
      body:
        'Ask for a methods section, an outline or an abstract and the app produces ' +
        'a document rather than a chat reply — you no longer have to switch to a ' +
        'separate writing mode first. If you ask for writing while the app is set ' +
        'to answer questions, it notices before sending and offers to switch.',
    },
    {
      title: '8. "The page scrolls when there is nothing there"',
      body:
        'Fixed. A hidden element was stretching the page far past its content, so ' +
        'the whole site scrolled behind the chat. There were two scrollbars; now ' +
        'there is one.',
    },
    {
      title: '9. "The library map should update when I upload"',
      body:
        'It now rebuilds itself after uploads settle, instead of only when run by ' +
        'hand. The map page tells you when it is out of date, how many papers are ' +
        'missing from it, when a rebuild is coming, and lets you start one. It had ' +
        'in fact been empty since the search index was rebuilt — that is fixed too.',
    },
    {
      title: '10. "Get it online so someone else can use it"',
      body:
        'One command brings up the app, the interface and the secure tunnel ' +
        'together, with a written runbook for restarting it.',
    },
  ],
};

export const SECTIONS: ChangelogSection[] = [
  {
    heading: 'Answers you can check',
    intro: 'The largest change: every claim is now traceable to the page it came from.',
    entries: [
      {
        title: 'Quotes are exact, and they point at the page',
        body:
          'Each citation carries the sentence it came from, word for word. Clicking ' +
          'it opens the PDF at that page with the sentence highlighted — the exact ' +
          'sentence, not the paragraph around it.',
      },
      {
        title: 'Each claim is labelled by how well the source supports it',
        body:
          'After an answer arrives, every cited claim is checked against its source ' +
          'and marked as supported or not. You can see which parts of an answer rest ' +
          'on solid ground without reading every paper yourself.',
      },
      {
        title: 'Figures and tables are part of the answer',
        body:
          'Figures referenced in the text are clickable and shown inline, and tables ' +
          'are read as tables rather than flattened into prose.',
      },
    ],
  },
  {
    heading: 'Better reading of your papers',
    entries: [
      {
        title: 'A new PDF reader, about four times faster',
        body:
          'Tables survive, references are no longer dropped, and very long documents ' +
          'are handled in sections instead of failing. Books are split by chapter ' +
          'rather than treated as one enormous paper.',
      },
      {
        title: 'Your references, cleaned up',
        body:
          'Papers whose titles were filenames now show their real titles, authors ' +
          'and journals, filled in from Crossref: 3,505 papers were corrected. Ten ' +
          'had been credited to the wrong paper entirely and were put right.',
      },
      {
        title: 'Import and export your bibliography',
        body:
          'BibTeX and RIS in and out, duplicate detection, Zotero sync, and ' +
          'suggestions for what to cite.',
      },
    ],
  },
  {
    heading: 'Working with the library',
    entries: [
      {
        title: 'A map of everything you have',
        body:
          'A visual layout of the whole library showing how papers group together ' +
          'and which topics connect, with nearest neighbours for any paper.',
      },
      {
        title: 'Ways to ask',
        body:
          'Beyond asking a question, you can brainstorm directions, develop an idea, ' +
          'tighten one, have it argued against, or turn it into writing. Each ' +
          'changes how the answer is written, not which papers are searched.',
      },
      {
        title: 'Conversations that remember',
        body:
          'Follow-up questions understand what you were just discussing. Projects ' +
          'keep their own notebook, and a profile describing your background can be ' +
          'included or left out per question.',
      },
      {
        title: 'What each answer cost',
        body:
          'Every answer shows which model wrote it and what the turn cost.',
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
      'About one paper in ten has neither a readable DOI nor a title on its first ' +
      'page. Looking those up by title is the next piece of work.',
  },
  {
    title: 'A few quotes still start mid-sentence',
    body:
      'Around one in fifty, down from one in five. What remains is damage in the ' +
      'original PDF — a word split across a column break, a heading the reader ' +
      'mistook for body text — which better reading of the file cannot repair.',
  },
  {
    title: 'Rebuilding the library map takes a few minutes',
    body:
      'It runs in the background after uploads settle rather than immediately, ' +
      'because it re-lays out the entire library each time.',
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
