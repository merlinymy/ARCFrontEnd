// API calls for the bibliography layer (W4). Every route is under /bibliography
// and needs the bearer token, which comes from the shared helpers in api.ts.

import { API_BASE, ApiError, getAuthHeaders } from './api';
import type {
  BackfillApplyRequest,
  BackfillApplyResponse,
  BackfillReportResponse,
  BackfillStatusKey,
  BackfillStatusResponse,
  CiteRequest,
  CiteResponse,
  CiteStylesResponse,
  CitationStyle,
  DedupeBatchResponse,
  DedupeDecisionRequest,
  DedupeDecisionResult,
  DedupeReport,
  DedupeReportQuery,
  EntryDetail,
  EntryFieldsInput,
  ExportPreview,
  ExportRequest,
  FileFormat,
  FormatCitationsResponse,
  ImportCommitRequest,
  ImportCommitResponse,
  ImportInfo,
  ImportReport,
  LibraryListResponse,
  LibraryQuery,
  LibraryStats,
  ReferenceCreateResponse,
  ZoteroConnectRequest,
  ZoteroParkedConflict,
  ZoteroResolveResponse,
  ZoteroStatus,
  ZoteroSyncJob,
  ZoteroSyncRequest,
} from '../types/bibliography';

const BASE = `${API_BASE}/bibliography`;

type Params = Record<string, string | number | boolean | null | undefined>;

function withParams(path: string, params?: Params): string {
  if (!params) return `${BASE}${path}`;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const text = qs.toString();
  return `${BASE}${path}${text ? `?${text}` : ''}`;
}

// FastAPI errors are {"detail": "text"}, {"detail": [{loc, msg}, ...]} (422) or,
// for an import with nothing in it, {"detail": {"message", "warnings"}}.
// The shared handleResponse in api.ts would print the last two as
// "[object Object]", so the message is built here.
function describeDetail(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (d && typeof d === 'object' && 'msg' in d) {
          const loc = Array.isArray((d as { loc?: unknown[] }).loc)
            ? (d as { loc: unknown[] }).loc.filter((p) => p !== 'body').join('.')
            : '';
          return loc ? `${loc}: ${String((d as { msg: unknown }).msg)}` : String((d as { msg: unknown }).msg);
        }
        return typeof d === 'string' ? d : '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const d = detail as { message: unknown; warnings?: unknown };
    const warnings = Array.isArray(d.warnings) && d.warnings.length ? ` (${d.warnings.join('; ')})` : '';
    return `${String(d.message)}${warnings}`;
  }
  return `Request failed with status ${status}`;
}

async function fail(response: Response): Promise<never> {
  const text = await response.text();
  let details: unknown = text;
  try {
    details = JSON.parse(text);
  } catch {
    // not JSON; keep the text
  }
  const detail = details && typeof details === 'object' ? (details as { detail?: unknown }).detail : undefined;
  throw new ApiError(response.status, describeDetail(detail, response.status), details);
}

