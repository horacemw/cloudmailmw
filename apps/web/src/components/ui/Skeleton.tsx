import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        'rounded shimmer animate-shimmer bg-surface-border/60 dark:bg-dark-border/60',
        className,
      )}
    />
  );
}

export function MessageRowSkeleton(): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-divider dark:border-dark-divider">
      <Skeleton className="h-[15px] w-[15px] rounded-[5px]" />
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-12 ml-auto" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}
