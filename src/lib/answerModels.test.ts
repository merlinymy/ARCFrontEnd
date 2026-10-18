import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answeringModel, findAnswerModel } from './answerModels.ts';
import type { AnswerModelInfo, AnswerModelsResponse } from '../types';

const model = (name: string, extra: Partial<AnswerModelInfo> = {}): AnswerModelInfo => ({
  name,
  label: name,
  model: `claude-${name}`,
  blurb: '',
  caution: null,
  has_fallback: false,
  fallback: null,
  is_default: false,
  ...extra,
});

const list: AnswerModelsResponse = {
  default: 'a',
  configured_model: 'claude-a',
  models: [model('a', { is_default: true }), model('b', { caution: 'declines' })],
};

test('a stored name the server no longer lists reads as not chosen', () => {
  // Sending it would be a 400 on every question, so it must not survive.
  assert.equal(findAnswerModel(list, 'retired'), null);
  assert.equal(findAnswerModel(list, null), null);
});

test('with no choice, the model that answers is the configured one', () => {
  assert.equal(answeringModel(list, null)?.name, 'a');
  assert.equal(answeringModel(list, 'retired')?.name, 'a');
});

test('a choice wins over the default, and its caution comes with it', () => {
  assert.equal(answeringModel(list, 'b')?.caution, 'declines');
});

test('a configured model outside the registry leaves nothing to describe', () => {
  const none = { ...list, default: null, models: [model('b')] };
  assert.equal(answeringModel(none, null), null);
});
