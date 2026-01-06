import {
  Plus,
  MessageSquare,
  FileText,
  Trash2,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MinimizedUploadWidget } from './MinimizedUploadWidget';
import { Tooltip } from './Tooltip';
import type { Conversation } from '../types';

interface SidebarProps {
  collapsed?: boolean;
}

function formatDate(date: Date): string {
  const now = new Date();
  const messageDate = new Date(date);

  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

  const diffMs = nowDay.getTime() - messageDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return messageDate.toLocaleDateString();
}

function groupConversationsByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const groups: Record<string, Conversation[]> = {};

  conversations.forEach((conv) => {
    const dateKey = formatDate(conv.updatedAt);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(conv);
  });

  return groups;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const { state, createNewConversation, setActivePage, toggleSidebar, selectConversation, deleteConversation } = useApp();
  const { conversations, activeConversationId, activePage } = state;

  const groupedConversations = groupConversationsByDate(conversations);

  // Collapsed view - icon only sidebar
  if (collapsed) {
    return (
      <aside className="w-16 h-full bg-gray-100 dark:bg-gray-900/80 border-r border-gray-200/50 dark:border-gray-700/50 flex-col items-center py-3 hidden md:flex">
        {/* Expand button */}
        <Tooltip content="Open sidebar" position="right">
          <button
            onClick={toggleSidebar}
            className="p-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors mb-3"
            aria-label="Open sidebar"
          >
            <PanelLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </Tooltip>

        {/* New Conversation */}
        <Tooltip content="New conversation" position="right">
          <button
            onClick={() => {
              createNewConversation();
              setActivePage('chat');
            }}
            className="p-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors mb-1"
            aria-label="New conversation"
          >
            <Plus className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </Tooltip>

        {/* Chat - expands sidebar to show conversations */}
        <Tooltip content="Chat" position="right">
          <button
            onClick={() => {
              setActivePage('chat');
              toggleSidebar();
            }}
            className={`p-2.5 rounded-lg transition-colors mb-1 ${
              activePage === 'chat'
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
            aria-label="Chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </Tooltip>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Paper Library */}
        <Tooltip content={`Library (${state.totalPapers || state.papers?.length || 0})`} position="right">
          <button
            onClick={() => setActivePage('library')}
            className={`p-2.5 rounded-lg transition-colors ${
              activePage === 'library'
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
            aria-label="Paper Library"
          >
            <FileText className="w-5 h-5" />
          </button>
        </Tooltip>
      </aside>
    );
  }

  // Expanded view - full sidebar
  return (
    <aside className="w-64 h-full bg-gray-100 dark:bg-gray-900/80 border-r border-gray-200/50 dark:border-gray-700/50 flex flex-col">
      {/* Header */}
      <div className="h-[52px] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">ARC</span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">ARC</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Close sidebar"
        >
          <PanelLeftClose className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* New Conversation Button */}
      <div className="p-3 shrink-0">
        <button
          onClick={() => {
            createNewConversation();
            setActivePage('chat');
            if (window.innerWidth < 768) {
              toggleSidebar();
            }
          }}
          className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm text-gray-700 dark:text-gray-300"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">
            No conversations yet
          </div>
        ) : (
          Object.entries(groupedConversations).map(([date, convs]) => (
            <div key={date} className="mb-3">
              <div className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                {date}
              </div>
              {convs.map((conv) => (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    selectConversation(conv.id);
                    setActivePage('chat');
                    if (window.innerWidth < 768) {
                      toggleSidebar();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      selectConversation(conv.id);
                      setActivePage('chat');
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left group cursor-pointer text-sm ${
                    activeConversationId === conv.id && activePage === 'chat'
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
                  <span className="truncate flex-1">{conv.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Paper Library Section */}
      <div className="shrink-0">
        <button
          onClick={() => {
            setActivePage('library');
            if (window.innerWidth < 768) {
              toggleSidebar();
            }
          }}
          className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-sm ${
            activePage === 'library'
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>Paper Library</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {state.totalPapers || state.papers?.length || 0}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </button>
      </div>

      {/* Upload Widget */}
      <div className="p-2 shrink-0">
        <MinimizedUploadWidget />
      </div>
    </aside>
  );
}
