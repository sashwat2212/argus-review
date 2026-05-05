import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';

interface Props { children: React.ReactNode; onLogout: () => void }

export function AppShell({ children, onLogout }: Props) {
  const { data: overview } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: analyticsApi.overview,
    refetchInterval: 30_000,
  });

  const NAV = [
    { to: '/',             icon: '📊', label: 'Dashboard',    count: null as number | null },
    { to: '/reviews',      icon: '🔍', label: 'Reviews',      count: overview?.total_reviews ?? null },
    { to: '/repositories', icon: '📁', label: 'Repos',        count: null as number | null },
  ];

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <div>
              <p className="text-sm font-bold text-white">Argus</p>
              <p className="text-xs text-gray-500">Code Review Engine</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon, label, count }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <span>{icon}</span>
              <span className="flex-1">{label}</span>
              {count !== null && (
                <span className="bg-gray-700 text-gray-300 text-xs rounded-full px-2 py-0.5">
                  {count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 w-full transition-colors"
          >
            <span>🚪</span>
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
