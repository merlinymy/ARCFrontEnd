import type { AnswerModelInfo, AnswerModelsResponse } from '../types';

/**
 * The entry a stored choice names, or null when the server no longer lists it.
 * A choice outlives the server's registry (a model retired there), and sending
 * a name the server does not know is a 400 on every question, so an unknown
 * name has to read as "not chosen".
 */
export function findAnswerModel(
  list: AnswerModelsResponse,
  name: string | null
): AnswerModelInfo | null {
  if (!name) return null;
  return list.models.find((m) => m.name === name) ?? null;
}

/**
 * The model that will actually answer: the chosen one, else the server's
 * configured one. null when neither is in the registry, in which case there is
 * nothing to describe, though the question still goes through.
 */
export function answeringModel(
  list: AnswerModelsResponse,
  name: string | null
): AnswerModelInfo | null {
  return (
    findAnswerModel(list, name) ??
    list.models.find((m) => m.is_default) ??
    null
  );
}
