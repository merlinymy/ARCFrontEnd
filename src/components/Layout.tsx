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
    <div className="h-screen flex bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
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
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
