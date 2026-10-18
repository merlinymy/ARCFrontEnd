import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG_SEEN_KEY, markChangelogSeen, shouldShowChangelog } from './changelogGate.ts';

const memoryStore = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};

const throwingStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('full');
  },
};

test('a version never seen, or a different one, shows the dialog', () => {
  assert.equal(shouldShowChangelog('2.0.0', memoryStore()), true);
  assert.equal(shouldShowChangelog('2.0.0', memoryStore({ [CHANGELOG_SEEN_KEY]: '1.1.0' })), true);
});

test('the current version, once dismissed, does not show again', () => {
  const store = memoryStore();
  markChangelogSeen('2.0.0', store);
  assert.equal(shouldShowChangelog('2.0.0', store), false);
  // A bump is what brings it back.
  assert.equal(shouldShowChangelog('2.1.0', store), true);
});

test('storage that throws neither shows nor breaks', () => {
  assert.equal(shouldShowChangelog('2.0.0', throwingStore), false);
  assert.doesNotThrow(() => markChangelogSeen('2.0.0', throwingStore));
});
