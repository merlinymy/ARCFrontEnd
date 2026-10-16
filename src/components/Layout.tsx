import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useApp } from '../context/AppContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { state, toggleSidebar } = useApp();
  const { sidebarOpen } = state;

  return (
    /* overflow-hidden states the invariant this shell already assumed: one
       viewport tall, everything inside scrolls in its own pane. Kept as
       defence in depth, but note it is NOT what fixed the two-scrollbar bug
       - see the comment on <main>. An absolutely positioned descendant of a
       static ancestor ignores this entirely. */
    <div className="h-screen overflow-hidden flex bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar - full height, transforms based on state */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 md:relative md:z-0
          transition-all duration-200 ease-in-out
          ${sidebarOpen ? 'w-64' : 'w-0 md:w-16'}
        `}
      >
        <Sidebar collapsed={!sidebarOpen} />
      </div>

      {/* Main area with header and content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <Header />
        {/* `relative` is what stops the page growing a second scrollbar.
            Tailwind's `sr-only` is position:absolute, and every wrapper in a
            page is position:static, so those elements' containing block was
            the page itself. Absolute boxes are not clipped by overflow:hidden
            on a static ancestor, so each one sat at its static position deep
            inside the scrolled content and stretched the document down to
            meet it - further with every answer, since each source card adds
            more. Measured in the running app: html scrollHeight 2865 against
            an 873 viewport, matching the last sr-only's bottom exactly; with
            this, 873. Making main the containing block puts them inside
            something that does clip. */}
        <main className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
