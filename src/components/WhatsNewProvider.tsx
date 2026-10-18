import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CHANGELOG_VERSION } from '../changelog';
import { markChangelogSeen, shouldShowChangelog } from '../lib/changelogGate';
import { WhatsNewDialog } from './WhatsNewDialog';
import { WhatsNewContext } from './whatsNewContext';

/**
 * Owns whether the dialog is open. Mounted inside the authenticated branch of
 * App, so the first-run check happens at login and never on the login screen.
 */
export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => shouldShowChangelog(CHANGELOG_VERSION));

  const openWhatsNew = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    // Written on every close, including one from the header: it is idempotent,
    // and a person who reopens it has plainly seen the current version.
    markChangelogSeen(CHANGELOG_VERSION);
    setOpen(false);
  }, []);

  const value = useMemo(() => ({ openWhatsNew }), [openWhatsNew]);

  return (
    <WhatsNewContext.Provider value={value}>
      {children}
      {open && <WhatsNewDialog onClose={close} />}
    </WhatsNewContext.Provider>
  );
}
