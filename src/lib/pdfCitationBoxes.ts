/**
 * Tight (sentence-level) boxes for a citation, from the PDF's own text layer.
 * The matching is in `pdfTextMatch.ts`; this reads the pages from a document.
 *
 * It never throws: when the cited text cannot be found with confidence it
 * returns null and the caller keeps the backend's block boxes. The reason is
 * logged (console.info) so a coarse highlight can be told from a bug.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageHighlight, PdfHighlight } from '../types';
import { locateQuote, placeItems, type PlacedPage, type RawTextItem } from './pdfTextMatch';

/** A span over more pages than this is not matched (the cost grows, and so does the risk). */
const MAX_PAGES = 4;

const TAG = '[pdf-highlight]';

async function placedPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PlacedPage> {
  const page = await doc.getPage(pageNumber);
  // Scale 1: per-mille does not depend on zoom. The viewport applies the page's rotation.
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // Marked-content entries have no `str`; only text items are placed.
  const raw = content.items.filter((i): i is typeof i & RawTextItem => 'str' in i);
  return {
    page: pageNumber,
    items: placeItems(raw, viewport.transform, viewport.width, viewport.height),
  };
}

export async function tightBoxesForCitation(
  doc: PDFDocumentProxy,
  highlight: PdfHighlight
): Promise<PageHighlight[] | null> {
  const blocks = highlight.highlights;
  try {
    if (!highlight.quote || blocks.length === 0) return null;
    const first = Math.min(...blocks.map((h) => h.page));
    const last = Math.max(...blocks.map((h) => h.page), highlight.pageEnd ?? 0);
    if (first < 1 || last > doc.numPages) {
      console.info(TAG, 'fell back to block boxes: page out of range', { first, last, numPages: doc.numPages });
      return null;
    }
    if (last - first + 1 > MAX_PAGES) {
      console.info(TAG, 'fell back to block boxes: span covers too many pages', { first, last });
      return null;
    }
    const pages: PlacedPage[] = [];
    for (let p = first; p <= last; p++) pages.push(await placedPage(doc, p));

    const result = locateQuote(highlight.quote, pages, blocks);
    if (!result.boxes) {
      console.info(TAG, `fell back to block boxes: ${result.reason}`, { pages: [first, last] });
      return null;
    }
    console.info(TAG, `sentence-level highlight (${result.how} match, ${result.candidates} occurrence(s))`, {
      pages: [first, last],
      boxes: result.boxes.length,
    });
    return result.boxes;
  } catch (err) {
    console.info(TAG, 'fell back to block boxes: text layer could not be read', err);
    return null;
  }
}
