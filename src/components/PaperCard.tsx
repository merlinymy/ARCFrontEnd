import { useState } from 'react';
import { FileText, Eye, Trash2, AlertCircle, Loader2, Calendar, Layers, User, Quote, Check, Edit2, X, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { updatePaperMetadata } from '../services/api';
import type { Paper } from '../types';

interface PaperCardProps {
  paper: Paper;
  viewMode: 'grid' | 'list';
  // Optional preview for search results
  preview?: {
    text: string;
    section?: string;
    subsection?: string;
    chunkType?: string;
  };
  searchQuery?: string;
  // Selection support
  isSelected?: boolean;
  onToggleSelect?: (paperId: string) => void;
  // Delete callback (optional override)
  onDelete?: (paperId: string) => Promise<void>;
}

// Highlight search terms in text
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  // Split query into words and escape regex special chars
  const words = query.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return text;

  const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-inherit rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function PaperCard({ paper, viewMode, preview, searchQuery, isSelected, onToggleSelect, onDelete }: PaperCardProps) {
  const { deletePaper, setViewingPdf, showToast, updatePaper } = useApp();
  const selectable = onToggleSelect !== undefined;
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state - initialize empty for performance
  const [editTitle, setEditTitle] = useState('');
  const [editAuthors, setEditAuthors] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editFilename, setEditFilename] = useState('');
  const [editDoi, setEditDoi] = useState('');
  const [isFetchingDoi, setIsFetchingDoi] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Use custom delete handler if provided, otherwise use global
      if (onDelete) {
        await onDelete(paper.id);
      } else {
        await deletePaper(paper.id);
      }
    } catch (error) {
      console.error('Failed to delete paper:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleViewPdf = () => {
    setViewingPdf(paper.id);
  };

  const handleEditClick = async () => {
    // Set form values when modal opens (not on every render)
    setEditTitle(paper.title);
    setEditAuthors(paper.authors.join(', '));
    setEditYear(paper.year?.toString() || '');
    setEditFilename(paper.filename);

    // Check if we need to auto-extract DOI
    const needsDoiExtraction =
      (!paper.doi) && // No DOI stored yet
      (
        paper.authors.length === 0 || // Empty authors
        !isFilenameMatchingFormat(paper.filename, paper.title, paper.authors) // Filename doesn't match expected format
      );

    if (needsDoiExtraction) {
      // Auto-extract DOI from PDF
      try {
        const response = await fetch(`http://localhost:8000/papers/${paper.id}/extract-doi`);
        if (response.ok) {
          const data = await response.json();
          if (data.doi) {
            setEditDoi(data.doi);
            showToast({ type: 'success', message: `DOI found: ${data.doi}` });
          } else {
            setEditDoi('');
            showToast({
              type: 'info',
              message: 'No DOI found in PDF. You can enter one manually to auto-fill metadata.'
            });
          }
        } else {
          setEditDoi('');
          showToast({
            type: 'warning',
            message: `Failed to extract DOI from PDF (status ${response.status})`
          });
        }
      } catch (error) {
        console.error('Failed to auto-extract DOI:', error);
        setEditDoi('');
        showToast({
          type: 'error',
          message: 'Error extracting DOI from PDF. You can enter one manually.'
        });
      }
    } else {
      setEditDoi(paper.doi || '');
    }

    setShowEditModal(true);
  };

  // Helper function to check if filename matches "Author-YEAR-Title" format
  const isFilenameMatchingFormat = (filename: string, title: string, authors: string[]): boolean => {
    if (authors.length === 0 || !title) return false;

    // Remove .pdf extension
    const nameWithoutExt = filename.replace(/\.pdf$/i, '');

    // Check if it starts with an author last name
    const firstAuthorLastName = authors[0].split(' ').pop()?.toLowerCase() || '';
    if (!firstAuthorLastName) return false;

    // Check if filename starts with author name and contains a dash
    const nameLower = nameWithoutExt.toLowerCase();
    return nameLower.startsWith(firstAuthorLastName.toLowerCase()) && nameLower.includes('-');
  };

  const handleFetchFromDoi = async () => {
    if (!editDoi.trim()) {
      showToast({ type: 'warning', message: 'Please enter a DOI' });
      return;
    }

    setIsFetchingDoi(true);
    try {
      const response = await fetch(`http://localhost:8000/metadata/doi/${encodeURIComponent(editDoi.trim())}`);
      if (!response.ok) {
        throw new Error('Failed to fetch metadata from DOI');
      }

      const metadata = await response.json();

      // Update form fields with fetched data
      if (metadata.title) {
        setEditTitle(metadata.title);
      }
      if (metadata.authors && metadata.authors.length > 0) {
        setEditAuthors(metadata.authors.join(', '));

        // Generate filename: "FirstAuthor-YEAR-Title.pdf"
        const firstAuthor = metadata.authors[0].split(' ').pop(); // Last name
        const year = metadata.year || '';
        const titleSlug = metadata.title
          .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .substring(0, 50); // Limit length

        const newFilename = `${firstAuthor}-${year}-${titleSlug}.pdf`.replace(/--+/g, '-');
        setEditFilename(newFilename);
      }
      if (metadata.year) {
        setEditYear(metadata.year.toString());
      }

      // Show success message
      showToast({
        type: 'success',
        message: 'Metadata fetched successfully from CrossRef!',
        duration: 2000
      });

    } catch (error) {
      console.error('Failed to fetch DOI metadata:', error);
      showToast({ type: 'error', message: 'Failed to fetch metadata from DOI. Please check the DOI is valid.' });
    } finally {
      setIsFetchingDoi(false);
    }
  };

  const handleSaveEdit = async () => {
    setIsEditing(true);
    try {
      // Parse authors from comma-separated string
      const authorsArray = editAuthors
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);

      const updates: {
        title?: string;
        authors?: string[];
        year?: number;
        filename?: string;
      } = {};

      if (editTitle !== paper.title) updates.title = editTitle;
      if (authorsArray.join(', ') !== paper.authors.join(', ')) updates.authors = authorsArray;
      if (editYear && parseInt(editYear) !== paper.year) updates.year = parseInt(editYear);
      if (editFilename !== paper.filename) updates.filename = editFilename;

      if (Object.keys(updates).length > 0) {
        // Call API and get the full updated paper object
        const updatedPaper = await updatePaperMetadata(paper.id, updates);

        // Update local state with the complete updated paper from backend
        updatePaper(paper.id, updatedPaper);

        // Show success message
        showToast({ type: 'success', message: 'Metadata updated successfully!' });

        // Close modal
        setShowEditModal(false);
      } else {
        // No changes, just close modal
        setShowEditModal(false);
      }
    } catch (error) {
      console.error('Failed to update paper metadata:', error);
      showToast({ type: 'error', message: 'Failed to update paper metadata. Please try again.' });
    } finally {
      setIsEditing(false);
    }
  };

  const statusColors = {
    indexed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    indexing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  };

  const handleCardClick = () => {
    if (selectable && paper.status === 'indexed') {
      onToggleSelect(paper.id);
    }
  };

  if (viewMode === 'list') {
    return (
      <div
        onClick={handleCardClick}
        className={`flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border transition-shadow ${
          selectable && paper.status === 'indexed' ? 'cursor-pointer' : ''
        } ${
          isSelected
            ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500 dark:ring-blue-400'
            : 'border-gray-200 dark:border-gray-700 hover:shadow-md'
        }`}
      >
        {/* Selection checkbox */}
        {selectable && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(paper.id); }}
            className={`shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
            }`}
          >
            {isSelected && <Check className="w-4 h-4" />}
          </button>
        )}

        {/* Icon */}
        <div className="shrink-0 w-12 h-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {paper.title}
          </h3>
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
            {paper.authors.length > 0 && (
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                {paper.authors.slice(0, 2).join(', ')}
                {paper.authors.length > 2 && ` +${paper.authors.length - 2}`}
              </span>
            )}
            {paper.year && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {paper.year}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Layers className="w-4 h-4" />
              {paper.chunkCount} chunks
            </span>
          </div>
          {/* Preview for list view */}
          {preview?.text && (
            <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-100 dark:border-purple-800">
              <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 mb-1">
                <Quote className="w-3 h-3" />
                {preview.section && (
                  <span>
                    § {preview.section}
                    {preview.subsection && <span className="opacity-70"> › {preview.subsection}</span>}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                {searchQuery ? highlightText(preview.text, searchQuery) : preview.text}
              </p>
            </div>
          )}
        </div>

        {/* Status */}
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[paper.status]}`}>
          {paper.status === 'indexing' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
          {paper.status === 'error' && <AlertCircle className="w-3 h-3 inline mr-1" />}
          {paper.status}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleViewPdf}
            className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="View PDF"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button
            onClick={handleEditClick}
            className="p-2 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Edit metadata"
          >
            <Edit2 className="w-5 h-5" />
          </button>
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Delete paper"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      onClick={handleCardClick}
      className={`flex flex-col p-4 bg-white dark:bg-gray-800 rounded-lg border transition-shadow ${
        selectable && paper.status === 'indexed' ? 'cursor-pointer' : ''
      } ${
        isSelected
          ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500 dark:ring-blue-400'
          : 'border-gray-200 dark:border-gray-700 hover:shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Selection checkbox */}
          {selectable && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(paper.id); }}
              className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
              }`}
            >
              {isSelected && <Check className="w-3 h-3" />}
            </button>
          )}
          <div className="w-10 h-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[paper.status]}`}>
          {paper.status === 'indexing' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
          {paper.status === 'error' && <AlertCircle className="w-3 h-3 inline mr-1" />}
          {paper.status}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mb-2">
        {paper.title}
      </h3>

      {/* Authors */}
      {paper.authors.length > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mb-2">
          {paper.authors.slice(0, 2).join(', ')}
          {paper.authors.length > 2 && ` +${paper.authors.length - 2}`}
        </p>
      )}

      {/* Preview for search results */}
      {preview?.text && (
        <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
          <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 mb-1">
            <Quote className="w-3 h-3" />
            {preview.section && (
              <span>
                § {preview.section}
                {preview.subsection && <span className="opacity-70"> › {preview.subsection}</span>}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">
            {searchQuery ? highlightText(preview.text, searchQuery) : preview.text}
          </p>
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-auto mb-3">
        {paper.year && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {paper.year}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Layers className="w-3 h-3" />
          {paper.chunkCount} chunks
        </span>
      </div>

      {/* Error message */}
      {paper.status === 'error' && paper.errorMessage && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-3 line-clamp-2">
          {paper.errorMessage}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleViewPdf}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <Eye className="w-4 h-4" />
          View PDF
        </button>
        <button
          onClick={handleEditClick}
          className="p-2 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
          title="Edit metadata"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? '...' : 'Yes'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Delete paper"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Paper Metadata</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-4">
              {/* DOI Auto-Fetch Section */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <label className="block text-sm font-medium text-purple-900 dark:text-purple-100 mb-2">
                  Auto-Fill from DOI
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editDoi}
                    onChange={(e) => setEditDoi(e.target.value)}
                    className="flex-1 px-3 py-2 border border-purple-300 dark:border-purple-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="10.1234/example.doi"
                    title="Enter DOI to automatically fetch metadata from CrossRef"
                  />
                  <button
                    onClick={handleFetchFromDoi}
                    disabled={isFetchingDoi || !editDoi.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    title="Fetch paper metadata from CrossRef using DOI"
                  >
                    {isFetchingDoi ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      'Fetch Metadata'
                    )}
                  </button>
                </div>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
                  Enter a DOI to automatically fill title, authors, year, and generate filename
                </p>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Paper title"
                  title="Full title of the research paper"
                />
              </div>

              {/* Authors */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Authors (comma-separated)
                </label>
                <input
                  type="text"
                  value={editAuthors}
                  onChange={(e) => setEditAuthors(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Author 1, Author 2, Author 3"
                  title="List of authors separated by commas"
                />
              </div>

              {/* Year */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="2024"
                  min="1900"
                  max="2100"
                  title="Publication year"
                />
              </div>

              {/* Filename */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Filename
                </label>
                <input
                  type="text"
                  value={editFilename}
                  onChange={(e) => setEditFilename(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="paper.pdf"
                  title="PDF filename (will be auto-generated when using DOI fetch)"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Close without saving"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isEditing}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                title="Save changes and update all chunks"
              >
                {isEditing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
