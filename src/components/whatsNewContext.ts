import { createContext, useContext } from 'react';

export interface WhatsNewContextValue {
  /** Opens the dialog regardless of which version was last seen. */
  openWhatsNew: () => void;
}

export const WhatsNewContext = createContext<WhatsNewContextValue | null>(null);

export function useWhatsNew(): WhatsNewContextValue {
  const ctx = useContext(WhatsNewContext);
  if (!ctx) throw new Error('useWhatsNew must be used within a WhatsNewProvider');
  return ctx;
}
