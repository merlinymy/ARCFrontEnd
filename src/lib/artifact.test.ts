import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitArtifact } from './artifact.ts';

// The streaming cases are the ones worth having. A finished answer is easy;
// what breaks in practice is the half-arrived tag, and a user watching a raw
// `<artifact title="Int` appear in the chat bubble would read as a bug.

test('an answer with no artifact is passed through untouched', () => {
  const text = 'The yield was 82% under reflux [1].';
  const out = splitArtifact(text);
  assert.equal(out.artifact, null);
  assert.equal(out.commentary, text);
});

test('a complete artifact is lifted out, with the remarks left behind', () => {
  const out = splitArtifact(
    'Here is a first pass.\n\n<artifact title="Introduction">Raman spectroscopy has.</artifact>\n\nI left the gap marked.'
  );
  assert.equal(out.artifact?.title, 'Introduction');
  assert.equal(out.artifact?.content, 'Raman spectroscopy has.');
  assert.equal(out.artifact?.closed, true);
  assert.equal(out.commentary, 'Here is a first pass.\n\nI left the gap marked.');
});

test('content streams into the panel before the closing tag arrives', () => {
  const out = splitArtifact('<artifact title="Methods">Peptides were synthesised');
  assert.equal(out.artifact?.closed, false);
  assert.equal(out.artifact?.content, 'Peptides were synthesised');
});

test('every prefix of a streamed answer is safe to render', () => {
  // The real guarantee: whatever arrives, the user never sees tag syntax.
  const full =
    'One moment.\n\n<artifact title="Abstract">We report a method.</artifact>\n\nDone.';
  for (let i = 0; i <= full.length; i++) {
    const out = splitArtifact(full.slice(0, i));
    assert.ok(!out.commentary.includes('<artifact'), `leaked an open tag at ${i}`);
    assert.ok(!out.commentary.includes('</artifact'), `leaked a close tag at ${i}`);
    assert.ok(!/<a?r?t?i?f?a?c?t?$/i.test(out.commentary), `leaked a partial tag at ${i}`);
  }
});

test('a less-than sign in ordinary prose is not mistaken for a tag', () => {
  // "<0.5 mM" is normal in this corpus; blanking the tail on every "<" would
  // make the answer flicker while streaming.
  const out = splitArtifact('Detection was <0.5 mM');
  assert.equal(out.commentary, 'Detection was <0.5 mM');
  assert.equal(out.artifact, null);
});

test('an untitled artifact still gets a panel label', () => {
  const out = splitArtifact('<artifact>Some prose.</artifact>');
  assert.equal(out.artifact?.title, 'Draft');
});

test('single quotes and odd spacing in the tag still parse', () => {
  const out = splitArtifact("<artifact   title = 'Specific Aims' >Aim 1.</artifact >");
  assert.equal(out.artifact?.title, 'Specific Aims');
  assert.equal(out.artifact?.content, 'Aim 1.');
  assert.equal(out.artifact?.closed, true);
});

test('an artifact that is never closed still yields its content', () => {
  // A truncated stream must not lose the draft the user watched being written.
  const out = splitArtifact('<artifact title="Intro">First line.\nSecond line.');
  assert.equal(out.artifact?.content, 'First line.\nSecond line.');
  assert.equal(out.artifact?.closed, false);
});
