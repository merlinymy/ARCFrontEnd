import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, mapIsStale, pollDelay, stripKind } from './refreshModel.ts';
import type { LibraryMapStatus } from '../../types';

const status = (over: Partial<LibraryMapStatus> = {}, refresh: Partial<LibraryMapStatus['refresh']> = {}): LibraryMapStatus => ({
  refresh: {
    state: 'idle',
    enabled: true,
    reason: null,
    seconds_until: null,
    running_for_seconds: null,
    queued_after: false,
    last_finished_at: null,
    last_error: null,
    ...refresh,
  },
  built_at: '2026-10-18T19:46:24+00:00',
  collection: 'research_papers_v3',
  papers_mapped: 4860,
  papers_in_library: 4860,
  papers_behind: 0,
  ...over,
});

test('a missing map is "never", not "behind" or "current"', () => {
  assert.equal(stripKind(status({ papers_mapped: null, papers_behind: null, built_at: null })), 'never');
  assert.equal(stripKind(status({ papers_mapped: 0, papers_behind: 0 })), 'current');
});

test('a running or scheduled build outranks papers being behind', () => {
  const behind = { papers_behind: 3 };
  assert.equal(stripKind(status(behind)), 'behind');
  assert.equal(stripKind(status(behind, { state: 'scheduled' })), 'scheduled');
  assert.equal(stripKind(status(behind, { state: 'building' })), 'building');
});

test('polling stops when idle and slows while only counting down', () => {
  assert.equal(pollDelay(status(), null), null);
  assert.equal(pollDelay(status({}, { state: 'building' }), null), 5000);
  assert.equal(pollDelay(status({}, { state: 'scheduled' }), 120), 10000);
  assert.equal(pollDelay(status({}, { state: 'scheduled' }), 4), 2000);
});

test('the shown map is stale only when the server holds a different build', () => {
  const s = status();
  assert.equal(mapIsStale(s.built_at, s), false);
  assert.equal(mapIsStale('2026-10-17T08:00:00+00:00', s), true);
  assert.equal(mapIsStale(null, s), false);
});

test('clock reads minutes and zero-padded seconds', () => {
  assert.equal(formatClock(134), '2:14');
  assert.equal(formatClock(5), '0:05');
});
