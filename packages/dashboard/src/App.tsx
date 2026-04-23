import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewList } from './components/ReviewList';
import { ReviewDetail } from './components/ReviewDetail';
import { LoginPage } from './pages/LoginPage';
import { getStoredApiKey } from './api/client';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

export function App() {
  const [authed, setAuthed] = useState(() => !!getStoredApiKey());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">🔍 Argus</span>
          <span className="text-xs text-gray-400">Code Review Engine</span>
        </header>
        <main>
          {selectedId
            ? <ReviewDetail reviewId={selectedId} onBack={() => setSelectedId(null)} />
            : <ReviewList onSelect={setSelectedId} />
          }
        </main>
      </div>
    </QueryClientProvider>
  );
}
