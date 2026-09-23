import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { api } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

interface MailboxUsage {
  id: string;
  address: string;
  quotaBytes: string;
  usedBytes: string;
}

interface MailboxesResponse {
  mailboxes: Array<{
    id: string;
    address: string;
    quotaBytes: string;
    usedBytes: string;
    status: string;
  }>;
}

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const rounded = n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return `${rounded} ${units[i]}`;
}

/**
 * Live storage widget. Reads the caller's own mailbox usage from
 * /v1/mailboxes and displays real numbers. Hidden entirely when the user has
 * no mailbox yet (org owners/admins without a mailbox of their own) rather
 * than showing a misleading "0%" bar.
 */
export function StorageWidget(): JSX.Element | null {
  const openStorage = useUIStore((s) => s.setStorageOpen);
  const liveMode = useLiveMailStore((s) => s.mode);
  const liveMailbox = useLiveMailStore((s) => s.mailbox);
  const [usage, setUsage] = useState<MailboxUsage | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Only fetch when we actually have a live mailbox to look up — otherwise
    // we'd either 401 or return an empty list. Refetch when the mailbox id
    // changes (rare: e.g. after backfill or admin action).
    if (!liveMailbox?.id) {
      setUsage(null);
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const resp = await api<MailboxesResponse>('/v1/mailboxes');
        if (cancelled) return;
        const mine = resp.mailboxes.find((m) => m.id === liveMailbox.id) ?? resp.mailboxes[0];
        setUsage(
          mine
            ? {
                id: mine.id,
                address: mine.address,
                quotaBytes: mine.quotaBytes,
                usedBytes: mine.usedBytes,
              }
            : null,
        );
      } catch {
        // Silent — the sidebar still renders; widget just won't show numbers.
        setUsage(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveMailbox?.id]);

  // Hide the widget entirely when there's no mailbox context. Better than a
  // stub bar for admin-only users.
  if (liveMode !== 'ready' || !usage) {
    if (!loaded) return null;
    return null;
  }

  const used = Number(usage.usedBytes);
  const quota = Number(usage.quotaBytes);
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
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
        {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} used
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
