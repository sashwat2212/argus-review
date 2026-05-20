interface Props {
  className?: string;
}

export function Skeleton({ className = '' }: Props) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-48 rounded" />
        <Skeleton className="h-2.5 w-32 rounded" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-5 w-12 rounded-full" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/5 p-6 space-y-3">
      <Skeleton className="h-3 w-24 rounded" />
      <Skeleton className="h-9 w-20 rounded" />
      <Skeleton className="h-3 w-32 rounded" />
    </div>
  );
}

export function SkeletonFinding() {
  return (
    <div className="rounded-xl border border-white/5 p-4 space-y-2.5">
      <Skeleton className="h-3 w-16 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-3 w-2/3 rounded" />
    </div>
  );
}

export function SkeletonHealthCard() {
  return (
    <div className="rounded-2xl border border-white/5 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3.5 w-32 rounded" />
          <Skeleton className="h-2.5 w-20 rounded" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
      </div>
    </div>
  );
}
