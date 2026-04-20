import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="text-center p-8">
        <h1 className="text-3xl font-bold">Argus Dashboard</h1>
        <p className="mt-4 text-gray-600">Code review dashboard coming soon...</p>
      </div>
    </QueryClientProvider>
  );
}
