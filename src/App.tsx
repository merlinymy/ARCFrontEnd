import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout, ChatPage, LibraryPage, PdfViewer, LoginPage, HealthStatusPanel } from './components';
import { PromptsPage } from './components/PromptsPage';
import { ToastContainer } from './components/Toast';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { state, removeToast } = useApp();
  const { activePage, viewingPdfId } = state;

  return (
    <>
      <Layout>
        {activePage === 'chat' && <ChatPage />}
        {activePage === 'library' && <LibraryPage />}
        {activePage === 'prompts' && <PromptsPage />}
        {activePage === 'health' && <HealthStatusPanel />}

        {/* Global PDF Viewer - works from any page */}
        {viewingPdfId && <PdfViewer paperId={viewingPdfId} />}
      </Layout>

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
