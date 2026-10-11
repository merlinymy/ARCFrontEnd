import { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout, ChatPage, LibraryPage, LoginPage, HealthStatusPanel } from './components';
import { PromptsPage } from './components/PromptsPage';
import { ProfilePage } from './components/ProfilePage';
import { ProjectsPage } from './components/ProjectsPage';
import { BibliographyPage } from './components/Bibliography';
import { ToastContainer } from './components/Toast';
import { BatchUploadPanel } from './components/BatchUploadPanel';
import { Loader2 } from 'lucide-react';

// pdf.js is large; it is fetched the first time a PDF is opened, not at startup.
const PdfViewer = lazy(() => import('./components/PdfViewer').then((m) => ({ default: m.PdfViewer })));

function AppContent() {
  const { state, removeToast } = useApp();
  const { activePage, viewingPdfId } = state;

  return (
    <>
      <Layout>
        {activePage === 'chat' && <ChatPage />}
        {activePage === 'library' && <LibraryPage />}
        {activePage === 'bibliography' && <BibliographyPage />}
        {activePage === 'prompts' && <PromptsPage />}
        {activePage === 'health' && <HealthStatusPanel />}
        {activePage === 'profile' && <ProfilePage />}
        {activePage === 'projects' && <ProjectsPage />}

        {/* Global PDF Viewer - works from any page. Keyed by paper so that
            nothing about one paper's page carries over to another's. */}
        {viewingPdfId && (
          <Suspense fallback={null}>
            <PdfViewer key={viewingPdfId} paperId={viewingPdfId} />
          </Suspense>
        )}
      </Layout>

      {/* Global Upload Panel */}
      <BatchUploadPanel />

      {/* Toast Notifications */}
      <ToastContainer toasts={state.toasts} onClose={removeToast} />
    </>
  );
}

function AuthenticatedApp() {
  const { state, isAuthenticated } = useAuth();

  // Show loading spinner while checking auth
  if (state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show main app if authenticated
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

export default App;
