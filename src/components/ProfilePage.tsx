import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  UserRound,
  RefreshCw,
  Save,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';
import type { MemoryFact, ProfileResponse } from '../types';

// The server's limits (backend: MAX_PARAGRAPH_CHARS, MAX_FACT_CHARS, category length).
const MAX_PARAGRAPH = 3000;
const MAX_FACT = 1000;
const MAX_CATEGORY = 50;
const CATEGORY_SUGGESTIONS = ['background', 'interest', 'preference', 'method', 'project'];

const INPUT =
  'w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
const BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
const PRIMARY = `${BUTTON} bg-blue-600 text-white hover:bg-blue-700`;
const SECONDARY = `${BUTTON} text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800`;

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** One fact: shown, or being edited in place. */
function FactRow({
  fact,
  onSaved,
  onDeleted,
  onError,
}: {
  fact: MemoryFact;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.fact);
  const [category, setCategory] = useState(fact.category ?? '');
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setText(fact.fact);
    setCategory(fact.category ?? '');
    setEditing(true);
  };

  const save = async () => {
    const nextText = text.trim();
    if (!nextText) return;
    setBusy(true);
    try {
      const nextCategory = category.trim();
      await api.updateMemory(fact.id, {
        fact: nextText,
        // An empty box means "no category": say so explicitly.
        ...(nextCategory ? { category: nextCategory } : { clearCategory: true }),
      });
      setEditing(false);
      await onSaved();
    } catch (err) {
      onError(errorText(err, 'Could not save the fact.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteMemory(fact.id);
      await onDeleted();
    } catch (err) {
      onError(errorText(err, 'Could not delete the fact.'));
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="p-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 space-y-2">
        <label className="block">
          <span className="sr-only">Fact</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_FACT}
            rows={2}
            className={INPUT}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={MAX_CATEGORY}
              list="profile-categories"
              placeholder="none"
              className={`${INPUT} !w-40 !py-1`}
            />
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={SECONDARY}>
              <X className="w-4 h-4" aria-hidden="true" />
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy || !text.trim()} className={PRIMARY}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
              Save
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{fact.fact}</p>
        {fact.category && (
          <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {fact.category}
          </span>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          type="button"
          onClick={startEdit}
          disabled={busy}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Edit this fact"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Delete this fact"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

/**
 * The profile: one paragraph and a list of short facts, which the server sends
 * with every question (unless switched off for that question). The right-hand
 * panel shows exactly that message, as the server rendered it.
 */
export function ProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // null = the box shows the saved paragraph; a string = the user's unsaved edit.
  const [paragraphDraft, setParagraphDraft] = useState<string | null>(null);
  const [savingParagraph, setSavingParagraph] = useState(false);

  const [newFact, setNewFact] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [adding, setAdding] = useState(false);

  const paragraph = paragraphDraft ?? profile?.paragraph ?? '';
  const paragraphDirty = profile !== null && paragraph !== profile.paragraph;

  // Reloading never touches an unsaved edit: that lives in `paragraphDraft`.
  const load = useCallback(async () => {
    setError(null);
    try {
      setProfile(await api.getProfile());
    } catch (err) {
      setError(errorText(err, 'Could not load the profile.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveParagraph = async () => {
    setSavingParagraph(true);
    setError(null);
    try {
      const p = await api.setProfileParagraph(paragraph.trim());
      setProfile(p);
      setParagraphDraft(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(errorText(err, 'Could not save the paragraph.'));
    } finally {
      setSavingParagraph(false);
    }
  };

  const addFact = async (e: FormEvent) => {
    e.preventDefault();
    const fact = newFact.trim();
    if (!fact) return;
    setAdding(true);
    setError(null);
    try {
      await api.addMemory(fact, newCategory.trim() || undefined);
      setNewFact('');
      setNewCategory('');
      await load();
    } catch (err) {
      setError(errorText(err, 'Could not add the fact.'));
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" aria-label="Loading the profile" />
      </div>
    );
  }

  const facts = profile?.facts ?? [];
  const left = profile && profile.truncated ? facts.length - profile.facts_included : 0;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserRound className="w-6 h-6 text-blue-500" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Profile</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                What the model is told about you with each question.
              </p>
            </div>
          </div>
          <button type="button" onClick={load} className={SECONDARY}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 grid gap-6 lg:grid-cols-2">
        {error && (
          <div role="alert" className="lg:col-span-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          </div>
        )}

        {/* Editing */}
        <div className="space-y-6">
          <section aria-labelledby="profile-paragraph">
            <h2 id="profile-paragraph" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              About you
            </h2>
            <textarea
              value={paragraph}
              onChange={(e) => setParagraphDraft(e.target.value)}
              maxLength={MAX_PARAGRAPH}
              rows={8}
              aria-labelledby="profile-paragraph"
              placeholder="A paragraph in your own words: your field, what you are working on, how you like answers written."
              className={INPUT}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {paragraph.length} / {MAX_PARAGRAPH}
              </span>
              <div className="flex items-center gap-2">
                {saved && (
                  <span className="text-sm text-green-600 dark:text-green-400 inline-flex items-center gap-1" role="status">
                    <Check className="w-4 h-4" aria-hidden="true" />
                    Saved
                  </span>
                )}
                <button type="button" onClick={saveParagraph} disabled={!paragraphDirty || savingParagraph} className={PRIMARY}>
                  {savingParagraph ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                  Save
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Saving an empty box removes the paragraph.</p>
          </section>

          <section aria-labelledby="profile-facts">
            <h2 id="profile-facts" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Facts ({facts.length})
            </h2>

            <form onSubmit={addFact} className="mb-3 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 space-y-2">
              <label className="block">
                <span className="sr-only">New fact</span>
                <input
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  maxLength={MAX_FACT}
                  placeholder="A short fact, e.g. Prefers concentrations in µM"
                  className={INPUT}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  Category
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    maxLength={MAX_CATEGORY}
                    list="profile-categories"
                    placeholder="optional"
                    className={`${INPUT} !w-40 !py-1`}
                  />
                </label>
                <button type="submit" disabled={adding || !newFact.trim()} className={`${PRIMARY} ml-auto`}>
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                  Add
                </button>
              </div>
              <datalist id="profile-categories">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </form>

            {facts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No facts yet.</p>
            ) : (
              <ul className="space-y-2">
                {facts.map((fact) => (
                  <FactRow key={fact.id} fact={fact} onSaved={load} onDeleted={load} onError={setError} />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* What is injected */}
        <section aria-labelledby="profile-injected" className="space-y-3">
          <h2 id="profile-injected" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            What the model receives
          </h2>

          {profile && !profile.injection_enabled && (
            <div role="note" className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Profile injection is switched off on the server (<code>PROFILE_INJECTION_ENABLED</code>).
                Nothing below is sent, whatever is stored.
              </span>
            </div>
          )}

          {profile?.truncated && (
            <div role="note" className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Your profile is longer than the {profile.max_chars.toLocaleString()}-character limit, so
                {left > 0 ? ` the last ${left} fact${left === 1 ? ' is' : 's are'}` : ' part of it is'} left
                out of the message. Shorten the paragraph or remove facts to include everything.
              </span>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            This is the message exactly as the server builds it. It rides along with each question as
            background, not as an instruction and not as evidence. Use the &ldquo;Profile&rdquo; switch
            under the question box to leave it out of one question.
          </p>

          {profile && profile.injected_message ? (
            <>
              <pre
                tabIndex={0}
                aria-label="The profile message as the model receives it"
                className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {profile.injected_message}
              </pre>
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex gap-1">
                  <dt>Size:</dt>
                  <dd className="tabular-nums">
                    {profile.injected_chars.toLocaleString()} of {profile.max_chars.toLocaleString()} characters (about {profile.est_tokens.toLocaleString()} tokens)
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Facts included:</dt>
                  <dd className="tabular-nums">
                    {profile.facts_included} of {facts.length}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Truncated:</dt>
                  <dd>{profile.truncated ? 'yes' : 'no'}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
              Nothing is sent: the profile is empty.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
