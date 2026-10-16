import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { BookMarked } from 'lucide-react';
import { LibraryTab } from './LibraryTab';
import { ImportTab } from './ImportTab';
import { ExportTab } from './ExportTab';
import { DedupeTab } from './DedupeTab';
import { BackfillTab } from './BackfillTab';
import { ZoteroTab } from './ZoteroTab';
import { CiteTab } from './CiteTab';
import { BIBLIOGRAPHY_TABS, type BibliographyTabId } from './tabs';

// One screen with seven tabs. Visited tabs stay mounted (hidden) so a half-done
// import, a typed-in paragraph or a running Zotero sync survives a tab switch.
// `version` goes up whenever a tab changes the library, so the others reload.
export function BibliographyPage() {
  const [active, setActive] = useState<BibliographyTabId>('library');
  const [visited, setVisited] = useState<Set<BibliographyTabId>>(new Set(['library']));
  const [version, setVersion] = useState(0);
  const tabRefs = useRef<Partial<Record<BibliographyTabId, HTMLButtonElement | null>>>({});

  const select = useCallback((id: BibliographyTabId, focus = false) => {
    setActive(id);
    setVisited((cur) => (cur.has(id) ? cur : new Set(cur).add(id)));
    if (focus) requestAnimationFrame(() => tabRefs.current[id]?.focus());
  }, []);

  const onChanged = useCallback(() => setVersion((v) => v + 1), []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = BIBLIOGRAPHY_TABS.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % BIBLIOGRAPHY_TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + BIBLIOGRAPHY_TABS.length) % BIBLIOGRAPHY_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = BIBLIOGRAPHY_TABS.length - 1;
    if (next >= 0) {
      e.preventDefault();
      select(BIBLIOGRAPHY_TABS[next].id, true);
    }
  };

  const panel = (id: BibliographyTabId) => {
    switch (id) {
      case 'library':
        return <LibraryTab version={version} onNavigate={select} onChanged={onChanged} />;
      case 'import':
        return <ImportTab onChanged={onChanged} onNavigate={select} />;
      case 'export':
        return <ExportTab onNavigate={select} />;
      case 'duplicates':
        return <DedupeTab version={version} onChanged={onChanged} onNavigate={select} />;
      case 'backfill':
        return <BackfillTab version={version} onChanged={onChanged} />;
      case 'zotero':
        return <ZoteroTab onChanged={onChanged} />;
      case 'cite':
        return <CiteTab />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <BookMarked className="w-8 h-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bibliography</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">PDF papers and reference-only entries, import and export, duplicates, metadata, Zotero and citation suggestions</p>
          </div>
        </div>
        <div role="tablist" aria-label="Bibliography sections" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto -mb-px">
          {BIBLIOGRAPHY_TABS.map((t) => {
            const selected = active === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                id={`bib-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`bib-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 rounded-t-lg ${
                  selected
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 font-medium'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {BIBLIOGRAPHY_TABS.filter((t) => visited.has(t.id)).map((t) => (
          <div key={t.id} id={`bib-panel-${t.id}`} role="tabpanel" aria-labelledby={`bib-tab-${t.id}`} hidden={active !== t.id} tabIndex={0} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
            {panel(t.id)}
          </div>
        ))}
      </div>
    </div>
  );
}
