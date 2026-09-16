import { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, Maximize2, X, FileText, Download } from 'lucide-react';
import { getFigureImageUrl } from '../services/api';
import { useApp } from '../context/AppContext';

/**
 * A persisted figure or table crop, rendered inline.
 *
 * Deliberately **not** a figure *interpreter*. The caption is the retrieval
 * surface and the user is the comprehension surface, so this component's whole
 * job is to put the actual pixels in front of them without making them leave
 * the conversation. No description, no alt-text guess, no derived claim about
 * what the axes say.
 *
 * A missing crop renders as nothing at all (or, in the lightbox, as an honest
 * "no crop stored" note): papers extracted before the crops were persisted have
 * no bytes to show, and a broken <img> icon would read as a bug.
 */

interface FigureViewProps {
  paperId: string;
  figureId: string;
  /** "Figure 3" / "Table II" — the paper's own label, when known. */
  label?: string | null;
  caption?: string | null;
  /** 1-indexed page the figure sits on, for the "open the PDF here" jump. */
  page?: number | null;
  /** Collapsed thumbnail vs full width. */
  variant?: 'thumbnail' | 'inline';
  className?: string;
}

export function FigureView({
  paperId,
  figureId,
  label,
  caption,
  page,
  variant = 'inline',
  className = '',
}: FigureViewProps) {
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const src = getFigureImageUrl(paperId, figureId);

  // A paper indexed before crops were persisted has no bytes for this id. Say
  // nothing rather than showing a broken image.
  if (failed) return null;

  const heightClass = variant === 'thumbnail' ? 'max-h-32' : 'max-h-96';

  return (
    <>
      <figure
        className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden ${className}`}
      >
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="group relative block w-full bg-white"
          title={label ? `Enlarge ${label}` : 'Enlarge figure'}
        >
          <img
            src={src}
            alt={label || figureId}
            onError={() => setFailed(true)}
            className={`w-full ${heightClass} object-contain`}
            loading="lazy"
          />
          <span className="absolute top-1.5 right-1.5 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 className="w-3.5 h-3.5" />
          </span>
        </button>

        {(label || caption) && (
          <figcaption className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            {label && (
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {label}
                {caption ? ' · ' : ''}
              </span>
            )}
            {caption && (
              <span className={variant === 'thumbnail' ? 'line-clamp-2' : ''}>
                {caption}
              </span>
            )}
          </figcaption>
        )}
      </figure>

      {zoomed && (
        <FigureLightbox
          paperId={paperId}
          figureId={figureId}
          label={label}
          caption={caption}
          page={page}
          onClose={() => setZoomed(false)}
        />
      )}
    </>
  );
}

interface FigureLightboxProps {
  paperId: string;
  figureId: string;
  label?: string | null;
  caption?: string | null;
  page?: number | null;
  onClose: () => void;
}

export function FigureLightbox({
  paperId,
  figureId,
  label,
  caption,
  page,
  onClose,
}: FigureLightboxProps) {
  const { setViewingPdf } = useApp();
  const [failed, setFailed] = useState(false);
  const src = getFigureImageUrl(paperId, figureId);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {label || figureId}
            </span>
            {page ? (
              <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">
                p. {page}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={() => {
                onClose();
                setViewingPdf(paperId, page ?? null);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={page ? `Open the PDF at page ${page}` : 'Open the PDF'}
            >
              <FileText className="w-4 h-4" />
              In the paper
            </button>
            <a
              href={`${src}?download=true`}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Download the crop"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white flex items-center justify-center p-4">
          {failed ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-12 text-center">
              No crop stored for this figure.
              <br />
              <span className="text-xs">
                Papers indexed before figure persistence have no image bytes; the
                figure is still in the PDF.
              </span>
            </p>
          ) : (
            <img
              src={src}
              alt={label || figureId}
              onError={() => setFailed(true)}
              className="max-w-full max-h-[70vh] object-contain"
            />
          )}
        </div>

        {caption && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 max-h-32 overflow-y-auto">
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
