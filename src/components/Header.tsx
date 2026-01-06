import {
  Sun,
  Moon,
  Activity,
  LogOut,
  FileText,
  Settings,
  Menu,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { state, setTheme, setActivePage, toggleSidebar } = useApp();
  const { logout } = useAuth();
  const { theme } = state;

  // Navigation items with responsive labels
  const navItems = [
    { page: 'library' as const, icon: FileText, label: 'Library' },
    { page: 'prompts' as const, icon: Settings, label: 'Prompts' },
    { page: 'health' as const, icon: Activity, label: 'Health' },
  ];

  return (
    <header className="h-[52px] bg-white dark:bg-gray-900 flex items-center justify-between px-3 shrink-0">
      {/* Mobile menu button */}
      <button
        onClick={toggleSidebar}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors md:hidden"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>

      {/* Spacer for desktop */}
      <div className="hidden md:block" />

      {/* Navigation */}
      <div className="flex items-center gap-1">
        {navItems.map(({ page, icon: Icon, label }) => {
          const isActive = state.activePage === page;
          return (
            <button
              key={page}
              onClick={() => setActivePage(page)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-sm ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
              aria-label={label}
            >
              {/* xl+: icon + label, lg: label only, <lg: icon only */}
              <Icon className="w-5 h-5 lg:hidden xl:block" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-gray-400" />
          ) : (
            <Moon className="w-5 h-5 text-gray-600" />
          )}
        </button>

        <button
          onClick={logout}
          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
