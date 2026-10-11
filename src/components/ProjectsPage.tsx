import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertCircle,
  FileText,
  MessageSquare,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { NotebookListing, Project } from '../types';

const INPUT =
  'w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500';
const BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
const PRIMARY = `${BUTTON} bg-blue-600 text-white hover:bg-blue-700`;
const SECONDARY = `${BUTTON} text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800`;
const DANGER = `${BUTTON} text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20`;

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(1)} MiB`;
}

const linesToList = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// The notebook: what the model wrote during deep runs. Read-only here.
// ---------------------------------------------------------------------------

function NotebookViewer({ projectId }: { projectId: string }) {
  const [listing, setListing] = useState<NotebookListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [raw, setRaw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.getNotebook(projectId);
      setListing(next);
      // A selected file that no longer exists is dropped.
      setSelected((current) => (current && next.files.some((f) => f.path === current) ? current : null));
    } catch (err) {
      setError(errorText(err, 'Could not load the notebook.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setLoadingFile(true);
    setConfirmDelete(false);
    api
      .readNotebookFile(projectId, selected)
      .then((file) => {
        if (!cancelled) setContent(file.content);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Could not read that file.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selected]);

  const deleteFile = async () => {
    if (!selected) return;
    try {
      await api.deleteNotebookFile(projectId, selected);
      setSelected(null);
      setConfirmDelete(false);
      await load();
    } catch (err) {
      setError(errorText(err, 'Could not delete that file.'));
    }
  };

  const files = listing?.files ?? [];
  const used = listing && listing.max_bytes > 0 ? Math.min(100, (listing.total_bytes / listing.max_bytes) * 100) : 0;

  return (
    <section aria-labelledby="notebook-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="notebook-heading" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Notebook
        </h3>
        <button type="button" onClick={load} disabled={loading} className={SECONDARY}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Notes the model keeps for this project during Develop, Critique and Draft. You can read them here.
      </p>

      {error && (
        <div role="alert" className="p-2 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {listing && (
        <div>
          <div
            className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={listing.max_bytes}
            aria-valuenow={listing.total_bytes}
            aria-label="Notebook space used"
          >
            <div className="h-full bg-blue-500" style={{ width: `${used}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {formatBytes(listing.total_bytes)} of {formatBytes(listing.max_bytes)} used
          </p>
        </div>
      )}

      {loading && !listing ? (
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" aria-label="Loading the notebook" />
      ) : files.length === 0 ? (
        <p className="p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
          The notebook is empty. It fills as the model works on this project.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
          <ul className="space-y-1" aria-label="Notebook files">
            {files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => setSelected(file.path)}
                  aria-current={selected === file.path ? 'true' : undefined}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    selected === file.path
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 shrink-0 opacity-60" aria-hidden="true" />
                    <span className="truncate">{file.path.replace(/^\/memories\//, '')}</span>
                  </span>
                  <span className="block pl-[1.375rem] text-xs text-gray-500 dark:text-gray-400">
                    {formatBytes(file.size)} &middot; {new Date(file.modified * 1000).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {!selected ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Choose a file to read it.</p>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 break-all">{selected}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setRaw((r) => !r)} aria-pressed={raw} className={SECONDARY}>
                      {raw ? 'Formatted' : 'Raw'}
                    </button>
                    {confirmDelete ? (
                      <>
                        <button type="button" onClick={deleteFile} className={DANGER}>
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                          Delete for good
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(false)} className={SECONDARY}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(true)} className={DANGER}>
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-3 max-h-[28rem] overflow-auto" tabIndex={0} aria-label="File contents">
                  {loadingFile || content === null ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" aria-label="Loading the file" />
                  ) : raw ? (
                    <pre className="whitespace-pre-wrap break-words text-xs text-gray-800 dark:text-gray-200">{content}</pre>
                  ) : (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// One project
// ---------------------------------------------------------------------------

function ProjectDetail({ project }: { project: Project }) {
  const { state, dispatch, selectConversation, setActivePage, setActiveProject, showToast } = useApp();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [questions, setQuestions] = useState(project.open_questions.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    name !== project.name ||
    description !== (project.description ?? '') ||
    linesToList(questions).join('\n') !== project.open_questions.join('\n');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        open_questions: linesToList(questions),
      });
      dispatch({ type: 'UPSERT_PROJECT', payload: updated });
      showToast({ type: 'success', message: 'Project saved' });
    } catch (err) {
      setError(errorText(err, 'Could not save the project.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteProject(project.id);
      dispatch({ type: 'REMOVE_PROJECT', payload: project.id });
      showToast({ type: 'success', message: 'Project deleted. Its conversations were kept.' });
    } catch (err) {
      setError(errorText(err, 'Could not delete the project.'));
    }
  };

  const linked = state.conversations.filter((c) => project.conversation_ids.includes(c.id));
  const isActive = state.activeProjectId === project.id;

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-3" aria-label="Project details">
        {error && (
          <div role="alert" className="p-2 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Open questions</span>
          <textarea
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            rows={4}
            placeholder="One per line"
            className={INPUT}
          />
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            The model sees the name, description and open questions with every Develop, Critique and Draft turn.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!dirty || saving || !name.trim()} className={PRIMARY}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveProject(project.id);
              setActivePage('chat');
            }}
            className={SECONDARY}
          >
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
            {isActive ? 'Back to the chat in this project' : 'Work in this project'}
          </button>
          <span className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <button type="button" onClick={remove} className={DANGER}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Delete project and notebook
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={SECONDARY}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={DANGER}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Delete
              </button>
            )}
          </span>
        </div>
      </form>

      <section aria-labelledby="project-conversations">
        <h3 id="project-conversations" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Conversations ({project.conversation_ids.length})
        </h3>
        {linked.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            None yet. Ask a question while this project is active, or link a conversation from the chat page.
          </p>
        ) : (
          <ul className="space-y-1">
            {linked.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectConversation(conv.id);
                    setActivePage('chat');
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-60" aria-hidden="true" />
                  <span className="truncate">{conv.title}</span>
                </button>
              </li>
            ))}
            {project.conversation_ids.length > linked.length && (
              <li className="px-2.5 text-xs text-gray-500 dark:text-gray-400">
                {project.conversation_ids.length - linked.length} more not shown in the sidebar list.
              </li>
            )}
          </ul>
        )}
      </section>

      <NotebookViewer projectId={project.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function ProjectsPage() {
  const { state, dispatch, refreshProjects, setActiveProject } = useApp();
  const { projects, activeProjectId } = state;
  const [selectedId, setSelectedId] = useState<string | null>(activeProjectId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // The selection follows the list: a deleted project drops out, and with
  // nothing chosen the first one is shown.
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({ name });
      dispatch({ type: 'UPSERT_PROJECT', payload: project });
      setSelectedId(project.id);
      setActiveProject(project.id);
      setNewName('');
      setCreating(false);
    } catch (err) {
      setError(errorText(err, 'Could not create the project.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FolderKanban className="w-6 h-6 text-blue-500" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Projects</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                A project gathers conversations and gives Develop, Critique and Draft a notebook to keep notes in.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => setCreating((c) => !c)} aria-expanded={creating} className={PRIMARY}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            New project
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 grid gap-6 md:grid-cols-[16rem_1fr]">
        {error && (
          <div role="alert" className="md:col-span-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          {creating && (
            <form onSubmit={create} className="p-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 space-y-2">
              <label className="block">
                <span className="sr-only">Project name</span>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={255}
                  placeholder="Project name"
                  className={INPUT}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreating(false)} className={SECONDARY}>
                  Cancel
                </button>
                <button type="submit" disabled={busy || !newName.trim()} className={PRIMARY}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                  Create
                </button>
              </div>
            </form>
          )}

          {projects.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No projects yet.</p>
          ) : (
            <ul className="space-y-1" aria-label="Projects">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(project.id)}
                    aria-current={selected?.id === project.id ? 'true' : undefined}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selected?.id === project.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span className="block truncate font-medium">{project.name}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {project.conversation_ids.length} conversation{project.conversation_ids.length === 1 ? '' : 's'}
                      {activeProjectId === project.id ? ' · active' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {selected ? (
            // Keyed by project so the form never shows another project's text.
            <ProjectDetail key={selected.id} project={selected} />
          ) : (
            <p className="p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
              Create a project to start. Questions asked while it is active, and the conversations they
              belong to, are kept together.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
