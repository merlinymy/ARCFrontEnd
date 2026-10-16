import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type {
  AppState,
  Conversation,
  Message,
  QueryOptions,
  QueryType,
  HealthStatus,
  StatsResponse,
  PipelineStepInfo,
  PipelineStepName,
  Paper,
  BatchUpload,
  UploadTask,
  BatchUploadSSEEvent,
  Citation,
  ToastMessage,
  AppPage,
  PdfHighlight,
  Project,
  RunProgress,
  DeepToolCall,
  EntailmentReport,
  AnswerStatus,
} from '../types';
import { DEFAULT_QUERY_OPTIONS, PIPELINE_STEPS, isEffortLevel } from '../types';
import { api, queryPapersStream, getUserPreferences, updateUserPreferences, type StreamEvent } from '../services/api';
import { messageFromStored } from '../lib/messages';

// Generate unique ID
const generateId = () => crypto.randomUUID();

// Check if we're on desktop (lg breakpoint = 1024px)
const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;

// The active project survives a reload. Storage can throw (private windows,
// blocked site data), and the app must work without it.
const ACTIVE_PROJECT_KEY = 'activeProjectId';
function readActiveProject(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;
  } catch {
    return null;
  }
}
function writeActiveProject(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    // ignore: a per-viewer convenience only
  }
}

// Initial state
const initialState: AppState = {
  conversations: [],
  activeConversationId: null,
  papers: [],
  indexingQueue: [],
  totalPapers: 0,
  hasMorePapers: false,
  isLoadingMorePapers: false,
  currentQuery: '',
  queryOptions: DEFAULT_QUERY_OPTIONS,
  isLoading: false,
  streamingResponse: null,
  pipelineProgress: null,
  health: null,
  stats: null,
  sidebarOpen: isDesktop, // Open on desktop, closed on mobile
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  pipelineExpanded: false,
  activePage: 'chat',
  selectedPaperId: null,
  viewingPdfId: null,
  viewingPdfPage: null,
  viewingPdfHighlight: null,
  webSearchProgress: null,
  thinkingProgress: null,
  runProgress: null,
  projects: [],
  activeProjectId: readActiveProject(),
  // Batch upload
  activeBatchUpload: null,
  isUploadPanelOpen: false,
  isUploadPanelMinimized: false,
  // Streaming state
  streamingState: null,
  // Toast notifications
  toasts: [],
};

// Action types
type Action =
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_ACTIVE_PAGE'; payload: AppPage }
  | { type: 'SET_CURRENT_QUERY'; payload: string }
  | { type: 'SET_QUERY_OPTIONS'; payload: Partial<QueryOptions> }
  | { type: 'LOAD_QUERY_OPTIONS'; payload: QueryOptions }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_HEALTH'; payload: HealthStatus | null }
  | { type: 'SET_STATS'; payload: StatsResponse | null }
  | { type: 'CREATE_CONVERSATION'; payload: Conversation }
  | { type: 'SET_ACTIVE_CONVERSATION'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { conversationId: string; message: Message } }
  | { type: 'UPDATE_CONVERSATION_TITLE'; payload: { id: string; title: string } }
  | { type: 'DELETE_CONVERSATION'; payload: string }
  | { type: 'CLEAR_CONVERSATIONS' }
  | { type: 'LOAD_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'SET_CONVERSATION_MESSAGES'; payload: { id: string; messages: Message[] } }
  | { type: 'TOGGLE_PIPELINE_EXPANDED' }
  | { type: 'SET_SELECTED_PAPER'; payload: string | null }
  | { type: 'SET_PIPELINE_PROGRESS'; payload: PipelineStepInfo[] | null }
  | { type: 'UPDATE_PIPELINE_STEP'; payload: { step: PipelineStepName; status: PipelineStepInfo['status']; data?: Record<string, unknown> } }
  // Paper library actions
  | { type: 'SET_PAPERS'; payload: { papers: Paper[]; total: number; hasMore: boolean } }
  | { type: 'APPEND_PAPERS'; payload: { papers: Paper[]; hasMore: boolean } }
  | { type: 'SET_LOADING_MORE_PAPERS'; payload: boolean }
  | { type: 'ADD_PAPER'; payload: Paper }
  | { type: 'UPDATE_PAPER'; payload: { id: string; updates: Partial<Paper> } }
  | { type: 'REMOVE_PAPER'; payload: string }
  | { type: 'SET_VIEWING_PDF'; payload: { paperId: string | null; page?: number | null; highlight?: PdfHighlight | null } }
  // Batch upload actions
  | { type: 'START_BATCH_UPLOAD'; payload: BatchUpload }
  | { type: 'UPDATE_UPLOAD_TASK'; payload: { taskId: string; updates: Partial<UploadTask> } }
  | { type: 'ADD_BATCH_TASKS'; payload: UploadTask[] }
  | { type: 'SET_UPLOAD_PANEL_OPEN'; payload: boolean }
  | { type: 'SET_UPLOAD_PANEL_MINIMIZED'; payload: boolean }
  | { type: 'CANCEL_UPLOAD_TASK'; payload: string }
  | { type: 'CLEAR_BATCH_UPLOAD' }
  // Streaming actions
  | { type: 'START_STREAMING'; payload: { messageId: string; conversationId: string } }
  | { type: 'APPEND_STREAMING_CHUNK'; payload: string }
  | { type: 'ADD_STREAMING_CITATION'; payload: Citation }
  // The server said to discard the answer so far: text and citations (answer_reset).
  | { type: 'RESET_STREAMING_ANSWER'; payload: { fallbackFrom?: string | null } }
  | { type: 'STOP_STREAMING' }
  | { type: 'UPDATE_MESSAGE_CONTENT'; payload: { conversationId: string; messageId: string; content: string } }
  | { type: 'UPDATE_MESSAGE'; payload: { conversationId: string; message: Message } }
  // Replace the placeholder (matched by its local id) with the finished message.
  | { type: 'FINALIZE_MESSAGE'; payload: { conversationId: string; localId: string; message: Message } }
  // The stream ended without `complete`: keep what arrived and mark it as cut off.
  | { type: 'CUT_OFF_MESSAGE'; payload: { conversationId: string; localId: string; reason: 'dropped' | 'stopped' } }
  // The entailment pass finished. Matched by local id, or by the stored id (a reopened thread).
  | { type: 'SET_MESSAGE_ENTAILMENT'; payload: { conversationId: string; localId: string; storedId: number | null; entailment: EntailmentReport } }
  | { type: 'RUN_EVENT'; payload: RunEvent }
  // Projects
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'UPSERT_PROJECT'; payload: Project }
  | { type: 'REMOVE_PROJECT'; payload: string }
  | { type: 'SET_ACTIVE_PROJECT'; payload: string | null }
  // After a project list loads: drop a remembered active project that no longer exists.
  | { type: 'SET_ACTIVE_PROJECT_IF_MISSING'; payload: string[] }
  // Web search actions
  | { type: 'SET_WEB_SEARCH_PROGRESS'; payload: string | null }
  | { type: 'SET_THINKING_PROGRESS'; payload: string | null }
  | { type: 'APPEND_WEB_SEARCH_CHUNK'; payload: { conversationId: string; messageId: string; chunk: string } }
  // Toast actions
  | { type: 'ADD_TOAST'; payload: Omit<ToastMessage, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: string };

// Progress events of the run in flight (long-context and deep stances)
export type RunEvent =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'long_context'; used: boolean; reason?: string; papers: number }
  | { kind: 'history'; trimmedTurns: number }
  | { kind: 'tool_call'; call: DeepToolCall }
  | { kind: 'passages'; count: number }
  | { kind: 'pause'; pauses: number }
  | { kind: 'final_turn' }
  | { kind: 'narration_reset' };

function emptyDeep(): NonNullable<RunProgress['deep']> {
  return { toolCalls: [], passagesFound: 0, pauses: 0, finalTurn: false, narrationResets: 0 };
}

