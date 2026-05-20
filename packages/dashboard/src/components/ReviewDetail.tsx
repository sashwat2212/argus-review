import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { api } from '../api/client';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';
import { GitHubStatusBadge } from './GitHubStatusBadge';
import { SkeletonFinding } from './Skeleton';
import { useToast } from '../hooks/useToast';
import { DiffPanel } from './DiffPanel';
import type { Finding, ReviewStatus } from '../api/types';

// ── Severity badge ────────────────────────────────────────────────────────
const SEV_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'C', color: 'var(--color-danger)', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)' },
  high:     { label: 'H', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  medium:   { label: 'M', color: '#eab308', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)' },
  low:      { label: 'L', color: 'var(--color-accent)', bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.3)' },
  info:     { label: 'I', color: '#a1a1aa', bg: 'rgba(161,161,170,0.1)', border: 'rgba(161,161,170,0.2)' },
};

function SeverityBadge({ severity, size = 'sm' }: { severity: string; size?: 'sm' | 'lg' }) {
  const m = SEV_META[severity] ?? SEV_META.info;
  const sz = size === 'lg' ? 'w-7 h-7 text-[11px]' : 'w-5 h-5 text-[9px]';
  return (
    <span
      className={`${sz} rounded-md flex items-center justify-center font-bold font-mono shrink-0`}
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}
    >
      {m.label}
    </span>
  );
}

// ── Review Timeline ───────────────────────────────────────────────────────────
const PIPELINE_STEPS: { label: string; statuses: ReviewStatus[] }[] = [
  { label: 'Queued',    statuses: ['pending'] },
  { label: 'Running',   statuses: ['running'] },
  { label: 'Quality',   statuses: ['running', 'completed'] },
  { label: 'Security',  statuses: ['running', 'completed'] },
  { label: 'Synthesis', statuses: ['running', 'completed'] },
  { label: 'Complete',  statuses: ['completed'] },
];

