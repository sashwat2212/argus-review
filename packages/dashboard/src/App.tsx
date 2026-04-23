import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearStoredApiKey, getStoredApiKey } from './api/client';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { RepositoriesPage } from './pages/RepositoriesPage';

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
      <BrowserRouter>
        <AppShell onLogout={handleLogout}>
          <Routes>
            <Route path="/"             element={<DashboardPage />} />
            <Route path="/reviews"      element={<ReviewsPage />} />
            <Route path="/repositories" element={<RepositoriesPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