export function reduceRun(prev: RunProgress | null, event: RunEvent): RunProgress | null {
  if (event.kind === 'start') {
    return { longContext: null, deep: null, trimmedTurns: 0, startedAt: Date.now() };
  }
  if (event.kind === 'end') return null;
  if (!prev) return prev;
  const deep = () => prev.deep ?? emptyDeep();
  switch (event.kind) {
    case 'long_context':
      return { ...prev, longContext: { used: event.used, reason: event.reason, papers: event.papers } };
    case 'history':
      return { ...prev, trimmedTurns: event.trimmedTurns };
    case 'tool_call':
      return { ...prev, deep: { ...deep(), toolCalls: [...deep().toolCalls, event.call] } };
    case 'passages':
      return { ...prev, deep: { ...deep(), passagesFound: deep().passagesFound + event.count } };
    case 'pause':
      return { ...prev, deep: { ...deep(), pauses: event.pauses } };
    case 'final_turn':
      return { ...prev, deep: { ...deep(), finalTurn: true } };
    case 'narration_reset':
      return { ...prev, deep: { ...deep(), narrationResets: deep().narrationResets + 1 } };
  }
}

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_THEME':
      localStorage.setItem('theme', action.payload);
      return { ...state, theme: action.payload };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'SET_SIDEBAR_OPEN':
      return { ...state, sidebarOpen: action.payload };

    case 'SET_ACTIVE_PAGE':
      return { ...state, activePage: action.payload };

    case 'SET_CURRENT_QUERY':
      return { ...state, currentQuery: action.payload };

    case 'SET_QUERY_OPTIONS':
      return { ...state, queryOptions: { ...state.queryOptions, ...action.payload } };

    case 'LOAD_QUERY_OPTIONS':
      return { ...state, queryOptions: action.payload };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_HEALTH':
      return { ...state, health: action.payload };

    case 'SET_STATS':
      return { ...state, stats: action.payload };

    case 'CREATE_CONVERSATION':
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
        activeConversationId: action.payload.id,
      };

    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversationId: action.payload };

    case 'ADD_MESSAGE': {
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.conversationId
            ? {
                ...conv,
                messages: [...conv.messages, action.payload.message],
                updatedAt: new Date(),
              }
            : conv
        ),
      };
    }

    case 'UPDATE_CONVERSATION_TITLE':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.id
            ? { ...conv, title: action.payload.title }
            : conv
        ),
      };

    case 'DELETE_CONVERSATION': {
      const filteredConversations = state.conversations.filter((c) => c.id !== action.payload);
      return {
        ...state,
        conversations: filteredConversations,
        activeConversationId:
          state.activeConversationId === action.payload
            ? filteredConversations[0]?.id ?? null
            : state.activeConversationId,
      };
    }

    case 'CLEAR_CONVERSATIONS':
      return { ...state, conversations: [], activeConversationId: null };

    case 'LOAD_CONVERSATIONS': {
      // Merge, never replace: this also runs from the always-mounted Writing page
      // while the user is mid-thread. The server list decides which conversations
      // exist and their titles and times, but it carries no messages, so loaded
      // messages (and a thread still streaming) stay.
      const local = new Map(state.conversations.map((c) => [c.id, c]));
      const fromServer = action.payload.map((c) => {
        const mine = local.get(c.id);
        return mine ? { ...c, messages: mine.messages, mode: mine.mode ?? c.mode } : c;
      });
      const serverIds = new Set(action.payload.map((c) => c.id));
      // Created here, not on the server list yet (a new thread mid-stream).
      const localOnly = state.conversations.filter((c) => !serverIds.has(c.id));
      const conversations = [...localOnly, ...fromServer];
      return {
        ...state,
        conversations,
        // Don't auto-select first conversation - landing page should show empty chat
        activeConversationId: conversations.some((c) => c.id === state.activeConversationId)
          ? state.activeConversationId
          : null,
      };
    }

    case 'SET_CONVERSATION_MESSAGES':
      return {
        ...state,
        conversations: state.conversations.map((conv) => {
          if (conv.id !== action.payload.id) return conv;
          // A reopened thread arrives from the server before an in-flight
          // entailment pass has been merged into it: keep showing "checking".
          const pending = new Set(
            conv.messages.filter((m) => m.metadata?.entailmentPending).map((m) => m.id)
          );
          const messages = action.payload.messages.map((m) =>
            pending.has(m.id) && m.metadata && !m.metadata.entailment
              ? { ...m, metadata: { ...m.metadata, entailmentPending: true } }
              : m
          );
          return { ...conv, messages };
        }),
      };

    case 'TOGGLE_PIPELINE_EXPANDED':
      return { ...state, pipelineExpanded: !state.pipelineExpanded };

    case 'SET_SELECTED_PAPER':
      return { ...state, selectedPaperId: action.payload };

    case 'SET_PIPELINE_PROGRESS':
      return { ...state, pipelineProgress: action.payload };

    case 'UPDATE_PIPELINE_STEP':
      if (!state.pipelineProgress) return state;
      return {
        ...state,
        pipelineProgress: state.pipelineProgress.map((step) =>
          step.name === action.payload.step
            ? { ...step, status: action.payload.status, data: action.payload.data }
            : step
        ),
      };

    // Paper library reducers
    case 'SET_PAPERS':
      return {
        ...state,
        papers: action.payload.papers,
        totalPapers: action.payload.total,
        hasMorePapers: action.payload.hasMore,
      };

    case 'APPEND_PAPERS':
      return {
        ...state,
        papers: [...state.papers, ...action.payload.papers],
        hasMorePapers: action.payload.hasMore,
        isLoadingMorePapers: false,
      };

    case 'SET_LOADING_MORE_PAPERS':
      return { ...state, isLoadingMorePapers: action.payload };

    case 'ADD_PAPER':
      return { ...state, papers: [action.payload, ...state.papers] };

    case 'UPDATE_PAPER':
      return {
        ...state,
        papers: state.papers.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
        ),
      };

    case 'REMOVE_PAPER':
      return {
        ...state,
        papers: state.papers.filter((p) => p.id !== action.payload),
        viewingPdfId: state.viewingPdfId === action.payload ? null : state.viewingPdfId,
        viewingPdfPage: state.viewingPdfId === action.payload ? null : state.viewingPdfPage,
        viewingPdfHighlight: state.viewingPdfId === action.payload ? null : state.viewingPdfHighlight,
      };

    case 'SET_VIEWING_PDF':
      return {
        ...state,
        viewingPdfId: action.payload.paperId,
        viewingPdfPage: action.payload.page ?? null,
        viewingPdfHighlight: action.payload.paperId ? action.payload.highlight ?? null : null,
      };

    // Batch upload reducers
    case 'START_BATCH_UPLOAD':
      return {
        ...state,
        activeBatchUpload: action.payload,
        isUploadPanelOpen: true,
        isUploadPanelMinimized: false,
      };

    case 'UPDATE_UPLOAD_TASK':
      if (!state.activeBatchUpload) return state;
      return {
        ...state,
        activeBatchUpload: {
          ...state.activeBatchUpload,
          tasks: state.activeBatchUpload.tasks.map((task) =>
            task.taskId === action.payload.taskId
              ? { ...task, ...action.payload.updates }
              : task
          ),
        },
      };

    case 'ADD_BATCH_TASKS':
      if (!state.activeBatchUpload) return state;
      return {
        ...state,
        activeBatchUpload: {
          ...state.activeBatchUpload,
          tasks: [...state.activeBatchUpload.tasks, ...action.payload],
        },
      };

    case 'SET_UPLOAD_PANEL_OPEN':
      return { ...state, isUploadPanelOpen: action.payload };

    case 'SET_UPLOAD_PANEL_MINIMIZED':
      return { ...state, isUploadPanelMinimized: action.payload };

    case 'CANCEL_UPLOAD_TASK':
      if (!state.activeBatchUpload) return state;
      return {
        ...state,
        activeBatchUpload: {
          ...state.activeBatchUpload,
          tasks: state.activeBatchUpload.tasks.map((task) =>
            task.taskId === action.payload
              ? { ...task, status: 'error' as const, errorMessage: 'Cancelled' }
              : task
          ),
        },
      };

    case 'CLEAR_BATCH_UPLOAD':
      return {
        ...state,
        activeBatchUpload: null,
        isUploadPanelOpen: false,
        isUploadPanelMinimized: false,
      };

    // Streaming reducers
    case 'START_STREAMING':
      return {
        ...state,
        streamingState: {
          messageId: action.payload.messageId,
          conversationId: action.payload.conversationId,
          content: '',
          citations: [],
          isStreaming: true,
        },
      };

    case 'APPEND_STREAMING_CHUNK':
      if (!state.streamingState) return state;
      return {
        ...state,
        streamingState: {
          ...state.streamingState,
          content: state.streamingState.content + action.payload,
        },
        // Also update the message in the conversation
        conversations: state.conversations.map((conv) =>
          conv.id === state.streamingState?.conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === state.streamingState?.messageId
                    ? { ...msg, content: state.streamingState.content + action.payload }
                    : msg
                ),
              }
            : conv
        ),
      };

    case 'ADD_STREAMING_CITATION': {
      if (!state.streamingState) return state;
      const { conversationId, messageId } = state.streamingState;
      // A citation id is unique within an answer; a repeat replaces.
      const withCitation = (list: Citation[]) => [
        ...list.filter((c) => c.id !== action.payload.id),
        action.payload,
      ];
      return {
        ...state,
        streamingState: {
          ...state.streamingState,
          citations: withCitation(state.streamingState.citations),
        },
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === messageId
                    ? {
                        ...msg,
                        metadata: {
                          ...msg.metadata,
                          citations: withCitation(msg.metadata?.citations ?? []),
                        },
                      }
                    : msg
                ),
              }
            : conv
        ),
      };
    }

    case 'RESET_STREAMING_ANSWER': {
      if (!state.streamingState) return state;
      const { conversationId, messageId } = state.streamingState;
      return {
        ...state,
        streamingState: { ...state.streamingState, content: '', citations: [] },
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === messageId
                    ? {
                        ...msg,
                        content: '',
                        metadata: {
                          ...msg.metadata,
                          citations: [],
                          ...(action.payload.fallbackFrom !== undefined
                            ? { fallbackFrom: action.payload.fallbackFrom }
                            : {}),
                        },
                      }
                    : msg
                ),
              }
            : conv
        ),
      };
    }

    case 'STOP_STREAMING':
      return {
        ...state,
        streamingState: null,
      };

    case 'UPDATE_MESSAGE_CONTENT':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === action.payload.messageId
                    ? { ...msg, content: action.payload.content }
                    : msg
                ),
              }
            : conv
        ),
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === action.payload.message.id
                    ? action.payload.message
                    : msg
                ),
              }
            : conv
        ),
      };

    case 'FINALIZE_MESSAGE':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === action.payload.localId ? action.payload.message : msg
                ),
              }
            : conv
        ),
      };

    case 'CUT_OFF_MESSAGE':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) => {
                  if (msg.id !== action.payload.localId) return msg;
                  // Partial text is real: keep it and say it is partial.
                  if (msg.content.trim()) {
                    return { ...msg, metadata: { ...msg.metadata, cutOff: action.payload.reason } };
                  }
                  // Nothing arrived; an empty answer card would be a blank box.
                  return {
                    ...msg,
                    content:
                      action.payload.reason === 'stopped'
                        ? 'You stopped this run before an answer was written.'
                        : 'The connection closed before an answer arrived.',
                    metadata: { ...msg.metadata, answerStatus: 'incomplete' as AnswerStatus },
                  };
                }),
              }
            : conv
        ),
      };

    case 'SET_MESSAGE_ENTAILMENT':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === action.payload.localId ||
                  (action.payload.storedId != null &&
                    (msg.metadata?.messageId === action.payload.storedId ||
                      msg.id === String(action.payload.storedId)))
                    ? {
                        ...msg,
                        metadata: {
                          ...msg.metadata,
                          entailment: action.payload.entailment,
                          entailmentPending: false,
                        },
                      }
                    : msg
                ),
              }
            : conv
        ),
      };

    case 'RUN_EVENT':
      return { ...state, runProgress: reduceRun(state.runProgress, action.payload) };

    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };

    case 'UPSERT_PROJECT': {
      const incoming = action.payload;
      const moved = new Set(incoming.conversation_ids);
      const exists = state.projects.some((p) => p.id === incoming.id);
      const projects = (exists
        ? state.projects.map((p) => (p.id === incoming.id ? incoming : p))
        : [incoming, ...state.projects]
      ).map((p) =>
        // A conversation belongs to at most one project: linking moves it.
        p.id === incoming.id
          ? p
          : { ...p, conversation_ids: p.conversation_ids.filter((id) => !moved.has(id)) }
      );
      return { ...state, projects };
    }

    case 'REMOVE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        activeProjectId: state.activeProjectId === action.payload ? null : state.activeProjectId,
      };

    case 'SET_ACTIVE_PROJECT':
      return { ...state, activeProjectId: action.payload };

    case 'SET_ACTIVE_PROJECT_IF_MISSING':
      return state.activeProjectId && !action.payload.includes(state.activeProjectId)
        ? { ...state, activeProjectId: null }
        : state;

    case 'SET_WEB_SEARCH_PROGRESS':
      return { ...state, webSearchProgress: action.payload };

    case 'SET_THINKING_PROGRESS':
      return { ...state, thinkingProgress: action.payload };

    case 'APPEND_WEB_SEARCH_CHUNK':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.conversationId
            ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === action.payload.messageId
                    ? { ...msg, content: msg.content + action.payload.chunk }
                    : msg
                ),
              }
            : conv
        ),
      };

    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, { ...action.payload, id: generateId() }],
      };

    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.payload),
      };

    default:
      return state;
  }
}

