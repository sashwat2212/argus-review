import { useState, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { api } from './api/client';
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

function AppContent() {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: api.getMe,
    retry: false,
  });

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort — proceed with local cleanup even if request fails
    }
    queryClient.clear();
    window.location.href = '/login';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 font-mono text-xs animate-pulse">Authenticating with Identity Provider...</p>
      </div>
    );
  }

  // If there's an error (401), or no user, show login page
  if (isError || !user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <AppShell onLogout={handleLogout}>
        <Routes>
          <Route path="/"             element={<PageTransition><DashboardPage /></PageTransition>} />
          <Route path="/reviews"      element={<PageTransition><ReviewsPage /></PageTransition>} />
          <Route path="/repositories" element={<PageTransition><RepositoriesPage /></PageTransition>} />
          {/* Catch-all */}
          <Route path="*"             element={<PageTransition><DashboardPage /></PageTransition>} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </QueryClientProvider>
  );
}
