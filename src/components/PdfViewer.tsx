import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  X,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  Quote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useApp } from '../context/AppContext';
import {
  api, downloadPdfWithAuth, fetchAuthedObjectUrl, getAuthHeaders, getPdfUrl,
} from '../services/api';
import type { PageHighlight, PdfHighlight } from '../types';
import { locationNote } from '../lib/citations';
import { tightBoxesForCitation } from '../lib/pdfCitationBoxes';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// pdf.js's data files, served by the `pdfjs-data` plugin in vite.config.ts.
const DATA_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
// Space around the page inside the scroll area, in CSS pixels.
const PAGE_GUTTER = 32;

interface PdfViewerProps {
  paperId: string;
}

interface LoadedDoc {
  paperId: string;
  doc: PDFDocumentProxy;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * The boxes of a citation, drawn over the page they belong to.
 *
 * A box is [x0, y0, x1, y1] in per-mille of the page, origin top-left (the
 * contract, and `bbox_units: per_mille_of_page` / `bbox_origin: top_left` on the
 * paper record). Percentages of the page's own box are all that is needed:
 * they hold at any zoom and for any page size, and pdf.js's viewport already
 * applies the page's rotation, as the extractor's raster did.
 */
function HighlightLayer({ boxes }: { boxes: PageHighlight[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {boxes.map((h, i) => {
        const [x0, y0, x1, y1] = h.bbox.map((n) => clamp(n, 0, 1000));
        return (
          <div
            key={i}
            // Multiply keeps the text readable through the colour.
            className="absolute rounded-sm bg-yellow-300/50 ring-2 ring-yellow-500/70 mix-blend-multiply"
            style={{
              left: `${x0 / 10}%`,
              top: `${y0 / 10}%`,
              width: `${(x1 - x0) / 10}%`,
              height: `${(y1 - y0) / 10}%`,
            }}
          />
        );
      })}
    </div>
  );
}

export function PdfViewer({ paperId }: PdfViewerProps) {
  const { state, setViewingPdf } = useApp();
  const requestedPage = state.viewingPdfPage;
  const highlight: PdfHighlight | null = state.viewingPdfHighlight;

  const paper = state.papers.find((p) => p.id === paperId);
  // A paper beyond the first page of the library list is not in `state.papers`.
  const [fetchedTitle, setFetchedTitle] = useState<{ id: string; title: string; filename: string } | null>(null);
  const title = paper?.title ?? (fetchedTitle?.id === paperId ? fetchedTitle.title : null);
  const filename = paper?.filename ?? (fetchedTitle?.id === paperId ? fetchedTitle.filename : 'paper.pdf');

  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  const [loaded, setLoaded] = useState<LoadedDoc | null>(null);
  const [loadError, setLoadError] = useState<{ paperId: string; message: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [pageNumber, setPageNumber] = useState(() => Math.max(1, requestedPage ?? 1));
  const [pageInput, setPageInput] = useState(() => String(Math.max(1, requestedPage ?? 1)));
  const [zoom, setZoom] = useState(1);
  const [scrollerWidth, setScrollerWidth] = useState(0);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(true);

  const doc = loaded?.paperId === paperId ? loaded.doc : null;
  const numPages = doc?.numPages ?? 0;

  // A new request from outside (another chip, a figure jump) while the viewer
  // is open moves it. Done while rendering rather than in an effect, so there
  // is no frame showing the old page.
  const [seenRequest, setSeenRequest] = useState({ page: requestedPage, highlight });
  if (seenRequest.page !== requestedPage || seenRequest.highlight !== highlight) {
    setSeenRequest({ page: requestedPage, highlight });
    const target = Math.max(1, requestedPage ?? 1);
    const next = numPages ? Math.min(target, numPages) : target;
    setPageNumber(next);
    setPageInput(String(next));
    setQuoteOpen(true);
  }

  const goToPage = useCallback(
    (n: number) => {
      if (!numPages) return;
      const next = clamp(Math.round(n), 1, numPages);
      setPageNumber(next);
      setPageInput(String(next));
    },
    [numPages]
  );

  // ---- load the document ---------------------------------------------------
  useEffect(() => {
    const task = pdfjsLib.getDocument({
      // The PDF route requires a token since the library API was closed
      // (2026-10-16). pdf.js issues the request itself, so the header goes
      // here rather than on a fetch. Cross-origin this costs a CORS
      // preflight when VITE_API_BASE_URL points at another host; the server
      // allows it (explicit origins, allow_headers "*").
      httpHeaders: getAuthHeaders() as Record<string, string>,
      url: getPdfUrl(paperId),
      cMapUrl: `${DATA_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${DATA_BASE}standard_fonts/`,
      wasmUrl: `${DATA_BASE}wasm/`,
      iccUrl: `${DATA_BASE}iccs/`,
    });
    task.onProgress = ({ loaded: got, total }: { loaded: number; total: number }) => {
      if (total > 0) setProgress(Math.min(100, Math.round((got / total) * 100)));
    };
    let cancelled = false;
    task.promise.then(
      (pdf) => {
        if (cancelled) return;
        setLoaded({ paperId, doc: pdf });
        setLoadError(null);
        // The page requested before the page count was known.
        setPageNumber((n) => clamp(n, 1, pdf.numPages));
        setPageInput((v) => String(clamp(parseInt(v, 10) || 1, 1, pdf.numPages)));
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'The PDF could not be loaded.';
        setLoadError({ paperId, message });
      }
    );
    return () => {
      cancelled = true;
      task.destroy().catch(() => {});
    };
  }, [paperId]);

  // ---- the title, when the library list does not have this paper ------------
  useEffect(() => {
    if (paper) return;
    let cancelled = false;
    api
      .getPaper(paperId)
      .then((p) => {
        if (!cancelled) setFetchedTitle({ id: paperId, title: p.title, filename: p.filename });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paperId, paper]);

  // ---- the width of the scroll area (the page is fitted to it) ---------------
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScrollerWidth(Math.round(el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- draw the page ---------------------------------------------------------
  useEffect(() => {
    if (!doc || !scrollerWidth) return;
    let cancelled = false;

    (async () => {
      // One render per canvas at a time: let a superseded one finish cancelling.
      const previous = renderTaskRef.current;
      if (previous) {
        previous.cancel();
        try {
          await previous.promise;
        } catch {
          // RenderingCancelledException is the expected outcome.
        }
      }
      if (cancelled) return;

      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const natural = page.getViewport({ scale: 1 });
        const fitScale = Math.max(0.1, (scrollerWidth - PAGE_GUTTER) / natural.width);
        const viewport = page.getViewport({ scale: fitScale * zoom });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setPageSize({ w: Math.floor(viewport.width), h: Math.floor(viewport.height) });
        setRenderError(null);

        const task = page.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setRenderedPage(pageNumber);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
        setRenderError(err instanceof Error ? err.message : 'This page could not be drawn.');
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [doc, pageNumber, zoom, scrollerWidth]);

  // ---- sentence-level boxes, from the PDF's own text layer --------------------
  // The backend's boxes are per paragraph. The cited text is looked for in the
  // text layer and boxed tightly; null means it was not found with confidence,
  // and the backend's boxes are kept (the reason is logged to the console).
  const [tight, setTight] = useState<{
    doc: PDFDocumentProxy;
    highlight: PdfHighlight;
    boxes: PageHighlight[] | null;
  } | null>(null);
  useEffect(() => {
    if (!doc || !highlight || !highlight.quote || highlight.highlights.length === 0) return;
    let cancelled = false;
    tightBoxesForCitation(doc, highlight).then((boxes) => {
      if (!cancelled) setTight({ doc, highlight, boxes });
    });
    return () => {
      cancelled = true;
    };
  }, [doc, highlight]);

  // Until the text layer has answered, the coarse boxes are not drawn: they
  // would flash and then shrink.
  const resolving =
    Boolean(doc && highlight?.quote) &&
    (highlight?.highlights.length ?? 0) > 0 &&
    !(tight?.doc === doc && tight?.highlight === highlight);
  const activeBoxes = useMemo(
    () => (tight?.doc === doc && tight?.highlight === highlight && tight.boxes) || highlight?.highlights || [],
    [tight, doc, highlight]
  );

  // ---- the boxes on this page ------------------------------------------------
  const boxesHere = useMemo(
    () => (resolving ? [] : activeBoxes.filter((h) => h.page === pageNumber)),
    [activeBoxes, resolving, pageNumber]
  );
  const boxesElsewhere = useMemo(
    () => (resolving ? [] : [...new Set(activeBoxes.map((h) => h.page))].filter((p) => p !== pageNumber)),
    [activeBoxes, resolving, pageNumber]
  );

  // Bring the highlight into view once its page is drawn; a page without one
  // starts at the top.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const box = pageBoxRef.current;
    if (!scroller || !box || renderedPage !== pageNumber || !pageSize) return;
    if (boxesHere.length === 0) {
      scroller.scrollTo({ top: 0 });
      return;
    }
    const top = Math.min(...boxesHere.map((h) => h.bbox[1])) / 1000;
    const y = box.offsetTop + top * pageSize.h;
    scroller.scrollTo({ top: Math.max(0, y - scroller.clientHeight / 3), behavior: 'smooth' });
    // pageSize is deliberately not a dependency: zooming should not yank the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedPage, pageNumber, boxesHere]);

  // ---- dialog behaviour: focus in, Escape, Tab stays inside, focus back ------
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setViewingPdf(null);
      return;
    }
    if (e.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    // Left/right turn pages, unless the page-number box has the keys.
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPage(pageNumber - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToPage(pageNumber + 1);
    }
  };

  // Both of these used to point an element straight at the API. That stopped
  // working when the paper routes began requiring a token: neither <a download>
  // nor window.open can send an Authorization header, so the bytes are fetched
  // here and the element is pointed at a blob instead.
  const handleDownload = () => {
    void downloadPdfWithAuth(paperId, filename)
      .catch(() => setRenderError('Could not download the PDF.'));
  };

  const handleOpenInNewTab = () => {
    void fetchAuthedObjectUrl(getPdfUrl(paperId))
      .then((objectUrl) => {
        // The browser's own viewer honours #page=N on a blob: URL, so the
        // "open at the cited page" behaviour survives.
        window.open(`${objectUrl}#page=${pageNumber}`, '_blank');
        // The new tab has loaded the blob by the time this fires; revoking
        // earlier can race it, and never revoking leaks the whole PDF.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      })
      .catch(() => setRenderError('Could not open the PDF.'));
  };

  const commitPageInput = () => {
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n)) goToPage(n);
    else setPageInput(String(pageNumber));
  };

  const failure = loadError?.paperId === paperId ? loadError.message : null;
  const loading = !doc && !failure;
  const note = highlight?.locationSource ? locationNote({ location_source: highlight.locationSource }) : null;
  const noBox = Boolean(highlight) && (highlight?.highlights.length ?? 0) === 0;

  const iconButton =
    'p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? `PDF: ${title}` : 'PDF viewer'}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full h-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col overflow-hidden focus:outline-none"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex-1 min-w-[10rem]">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {title || 'PDF Viewer'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {filename}
              {highlight?.locator ? ` · ${highlight.locator}` : ''}
            </p>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
            <button
              type="button"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={!doc || pageNumber <= 1}
              className={iconButton}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
              <span className="sr-only">Page</span>
              <input
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitPageInput();
                  }
                }}
                disabled={!doc}
                className="w-12 px-1.5 py-1 text-center bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span aria-hidden="true">/ {numPages || '–'}</span>
            </label>
            <button
              type="button"
              onClick={() => goToPage(pageNumber + 1)}
              disabled={!doc || pageNumber >= numPages}
              className={iconButton}
              aria-label="Next page"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button
              type="button"
              onClick={() => setZoom((z) => clamp(z - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
              disabled={zoom <= MIN_ZOOM}
              className={iconButton}
              aria-label="Zoom out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 py-1 text-sm tabular-nums text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={`Zoom ${Math.round(zoom * 100)} percent of page width. Reset to fit width`}
              title="Fit to width"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clamp(z + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
              disabled={zoom >= MAX_ZOOM}
              className={iconButton}
              aria-label="Zoom in"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={handleOpenInNewTab} className={iconButton} title="Open in new tab" aria-label="Open in new tab">
              <ExternalLink className="w-5 h-5" />
            </button>
            <button type="button" onClick={handleDownload} className={iconButton} title="Download PDF" aria-label="Download PDF">
              <Download className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setViewingPdf(null)} className={iconButton} title="Close" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* The cited passage, verbatim, beside the page it is highlighted on. */}
        {highlight?.quote && (
          <div className="border-b border-gray-200 dark:border-gray-700 bg-yellow-50/60 dark:bg-yellow-900/10 px-4 py-2">
            <button
              type="button"
              onClick={() => setQuoteOpen((o) => !o)}
              aria-expanded={quoteOpen}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <Quote className="w-3.5 h-3.5" aria-hidden="true" />
              Cited passage
              {quoteOpen ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
            {quoteOpen && (
              <>
                <blockquote className="mt-1.5 max-h-28 overflow-y-auto border-l-2 border-yellow-500 pl-3 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
                  {highlight.quote}
                </blockquote>
                {(note || noBox) && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                    {note ?? 'No highlight box is available for this citation; the page is shown.'}
                    {highlight.pageEnd && highlight.pageEnd !== pageNumber && boxesElsewhere.length === 0
                      ? ` The passage runs to p. ${highlight.pageEnd}.`
                      : ''}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* The page */}
        <div
          ref={scrollerRef}
          className="relative flex-1 min-h-0 overflow-auto bg-gray-200 dark:bg-gray-900"
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400" role="status">
              <Loader2 className="w-6 h-6 animate-spin mr-2" aria-hidden="true" />
              Loading the PDF{progress !== null ? ` (${progress}%)` : '…'}
            </div>
          )}

          {failure && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-gray-600 dark:text-gray-300" role="alert">
              <p>The PDF could not be displayed here.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 break-words max-w-md">{failure}</p>
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                Open in the browser&rsquo;s viewer
              </button>
            </div>
          )}

          {doc && (
            <div className="min-w-full w-max px-4 py-4">
              {boxesElsewhere.length > 0 && boxesHere.length === 0 && (
                <div className="mx-auto mb-3 w-fit text-sm">
                  <button
                    type="button"
                    onClick={() => goToPage(boxesElsewhere[0])}
                    className="px-3 py-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    The highlighted passage is on p. {boxesElsewhere[0]}
                  </button>
                </div>
              )}
              {boxesElsewhere.length > 0 && boxesHere.length > 0 && (
                <div className="mx-auto mb-3 w-fit text-sm">
                  <button
                    type="button"
                    onClick={() => goToPage(boxesElsewhere[0])}
                    className="px-3 py-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    The passage continues on p. {boxesElsewhere[0]}
                  </button>
                </div>
              )}

              <div
                ref={pageBoxRef}
                className="relative mx-auto bg-white shadow-md"
                style={pageSize ? { width: pageSize.w, height: pageSize.h } : undefined}
              >
                <canvas ref={canvasRef} className="block" />
                {boxesHere.length > 0 && renderedPage === pageNumber && <HighlightLayer boxes={boxesHere} />}
              </div>

              {renderError && (
                <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400" role="alert">
                  {renderError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