// Context
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  // Convenience actions
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setActivePage: (page: AppPage) => void;
  createNewConversation: () => string;
  submitQuery: (query: string) => Promise<void>;
  /** Abort the query in flight. The partial answer stays, marked as stopped. */
  stopQuery: () => void;
  clearConversation: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshStats: () => Promise<void>;
  // Conversation actions
  refreshConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  // Paper library actions
  refreshPapers: () => Promise<void>;
  loadMorePapers: () => Promise<void>;
  deletePaper: (paperId: string) => Promise<void>;
  updatePaper: (paperId: string, updates: Partial<Paper>) => void;
  setViewingPdf: (paperId: string | null, page?: number | null, highlight?: PdfHighlight | null) => void;
  // Projects
  refreshProjects: () => Promise<void>;
  setActiveProject: (projectId: string | null) => void;
  /** Link (or, with null, unlink) a conversation. Resolves to the updated project, or null. */
  setConversationProject: (conversationId: string, projectId: string | null) => Promise<void>;
  // Batch upload actions
  startBatchUpload: (files: File[]) => Promise<void>;
  cancelUploadTask: (taskId: string) => Promise<void>;
  retryUploadTask: (taskId: string) => Promise<void>;
  openUploadPanel: () => void;
  closeUploadPanel: () => void;
  minimizeUploadPanel: () => void;
  maximizeUploadPanel: () => void;
  // Toast actions
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// Provider component
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // The conversation a stream is currently writing into. Streaming updates are
  // addressed by conversation id (not "the active one"), so switching threads
  // mid-answer is safe; this ref only stops a refetch of that same thread from
  // replacing the half-built message with the server's (not yet written) copy.
  const streamingConversationRef = useRef<string | null>(null);
  // Latest projects, for selectConversation without re-creating it on every change.
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = state.projects;
  // Aborts the query stream in flight (the Stop button, and unmount: logout
  // unmounts this provider and a minutes-long run must not outlive the session).
  const queryAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queryAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    writeActiveProject(state.activeProjectId);
  }, [state.activeProjectId]);

  // Apply theme to document
  useEffect(() => {
    if (state.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.theme]);

  // Load user preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getUserPreferences();
        console.log('[Preferences] Loaded from server:', prefs);
        dispatch({
          type: 'LOAD_QUERY_OPTIONS',
          payload: {
            // Only the stored values for the controls the panel still has are
            // read. The rest stay on the server untouched.
            effort: isEffortLevel(prefs.effort) ? prefs.effort : DEFAULT_QUERY_OPTIONS.effort,
            // Stance is per-conversation, not a stored user preference, so it
            // resets to the default here and is restored by selectConversation.
            mode: DEFAULT_QUERY_OPTIONS.mode,
            paperFilter: [],
            sectionFilter: null,
            enableWebSearch: prefs.enable_web_search ?? DEFAULT_QUERY_OPTIONS.enableWebSearch,
            enablePdfUpload: prefs.enable_pdf_upload ?? false,
            // Per message, not a stored preference.
            useProfile: DEFAULT_QUERY_OPTIONS.useProfile,
          },
        });
      } catch (error) {
        console.log('[Preferences] Failed to load (user may not be authenticated):', error);
        // Silently fail - user preferences will use defaults
      }
    };
    loadPreferences();
  }, []);

  // Save preferences when they change (debounced)
  useEffect(() => {
    const savePreferences = async () => {
      try {
        await updateUserPreferences({
          // A partial update: fields left out are not touched on the server,
          // so values stored for controls that no longer exist stay as they were.
          effort: state.queryOptions.effort,
          enable_web_search: state.queryOptions.enableWebSearch,
          enable_pdf_upload: state.queryOptions.enablePdfUpload,
        });
        console.log('[Preferences] Saved to server');
      } catch (error) {
        // Silently fail - preferences will be saved next time
        console.log('[Preferences] Failed to save:', error);
      }
    };

    // Debounce saves to avoid too many requests
    const timeoutId = setTimeout(savePreferences, 1000);
    return () => clearTimeout(timeoutId);
  }, [state.queryOptions]);

  // Convenience actions
  const setTheme = useCallback((theme: 'light' | 'dark') => {
    dispatch({ type: 'SET_THEME', payload: theme });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);

  const setActivePage = useCallback((page: AppPage) => {
    dispatch({ type: 'SET_ACTIVE_PAGE', payload: page });
  }, []);

  const createNewConversation = useCallback(() => {
    // Just clear the active conversation to show empty chat
    // Actual conversation will be created when user sends first message
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: null });
    return '';
  }, []);

  const submitQuery = useCallback(async (query: string) => {
    if (!query.trim()) return;

    // Created before the first await so Stop also works while the new
    // conversation is still being saved.
    const controller = new AbortController();
    queryAbortRef.current = controller;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'RUN_EVENT', payload: { kind: 'start' } });

    // Initialize pipeline progress
    const initialProgress: PipelineStepInfo[] = PIPELINE_STEPS.map((step) => ({
      ...step,
      status: 'pending' as const,
    }));
    dispatch({ type: 'SET_PIPELINE_PROGRESS', payload: initialProgress });

    // Ensure we have an active conversation
    let conversationId = state.activeConversationId;

    // Verify the active conversation actually exists, or create a new one
    const conversationExists = conversationId && state.conversations.some((c) => c.id === conversationId);

    if (!conversationExists) {
      conversationId = generateId();
      const title = query.slice(0, 50) + (query.length > 50 ? '...' : '');
      const conversation: Conversation = {
        id: conversationId,
        title,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        mode: state.queryOptions.mode,
      };
      dispatch({ type: 'CREATE_CONVERSATION', payload: conversation });

      // Persist new conversation to backend
      try {
        await api.createConversation(conversationId, title, state.queryOptions.mode);
      } catch (error) {
        console.error('Failed to create conversation in backend:', error);
        // Continue anyway - conversation exists locally
      }
    }

    // At this point, conversationId is guaranteed to be a string
    // (either from state or newly generated)
    if (!conversationId) {
      throw new Error('Failed to establish conversation ID');
    }
    const activeConversationId = conversationId;
    const projectId = state.activeProjectId;

    // Add query message
    const queryMessage: Message = {
      id: generateId(),
      type: 'query',
      content: query,
      timestamp: new Date(),
    };
    dispatch({
      type: 'ADD_MESSAGE',
      payload: { conversationId: activeConversationId, message: queryMessage },
    });

    // Create a placeholder response message for streaming. `citations: []`
    // (an array, not undefined) is what marks it as a W3 message.
    const responseMessageId = generateId();
    const placeholderMessage: Message = {
      id: responseMessageId,
      type: 'response',
      content: '',
      timestamp: new Date(),
      metadata: {
        citations: [],
        claims: [],
      },
    };
    dispatch({
      type: 'ADD_MESSAGE',
      payload: { conversationId: activeConversationId, message: placeholderMessage },
    });

    // Start streaming state
    dispatch({
      type: 'START_STREAMING',
      payload: { messageId: responseMessageId, conversationId: activeConversationId },
    });
    streamingConversationRef.current = activeConversationId;

    const startTime = performance.now();
    const completedSteps: Set<PipelineStepName> = new Set();
    let streamedThinking = '';
    let streamedWebSearchContent = '';
    let webSearchMessageId: string | null = null;
    // The server sent `complete`: the answer is final and persisted. After this
    // the stream may still carry a web-search message and the entailment event.
    let answered = false;
    let storedMessageId: number | null = null;
    let entailmentExpected = false;
    let entailmentArrived = false;
    let loadingFinished = false;

    // The input is released when the answer is final, not when the stream
    // closes: the entailment pass runs for a few seconds after `complete` and
    // nobody should have to wait for it to ask the next question. Idempotent,
    // so the error path and `finally` can both call it.
    const finishLoading = () => {
      if (loadingFinished) return;
      loadingFinished = true;
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_CURRENT_QUERY', payload: '' });
      dispatch({ type: 'SET_PIPELINE_PROGRESS', payload: null });
      dispatch({ type: 'SET_THINKING_PROGRESS', payload: null });
      dispatch({ type: 'SET_WEB_SEARCH_PROGRESS', payload: null });
      dispatch({ type: 'RUN_EVENT', payload: { kind: 'end' } });
      if (streamingConversationRef.current === activeConversationId) {
        streamingConversationRef.current = null;
      }
    };

    const setEntailment = (entailment: EntailmentReport) =>
      dispatch({
        type: 'SET_MESSAGE_ENTAILMENT',
        payload: {
          conversationId: activeConversationId,
          localId: responseMessageId,
          storedId: storedMessageId,
          entailment,
        },
      });

    try {
      // Log query options being sent to API
      console.log('[Query] Submitting with options:', {
        mode: state.queryOptions.mode,
        enableWebSearch: state.queryOptions.enableWebSearch,
        useProfile: state.queryOptions.useProfile,
        projectId,
      });

      await queryPapersStream(
        query,
        (event: StreamEvent) => {
          if (event.type === 'progress') {
            const stepName = event.step as PipelineStepName;
            // Cast data to Record for flexible property access
            const data = event.data as Record<string, unknown>;

            // Handle streaming answer chunks. A chunk can be a citation marker
            // on its own ("⟦3⟧"); the renderer turns it into a chip.
            if (stepName === 'answer_chunk' && data?.chunk) {
              const chunk = data.chunk as string;
              dispatch({ type: 'APPEND_STREAMING_CHUNK', payload: chunk });
              // The model has started writing the answer; stop showing reasoning
              if (streamedThinking) {
                streamedThinking = '';
                dispatch({ type: 'SET_THINKING_PROGRESS', payload: null });
              }
              return;
            }

            // Handle summarized reasoning - kept out of the answer text
            if (stepName === 'thinking_chunk' && data?.chunk) {
              streamedThinking += data.chunk as string;
              dispatch({ type: 'SET_THINKING_PROGRESS', payload: streamedThinking });
              return;
            }

            // A full citation object, always ahead of the chunk holding its marker.
            if (stepName === 'citation' && data) {
              dispatch({ type: 'ADD_STREAMING_CITATION', payload: data as unknown as Citation });
              return;
            }

            // Discard the answer so far: its text and its citations.
            //   fallback: the answer model declined partway and a fallback restarts.
            //   tool_use: a deep run's narration before a tool call.
            if (stepName === 'answer_reset') {
              const fromModel = typeof data?.from_model === 'string' ? data.from_model : undefined;
              dispatch({
                type: 'RESET_STREAMING_ANSWER',
                payload: data?.reason === 'fallback' ? { fallbackFrom: fromModel ?? null } : {},
              });
              if (data?.reason === 'tool_use') {
                dispatch({ type: 'RUN_EVENT', payload: { kind: 'narration_reset' } });
              }
              return;
            }

            // What this turn carries from the thread.
            if (stepName === 'memory') {
              dispatch({
                type: 'RUN_EVENT',
                payload: { kind: 'history', trimmedTurns: Number(data?.trimmed_turns ?? 0) },
              });
              return;
            }

            // The selected papers were sent whole, or were not and why.
            if (stepName === 'long_context') {
              dispatch({
                type: 'RUN_EVENT',
                payload: {
                  kind: 'long_context',
                  used: Boolean(data?.used),
                  reason: typeof data?.reason === 'string' ? data.reason : undefined,
                  papers: Array.isArray(data?.papers) ? data.papers.length : 0,
                },
              });
              return;
            }

            // Deep stances: the tool loop.
            if (stepName === 'tool_call') {
              dispatch({
                type: 'RUN_EVENT',
                payload: {
                  kind: 'tool_call',
                  call: {
                    name: String(data?.name ?? 'tool'),
                    input: (data?.input as Record<string, unknown>) ?? {},
                    passages: Number(data?.passages ?? 0),
                  },
                },
              });
              return;
            }
            if (stepName === 'sources_added') {
              const added = Array.isArray(data?.sources) ? data.sources.length : 0;
              dispatch({ type: 'RUN_EVENT', payload: { kind: 'passages', count: added } });
              return;
            }
            if (stepName === 'pause_turn') {
              dispatch({ type: 'RUN_EVENT', payload: { kind: 'pause', pauses: Number(data?.pauses ?? 0) } });
              return;
            }
            if (stepName === 'deep_final_turn') {
              dispatch({ type: 'RUN_EVENT', payload: { kind: 'final_turn' } });
              return;
            }

            // answer_complete: `complete.answer` is authoritative. verification
            // ({deferred} / {skipped}) only announces the later entailment event.
            if (stepName === 'answer_complete' || stepName === 'verification') {
              return;
            }

            // Handle web search streaming chunks
            if (stepName === 'web_search_chunk' && data?.chunk) {
              const chunk = data.chunk as string;
              streamedWebSearchContent += chunk;

              // Create placeholder web search message if it doesn't exist
              if (!webSearchMessageId) {
                webSearchMessageId = generateId();
                const placeholderWebSearchMessage: Message = {
                  id: webSearchMessageId,
                  type: 'web_search',
                  content: '',
                  timestamp: new Date(),
                  metadata: {
                    isWebSearch: true,
                    webSearchSources: [],
                  },
                };
                dispatch({
                  type: 'ADD_MESSAGE',
                  payload: { conversationId: activeConversationId, message: placeholderWebSearchMessage },
                });
              }

              // Append chunk to web search message
              dispatch({
                type: 'APPEND_WEB_SEARCH_CHUNK',
                payload: { conversationId: activeConversationId, messageId: webSearchMessageId, chunk },
              });
              return;
            }

            // Handle web search progress messages
            if (stepName === 'web_search_progress' && data?.message) {
              dispatch({ type: 'SET_WEB_SEARCH_PROGRESS', payload: data.message as string });
              return;
            }

            // Light the indicator the moment the search starts, not when the
            // first progress message happens to arrive. Those come from the
            // search tool and can be far apart or absent entirely, which left
            // a long web search looking identical to a hung request - the
            // only cue was the spinner in the composer.
            if (stepName === 'web_search' && data?.status === 'starting') {
              dispatch({ type: 'SET_WEB_SEARCH_PROGRESS', payload: 'Searching the web…' });
              return;
            }

            // Clear web search progress when web search completes
            if (stepName === 'web_search' && data?.status === 'complete') {
              dispatch({ type: 'SET_WEB_SEARCH_PROGRESS', payload: null });
            }

            // Mark this step as active and previous steps as completed
            PIPELINE_STEPS.forEach((s) => {
              if (s.name === stepName) {
                dispatch({
                  type: 'UPDATE_PIPELINE_STEP',
                  payload: { step: s.name, status: 'active', data },
                });
              } else if (completedSteps.has(s.name)) {
                // Already completed
              } else {
                // Check if this step comes before the current one
                const currentIdx = PIPELINE_STEPS.findIndex((p) => p.name === stepName);
                const thisIdx = PIPELINE_STEPS.findIndex((p) => p.name === s.name);
                if (thisIdx < currentIdx) {
                  completedSteps.add(s.name);
                  dispatch({
                    type: 'UPDATE_PIPELINE_STEP',
                    payload: { step: s.name, status: data?.skipped ? 'skipped' : 'completed' },
                  });
                }
              }
            });

            // Mark step completed when we get data (not just "starting")
            if (data && data.status !== 'starting') {
              completedSteps.add(stepName);
              // Determine status: failed if success is explicitly false, skipped if marked, otherwise completed
              let status: 'completed' | 'skipped' | 'failed' = 'completed';
              if (data.success === false) {
                status = 'failed';
              } else if (data.skipped) {
                status = 'skipped';
              }
              dispatch({
                type: 'UPDATE_PIPELINE_STEP',
                payload: {
                  step: stepName,
                  status,
                  data
                },
              });
            }
          } else if (event.type === 'web_search') {
            // Update web search message with sources
            if (webSearchMessageId) {
              // Update existing message with sources
              dispatch({
                type: 'UPDATE_MESSAGE',
                payload: {
                  conversationId: activeConversationId,
                  message: {
                    id: webSearchMessageId,
                    type: 'web_search',
                    content: streamedWebSearchContent || event.answer,
                    timestamp: new Date(),
                    metadata: {
                      isWebSearch: true,
                      webSearchSources: event.sources,
                    },
                  },
                },
              });
            } else {
              // Fallback: create message if streaming didn't happen
              const webSearchMessage: Message = {
                id: generateId(),
                type: 'web_search',
                content: event.answer,
                timestamp: new Date(),
                metadata: {
                  isWebSearch: true,
                  webSearchSources: event.sources,
                },
              };
              dispatch({
                type: 'ADD_MESSAGE',
                payload: { conversationId: activeConversationId, message: webSearchMessage },
              });
            }
            // Reset for next query
            streamedWebSearchContent = '';
            webSearchMessageId = null;
          } else if (event.type === 'complete') {
            const latency = performance.now() - startTime;
            answered = true;
            storedMessageId = event.message_id ?? null;
            entailmentExpected = Boolean(event.entailment_pending);

            // Stop streaming state
            dispatch({ type: 'STOP_STREAMING' });

            // `complete.answer` replaces whatever was streamed (the contract:
            // it is authoritative, and for any status but 'ok' it is a notice).
            dispatch({
              type: 'FINALIZE_MESSAGE',
              payload: {
                conversationId: activeConversationId,
                localId: responseMessageId,
                message: {
                  id: responseMessageId,
                  type: 'response',
                  content: event.answer,
                  timestamp: new Date(),
                  metadata: {
                    messageId: storedMessageId,
                    queryType: event.query_type as QueryType,
                    expandedQuery: event.expanded_query,
                    sources: event.sources,
                    retrievalCount: event.retrieval_count,
                    rerankedCount: event.reranked_count,
                    latency,
                    warnings: event.warnings,
                    citations: event.citations ?? [],
                    claims: event.claims ?? [],
                    answerStatus: event.answer_status,
                    servedModel: event.served_model,
                    fallbackUsed: event.fallback_used,
                    stopReason: event.stop_reason,
                    retrievalMode: event.retrieval_mode,
                    longContext: event.long_context,
                    hybridFallback: event.hybrid_fallback,
                    history: event.history,
                    profileUsed: event.profile_used,
                    deep: event.deep,
                    mode: event.mode,
                    entailment: null,
                    entailmentPending: entailmentExpected,
                  },
                },
              },
            });

            // Release the input; the entailment event (if any) still follows.
            finishLoading();

            // Update conversation title if it's the first query
            const conversation = state.conversations.find((c) => c.id === activeConversationId);
            if (conversation?.title === 'New Conversation') {
              dispatch({
                type: 'UPDATE_CONVERSATION_TITLE',
                payload: { id: activeConversationId, title: query.slice(0, 50) + (query.length > 50 ? '...' : '') },
              });
            }
          } else if (event.type === 'entailment') {
            entailmentArrived = true;
            setEntailment({
              status: event.status,
              model: event.model,
              labels: event.labels ?? [],
              summary: event.summary ?? {},
              error: event.error ?? null,
              latency_ms: event.latency_ms ?? 0,
            });
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        },
        {
          effort: state.queryOptions.effort,
          paperIds: state.queryOptions.paperFilter,
          conversationId: activeConversationId,
          mode: state.queryOptions.mode,
          enableWebSearch: state.queryOptions.enableWebSearch,
          enablePdfUpload: state.queryOptions.enablePdfUpload,
          useProfile: state.queryOptions.useProfile,
          projectId,
        },
        controller.signal
      );

      // The stream closed cleanly but the server never said `complete` (a
      // tunnel or proxy cut it). Without this the half answer would sit in the
      // "streaming" state forever, with no footer and no error.
      if (!answered) {
        dispatch({ type: 'STOP_STREAMING' });
        dispatch({
          type: 'CUT_OFF_MESSAGE',
          payload: {
            conversationId: activeConversationId,
            localId: responseMessageId,
            reason: controller.signal.aborted ? 'stopped' : 'dropped',
          },
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // Stop was pressed (or the provider unmounted): a clean stop, not a failure.
        if (!answered) {
          dispatch({ type: 'STOP_STREAMING' });
          dispatch({
            type: 'CUT_OFF_MESSAGE',
            payload: { conversationId: activeConversationId, localId: responseMessageId, reason: 'stopped' },
          });
        }
        return;
      }
      console.error('Query failed:', error);
      const text = error instanceof Error ? error.message : 'Failed to process query';
      dispatch({ type: 'STOP_STREAMING' });
      if (!answered) {
        // The placeholder becomes the error notice. (Adding a second message
        // would leave an empty answer card above it.)
        dispatch({
          type: 'FINALIZE_MESSAGE',
          payload: {
            conversationId: activeConversationId,
            localId: responseMessageId,
            message: {
              id: responseMessageId,
              type: 'response',
              content: `Error: ${text}`,
              timestamp: new Date(),
              metadata: { citations: [], claims: [], answerStatus: 'error' as AnswerStatus },
            },
          },
        });
      }
    } finally {
      finishLoading();
      // The answer is on screen but the check never reported (the connection
      // dropped). Say so quietly instead of spinning forever.
      if (answered && entailmentExpected && !entailmentArrived) {
        setEntailment({
          status: 'error',
          model: null,
          labels: [],
          summary: {},
          error: 'The connection closed before the check finished.',
          latency_ms: 0,
        });
      }
      if (queryAbortRef.current === controller) queryAbortRef.current = null;
      // Unmounted (logout): nothing left to refresh, and the token is gone.
      if (mountedRef.current) {
        // Refresh stats to update query count and cache hit rate
        try {
          const stats = await api.getStats();
          dispatch({ type: 'SET_STATS', payload: stats });
        } catch (error) {
          console.error('Failed to refresh stats:', error);
        }
        // A turn asked under a project links its conversation to it server side.
        if (projectId) {
          try {
            const { projects } = await api.getProjects();
            dispatch({ type: 'SET_PROJECTS', payload: projects });
          } catch (error) {
            console.error('Failed to refresh projects:', error);
          }
        }
      }
    }
  }, [state.activeConversationId, state.conversations, state.queryOptions, state.activeProjectId]);

  const stopQuery = useCallback(() => {
    queryAbortRef.current?.abort();
  }, []);

  // Since W3 the model's view of a thread is rebuilt from the stored messages
  // on every turn, and POST /conversation/clear is a no-op: the only thing that
  // changes what the model sees is deleting the messages. So "clear" deletes
  // the thread, on the server as well as here.
  const clearConversation = useCallback(async () => {
    if (!state.activeConversationId) return;
    try {
      await api.deleteConversation(state.activeConversationId);
      dispatch({ type: 'DELETE_CONVERSATION', payload: state.activeConversationId });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, [state.activeConversationId]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      await api.deleteConversation(conversationId);
      dispatch({ type: 'DELETE_CONVERSATION', payload: conversationId });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const health = await api.getHealth();
      dispatch({ type: 'SET_HEALTH', payload: health });
    } catch (error) {
      console.error('Failed to fetch health:', error);
      dispatch({
        type: 'SET_HEALTH',
        payload: { status: 'unhealthy', services: {} },
      });
    }
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const stats = await api.getStats();
      dispatch({ type: 'SET_STATS', payload: stats });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await api.getConversations();
      // Load conversations without messages first (fast)
      const conversations: Conversation[] = response.conversations.map((conv) => ({
        id: conv.id,
        title: conv.title || 'Untitled',
        messages: [],
        createdAt: new Date(conv.created_at),
        updatedAt: new Date(conv.updated_at),
      }));
      dispatch({ type: 'LOAD_CONVERSATIONS', payload: conversations });
    } catch (error) {
      // Silently fail if not authenticated - conversations will be local only
      console.debug('Failed to fetch conversations (user may not be authenticated):', error);
    }
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: id });

    // Questions asked here go to the project this thread belongs to, if any.
    // (Staying on another project would silently move this thread into it on
    // the next turn.)
    const owner = projectsRef.current.find((p) => p.conversation_ids.includes(id));
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: owner?.id ?? null });

    // A stream is still writing into this thread: its half-built message is
    // newer than anything the server has, so do not replace it.
    if (streamingConversationRef.current === id) return;

    // Always fetch fresh messages from server to ensure we have the latest
    // (removes stale cache issue where messages saved after frontend closed aren't loaded)
    try {
      const fullConv = await api.getConversation(id);

      // Restore the stance this thread was last held in, so reopening a
      // critique thread does not silently answer in Ask mode.
      if (fullConv.mode) {
        dispatch({ type: 'SET_QUERY_OPTIONS', payload: { mode: fullConv.mode } });
      }

      const messages: Message[] = (fullConv.messages || []).map(messageFromStored);
      // A stream may have started in this thread while the fetch was in flight.
      if (streamingConversationRef.current === id) return;
      dispatch({ type: 'SET_CONVERSATION_MESSAGES', payload: { id, messages } });
    } catch (error) {
      console.error('Failed to load conversation messages:', error);
    }
  }, []);

  // Projects
  const refreshProjects = useCallback(async () => {
    try {
      const { projects } = await api.getProjects();
      dispatch({ type: 'SET_PROJECTS', payload: projects });
      // A remembered project that no longer exists must not ride along on queries.
      dispatch({ type: 'SET_ACTIVE_PROJECT_IF_MISSING', payload: projects.map((p) => p.id) });
    } catch (error) {
      console.debug('Failed to fetch projects (user may not be authenticated):', error);
    }
  }, []);

  const setActiveProject = useCallback((projectId: string | null) => {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: projectId });
  }, []);

  const setConversationProject = useCallback(
    async (conversationId: string, projectId: string | null) => {
      if (projectId) {
        const project = await api.linkConversationToProject(projectId, conversationId);
        dispatch({ type: 'UPSERT_PROJECT', payload: project });
      } else {
        // Unlink from whichever project holds it.
        const owner = projectsRef.current.find((p) => p.conversation_ids.includes(conversationId));
        if (owner) {
          await api.unlinkConversationFromProject(owner.id, conversationId);
          dispatch({
            type: 'UPSERT_PROJECT',
            payload: {
              ...owner,
              conversation_ids: owner.conversation_ids.filter((c) => c !== conversationId),
            },
          });
        }
      }
    },
    []
  );

  // Paper library actions
  const refreshPapers = useCallback(async () => {
    try {
      const response = await api.getPapers(0, 50);
      dispatch({
        type: 'SET_PAPERS',
        payload: {
          papers: response.papers,
          total: response.total,
          hasMore: response.hasMore,
        },
      });
    } catch (error) {
      console.error('Failed to fetch papers:', error);
    }
  }, []);

  const loadMorePapers = useCallback(async () => {
    if (state.isLoadingMorePapers || !state.hasMorePapers) return;

    dispatch({ type: 'SET_LOADING_MORE_PAPERS', payload: true });
    try {
      const offset = state.papers.length;
      const response = await api.getPapers(offset, 50);
      dispatch({
        type: 'APPEND_PAPERS',
        payload: {
          papers: response.papers,
          hasMore: response.hasMore,
        },
      });
    } catch (error) {
      console.error('Failed to load more papers:', error);
      dispatch({ type: 'SET_LOADING_MORE_PAPERS', payload: false });
    }
  }, [state.isLoadingMorePapers, state.hasMorePapers, state.papers.length]);

  const deletePaperAction = useCallback(async (paperId: string) => {
    try {
      await api.deletePaper(paperId);
      dispatch({ type: 'REMOVE_PAPER', payload: paperId });
      // Refresh stats after deletion
      refreshStats();
    } catch (error) {
      console.error('Failed to delete paper:', error);
      throw error;
    }
  }, [refreshStats]);

  const updatePaperAction = useCallback((paperId: string, updates: Partial<Paper>) => {
    dispatch({ type: 'UPDATE_PAPER', payload: { id: paperId, updates } });
  }, []);

  const setViewingPdf = useCallback(
    (paperId: string | null, page?: number | null, highlight?: PdfHighlight | null) => {
      dispatch({ type: 'SET_VIEWING_PDF', payload: { paperId, page, highlight } });
    },
    []
  );

  // SSE stream ref to track connection state
  const sseStreamRef = useRef<{ ready: Promise<void>; close: () => void } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Event queue to space out rapid SSE events so React renders each step
  const eventQueueRef = useRef<BatchUploadSSEEvent[]>([]);
  const processingEventsRef = useRef(false);

  // Direct event dispatcher (processes a single event immediately)
  const dispatchSSEEvent = useCallback((event: BatchUploadSSEEvent) => {
    console.log('[SSE] dispatch', event.type, event.status, event.currentStep, event.progressPercent);
    if (event.type === 'task_progress' && event.taskId) {
      dispatch({
        type: 'UPDATE_UPLOAD_TASK',
        payload: {
          taskId: event.taskId,
          updates: {
            status: (event.status as UploadTask['status']) || 'processing',
            currentStep: event.currentStep,
            progressPercent: event.progressPercent || 0,
            paperId: event.paperId,
          },
        },
      });

      dispatch({
        type: 'UPDATE_PAPER',
        payload: {
          id: event.taskId,
          updates: {
            status: 'indexing',
            progress: event.progressPercent,
          },
        },
      });
    } else if (event.type === 'task_complete' && event.taskId) {
      dispatch({
        type: 'UPDATE_UPLOAD_TASK',
        payload: {
          taskId: event.taskId,
          updates: {
            status: 'complete',
            progressPercent: 100,
            paperId: event.paperId,
          },
        },
      });

      refreshPapers();
    } else if (event.type === 'task_error' && event.taskId) {
      dispatch({
        type: 'UPDATE_UPLOAD_TASK',
        payload: {
          taskId: event.taskId,
          updates: {
            status: 'error',
            errorMessage: event.errorMessage,
          },
        },
      });

      dispatch({
        type: 'UPDATE_PAPER',
        payload: {
          id: event.taskId,
          updates: {
            status: 'error',
            errorMessage: event.errorMessage,
          },
        },
      });
    } else if (event.type === 'batch_complete') {
      refreshPapers();
      refreshStats();
      // Second refresh after a delay to catch any papers that weren't
      // fully committed when the first refresh fired
      setTimeout(() => {
        refreshPapers();
        refreshStats();
      }, 1500);
      sseStreamRef.current = null;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [refreshPapers, refreshStats]);

  // Ref to always access latest dispatchSSEEvent without stale closures
  const dispatchSSEEventRef = useRef(dispatchSSEEvent);
  dispatchSSEEventRef.current = dispatchSSEEvent;

  const processEventQueue = useCallback(() => {
    if (processingEventsRef.current) return;
    processingEventsRef.current = true;

    const processNext = () => {
      const event = eventQueueRef.current.shift();
      if (!event) {
        processingEventsRef.current = false;
        return;
      }
      dispatchSSEEventRef.current(event);
      // ALWAYS hold the lock for 200ms after dispatching, even if queue is empty.
      // This ensures events arriving in a synchronous burst (from a single
      // reader.read() chunk) accumulate in the queue instead of each being
      // processed immediately. Each pipeline step is visible for >= 200ms.
      setTimeout(processNext, 200);
    };

    processNext();
  }, []);

  // Shared SSE event handler — queues events and spaces them out
  // so React renders each intermediate step instead of batching to final state
  const handleBatchSSEEvent = useCallback((event: BatchUploadSSEEvent) => {
    console.log('[SSE] queued', event.type, event.status, event.currentStep, event.progressPercent);
    eventQueueRef.current.push(event);
    processEventQueue();
  }, [processEventQueue]);

  // Helper: upload tasks in parallel and start processing
  const uploadAndProcess = useCallback(async (
    batchId: string,
    tasks: Array<UploadTask & { file?: File }>
  ) => {
    const concurrency = 2;

    for (let i = 0; i < tasks.length; i += concurrency) {
      const chunk = tasks.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async (task) => {
        if (!task.file) return;

        dispatch({
          type: 'UPDATE_UPLOAD_TASK',
          payload: {
            taskId: task.taskId,
            updates: { status: 'uploading' },
          },
        });

        try {
          await api.uploadBatchFile(batchId, task.taskId, task.file);
          // Transition from uploading → processing so UI doesn't stay stuck on "Uploading..."
          dispatch({
            type: 'UPDATE_UPLOAD_TASK',
            payload: {
              taskId: task.taskId,
              updates: { status: 'processing', progressPercent: 5 },
            },
          });
        } catch (error) {
          console.error(`Failed to upload ${task.filename}:`, error);
          dispatch({
            type: 'UPDATE_UPLOAD_TASK',
            payload: {
              taskId: task.taskId,
              updates: {
                status: 'error',
                errorMessage: error instanceof Error ? error.message : 'Upload failed',
              },
            },
          });
        }
      });

      await Promise.all(chunkPromises);
    }

    try {
      await api.startBatchProcessing(batchId);
    } catch (error) {
      // Non-fatal: the processing queue auto-picks up tasks
      console.warn('startBatchProcessing returned error (processing may already be in progress):', error);
    }
  }, []);

  // Helper: deduplicate files and return unique ones
  const deduplicateFiles = useCallback(async (files: File[]) => {
    console.log(`Computing hashes for ${files.length} files...`);
    const fileHashes = await Promise.all(
      files.map(async (file) => ({
        file,
        hash: await api.computeFileHash(file),
      }))
    );

    const hashes = fileHashes.map((fh) => fh.hash);
    const duplicateCheck = await api.checkDuplicates(hashes);

    const duplicateHashes = new Set(duplicateCheck.duplicates.map((d) => d.hash));
    const uniqueFiles = fileHashes
      .filter((fh) => !duplicateHashes.has(fh.hash))
      .map((fh) => fh.file);

    if (duplicateCheck.duplicate_count > 0) {
      const skippedNames = duplicateCheck.duplicates
        .map((d) => d.title || 'Unknown')
        .join(', ');
      console.log(
        `Skipped ${duplicateCheck.duplicate_count} duplicate(s): ${skippedNames}`
      );
    }

    return { uniqueFiles, duplicateCheck };
  }, []);

  // Add files to an existing active batch
  const addFilesToBatch = useCallback(async (files: File[]) => {
    const batch = state.activeBatchUpload;
    if (!batch) return;

    try {
      const { uniqueFiles, duplicateCheck } = await deduplicateFiles(files);

      if (uniqueFiles.length === 0) {
        const skippedNames = duplicateCheck.duplicates
          .map((d) => d.title || 'Unknown')
          .slice(0, 5)
          .join('\n• ');
        const moreCount = duplicateCheck.duplicates.length - 5;
        alert(
          `All ${duplicateCheck.duplicate_count} file${duplicateCheck.duplicate_count > 1 ? 's are' : ' is'} already in your library:\n\n• ${skippedNames}${moreCount > 0 ? `\n• ...and ${moreCount} more` : ''}\n\nNo files were uploaded.`
        );
        return;
      }

      console.log(`Adding ${uniqueFiles.length} files to existing batch ${batch.batchId}`);

      const filenames = uniqueFiles.map((f) => f.name);
      const addResponse = await api.addBatchTasks(batch.batchId, filenames);

      const newTasks: UploadTask[] = addResponse.tasks.map((task, index) => ({
        ...task,
        file: uniqueFiles[index],
      }));

      dispatch({ type: 'ADD_BATCH_TASKS', payload: newTasks });

      // Add papers to library with pending status
      for (const task of newTasks) {
        const pendingPaper: Paper = {
          id: task.taskId,
          title: task.filename.replace('.pdf', ''),
          authors: [],
          filename: task.filename,
          pageCount: 0,
          chunkCount: 0,
          chunkStats: {},
          status: 'pending',
          pdfUrl: '',
          progress: 0,
          fileSizeBytes: 0,
        };
        dispatch({ type: 'ADD_PAPER', payload: pendingPaper });
      }

      // Re-open SSE stream if it was closed (batch_complete already fired)
      if (!sseStreamRef.current) {
        const stream = api.streamBatchProgress(
          batch.batchId,
          handleBatchSSEEvent,
          (error) => {
            console.error('[SSE] Batch stream error on add:', error);
            sseStreamRef.current = null;
          }
        );
        sseStreamRef.current = stream;

        // Wait for SSE readiness before uploading
        try {
          await Promise.race([
            stream.ready,
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 5000)),
          ]);
        } catch {
          console.warn('[SSE] Ready timeout on add, proceeding anyway');
        }
      }

      // Upload the new files and start processing
      await uploadAndProcess(batch.batchId, newTasks);

    } catch (error) {
      console.error('Failed to add files to batch:', error);
    }
  }, [state.activeBatchUpload, deduplicateFiles, handleBatchSSEEvent, uploadAndProcess]);

  // Batch upload actions
  const startBatchUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // If there's already an active batch, add files to it
    if (state.activeBatchUpload) {
      return addFilesToBatch(files);
    }

    try {
      const { uniqueFiles, duplicateCheck } = await deduplicateFiles(files);

      if (uniqueFiles.length === 0) {
        console.log('All files are duplicates, nothing to upload');
        const skippedNames = duplicateCheck.duplicates
          .map((d) => d.title || 'Unknown')
          .slice(0, 5)
          .join('\n• ');
        const moreCount = duplicateCheck.duplicates.length - 5;
        alert(
          `All ${duplicateCheck.duplicate_count} file${duplicateCheck.duplicate_count > 1 ? 's are' : ' is'} already in your library:\n\n• ${skippedNames}${moreCount > 0 ? `\n• ...and ${moreCount} more` : ''}\n\nNo files were uploaded.`
        );
        return;
      }

      console.log(`Uploading ${uniqueFiles.length} unique files (${duplicateCheck.duplicate_count} duplicates skipped)`);

      // Initialize batch on backend with only unique files
      const filenames = uniqueFiles.map((f) => f.name);
      const initResponse = await api.initBatchUpload(filenames);

      // Create batch upload state with file references
      const batch: BatchUpload = {
        batchId: initResponse.batchId,
        tasks: initResponse.tasks.map((task, index) => ({
          ...task,
          file: uniqueFiles[index],
        })),
        isMinimized: false,
        createdAt: new Date(),
        skippedDuplicates: duplicateCheck.duplicate_count,
      };

      dispatch({ type: 'START_BATCH_UPLOAD', payload: batch });

      // Add papers to library with pending status
      for (const task of batch.tasks) {
        const pendingPaper: Paper = {
          id: task.taskId,
          title: task.filename.replace('.pdf', ''),
          authors: [],
          filename: task.filename,
          pageCount: 0,
          chunkCount: 0,
          chunkStats: {},
          status: 'pending',
          pdfUrl: '',
          progress: 0,
          fileSizeBytes: 0,
        };
        dispatch({ type: 'ADD_PAPER', payload: pendingPaper });
      }

      // Start SSE stream for progress updates
      const stream = api.streamBatchProgress(
        initResponse.batchId,
        handleBatchSSEEvent,
        (error) => {
          console.error('[SSE] Batch stream failed, starting polling fallback:', error);
          sseStreamRef.current = null;
          // Start polling fallback
          if (!pollingRef.current) {
            pollingRef.current = setInterval(async () => {
              try {
                const status = await api.getBatchStatus(initResponse.batchId);
                for (const task of status.tasks) {
                  dispatch({
                    type: 'UPDATE_UPLOAD_TASK',
                    payload: {
                      taskId: task.taskId,
                      updates: {
                        status: task.status,
                        currentStep: task.currentStep,
                        progressPercent: task.progressPercent,
                        paperId: task.paperId,
                        errorMessage: task.errorMessage,
                      },
                    },
                  });
                }
                if (status.completed + status.failed === status.total) {
                  if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                  }
                  refreshPapers();
                  refreshStats();
                }
              } catch (e) {
                console.error('[Polling] Failed to get batch status:', e);
              }
            }, 2000);
          }
        }
      );
      sseStreamRef.current = stream;

      // Wait for SSE to be ready (with 5s timeout) before uploading
      try {
        await Promise.race([
          stream.ready,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 5000)),
        ]);
        console.log('[SSE] Stream ready, starting uploads');
      } catch {
        console.warn('[SSE] Ready timeout, proceeding with uploads anyway');
      }

      // Upload files and start processing
      await uploadAndProcess(batch.batchId, batch.tasks);

    } catch (error) {
      console.error('Failed to start batch upload:', error);
    }
  }, [state.activeBatchUpload, addFilesToBatch, deduplicateFiles, handleBatchSSEEvent, uploadAndProcess]);

  const cancelUploadTaskAction = useCallback(async (taskId: string) => {
    const batch = state.activeBatchUpload;
    if (!batch) return;

    try {
      await api.cancelUploadTask(batch.batchId, taskId);
      dispatch({ type: 'CANCEL_UPLOAD_TASK', payload: taskId });
    } catch (error) {
      console.error('Failed to cancel upload task:', error);
    }
  }, [state.activeBatchUpload]);

  const retryUploadTaskAction = useCallback(async (taskId: string) => {
    const batch = state.activeBatchUpload;
    if (!batch) return;

    try {
      await api.retryUploadTask(batch.batchId, taskId);
      dispatch({
        type: 'UPDATE_UPLOAD_TASK',
        payload: {
          taskId,
          updates: {
            status: 'pending',
            errorMessage: undefined,
            progressPercent: 0,
          },
        },
      });
    } catch (error) {
      console.error('Failed to retry upload task:', error);
    }
  }, [state.activeBatchUpload]);

  const openUploadPanel = useCallback(() => {
    dispatch({ type: 'SET_UPLOAD_PANEL_OPEN', payload: true });
    dispatch({ type: 'SET_UPLOAD_PANEL_MINIMIZED', payload: false });
  }, []);

  const closeUploadPanel = useCallback(() => {
    dispatch({ type: 'SET_UPLOAD_PANEL_OPEN', payload: false });
  }, []);

  const minimizeUploadPanel = useCallback(() => {
    dispatch({ type: 'SET_UPLOAD_PANEL_MINIMIZED', payload: true });
  }, []);

  const maximizeUploadPanel = useCallback(() => {
    dispatch({ type: 'SET_UPLOAD_PANEL_MINIMIZED', payload: false });
  }, []);

  // Toast actions
  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    dispatch({ type: 'ADD_TOAST', payload: toast });
  }, []);

  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  // Initial data load - run once when site opens
  useEffect(() => {
    refreshHealth();
    refreshStats();
    refreshPapers();
    refreshConversations();
    refreshProjects();
  }, [refreshHealth, refreshStats, refreshPapers, refreshConversations, refreshProjects]);

  const value: AppContextValue = {
    state,
    dispatch,
    setTheme,
    toggleSidebar,
    setActivePage,
    createNewConversation,
    submitQuery,
    stopQuery,
    clearConversation,
    deleteConversation,
    refreshHealth,
    refreshStats,
    refreshConversations,
    selectConversation,
    refreshPapers,
    loadMorePapers,
    deletePaper: deletePaperAction,
    updatePaper: updatePaperAction,
    setViewingPdf,
    // Projects
    refreshProjects,
    setActiveProject,
    setConversationProject,
    // Batch upload
    startBatchUpload,
    cancelUploadTask: cancelUploadTaskAction,
    retryUploadTask: retryUploadTaskAction,
    openUploadPanel,
    closeUploadPanel,
    minimizeUploadPanel,
    maximizeUploadPanel,
    // Toast
    showToast,
    removeToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Custom hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
