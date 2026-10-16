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
    /* overflow-hidden is load-bearing: this shell is exactly one viewport
       tall and everything inside scrolls in its own pane. Without it a child
       taller than the viewport - a long conversation list in the sidebar -
       overflows visibly and gives the document its own scrollbar, so you get
       two: an inner one for the chat and an outer one dragging the whole app. */
    <div className="h-screen overflow-hidden flex bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar - full height, transforms based on state */}
      {/* h-full so the aside's own `h-full` has something to resolve against.
          Without it the aside falls back to its content height, its inner
          `flex-1 overflow-y-auto` conversation list never gets a bound to
          scroll within, and the sidebar grows past the viewport instead. */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 md:relative md:z-0 h-full
          transition-all duration-200 ease-in-out
          ${sidebarOpen ? 'w-64' : 'w-0 md:w-16'}
        `}
      >
        <Sidebar collapsed={!sidebarOpen} />
      </div>

      {/* Main area with header and content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <Header />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