async function request<T>(path: string, init: RequestInit = {}, params?: Params): Promise<T> {
  const headers: Record<string, string> = { ...(getAuthHeaders() as Record<string, string>) };
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(withParams(path, params), { ...init, headers: { ...headers, ...(init.headers as object) } });
  if (!response.ok) return fail(response);
  return response.json() as Promise<T>;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

// Downloads need the bearer token, so a plain <a href> would 403: fetch the
// blob with the header, then save it. The browser cannot read
// Content-Disposition, so the caller chooses the file name.
async function fetchBlob(path: string, init: RequestInit = {}, params?: Params): Promise<Blob> {
  const headers: Record<string, string> = { ...(getAuthHeaders() as Record<string, string>) };
  if (init.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(withParams(path, params), { ...init, headers });
  if (!response.ok) return fail(response);
  return response.blob();
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const FORMAT_EXTENSION: Record<FileFormat, string> = { ris: 'ris', bibtex: 'bib', csljson: 'json' };

export const FORMAT_LABEL: Record<FileFormat, string> = {
  ris: 'RIS (EndNote, Mendeley, Zotero)',
  bibtex: 'BibTeX',
  csljson: 'CSL-JSON (Zotero)',
};

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export function getBibliographyLibrary(query: LibraryQuery = {}): Promise<LibraryListResponse> {
  const { missing, ...rest } = query;
  return request<LibraryListResponse>('/library', {}, { ...rest, missing: missing?.length ? missing.join(',') : undefined });
}

export function getBibliographyStats(): Promise<LibraryStats> {
  return request<LibraryStats>('/stats');
}

export function getEntry(entryId: string): Promise<EntryDetail> {
  return request<EntryDetail>(`/entries/${encodeURIComponent(entryId)}`);
}

export function updateEntry(entryId: string, fields: EntryFieldsInput): Promise<EntryDetail> {
  return request<EntryDetail>(`/entries/${encodeURIComponent(entryId)}`, json('PATCH', fields));
}

export function createReference(fields: EntryFieldsInput & { title: string }): Promise<ReferenceCreateResponse> {
  return request<ReferenceCreateResponse>('/references', json('POST', fields));
}

export function removeReference(refId: string): Promise<{ entry_id: string; hidden: boolean }> {
  return request(`/references/${encodeURIComponent(refId)}`, json('DELETE'));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export function uploadImport(
  file: File,
  options: { format?: 'auto' | FileFormat; againstLibrary?: boolean; enrich?: boolean } = {}
): Promise<ImportInfo> {
  const form = new FormData();
  form.append('file', file);
  form.append('format', options.format ?? 'auto');
  form.append('against_library', String(options.againstLibrary ?? true));
  form.append('enrich', String(options.enrich ?? false));
  return request<ImportInfo>('/imports', { method: 'POST', body: form });
}

export function listImports(limit = 20): Promise<{ imports: ImportInfo[] }> {
  return request('/imports', {}, { limit });
}

export function getImport(importId: string, includeReport = false): Promise<ImportInfo> {
  return request<ImportInfo>(`/imports/${encodeURIComponent(importId)}`, {}, { include_report: includeReport });
}

export function getImportRecords(
  importId: string,
  offset = 0,
  limit = 100
): Promise<{ total: number; offset: number; limit: number; records: Array<{ rid: string; title: string }> }> {
  return request(`/imports/${encodeURIComponent(importId)}/records`, {}, { offset, limit });
}

export function enrichImport(importId: string): Promise<ImportInfo> {
  return request<ImportInfo>(`/imports/${encodeURIComponent(importId)}/enrich`, json('POST'));
}

export function getImportReportJson(importId: string): Promise<ImportReport> {
  return request<ImportReport>(`/imports/${encodeURIComponent(importId)}/report`, {}, { format: 'json' });
}

export function downloadImportReport(importId: string, format: 'json' | 'markdown'): Promise<Blob> {
  return fetchBlob(`/imports/${encodeURIComponent(importId)}/report`, {}, { format });
}

export function downloadCleaned(importId: string, format: FileFormat): Promise<Blob> {
  return fetchBlob(`/imports/${encodeURIComponent(importId)}/cleaned`, {}, { format });
}

export function commitImport(importId: string, body: ImportCommitRequest = {}): Promise<ImportCommitResponse> {
  return request<ImportCommitResponse>(`/imports/${encodeURIComponent(importId)}/commit`, json('POST', body));
}

// ---------------------------------------------------------------------------
// Export and citation formatting
// ---------------------------------------------------------------------------

export function previewExport(body: ExportRequest): Promise<ExportPreview> {
  return request<ExportPreview>('/export/preview', json('POST', body));
}

export function downloadExport(body: ExportRequest): Promise<Blob> {
  return fetchBlob('/export', json('POST', body));
}

export async function exportText(body: ExportRequest): Promise<string> {
  return (await downloadExport(body)).text();
}

export function getCiteStyles(): Promise<CiteStylesResponse> {
  return request<CiteStylesResponse>('/cite/styles');
}

export function formatCitations(entryIds: string[], style: CitationStyle): Promise<FormatCitationsResponse> {
  return request<FormatCitationsResponse>('/cite/format', json('POST', { entry_ids: entryIds, style }));
}

// ---------------------------------------------------------------------------
// Library duplicates
// ---------------------------------------------------------------------------

export function getDedupeReport(query: DedupeReportQuery = {}): Promise<DedupeReport> {
  return request<DedupeReport>('/dedupe/report', {}, { ...query });
}

export function downloadDedupeMarkdown(): Promise<Blob> {
  return fetchBlob('/dedupe/report/markdown');
}

export function decideDuplicates(body: DedupeDecisionRequest): Promise<DedupeDecisionResult> {
  return request<DedupeDecisionResult>('/dedupe/decisions', json('POST', body));
}

export function decideDuplicatesBatch(decisions: DedupeDecisionRequest[]): Promise<DedupeBatchResponse> {
  return request<DedupeBatchResponse>('/dedupe/decisions/batch', json('POST', { decisions }));
}

// ---------------------------------------------------------------------------
// Metadata backfill (the Crossref lookup itself is a backend script)
// ---------------------------------------------------------------------------

export function getBackfillStatus(): Promise<BackfillStatusResponse> {
  return request<BackfillStatusResponse>('/backfill/status');
}

export function getBackfillReport(
  query: { status?: BackfillStatusKey; offset?: number; limit?: number } = {}
): Promise<BackfillReportResponse> {
  return request<BackfillReportResponse>('/backfill/report', {}, { ...query });
}

export function applyBackfill(body: BackfillApplyRequest): Promise<BackfillApplyResponse> {
  return request<BackfillApplyResponse>('/backfill/apply', json('POST', body));
}

// ---------------------------------------------------------------------------
// Zotero
// ---------------------------------------------------------------------------

export function getZoteroStatus(): Promise<ZoteroStatus> {
  return request<ZoteroStatus>('/zotero/status');
}

export function connectZotero(body: ZoteroConnectRequest): Promise<ZoteroStatus> {
  return request<ZoteroStatus>('/zotero/connect', json('POST', body));
}

export function disconnectZotero(): Promise<{ configured: boolean; connected: boolean }> {
  return request('/zotero/connect', json('DELETE'));
}

export function startZoteroSync(body: ZoteroSyncRequest): Promise<{ job_id: string; status: string }> {
  return request('/zotero/sync', json('POST', body));
}

export function getZoteroSyncJob(jobId: string): Promise<ZoteroSyncJob> {
  return request<ZoteroSyncJob>(`/zotero/sync/${encodeURIComponent(jobId)}`);
}

export function getZoteroConflicts(): Promise<{ conflicts: ZoteroParkedConflict[] }> {
  return request('/zotero/conflicts');
}

export function resolveZoteroConflict(itemId: number, choice: 'zotero' | 'arc'): Promise<ZoteroResolveResponse> {
  return request<ZoteroResolveResponse>(`/zotero/conflicts/${itemId}/resolve`, json('POST', { choice }));
}

// ---------------------------------------------------------------------------
// "What should I cite"
// ---------------------------------------------------------------------------

export function recommendCitations(body: CiteRequest): Promise<CiteResponse> {
  return request<CiteResponse>('/cite/recommend', json('POST', body));
}
