import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useToast } from '../hooks/useToast';
import type { Review } from '../api/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Action = {
  id: string;
  icon: string;
  label: string;
  sub?: string;
  category: string;
  onSelect: () => void;
};

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.listReviews(1, 50),
    enabled: open,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const nav = useCallback(
    (path: string) => { navigate(path); onClose(); },
    [navigate, onClose],
  );

  const staticActions: Action[] = [
    { id: 'goto-dashboard',  icon: '📊', label: 'Go to Dashboard',    category: 'Navigate', onSelect: () => nav('/') },
    { id: 'goto-reviews',    icon: '🔍', label: 'Go to Reviews',      category: 'Navigate', onSelect: () => nav('/reviews') },
    { id: 'goto-repos',      icon: '📁', label: 'Go to Repositories', category: 'Navigate', onSelect: () => nav('/repositories') },
  ];

  const reviewActions: Action[] = (data?.items ?? [])
    .filter(r =>
      !query ||
      (r.pr_title ?? '').toLowerCase().includes(query.toLowerCase()) ||
      (r.repo_full_name ?? '').toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 8)
    .flatMap((r: Review): Action[] => [
      {
        id: `review-${r.id}`,
        icon: r.status === 'completed' ? '✅' : r.status === 'failed' ? '❌' : '🔄',
        label: r.pr_title ?? `PR #${r.pr_number}`,
        sub: r.repo_full_name ?? undefined,
        category: 'Reviews',
        onSelect: () => { navigate(`/reviews?id=${r.id}`); onClose(); },
      },
      ...(r.status === 'completed' || r.status === 'failed' ? [{
        id: `rerun-${r.id}`,
        icon: '↺',
        label: `Re-run: ${r.pr_title ?? `PR #${r.pr_number}`}`,
        sub: 'Queue a new review run',
        category: 'Actions',
        onSelect: async () => {
          onClose();
          try {
            await api.retryReview(r.id);
            queryClient.invalidateQueries({ queryKey: ['reviews'] });
            toast.success('Re-review queued');
          } catch { toast.error('Failed to queue re-review'); }
        },
      }] : []),
      {
        id: `resolve-all-${r.id}`,
        icon: '☑️',
        label: `Resolve all: ${r.pr_title ?? `PR #${r.pr_number}`}`,
        sub: 'Mark every finding as resolved',
        category: 'Actions',
        onSelect: async () => {
          onClose();
          try {
            await api.resolveAll(r.id);
            queryClient.invalidateQueries({ queryKey: ['review', r.id] });
            toast.success('All findings resolved');
          } catch { toast.error('Failed to resolve findings'); }
        },
      },
      ...(r.repo_full_name && r.pr_number ? [{
        id: `gh-${r.id}`,
        icon: '↗',
        label: `Open PR on GitHub`,
        sub: `${r.repo_full_name}#${r.pr_number}`,
        category: 'Actions',
        onSelect: () => {
          window.open(`https://github.com/${r.repo_full_name}/pull/${r.pr_number}`, '_blank');
          onClose();
        },
      }] : []),
    ]);

  const allActions = query
    ? [...staticActions.filter(a => a.label.toLowerCase().includes(query.toLowerCase())), ...reviewActions]
    : [...staticActions, ...reviewActions.slice(0, 5)];

  const groups = Array.from(new Set(allActions.map(a => a.category)));

  useEffect(() => { setIdx(0); }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, allActions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); allActions[idx]?.onSelect(); }
    if (e.key === 'Escape')    { onClose(); }
  };

  if (!open) return null;

  let globalIdx = 0;

  return (
    <div
      className="cmd-backdrop fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <span className="text-slate-500 text-sm">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search reviews, navigate, or run actions..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none font-mono"
          />
          <kbd className="text-[10px] font-mono bg-slate-800 border border-white/5 px-1.5 py-0.5 rounded text-slate-400">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto py-2">
          {allActions.length === 0 && (
            <p className="text-center text-slate-500 text-xs py-8">No results for "{query}"</p>
          )}

          {groups.map(group => {
            const groupItems = allActions.filter(a => a.category === group);
            return (
              <div key={group}>
                <p className="px-4 py-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
                  {group}
                </p>
                {groupItems.map(action => {
                  const itemIdx = globalIdx++;
                  const isActive = itemIdx === idx;
                  return (
                    <button
                      key={action.id}
                      onMouseEnter={() => setIdx(itemIdx)}
                      onClick={action.onSelect}
                      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        isActive ? 'bg-indigo-500/10 text-white' : 'text-slate-300 hover:bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-base w-5 text-center shrink-0">{action.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{action.label}</p>
                        {action.sub && (
                          <p className="text-[11px] text-slate-500 font-mono truncate">{action.sub}</p>
                        )}
                      </div>
                      {isActive && (
                        <kbd className="text-[9px] font-mono bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded text-indigo-400 shrink-0">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="border-t border-white/5 px-4 py-2 flex items-center gap-4 text-[10px] text-slate-500 font-mono">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
          <span className="ml-auto">{allActions.length} results</span>
        </div>
      </div>
    </div>
  );
}
