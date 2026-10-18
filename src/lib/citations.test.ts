import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTurnCost } from './citations.ts';

// The cases that matter are the ones that must stay silent: a wrong or zero
// price on an answer reads as a fact about spend.

test('says nothing for a message with no budget, an unknown model, or no usage', () => {
  assert.equal(formatTurnCost(undefined), null);
  assert.equal(formatTurnCost(null), null);
  assert.equal(formatTurnCost({ known_model: false, actual: { cost_usd: 0.12 } }), null);
  assert.equal(formatTurnCost({ known_model: true, actual: null }), null);
  assert.equal(formatTurnCost({ known_model: true, actual: { cost_usd: null } }), null);
  assert.equal(formatTurnCost({ known_model: true, actual: { cost_usd: 0 } }), null);
});

test('formats to three decimals, with a floor for sub-tenth-of-a-cent turns', () => {
  assert.equal(formatTurnCost({ known_model: true, actual: { cost_usd: 0.04237 } }), '$0.042');
  assert.equal(formatTurnCost({ known_model: true, actual: { cost_usd: 0.0031 } }), '$0.003');
  assert.equal(formatTurnCost({ known_model: true, actual: { cost_usd: 0.0002 } }), '<$0.001');
});
