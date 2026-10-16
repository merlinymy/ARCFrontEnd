/**
 * Flags for features that are off but not gone.
 *
 * Switched off rather than deleted, deliberately: the code is working and
 * tested, and the decision to retire it is a product judgement that may be
 * reversed. Flip the constant to bring it back; nothing else is needed.
 */

/**
 * The standalone Writing page (W6) — its own form, task picker and result view.
 *
 * Off since 2026-10-16. Writing folded back into the conversation: ask for a
 * draft in chat and the model returns it as an artifact, with the library
 * searched the same way it is for any other turn. Two places to write meant
 * two prompts, two retrieval paths and two sets of bugs, and the chat one has
 * the conversation context that drafting actually depends on.
 *
 * Switching this off also stops the writing picker generating a second draft
 * per run (~$0.49) that nothing in the UI ever read.
 *
 * Still reachable in the code: App.tsx renders the page when activePage is
 * 'writing', and the backend /writing routes are untouched. Only the ways in
 * are hidden.
 */
export const WRITING_PAGE_ENABLED = false;
