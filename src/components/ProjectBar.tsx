import { useState } from 'react';
import { FolderKanban, Link2, Unlink, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * The project switcher, and the link between this conversation and a project.
 *
 * The active project rides along with every question (`project_id`), which is
 * what gives the Develop, Critique and Draft stances their notebook; the server
 * links the conversation to it when the turn is saved. This bar also lets you
 * link or unlink a conversation by hand.
 */
export function ProjectBar() {
  const { state, setActiveProject, setActivePage, setConversationProject, showToast } = useApp();
  const { projects, activeProjectId, activeConversationId, conversations } = state;
  const [busy, setBusy] = useState(false);

  const active = projects.find((p) => p.id === activeProjectId) ?? null;
  const conversationExists = Boolean(
    activeConversationId && conversations.some((c) => c.id === activeConversationId)
  );
  const owner = activeConversationId
    ? projects.find((p) => p.conversation_ids.includes(activeConversationId)) ?? null
    : null;
  const inActive = Boolean(active && owner && owner.id === active.id);

  // Nothing to switch between and nothing active: stay out of the way.
  if (projects.length === 0 && !activeProjectId) {
    return (
      <div className="px-4 py-1.5 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-4xl mx-auto flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <FolderKanban className="w-3.5 h-3.5" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setActivePage('projects')}
            className="underline decoration-dotted underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Start a project
          </button>
          <span>to keep conversations together and give Develop, Critique and Draft a notebook.</span>
        </div>
      </div>
    );
  }

  const link = async () => {
    if (!active || !activeConversationId) return;
    setBusy(true);
    try {
      await setConversationProject(activeConversationId, active.id);
      showToast({ type: 'success', message: `Added to ${active.name}` });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not link the conversation' });
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!activeConversationId) return;
    setBusy(true);
    try {
      await setConversationProject(activeConversationId, null);
      // Leaving the project in place would link the thread again on the next question.
      setActiveProject(null);
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not unlink the conversation' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <FolderKanban className="w-4 h-4" aria-hidden="true" />
          <span>Project</span>
          <select
            value={activeProjectId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              if (id === '__manage') {
                setActivePage('projects');
                return;
              }
              setActiveProject(id);
            }}
            className="max-w-[14rem] px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__manage">Manage projects…</option>
          </select>
        </label>

        {active && conversationExists && (
          inActive ? (
            <span className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1 text-xs">
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                This conversation is in {active.name}
              </span>
              <button
                type="button"
                onClick={unlink}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Unlink className="w-3 h-3" aria-hidden="true" />}
                Remove
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={link}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Link2 className="w-3.5 h-3.5" aria-hidden="true" />}
              {owner ? `Move this conversation here from ${owner.name}` : 'Add this conversation to the project'}
            </button>
          )
        )}

        {active && !conversationExists && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            The next conversation you start joins {active.name}.
          </span>
        )}

        {!active && owner && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            In project {owner.name}; pick it above to ask within it.
          </span>
        )}
      </div>
    </div>
  );
}
