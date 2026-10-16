/**
 * Pull a drafted piece out of an answer so it can be shown as an artifact.
 *
 * The model decides, the way Claude does: it is told when a turn produces
 * something the user will keep, and wraps that piece in
 * `<artifact title="...">` ... `</artifact>`. Nothing here guesses from the
 * user's wording — a regex over the message was what made ARC miss "write an
 * introduction on X" while firing on "does the paper outline the methods?".
 *
 * Parses the WHOLE accumulated answer every time rather than consuming
 * deltas. A streamed chunk can split a tag down the middle
 * (`<arti` | `fact title="Intro">`), and an incremental state machine has to
 * get every one of those boundaries right. Re-parsing is a few microseconds
 * on a few KB and simply cannot have that class of bug.
 *
 * Degrades to nothing: no opening tag means `artifact: null`, and the caller
 * renders the answer exactly as it did before artifacts existed. A model that
 * forgets the marker loses the panel, never the text.
 */

export interface ArtifactSplit {
  /** Answer text outside the artifact — stays in the chat bubble. */
  commentary: string;
  artifact: {
    title: string;
    content: string;
    /** False while still streaming: the closing tag has not arrived yet. */
    closed: boolean;
  } | null;
}

const OPEN = /<artifact(?:\s+title\s*=\s*(?:"([^"]*)"|'([^']*)'))?\s*>/i;
const CLOSE = /<\/artifact\s*>/i;

/**
 * A half-arrived opening tag at the very end of a streaming answer. Held back
 * from the bubble so raw tag syntax is never shown for the frame before it
 * completes.
 *
 * Two shapes, and the precision matters. `<`, `<a`, `<art` … are strict
 * prefixes of `<artifact`; `<artifact title="Intr` is the tag with its
 * attributes still arriving. Anything else is left alone, which is why
 * `<0.5 mM` — ordinary in this corpus — survives instead of making the answer
 * flicker on every comparison operator.
 */
const PARTIAL_OPEN = /(?:<(?:a(?:r(?:t(?:i(?:f(?:a(?:c(?:t)?)?)?)?)?)?)?)?|<artifact[^<>]*)$/i;

export function splitArtifact(text: string): ArtifactSplit {
  const open = OPEN.exec(text);
  if (!open) {
    // No artifact yet. Hide a half-arrived opening tag, but only when it
    // really could become one: a bare "<" mid-sentence is common in science
    // writing ("<0.5 mM"), and blanking the tail on every one would make the
    // answer flicker as it streams.
    const partial = PARTIAL_OPEN.exec(text);
    return {
      commentary: partial ? text.slice(0, partial.index) : text,
      artifact: null,
    };
  }

  const title = (open[1] ?? open[2] ?? '').trim();
  const rest = text.slice(open.index + open[0].length);

  const close = CLOSE.exec(rest);
  const content = close ? rest.slice(0, close.index) : rest;
  const after = close ? rest.slice(close.index + close[0].length) : '';

  // Joined with one blank line, not concatenated: the text before the tag
  // ends in a newline and the text after starts with one, so a raw join
  // leaves a four-newline gap in the bubble.
  const before = text.slice(0, open.index).trim();
  const trailing = after.trim();

  return {
    commentary: [before, trailing].filter(Boolean).join('\n\n'),
    artifact: {
      // An untitled artifact still needs a label for the panel header.
      title: title || 'Draft',
      content: close ? content.trim() : content.replace(/^\n+/, ''),
      closed: close !== null,
    },
  };
}
