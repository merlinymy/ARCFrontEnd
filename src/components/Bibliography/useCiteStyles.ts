import { useEffect, useState } from 'react';
import { getCiteStyles } from '../../services/bibliographyApi';
import type { CitationStyle, CiteStylesResponse } from '../../types/bibliography';

const FALLBACK: CiteStylesResponse = { styles: ['acs', 'apa', 'ieee', 'vancouver'], default: 'acs' };

export const STYLE_LABEL: Record<CitationStyle, string> = {
  acs: 'ACS',
  apa: 'APA 7',
  ieee: 'IEEE',
  vancouver: 'Vancouver',
};

let cached: Promise<CiteStylesResponse> | null = null;

// The list of citation styles comes from the server (GET /cite/styles). It does
// not change at runtime, so it is fetched once; if the call fails the four
// documented styles are used and the next mount tries again.
export function useCiteStyles(): CiteStylesResponse {
  const [styles, setStyles] = useState<CiteStylesResponse>(FALLBACK);
  useEffect(() => {
    let alive = true;
    if (!cached) {
      cached = getCiteStyles().catch(() => {
        cached = null;
        return FALLBACK;
      });
    }
    cached.then((s) => {
      if (alive) setStyles(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return styles;
}
