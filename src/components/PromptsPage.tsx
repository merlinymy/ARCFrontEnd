import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  RefreshCw,
  Save,
  RotateCcw,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import {
  getSystemPrompts,
  updateSystemPrompt,
  resetPrompt,
  resetAllPrompts,
} from '../services/api';
import { QUERY_TYPE_LABELS, ADDENDUM_LABELS } from '../types';

type TabMode = 'concise' | 'detailed' | 'addendums';

// Local type definition to avoid import issues
interface SystemPromptsResponse {
  defaults: {
    concise: Record<string, string>;
    detailed: Record<string, string>;
    addendums: {
      general_knowledge: string;
      web_search: string;
    };
  };
  custom: Record<string, Record<string, string>> | null;
  query_types: string[];
}

export function PromptsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [promptsData, setPromptsData] = useState<SystemPromptsResponse | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<TabMode>('detailed');
  const [selectedPrompt, setSelectedPrompt] = useState<string>('factual');
  const [editedContent, setEditedContent] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showDefaultPreview, setShowDefaultPreview] = useState(false);

  // Load prompts on mount
  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSystemPrompts();
      setPromptsData(data);
      // Initialize with first prompt
      updateEditorContent(data, activeTab, selectedPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  };

  // Get effective prompt (custom or default)
  const getEffectivePrompt = useCallback(
    (data: SystemPromptsResponse, mode: TabMode, promptType: string): string => {
      // Check for custom prompt first
      if (data.custom && mode in data.custom) {
        const modeCustom = data.custom[mode] as Record<string, string> | undefined;
        if (modeCustom && promptType in modeCustom) {
          return modeCustom[promptType];
        }
      }
      // Fall back to default
      if (mode === 'addendums') {
        return data.defaults.addendums[promptType as keyof typeof data.defaults.addendums] || '';
      }
      return data.defaults[mode][promptType] || '';
    },
    []
  );

  // Check if prompt is customized
  const isCustomized = useCallback(
    (data: SystemPromptsResponse, mode: TabMode, promptType: string): boolean => {
      if (!data.custom || !(mode in data.custom)) return false;
      const modeCustom = data.custom[mode] as Record<string, string> | undefined;
      return modeCustom !== undefined && promptType in modeCustom;
    },
    []
  );

  // Get default prompt for comparison
  const getDefaultPrompt = useCallback(
    (data: SystemPromptsResponse, mode: TabMode, promptType: string): string => {
      if (mode === 'addendums') {
        return data.defaults.addendums[promptType as keyof typeof data.defaults.addendums] || '';
      }
      return data.defaults[mode][promptType] || '';
    },
    []
  );

  // Update editor when selection changes
  const updateEditorContent = useCallback(
    (data: SystemPromptsResponse, mode: TabMode, promptType: string) => {
      const content = getEffectivePrompt(data, mode, promptType);
      setEditedContent(content);
      setHasChanges(false);
    },
    [getEffectivePrompt]
  );

  // Handle tab change
  const handleTabChange = (tab: TabMode) => {
    if (hasChanges && !confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    setActiveTab(tab);
    const firstPrompt = tab === 'addendums' ? 'general_knowledge' : 'factual';
    setSelectedPrompt(firstPrompt);
    if (promptsData) {
      updateEditorContent(promptsData, tab, firstPrompt);
    }
  };

  // Handle prompt selection
  const handleSelectPrompt = (promptType: string) => {
    if (hasChanges && !confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    setSelectedPrompt(promptType);
    if (promptsData) {
      updateEditorContent(promptsData, activeTab, promptType);
    }
  };

  // Handle content change
  const handleContentChange = (content: string) => {
    setEditedContent(content);
    if (promptsData) {
      const customContent = getEffectivePrompt(promptsData, activeTab, selectedPrompt);
      // Has changes if different from what's currently saved
      setHasChanges(content !== customContent);
    }
  };

  // Save prompt
  const handleSave = async () => {
    if (!promptsData) return;
    try {
      setSaving(true);
      setError(null);
      const data = await updateSystemPrompt(activeTab, selectedPrompt, editedContent);
      setPromptsData(data);
      setHasChanges(false);
      setSuccessMessage('Prompt saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  // Reset single prompt
  const handleResetPrompt = async () => {
    if (!confirm('Reset this prompt to default? This cannot be undone.')) return;
    try {
      setSaving(true);
      setError(null);
      await resetPrompt(activeTab, selectedPrompt);
      const data = await getSystemPrompts();
      setPromptsData(data);
      updateEditorContent(data, activeTab, selectedPrompt);
      setSuccessMessage('Prompt reset to default');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset prompt');
    } finally {
      setSaving(false);
    }
  };

  // Reset all prompts
  const handleResetAll = async () => {
    if (!confirm('Reset ALL prompts to defaults? This cannot be undone.')) return;
    try {
      setSaving(true);
      setError(null);
      await resetAllPrompts();
      const data = await getSystemPrompts();
      setPromptsData(data);
      updateEditorContent(data, activeTab, selectedPrompt);
      setSuccessMessage('All prompts reset to defaults');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset prompts');
    } finally {
      setSaving(false);
    }
  };

  // Get list of prompts for current tab
  const getPromptList = (): string[] => {
    if (activeTab === 'addendums') {
      return ['general_knowledge', 'web_search'];
    }
    return promptsData?.query_types || [];
  };

  // Get label for prompt
  const getPromptLabel = (promptType: string): string => {
    if (activeTab === 'addendums') {
      return ADDENDUM_LABELS[promptType] || promptType;
    }
    return QUERY_TYPE_LABELS[promptType] || promptType;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              System Prompts
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadPrompts}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleResetAll}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset All
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex-shrink-0 mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="flex-shrink-0 mx-4 mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-300">{successMessage}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col">
          {/* Tabs */}
          <div className="flex-shrink-0 p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-1">
              {(['detailed', 'concise', 'addendums'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {tab === 'addendums' ? 'Special' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt List */}
          <div className="flex-1 overflow-y-auto p-2">
            {getPromptList().map((promptType) => {
              const isSelected = selectedPrompt === promptType;
              const customized = promptsData ? isCustomized(promptsData, activeTab, promptType) : false;
              return (
                <button
                  key={promptType}
                  onClick={() => handleSelectPrompt(promptType)}
                  className={`w-full flex items-center justify-between px-3 py-2 mb-1 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="text-sm font-medium truncate">
                    {getPromptLabel(promptType)}
                  </span>
                  <div className="flex items-center gap-1">
                    {customized && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                        Custom
                      </span>
                    )}
                    <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Header */}
          <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {getPromptLabel(selectedPrompt)}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeTab === 'detailed' && 'Comprehensive prompt for detailed responses'}
                  {activeTab === 'concise' && 'Brief prompt for concise responses'}
                  {activeTab === 'addendums' && selectedPrompt === 'general_knowledge' && 'Appended when general knowledge is enabled'}
                  {activeTab === 'addendums' && selectedPrompt === 'web_search' && 'Used for web search functionality'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {promptsData && isCustomized(promptsData, activeTab, selectedPrompt) && (
                  <button
                    onClick={handleResetPrompt}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    hasChanges
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>

          {/* Default Preview Toggle */}
          {promptsData && isCustomized(promptsData, activeTab, selectedPrompt) && (
            <div className="flex-shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowDefaultPreview(!showDefaultPreview)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showDefaultPreview ? 'Hide default prompt' : 'Show default prompt for reference'}
              </button>
            </div>
          )}

          {/* Default Preview */}
          {showDefaultPreview && promptsData && (
            <div className="flex-shrink-0 max-h-48 overflow-y-auto mx-4 mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Default Prompt:</p>
              <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-mono">
                {getDefaultPrompt(promptsData, activeTab, selectedPrompt)}
              </pre>
            </div>
          )}

          {/* Text Editor */}
          <div className="flex-1 overflow-hidden p-4">
            <textarea
              value={editedContent}
              onChange={(e) => handleContentChange(e.target.value)}
              className="w-full h-full p-4 font-mono text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100"
              placeholder="Enter prompt content..."
              spellCheck={false}
            />
          </div>

          {/* Character Count */}
          <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {editedContent.length.toLocaleString()} characters
              {hasChanges && <span className="ml-2 text-amber-500">• Unsaved changes</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
