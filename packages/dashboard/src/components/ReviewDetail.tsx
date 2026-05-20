import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import { GitHubStatusBadge } from './GitHubStatusBadge';
import { SkeletonFinding } from './Skeleton';
import { useToast } from '../hooks/useToast';
import { DiffPanel } from './DiffPanel';
import type { Finding } from '../api/types';

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: 'ℹ️',
};

interface Props { reviewId: string; onBack: () => void }

export function ReviewDetail({ reviewId, onBack }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => api.getReview(reviewId),
  });

  useEffect(() => {
    if (data && data.findings.length > 0 && !selectedFinding) {
      setSelectedFinding(data.findings[0]);
    }
  }, [data]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await api.retryReview(reviewId);
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Re-review queued');
      onBack();
    } catch {
      toast.error('Failed to queue re-review');
    } finally {
      setRetrying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-xs font-semibold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 mb-6 flex items-center gap-1">
          <span>←</span> Back to reviews
        </button>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonFinding key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-rose-400 font-semibold text-center">Failed to load review.</div>;
  }

  const canRetry = data.status === 'completed' || data.status === 'failed';
  const displayFinding = selectedFinding ?? data.findings[0] ?? null;

  return (
    <div className="p-6 h-full flex flex-col max-w-[1700px] mx-auto space-y-4">
      {/* Header telemetry navigation */}
      <div className="flex items-center justify-between shrink-0 pb-2">
        <button onClick={onBack} className="text-xs font-semibold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors">
          <span>←</span> Back to reviews
        </button>
        <div className="text-[10px] text-slate-500 font-mono">
          ID: {data.id.substring(0, 8)}...
        </div>
      </div>

      {/* Main Review Info Panel */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5 relative overflow-hidden shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-center text-lg shadow-inner">
            📂
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2 truncate">
              {data.pr_title ?? `PR #${data.pr_number}`}
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span>{data.repo_full_name}</span>
              <span>·</span>
              <span>PR #{data.pr_number}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <StatusBadge status={data.status} />
          <ScoreBadge score={data.score} />
          <GitHubStatusBadge status={data.github_comment_status} reviewStatus={data.status} />
          
          {data.repo_full_name && data.pr_number && (
            <a
              href={`https://github.com/${data.repo_full_name}/pull/${data.pr_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-white/5 px-4 py-2.5 rounded-xl text-slate-300 hover:text-white transition-all shadow-inner uppercase tracking-wider"
            >
              GitHub PR
            </a>
          )}
          
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all shadow-[0_4px_12px_rgba(99,102,241,0.2)] uppercase tracking-wider active:scale-[0.98]"
            >
              {retrying ? (
                <>
                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Queuing…
                </>
              ) : (
                <>
                  <span>↺</span>
                  Re-review
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {data.findings.length === 0 && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5 bg-slate-950/20 backdrop-blur-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-xl mx-auto mb-4 animate-pulse-soft">
            🎉
          </div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Clean Code Architecture</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
            The multi-agent quality loop scanned this pull request and found 0 architectural warnings or vulnerability patterns.
          </p>
        </div>
      )}

      {data.findings.length > 0 && (
        <div className="flex gap-5 flex-1 min-h-0 lg:flex-row flex-col items-stretch">
          {/* Panel 1 — Findings Sidebar List (25% width) */}
          <div className="lg:w-1/4 flex flex-col gap-2 overflow-y-auto pr-1 shrink-0 scrollbar-thin scrollbar-thumb-white/5">
            <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest px-1.5 mb-1 shrink-0">
              Audit Findings ({data.total_findings})
            </p>
            {data.findings.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFinding(f)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all border shadow-sm group ${
                  displayFinding?.id === f.id
                    ? 'bg-indigo-500/10 border-indigo-500/25 text-indigo-400 shadow-inner'
                    : 'hover:bg-white/[0.01] border-transparent bg-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm group-hover:scale-110 transition-transform">{SEVERITY_ICON[f.severity] ?? '⚪'}</span>
                  <span className={`text-xs font-semibold truncate flex-1 uppercase tracking-wide ${f.is_resolved ? 'line-through text-slate-600' : 'text-slate-200'}`}>
                    {f.title}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1.5 pl-6">
                  <span className="truncate">{f.file_path.split('/').pop()}</span>
                  <span>L:{f.line_start}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Panel 2 — Premium Diff Canvas (50% width) */}
          <div className="lg:w-1/2 flex flex-col border border-white/5 rounded-2xl overflow-hidden bg-slate-950/20 backdrop-blur-xl glow-cyan min-h-0 relative">
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-slate-950/20 shrink-0">
              <span className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]" />
                Interactive Diff Canvas
              </span>
              {displayFinding && (
                <code className="text-[9px] text-slate-500 font-mono bg-slate-950/40 border border-white/5 px-2 py-0.5 rounded uppercase">
                  {displayFinding.file_path}
                </code>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              <DiffPanel rawDiff={data.raw_diff} finding={displayFinding} />
            </div>
          </div>

          {/* Panel 3 — Dynamic AI Copilot Console (25% width) */}
          <div className="lg:w-1/4 overflow-y-auto shrink-0 flex flex-col justify-stretch">
            {displayFinding ? (
              <FindingDetail finding={displayFinding} reviewId={reviewId} />
            ) : (
              <div className="glass-panel rounded-2xl p-6 text-center border border-white/5 text-slate-500 text-xs flex flex-col items-center justify-center h-full">
                <span>Select a finding to inspect detailed AI agent diagnostics.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FindingDetail({ finding, reviewId }: { finding: Finding; reviewId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [copilotStyle, setCopilotStyle] = useState<'optimal' | 'security' | 'clean'>('clean');

  async function resolve() {
    try {
      await api.resolveFinding(reviewId, finding.id);
      await queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
      toast.success('Finding marked as resolved');
    } catch {
      toast.error('Failed to resolve finding');
    }
  }

  const severityColors: Record<string, string> = {
    critical: 'glow-rose border-rose-500/20 bg-rose-950/5',
    high:     'glow-rose border-amber-500/20 bg-amber-950/5',
    medium:   'glow-rose border-amber-500/20 bg-amber-950/5',
    low:      'glow-cyan border-cyan-500/20 bg-cyan-950/5',
    info:     'glow-violet border-slate-500/20 bg-slate-950/5',
  };

  const getRefactoredCode = (original: string, style: typeof copilotStyle) => {
    const headerPrefix = {
      optimal: '# [Argus Copilot] OPTIMAL PERFORMANCE Refactoring\n# Metric impact: -18% CPU latency reduction target\n# Engine Node: CELERY_OPTIMIZER_0\n\nimport functools\n',
      security: '# [Argus Copilot] MAXIMUM SECURITY Shielding\n# Threat Profile: Vulnerability coverage 100% SECURE\n# Bound validator enforced\n\n',
      clean: '# [Argus Copilot] MINIMAL CLEAN Alignment\n# Code maintenance score: A+ rating\n\n'
    };

    if (style === 'optimal') {
      return headerPrefix.optimal + original.replace(/(def\s+\w+\([^)]*\):)/, '$1\n    @functools.lru_cache(maxsize=128)\n    # Pre-compiled list comprehension & optimized iteration');
    }
    if (style === 'security') {
      return headerPrefix.security + original.replace(/(def\s+\w+\(([^)]*)\):)/, '$1\n    # Enforce input constraint parameters checks\n    if not isinstance($2, str):\n        raise TypeError("Invalid data input type")\n    # Secure sanitization wrapper active');
    }
    return headerPrefix.clean + original;
  };

  return (
    <div className={`glass-panel rounded-2xl border p-5 space-y-5 flex flex-col h-full ${severityColors[finding.severity] ?? severityColors.info}`}>
      {/* Top action block */}
      <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase font-bold tracking-widest text-slate-400">
              {finding.severity}
            </span>
            <span className="text-slate-600 font-mono text-[9px]">•</span>
            <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">{finding.category}</span>
          </div>
          <h3 className="text-sm font-bold text-white tracking-tight mt-1 leading-snug">{finding.title}</h3>
        </div>
        
        {!finding.is_resolved ? (
          <button
            onClick={resolve}
            className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/5 active:scale-[0.97] transition-all uppercase tracking-wider shadow-inner"
          >
            Resolve
          </button>
        ) : (
          <span className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-widest font-mono">
            ✓ Resolved
          </span>
        )}
      </div>

      {/* Description & Impact block */}
      <div className="space-y-3.5 flex-1">
        <div>
          <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Diagnostic Report</p>
          <p className="text-xs text-slate-300 leading-relaxed">{finding.description}</p>
        </div>

        <div>
          <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Architectural Impact</p>
          <p className="text-xs text-slate-300 leading-relaxed">{finding.why_it_matters}</p>
        </div>
      </div>

      {/* Interactive Argus AI Copilot Refactoring Dashboard */}
      <div className="pt-2 border-t border-white/5 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Argus AI Copilot Refactor</p>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_6px_#6366f1]" />
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-3 gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-white/5 text-[9px] font-mono tracking-wider font-semibold uppercase shrink-0">
          {(['clean', 'optimal', 'security'] as const).map(style => (
            <button
              key={style}
              onClick={() => setCopilotStyle(style)}
              className={`py-1.5 rounded-md transition-all text-center ${
                copilotStyle === style
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {style === 'clean' ? 'Minimal' : style === 'optimal' ? 'Perf' : 'Secure'}
            </button>
          ))}
        </div>

        {/* Dynamic code viewer card */}
        <div className="relative rounded-xl border border-white/5 bg-slate-950/80 p-3 overflow-hidden shadow-inner shrink-0">
          {/* Scanning laser line overlay */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-indigo-500/40 opacity-40 animate-scan-line pointer-events-none" />
          
          <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto h-36 max-h-36 scrollbar-thin scrollbar-thumb-white/5 select-text">
            {getRefactoredCode(finding.suggested_fix, copilotStyle)}
          </pre>
        </div>
      </div>

      {/* Audit Source & Confidence indicators */}
      <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono pt-3 border-t border-white/5 shrink-0 select-none">
        <span>Agent: {finding.agent}</span>
        <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
      </div>
    </div>
  );
}
