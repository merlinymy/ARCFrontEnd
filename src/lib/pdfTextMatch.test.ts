/// <reference types="node" />
// Run with `npm test` (Node's built-in runner; no extra dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupIntoLines, locateQuote, normalizeWithMap, pieces, buildStream, placeItems, type PlacedItem, type PlacedPage } from './pdfTextMatch.ts';

/** A horizontal item, `w` wide and 10 high, with its baseline start at (x, y). */
const item = (str: string, x: number, y: number, w = str.length * 5): PlacedItem => ({
  str,
  ox: x,
  oy: y,
  wx: w,
  wy: 0,
  hx: 0,
  hy: -10,
});

test('normalization drops whitespace, dashes, quotes and ligatures, and maps back to the original', () => {
  const { key, map } = normalizeWithMap('The “ﬁrst” – inter-­national');
  assert.equal(key, 'thefirstinternational');
  // "ﬁ" (index 5) produced both "f" and "i"; the quote before it (index 4) produced nothing.
  assert.equal(map[3], 5);
  assert.equal(map[4], 5);
  assert.equal(map[5], 6);
});

test('a quote is found across fragments and a line-end hyphen, and only the cited occurrence is boxed', () => {
  const page: PlacedPage = {
    page: 1,
    items: [
      // The same sentence twice: the first in the top paragraph, the second lower.
      item('Cells were grown in', 100, 100),
      item('mono-', 100, 112),
      item('layers.', 100, 124),
      item('Other text here, unrelated to the claim at all.', 100, 300),
      item('Cells were grown in', 100, 500),
      item('monolayers.', 100, 512),
    ],
  };
  const quote = 'Cells were grown in monolayers.';
  // The backend's block box sits around the second occurrence.
  const near = locateQuote(quote, [page], [{ page: 1, bbox: [90, 480, 600, 530] }]);
  assert.ok(near.boxes);
  assert.equal(near.boxes.length, 2);
  assert.ok(near.boxes.every((b) => b.bbox[1] >= 480));
  // Nothing near the backend's box: the match is not believed.
  const far = locateQuote(quote, [page], [{ page: 1, bbox: [90, 800, 600, 900] }]);
  assert.equal(far.boxes, null);
});

test('a span over three lines gives three boxes, the last cut at the matched word', () => {
  const page: PlacedPage = {
    page: 1,
    items: [
      item('Alpha beta gamma', 100, 100),
      item('delta epsilon zeta', 100, 112),
      item('eta theta iota kappa', 100, 124),
    ],
  };
  const stream = buildStream([page]);
  const start = stream.key.indexOf('betagamma');
  const end = stream.key.indexOf('theta') + 'theta'.length;
  const boxes = groupIntoLines(pieces(stream, start, end));
  assert.equal(boxes.length, 3);
  assert.ok(boxes[0].bbox[0] > 100, 'the first line starts after "Alpha"');
  assert.ok(boxes[2].bbox[2] < 100 + 20 * 5, 'the last line ends before "iota kappa"');
});

test('an empty or unrelated text layer is not matched', () => {
  const quote = 'A sentence long enough to be looked for.';
  assert.equal(locateQuote(quote, [{ page: 1, items: [] }], [{ page: 1, bbox: [0, 0, 1000, 1000] }]).boxes, null);
  const noise: PlacedPage = { page: 1, items: [item('xq zzv ~~ 9f8 kk jj hh gg ff dd ss aa', 10, 10)] };
  assert.equal(locateQuote(quote, [noise], [{ page: 1, bbox: [0, 0, 1000, 1000] }]).boxes, null);
});

test('placement gives per-mille, top-left coordinates, and follows the page rotation', () => {
  const text = [{ str: 'word', transform: [10, 0, 0, 10, 60, 700], width: 100, height: 10 }];
  // A 600x800 page, unrotated: y is flipped so the origin is top-left.
  const [flat] = placeItems(text, [1, 0, 0, -1, 0, 800], 600, 800);
  assert.deepEqual([flat.ox, flat.oy].map(Math.round), [100, 125]);
  assert.ok(flat.wx > 0 && flat.wy === 0 && flat.hy < 0);
  // The same page rotated 90 degrees (viewport 800x600): the advance now runs down the page.
  const [turned] = placeItems(text, [0, 1, 1, 0, 0, 0], 800, 600);
  assert.deepEqual([turned.ox, turned.oy].map(Math.round), [875, 100]);
  assert.ok(turned.wy > 0 && Math.abs(turned.wx) < 1e-9);
});
