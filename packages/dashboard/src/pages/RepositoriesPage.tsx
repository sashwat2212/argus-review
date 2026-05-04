import { useQuery } from '@tanstack/react-query';
import { SkeletonRow } from '../components/Skeleton';

const BASE = import.meta.env.VITE_API_URL ?? '';

interface Repo {
  id: string;
  full_name: string;
  default_branch: string;
  is_active: boolean;
  created_at: string;
}

async function fetchRepos(): Promise<Repo[]> {
  const key = localStorage.getItem('argus_api_key') ?? '';
  const res = await fetch(`${BASE}/api/v1/repositories`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error('Failed to fetch repositories');
  return res.json();
}

export function RepositoriesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['repositories'], queryFn: fetchRepos });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Repositories</h1>
        <p className="text-sm text-gray-400 mt-0.5">All monitored repositories</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-800 rounded-xl text-red-400 text-sm mb-4">
          Failed to load repositories.
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">📁</div>
          <h2 className="text-lg font-semibold text-white mb-2">No repositories yet</h2>
          <p className="text-sm text-gray-400 mb-4">Repositories are registered automatically when GitHub sends a webhook event.</p>
          <a href="/docs/self-hosting.md" className="text-blue-400 text-sm hover:underline">View webhook setup guide →</a>
        </div>
      )}

      {(isLoading || (data?.length ?? 0) > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Repository</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Default Branch</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={4} className="px-4 py-1">
                        <SkeletonRow />
                      </td>
                    </tr>
                  ))
                : data!.map(repo => (
                    <tr key={repo.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{repo.full_name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{repo.default_branch}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${repo.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                          {repo.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(repo.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
