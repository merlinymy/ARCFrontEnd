// Lets api.ts tell AuthContext that the server rejected the token, without
// either importing the other (api.ts already imports getAuthToken from
// AuthContext, so a handler registered through api.ts would be an import cycle).

import { getAuthToken } from '../context/AuthContext';

let handler: (() => void) | null = null;

export function setUnauthorizedHandler(next: (() => void) | null): void {
  handler = next;
}

// Several requests in flight usually 401 together. The handler clears the stored
// token synchronously, so every call after the first sees no token and does
// nothing; an anonymous 401 (no token was sent) is not an expired session either.
export function notifyUnauthorized(): void {
  if (!handler || !getAuthToken()) return;
  handler();
}
