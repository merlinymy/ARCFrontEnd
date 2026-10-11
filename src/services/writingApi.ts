// API calls for the writing surface (W6). Every route is under /writing and needs the bearer token.

import { API_BASE, ApiError, getAuthHeaders, postEventStream } from './api';
import type { WritingRequestBody, WritingStreamEvent, WritingTask, WritingTasksInfo } from '../types/writing';
import { WRITING_TASKS } from '../types/writing';

function pathFor(task: WritingTask): string {
  const spec = WRITING_TASKS.find((t) => t.task === task);
  if (!spec) throw new Error(`Unknown writing task: ${task}`);
  return `/writing/${spec.path}`;
}

/**
 * Run one helper over the `/stream` route: `progress` events, then `complete`,
 * then `entailment` when the run asked for it. An HTTP error (unknown project,
 * validation, auth) is thrown before any event arrives; an `error` event is
 * handed to `onEvent`, which decides what to do with it.
 */
export function streamWriting(
  task: WritingTask,
  body: WritingRequestBody,
  onEvent: (event: WritingStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  return postEventStream<WritingStreamEvent>(`${pathFor(task)}/stream`, body, onEvent, signal);
}

export async function getWritingTasks(): Promise<WritingTasksInfo> {
  const response = await fetch(`${API_BASE}/writing/tasks`, { headers: getAuthHeaders() });
  if (!response.ok) throw new ApiError(response.status, `Request failed with status ${response.status}`);
  return response.json() as Promise<WritingTasksInfo>;
}
