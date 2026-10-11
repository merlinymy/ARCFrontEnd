export type BibliographyTabId = 'library' | 'import' | 'export' | 'duplicates' | 'backfill' | 'zotero' | 'cite';

export const BIBLIOGRAPHY_TABS: Array<{ id: BibliographyTabId; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'import', label: 'Import' },
  { id: 'export', label: 'Export' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'backfill', label: 'Metadata backfill' },
  { id: 'zotero', label: 'Zotero' },
  { id: 'cite', label: 'What should I cite' },
];