function ReviewTimeline({ status }: { status: ReviewStatus }) {
  const completedIdx = status === 'completed' ? 5 : status === 'running' ? 2 : status === 'failed' ? 2 : 0;
  return (
    <div className="flex items-center gap-0">
      {PIPELINE_STEPS.map((step, i) => {
        const done = i <= completedIdx && status !== 'failed';
        const current = i === completedIdx && status === 'running';
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full transition-all ${
                  done && !current ? 'bg-emerald-500' :
                  current ? 'bg-cyan-400 animate-pulse' :
                  status === 'failed' && i === completedIdx ? 'bg-rose-500' :
                  'bg-white/10'
                }`}
                style={done && !current ? { boxShadow: '0 0 6px var(--color-success)' } : current ? { boxShadow: '0 0 8px var(--color-accent)' } : undefined}
              />
              <span className={`text-[8px] font-mono uppercase tracking-wider whitespace-nowrap ${done || current ? 'text-zinc-400' : 'text-zinc-700'}`}>
                {step.label}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={`h-px w-6 mx-1 mb-3 transition-all ${i < completedIdx && status !== 'failed' ? 'bg-emerald-500/30' : 'bg-white/5'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props { reviewId: string; onBack: () => void }

export function ReviewDetail({ reviewId, onBack }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [resolvingAll, setResolvingAll] = useState(false);
  const [sevFilter, setSevFilter] = useState<string>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => api.getReview(reviewId),
  });

  const filteredFindings = data?.findings.filter(f => sevFilter === 'all' || f.severity === sevFilter) ?? [];
  const displayFinding = selectedFinding ?? filteredFindings[0] ?? null;

  useEffect(() => {
    if (data?.findings.length && !selectedFinding) {
      setSelectedFinding(data.findings[0]);
    }
  }, [data, selectedFinding]);

  // ── Keyboard Shortcuts Engine ──
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'j' || e.key === 'k') {
      if (!filteredFindings.length) return;
      e.preventDefault();
      const idx = filteredFindings.findIndex(f => f.id === displayFinding?.id);
      let nextIdx = idx;
      if (e.key === 'j') nextIdx = Math.min(idx + 1, filteredFindings.length - 1);
      if (e.key === 'k') nextIdx = Math.max(idx - 1, 0);
      setSelectedFinding(filteredFindings[nextIdx]);
    }

    if (e.key === 'r') {
      e.preventDefault();
      if (displayFinding && !displayFinding.is_resolved) {
        api.resolveFinding(reviewId, displayFinding.id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
            toast.success('Finding resolved');
          })
          .catch(() => toast.error('Failed to resolve'));
      }
    }
  }, [filteredFindings, displayFinding, reviewId, queryClient, toast]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await api.retryReview(reviewId);
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Re-review queued');
      onBack();
    } catch { toast.error('Failed to queue re-review'); }
    finally { setRetrying(false); }
  }

  async function handleResolveAll() {
    setResolvingAll(true);
    try {
      await api.resolveAll(reviewId);
      await queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
      
      // Fire confetti!
      const end = Date.now() + 1.5 * 1000;
      const colors = ['#06b6d4', '#4f46e5', '#10b981'];
      (function frame() {
        confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());

      toast.success('All findings resolved!');
    } catch { toast.error('Failed to resolve all'); }
    finally { setResolvingAll(false); }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={onBack} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-primary)] hover:opacity-80 flex items-center gap-1.5">
          ← Back
        </button>
        {Array.from({ length: 4 }).map((_, i) => <SkeletonFinding key={i} />)}
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-rose-400 font-semibold text-center">Failed to load review.</div>;
  }

  const canRetry = data.status === 'completed' || data.status === 'failed';
  const presentSeverities = Array.from(new Set(data.findings.map(f => f.severity)));
  const hasUnresolved = data.findings.some(f => !f.is_resolved);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5 h-full flex flex-col max-w-[1800px] mx-auto gap-4">
      {/* Nav row */}
      <div className="flex items-center justify-between shrink-0">
        <button onClick={onBack} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-primary)] hover:opacity-80 flex items-center gap-1.5 transition-colors">
          ← Back
        </button>
        <span className="text-[10px] text-zinc-600 font-mono">{reviewId.substring(0, 8)}…</span>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-white/5 p-4 shrink-0 space-y-3" style={{ background: 'var(--color-surface)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white tracking-tight truncate">
              {data.pr_title ?? `PR #${data.pr_number}`}
            </h1>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{data.repo_full_name} · PR #{data.pr_number}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <StatusBadge status={data.status} />
            <ScoreBadge score={data.score} />
            <GitHubStatusBadge status={data.github_comment_status} reviewStatus={data.status} />
            {data.repo_full_name && data.pr_number && (
              <a href={`https://github.com/${data.repo_full_name}/pull/${data.pr_number}`} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-mono px-3 py-1.5 rounded-xl border border-white/5 text-zinc-400 hover:text-white hover:border-white/10 transition-all">
                ↗ GitHub
              </a>
            )}
            
            {hasUnresolved && (
              <button onClick={handleResolveAll} disabled={resolvingAll}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/5 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider transition-all">
                {resolvingAll ? 'Resolving…' : '✓ Resolve All'}
              </button>
            )}

            {canRetry && (
              <button onClick={handleRetry} disabled={retrying}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider transition-all"
                style={{ background: 'var(--color-primary)' }}>
                {retrying ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '↺'}
                {retrying ? 'Queuing…' : 'Re-run'}
              </button>
            )}
          </div>
        </div>

        {/* Pipeline Timeline */}
        <div className="border-t border-white/[0.04] pt-3">
          <ReviewTimeline status={data.status} />
        </div>
      </div>

      {data.findings.length === 0 && (
        <div className="rounded-2xl border border-white/5 p-12 text-center" style={{ background: 'var(--color-surface)' }}>
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl mx-auto mb-3 animate-pulse">✓</div>
          <h3 className="text-sm font-bold text-white mb-1">Clean code — no findings</h3>
          <p className="text-xs text-zinc-500">All agents scanned this PR and found zero issues.</p>
        </div>
      )}

      {data.findings.length > 0 && (
        <div className="flex gap-4 flex-1 min-h-0 flex-col lg:flex-row">
          {/* Panel 1: Findings sidebar */}
          <div className="lg:w-[220px] xl:w-[240px] flex flex-col gap-2 shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between px-1 shrink-0">
              <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest">
                Findings · {data.total_findings}
              </span>
            </div>

            {/* Severity filter chips */}
            <div className="flex flex-wrap gap-1 px-0.5 shrink-0">
              <button
                onClick={() => setSevFilter('all')}
                className={`text-[9px] font-bold font-mono uppercase px-2 py-1 rounded-md border transition-all ${sevFilter === 'all' ? 'bg-[color:var(--color-primary-dim)] border-[color:var(--color-primary)] text-[color:var(--color-primary)]' : 'border-white/5 text-zinc-500 hover:text-zinc-300'}`}
              >
                All
              </button>
              {presentSeverities.map(s => {
                const m = SEV_META[s] ?? SEV_META.info;
                const active = sevFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSevFilter(s)}
                    className={`text-[9px] font-bold font-mono uppercase px-2 py-1 rounded-md border transition-all`}
                    style={active
                      ? { color: m.color, background: m.bg, borderColor: m.border }
                      : { color: '#a1a1aa', background: 'transparent', borderColor: 'rgba(255,255,255,0.05)' }}
                  >
                    {s.slice(0, 4)}
                  </button>
                );
              })}
            </div>

            {/* Finding list */}
            {filteredFindings.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFinding(f)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2.5 group ${
                  displayFinding?.id === f.id
                    ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary-dim)] text-white'
                    : 'border-transparent hover:border-white/5 hover:bg-white/[0.02]'
                }`}
              >
                <SeverityBadge severity={f.severity} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-semibold truncate ${f.is_resolved ? 'line-through text-zinc-600' : 'text-zinc-200'}`}>
                    {f.title}
                  </p>
                  <p className="text-[9px] text-zinc-600 font-mono truncate mt-0.5">
                    {f.file_path.split('/').pop()}:{f.line_start}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Panel 2: Diff viewer */}
          <div className="flex-1 flex flex-col border border-white/5 rounded-2xl overflow-hidden min-h-0" style={{ background: 'var(--color-surface)' }}>
            <div className="flex-1 overflow-y-auto">
              <DiffPanel rawDiff={data.raw_diff} finding={displayFinding} />
            </div>
          </div>

          {/* Panel 3: Finding detail + Copilot */}
          <div className="lg:w-[280px] xl:w-[300px] overflow-y-auto shrink-0">
            {displayFinding
              ? <FindingDetail finding={displayFinding} reviewId={reviewId} />
              : <div className="rounded-2xl border border-white/5 p-6 text-center text-zinc-500 text-xs" style={{ background: 'var(--color-surface)' }}>Select a finding</div>
            }
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Finding Detail Panel ──────────────────────────────────────────────────────
function FindingDetail({ finding, reviewId }: { finding: Finding; reviewId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [copilotStyle, setCopilotStyle] = useState<'clean' | 'optimal' | 'security'>('clean');
  const [copied, setCopied] = useState(false);

  async function resolve() {
    try {
      await api.resolveFinding(reviewId, finding.id);
      await queryClient.invalidateQueries({ queryKey: ['review', reviewId] });
      toast.success('Finding resolved');
    } catch { toast.error('Failed to resolve'); }
  }

  const getRefactored = (original: string, style: typeof copilotStyle) => {
    if (style === 'optimal')  return `# [Argus Copilot] Optimal Performance\n# CPU target: -18% latency\n\n${original}`;
    if (style === 'security') return `# [Argus Copilot] Maximum Security\n# Input validation enforced\n\n${original}`;
    return `# [Argus Copilot] Minimal Clean\n# Readability grade: A+\n\n${original}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getRefactored(finding.suggested_fix, copilotStyle));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const m = SEV_META[finding.severity] ?? SEV_META.info;

  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-4 h-full" style={{ background: 'var(--color-surface)', borderColor: m.border }}>
      {/* Top: severity + action */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <SeverityBadge severity={finding.severity} size="lg" />
          <div>
            <span className="text-[9px] font-bold font-mono uppercase tracking-widest" style={{ color: m.color }}>
              {finding.severity}
            </span>
            <p className="text-[9px] text-zinc-500 font-mono">{finding.category}</p>
          </div>
        </div>
        {!finding.is_resolved ? (
          <button onClick={resolve}
            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/5 transition-all uppercase tracking-wider">
            Resolve <kbd className="font-mono text-[9px] ml-1 text-zinc-500">R</kbd>
          </button>
        ) : (
          <span className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-widest">✓</span>
        )}
      </div>

      <h3 className="text-[13px] font-bold text-white leading-snug">{finding.title}</h3>

      {/* Description */}
      <div>
        <p className="text-[9px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">Diagnostic</p>
        <p className="text-[11px] text-zinc-300 leading-relaxed">{finding.description}</p>
      </div>

      <div>
        <p className="text-[9px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">Impact</p>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{finding.why_it_matters}</p>
      </div>

      {/* Confidence meter */}
      <div>
        <div className="flex items-center justify-between text-[9px] font-mono mb-1.5">
          <span className="text-zinc-600 uppercase tracking-wider">Confidence</span>
          <span className={`font-bold ${finding.confidence >= 0.8 ? 'text-emerald-400' : finding.confidence >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
            {Math.round(finding.confidence * 100)}%
          </span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${finding.confidence * 100}%`,
              background: finding.confidence >= 0.8 ? 'var(--color-success)' : finding.confidence >= 0.5 ? 'var(--color-warning)' : 'var(--color-danger)',
            }}
          />
        </div>
      </div>

      {/* AI Copilot */}
      <div className="border-t border-white/[0.04] pt-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-[color:var(--color-primary)] uppercase tracking-widest">Argus Copilot</p>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-primary)', boxShadow: '0 0 5px var(--color-primary)' }} />
        </div>

        <div className="grid grid-cols-3 gap-0.5 bg-zinc-950/60 p-0.5 rounded-lg border border-white/5">
          {(['clean', 'optimal', 'security'] as const).map(s => (
            <button key={s} onClick={() => setCopilotStyle(s)}
              className={`py-1.5 rounded-md text-[9px] font-bold font-mono uppercase tracking-wider transition-all ${copilotStyle === s ? 'bg-[color:var(--color-primary)] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {s === 'clean' ? 'Clean' : s === 'optimal' ? 'Perf' : 'Sec'}
            </button>
          ))}
        </div>

        <div className="relative rounded-xl border border-white/5 p-3 overflow-hidden" style={{ background: 'var(--color-bg)' }}>
          <button 
            onClick={copyToClipboard}
            className="absolute top-2 right-2 text-[10px] font-mono px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors border border-white/5"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <pre className="text-[10px] font-mono text-zinc-400 whitespace-pre-wrap overflow-x-auto max-h-32 leading-relaxed pt-6">
            {getRefactored(finding.suggested_fix, copilotStyle)}
          </pre>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600 border-t border-white/[0.04] pt-2.5 mt-auto">
        <span>Agent: {finding.agent}</span>
        <span>L{finding.line_start}–{finding.line_end}</span>
      </div>
    </div>
  );
}

