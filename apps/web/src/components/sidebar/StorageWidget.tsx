import { HardDrive } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';

const STORAGE_USED_GB = 6.8;
const STORAGE_TOTAL_GB = 10;

export function StorageWidget(): JSX.Element {
  const pct = Math.round((STORAGE_USED_GB / STORAGE_TOTAL_GB) * 100);
  const openStorage = useUIStore((s) => s.setStorageOpen);
  const highUsage = pct >= 80;

  return (
    <div className="rounded-xl border border-surface-border dark:border-dark-border p-3 bg-surface-bg/60 dark:bg-dark-bg/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink dark:text-dark-text">
          <HardDrive size={13} className="text-ink-muted dark:text-dark-muted" />
          Storage
        </div>
        <span
          className={cn(
            'text-[11px] font-semibold tabular-nums',
            highUsage ? 'text-state-warning' : 'text-ink-muted dark:text-dark-muted',
          )}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-border dark:bg-dark-border overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            highUsage ? 'bg-state-warning' : 'bg-brand',
          )}
          style={{ width: `${pct}%` }}
          aria-label={`Storage ${pct} percent used`}
        />
      </div>
      <p className="text-[11.5px] text-ink-muted dark:text-dark-muted mt-2">
        {STORAGE_USED_GB} GB of {STORAGE_TOTAL_GB} GB used
      </p>
      <button
        onClick={() => openStorage(true)}
        className={cn(
          'mt-2.5 flex items-center justify-center w-full h-8 rounded-lg',
          'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50 text-[12.5px] font-semibold transition-colors',
          'dark:bg-dark-card dark:text-brand-300 dark:border-brand-900/60 dark:hover:bg-dark-hover',
        )}
      >
        Upgrade Storage
      </button>
    </div>
  );
}
