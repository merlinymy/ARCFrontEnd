import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, Upload, Grid, List, SortAsc, SortDesc, FileText, Loader2, MessageSquare, X, Filter, FileUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PaperCard } from './PaperCard';
import { BatchUploadPanel } from './BatchUploadPanel';
import { InfoTooltip } from './Tooltip';
import { searchPapers, type PaperSearchResult, getPapers } from '../services/api';

type SortField = 'title' | 'year' | 'chunkCount' | 'relevance' | 'uploadDate';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

export function LibraryPage() {
  const { state, dispatch, setActivePage, createNewConversation, openUploadPanel, deletePaper } = useApp();
  const { papers } = state;

  const [textFilter, setTextFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('uploadDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [semanticResults, setSemanticResults] = useState<PaperSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [enablePdfUpload, setEnablePdfUpload] = useState(false);

  // Search pagination state
  const [totalSearchResults, setTotalSearchResults] = useState(0);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [isLoadingMoreSearchResults, setIsLoadingMoreSearchResults] = useState(false);

  // Text filter state (separate from semantic search)
  const [filteredPapersCache, setFilteredPapersCache] = useState<typeof papers>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [isLoadingFiltered, setIsLoadingFiltered] = useState(false);

  // Browse mode state (when no filters active)
  const [browsePapers, setBrowsePapers] = useState<typeof papers>([]);
  const [totalBrowse, setTotalBrowse] = useState(0);
  const [hasMoreBrowse, setHasMoreBrowse] = useState(false);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);

  // Sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);


  const togglePaperSelection = useCallback((paperId: string) => {
    setSelectedPaperIds(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else {
        next.add(paperId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPaperIds(new Set());
    setEnablePdfUpload(false);
  }, []);

  // Calculate total size of selected papers
  const selectedPapersInfo = useMemo(() => {
    const selectedPapers = papers.filter(p => selectedPaperIds.has(p.id));

    // Calculate actual total file size from disk
    const totalSizeBytes = selectedPapers.reduce((sum, p) => sum + (p.fileSizeBytes || 0), 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024); // Convert bytes to MB

    const MAX_SIZE_MB = 30; // Leave 2MB buffer from 32MB limit for request overhead

    const exceedsSize = totalSizeMB > MAX_SIZE_MB;
    const canUpload = !exceedsSize && selectedPapers.length > 0;

    let disabledReason = '';
    if (exceedsSize) {
      disabledReason = `Total size (${totalSizeMB.toFixed(1)}MB) exceeds 30MB limit`;
    }

    return {
      totalSizeMB,
      canUpload,
      disabledReason,
      selectedPapers,
    };
  }, [papers, selectedPaperIds]);

  const handleChatWithSelected = useCallback(() => {
    createNewConversation();
    dispatch({
      type: 'SET_QUERY_OPTIONS',
      payload: {
        paperFilter: Array.from(selectedPaperIds),
        enablePdfUpload,
      },
    });
    setActivePage('chat');
    clearSelection();
  }, [selectedPaperIds, enablePdfUpload, dispatch, setActivePage, clearSelection, createNewConversation]);

  // Map frontend sort field to backend field name
  const mapSortField = (field: SortField): string => {
    switch (field) {
      case 'uploadDate':
        return 'indexed_at';
      case 'chunkCount':
        return 'chunk_count';
      default:
        return field; // title, year stay the same
    }
  };

  // Load papers in browse mode (no filters)
  const loadBrowsePapers = useCallback(async (sort: SortField, order: SortOrder, reset: boolean = true) => {
    setIsLoadingBrowse(true);
    try {
      const backendSortField = mapSortField(sort);
      const offset = reset ? 0 : browsePapers.length;
      const response = await getPapers(offset, 50, undefined, backendSortField, order);

      if (reset) {
        setBrowsePapers(response.papers);
      } else {
        setBrowsePapers(prev => [...prev, ...response.papers]);
      }
      setTotalBrowse(response.total);
      setHasMoreBrowse(response.hasMore);
    } catch (err) {
      console.error('Failed to load papers:', err);
    } finally {
      setIsLoadingBrowse(false);
    }
  }, [browsePapers.length]);

  // Text filter with backend (for title/author/filename)
  const performTextFilter = useCallback(async (filter: string, sort: SortField, order: SortOrder) => {
    if (!filter.trim()) {
      setFilteredPapersCache([]);
      setTotalFiltered(0);
      return;
    }

    setIsLoadingFiltered(true);
    try {
      const backendSortField = mapSortField(sort);
      const response = await getPapers(0, 50, filter, backendSortField, order);
      setFilteredPapersCache(response.papers);
      setTotalFiltered(response.total);
    } catch (err) {
      console.error('Text filter failed:', err);
      setFilteredPapersCache([]);
      setTotalFiltered(0);
    } finally {
      setIsLoadingFiltered(false);
    }
  }, []);

  // Debounced semantic search
  const performSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSemanticResults([]);
      setTotalSearchResults(0);
      setHasMoreSearchResults(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await searchPapers(query, 25, 0);
      setSemanticResults(response.results);
      setTotalSearchResults(response.total);
      setHasMoreSearchResults(response.hasMore);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSemanticResults([]);
      setTotalSearchResults(0);
      setHasMoreSearchResults(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Load more search results
  const loadMoreSearchResults = useCallback(async () => {
    if (!searchQuery.trim() || isLoadingMoreSearchResults || !hasMoreSearchResults) return;

    setIsLoadingMoreSearchResults(true);
    try {
      const response = await searchPapers(searchQuery, 25, semanticResults.length);
      setSemanticResults(prev => [...prev, ...response.results]);
      setHasMoreSearchResults(response.hasMore);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to load more results');
    } finally {
      setIsLoadingMoreSearchResults(false);
    }
  }, [searchQuery, semanticResults.length, isLoadingMoreSearchResults, hasMoreSearchResults]);

  // Load browse papers when sort changes (and no filters active)
  useEffect(() => {
    if (!textFilter.trim() && !searchQuery.trim()) {
      loadBrowsePapers(sortField, sortOrder, true);
    }
  }, [sortField, sortOrder, textFilter, searchQuery, loadBrowsePapers]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    // Only enable infinite scroll when not searching or filtering
    if (searchQuery.trim() || textFilter.trim()) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreBrowse && !isLoadingBrowse) {
          loadBrowsePapers(sortField, sortOrder, false);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searchQuery, textFilter, hasMoreBrowse, isLoadingBrowse, sortField, sortOrder, loadBrowsePapers]);

  // Debounce text filter
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performTextFilter(textFilter, sortField, sortOrder);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [textFilter, sortField, sortOrder, performTextFilter]);

  // Debounce semantic search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSemanticSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSemanticSearch]);

  // Convert semantic results to Paper-like objects for display
  const semanticPapers = useMemo((): Paper[] => {
    return semanticResults.map((r) => ({
      id: r.id,
      title: r.title,
      authors: r.authors,
      year: r.year,
      filename: r.filename,
      pageCount: 0,
      chunkCount: r.chunkCount,
      chunkStats: {},
      status: r.status as 'indexed' | 'indexing' | 'error' | 'pending',
      pdfUrl: r.pdfUrl,
      fileSizeBytes: r.fileSizeBytes,
      // Extra properties for preview (not in Paper interface but TypeScript allows them)
      relevanceScore: r.relevanceScore,
      previewText: r.previewText,
      previewSection: r.previewSection,
      previewSubsection: r.previewSubsection,
      previewChunkType: r.previewChunkType,
    } as Paper));
  }, [semanticResults]);

  // Filter and sort papers
  const filteredPapers = useMemo(() => {
    // Priority: Semantic Search > Text Filter > Browse Papers

    if (searchQuery.trim()) {
      // Semantic search is active - apply client-side sorting since backend doesn't support it
      let source = semanticPapers;

      if (sortField === 'relevance') {
        return sortOrder === 'desc' ? source : [...source].reverse();
      }

      // Apply sorting for other fields
      const sorted = [...source];
      sorted.sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'year':
            comparison = (a.year || 0) - (b.year || 0);
            break;
          case 'chunkCount':
            comparison = a.chunkCount - b.chunkCount;
            break;
          case 'uploadDate':
            const aDate = 'indexedAt' in a && a.indexedAt instanceof Date ? a.indexedAt.getTime() : 0;
            const bDate = 'indexedAt' in b && b.indexedAt instanceof Date ? b.indexedAt.getTime() : 0;
            comparison = aDate - bDate;
            break;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
      return sorted;
    } else if (textFilter.trim()) {
      // Text filter is active - backend already sorted, just return
      return filteredPapersCache;
    } else {
      // Browse mode - backend already sorted, just return
      return browsePapers;
    }
  }, [searchQuery, textFilter, sortField, sortOrder, semanticPapers, filteredPapersCache, browsePapers]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  // Handle paper deletion with refresh
  const handleDeletePaper = useCallback(async (paperId: string) => {
    // Call the global delete action
    await deletePaper(paperId);

    // Refresh the current view based on active filters
    if (searchQuery.trim()) {
      // Re-run semantic search
      performSemanticSearch(searchQuery);
    } else if (textFilter.trim()) {
      // Re-run text filter
      performTextFilter(textFilter, sortField, sortOrder);
    } else {
      // Refresh browse papers
      loadBrowsePapers(sortField, sortOrder, true);
    }
  }, [deletePaper, searchQuery, textFilter, sortField, sortOrder, performSemanticSearch, performTextFilter, loadBrowsePapers]);

  // Display count: prioritize semantic search > text filter > browse
  const displayCount = searchQuery.trim()
    ? totalSearchResults
    : textFilter.trim()
    ? totalFiltered
    : totalBrowse;
  const loadedCount = searchQuery.trim()
    ? semanticResults.length
    : textFilter.trim()
    ? filteredPapersCache.length
    : browsePapers.length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Paper Library
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchQuery.trim()
                  ? `${loadedCount} of ${displayCount} papers found`
                  : textFilter.trim()
                  ? `${loadedCount} of ${displayCount} papers match filter`
                  : `${loadedCount} of ${displayCount} papers loaded`
                }
              </p>
            </div>
          </div>
          <button
            onClick={openUploadPanel}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            <Upload className="w-5 h-5" />
            Upload Papers
          </button>
        </div>

        {/* Search and Controls */}
        <div className="flex flex-col gap-4">
          {/* Quick filter (text-based) */}
          <div className="flex-1 relative">
            {isLoadingFiltered ? (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500 animate-spin" />
            ) : (
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            )}
            <input
              type="text"
              placeholder='Quick filter by title, author, or filename: "Smith", "2024-peptide"...'
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Semantic search input */}
            <div className="flex-1 relative">
              {isSearching ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-500 animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              )}
              <input
                type="text"
                placeholder='Semantic search: "SERS imaging techniques", "nanoparticle synthesis"...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-purple-300 dark:border-purple-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {searchQuery.trim() && (
                <option value="relevance">Sort by Relevance</option>
              )}
              <option value="uploadDate">Sort by Upload Date</option>
              <option value="title">Sort by Title</option>
              <option value="year">Sort by Year</option>
              <option value="chunkCount">Sort by Chunks</option>
            </select>
            <button
              onClick={toggleSortOrder}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? (
                <SortAsc className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              ) : (
                <SortDesc className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
          </div>

            {/* View Mode */}
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
              } transition-colors`}
              title="Grid view"
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
              } transition-colors`}
              title="List view"
            >
              <List className="w-5 h-5" />
            </button>
            </div>
          </div>
        </div>

        {/* Filter/Search info */}
        {(textFilter.trim() || searchQuery.trim()) && (
          <div className="mt-4">
            {searchQuery.trim() ? (
              // Semantic search info
              <>
                {searchError ? (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                    Search error: {searchError}
                  </div>
                ) : semanticResults.length > 0 ? (
                  <div className="text-sm text-purple-600 dark:text-purple-400">
                    Showing {semanticResults.length} of {totalSearchResults} papers matching "{searchQuery}"
                  </div>
                ) : !isSearching ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No papers found for "{searchQuery}"
                  </div>
                ) : null}
              </>
            ) : textFilter.trim() ? (
              // Text filter info
              <div className="text-sm text-blue-600 dark:text-blue-400">
                {filteredPapersCache.length > 0
                  ? `Filtered to ${filteredPapersCache.length} of ${totalFiltered} papers matching "${textFilter}"`
                  : !isLoadingFiltered
                  ? `No papers match "${textFilter}"`
                  : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Paper Grid/List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredPapers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            {browsePapers.length === 0 && !searchQuery.trim() && !textFilter.trim() && !isLoadingBrowse ? (
              <>
                <FileText className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">No papers yet</p>
                <p className="text-sm">Upload your first PDF to get started</p>
                <button
                  onClick={openUploadPanel}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload Papers
                </button>
              </>
            ) : (
              <>
                {searchQuery.trim() ? (
                  <Search className="w-16 h-16 mb-4 opacity-50" />
                ) : (
                  <Filter className="w-16 h-16 mb-4 opacity-50" />
                )}
                <p className="text-lg font-medium">No papers found</p>
                <p className="text-sm">
                  {searchQuery.trim()
                    ? 'Try a different search query'
                    : 'Try a different filter'}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                  : 'flex flex-col gap-3'
              }
            >
              {filteredPapers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  viewMode={viewMode}
                  preview={
                    searchQuery.trim() &&
                    'previewText' in paper &&
                    typeof paper.previewText === 'string' &&
                    paper.previewText
                      ? {
                          text: paper.previewText,
                          section: 'previewSection' in paper ? (paper.previewSection as string | undefined) : undefined,
                          subsection: 'previewSubsection' in paper ? (paper.previewSubsection as string | undefined) : undefined,
                          chunkType: 'previewChunkType' in paper ? (paper.previewChunkType as string | undefined) : undefined,
                        }
                      : undefined
                  }
                  searchQuery={searchQuery.trim() ? searchQuery : undefined}
                  isSelected={selectedPaperIds.has(paper.id)}
                  onToggleSelect={paper.status === 'indexed' ? togglePaperSelection : undefined}
                  onDelete={handleDeletePaper}
                />
              ))}
            </div>

            {/* Load more for search results */}
            {searchQuery.trim() && (
              <div className="h-20 flex items-center justify-center mt-4">
                {isLoadingMoreSearchResults ? (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading more results...</span>
                  </div>
                ) : hasMoreSearchResults ? (
                  <button
                    onClick={loadMoreSearchResults}
                    className="px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Load more results ({totalSearchResults - semanticResults.length} remaining)
                  </button>
                ) : semanticResults.length > 0 ? (
                  <span className="text-sm text-gray-400 dark:text-gray-500">
                    All {totalSearchResults} matching papers shown
                  </span>
                ) : null}
              </div>
            )}

            {/* Infinite scroll sentinel for browsing (only when not filtering) */}
            {!searchQuery.trim() && !textFilter.trim() && (
              <div
                ref={sentinelRef}
                className="h-20 flex items-center justify-center mt-4"
              >
                {isLoadingBrowse ? (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading more papers...</span>
                  </div>
                ) : hasMoreBrowse ? (
                  <button
                    onClick={() => loadBrowsePapers(sortField, sortOrder, false)}
                    className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Load more papers
                  </button>
                ) : browsePapers.length > 0 ? (
                  <span className="text-sm text-gray-400 dark:text-gray-500">
                    All {totalBrowse} papers loaded
                  </span>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating action bar when papers are selected */}
      {selectedPaperIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full shadow-lg z-40">
          <span className="text-sm font-medium">
            {selectedPaperIds.size} paper{selectedPaperIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="w-px h-5 bg-gray-600 dark:bg-gray-400" />

          {/* PDF Upload Toggle */}
          <div className="flex items-center gap-2">
            <label
              className={`flex items-center gap-2 cursor-pointer ${
                !selectedPapersInfo.canUpload ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={enablePdfUpload}
                onChange={(e) => setEnablePdfUpload(e.target.checked)}
                disabled={!selectedPapersInfo.canUpload}
                className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
              />
              <FileUp className="w-4 h-4" />
              <span className="text-sm font-medium">Send PDFs</span>
            </label>
            {/* Always show file size info */}
            <span className={`text-xs ${selectedPapersInfo.canUpload ? 'text-gray-300 dark:text-gray-700' : 'text-red-300 dark:text-red-700'}`}>
              ({selectedPapersInfo.totalSizeMB.toFixed(1)}MB)
            </span>
            {/* Only show tooltip when disabled */}
            {!selectedPapersInfo.canUpload && (
              <InfoTooltip content={selectedPapersInfo.disabledReason || 'Select papers to enable'} />
            )}
          </div>

          <div className="w-px h-5 bg-gray-600 dark:bg-gray-400" />
          <button
            onClick={handleChatWithSelected}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-medium transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Chat about {selectedPaperIds.size === 1 ? 'this paper' : 'these papers'}
          </button>
          <button
            onClick={clearSelection}
            className="p-1.5 hover:bg-gray-700 dark:hover:bg-gray-300 rounded-full transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Batch Upload Panel */}
      <BatchUploadPanel />
    </div>
  );
}
