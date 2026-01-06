import {
  Sun,
  Moon,
  Activity,
  Menu,
  LogOut,
  FileText,
  Settings,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { state, setTheme, toggleSidebar, setActivePage } = useApp();
  const { logout } = useAuth();
  const { theme, sidebarOpen } = state;

  // Navigation items with responsive labels
  const navItems = [
    { page: 'library' as const, icon: FileText, label: 'Library' },
    { page: 'prompts' as const, icon: Settings, label: 'Prompts' },
    { page: 'health' as const, icon: Activity, label: 'Health' },
  ];

  return (
    <header className="h-14 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between px-4 shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">ARC</span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-gray-100 hidden sm:block">
            ARC
          </span>
        </div>
      </div>

      {/* Right section - Navigation */}
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

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

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
