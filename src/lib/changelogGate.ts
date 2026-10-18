/**
 * Whether to interrupt someone with the "What's new" dialog, and remembering
 * that they were told.
 *
 * Kept out of the component so the decision can be tested without a DOM, and
 * so every storage access sits behind one try/catch: localStorage throws on
 * access in some private or blocked-storage modes, and on write when full, and
 * neither may take the app down.
 */

export const CHANGELOG_SEEN_KEY = 'arc.changelog.seenVersion';

type VersionStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * True when the stored version is not the current one (including never stored).
 *
 * If storage cannot be read the answer is false, not true: we could not record
 * a dismissal either, so showing would mean the same dialog on every load for
 * that person. The header entry still reaches it, and does not use this.
 */
export function shouldShowChangelog(current: string, store?: VersionStore): boolean {
  try {
    return (store ?? localStorage).getItem(CHANGELOG_SEEN_KEY) !== current;
  } catch {
    return false;
  }
}

export function markChangelogSeen(current: string, store?: VersionStore): void {
  try {
    (store ?? localStorage).setItem(CHANGELOG_SEEN_KEY, current);
  } catch {
    // Unwritable storage means it may show again next load; that is better than
    // an exception on the close button.
  }
}
