import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearStoredApiKey, getStoredApiKey } from './api/client';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { ToastProvider } from './components/Toast';
import { PageTransition } from './components/PageTransition';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

export function App() {
  const [authed, setAuthed] = useState(() => !!getStoredApiKey());

  const handleLogout = () => {
    clearStoredApiKey();
    queryClient.clear();
    setAuthed(false);
  };

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppShell onLogout={handleLogout}>
            <Routes>
              <Route path="/"             element={<PageTransition><DashboardPage /></PageTransition>} />
              <Route path="/reviews"      element={<PageTransition><ReviewsPage /></PageTransition>} />
              <Route path="/repositories" element={<PageTransition><RepositoriesPage /></PageTransition>} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
