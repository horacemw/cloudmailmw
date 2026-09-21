import { Server } from 'lucide-react';
import { useResource } from '@/lib/hooks';

interface QueueResp {
  available: boolean;
  summary?: string;
  entries?: number;
  raw?: string;
  error?: string;
}

export function AdminQueuePage(): JSX.Element {
  const { data, loading, refetch } = useResource<QueueResp>('/v1/admin/queue');

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Mail queue</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">Live output from Postfix's `mailq` on the mail server.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border"
        >
          Refresh
        </button>
      </div>
      {loading && !data && <p className="mt-6 text-[13px] text-ink-muted">Loading…</p>}
      {data && !data.available && (
        <div className="mt-6 rounded-lg border border-state-warning/30 bg-state-warning-soft px-4 py-3 text-[13px] text-state-warning">
          <Server size={14} className="inline mr-1.5" />
          Queue not available: {data.error}
        </div>
      )}
      {data?.available && (
        <>
          <div className="mt-6 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
            {data.summary || 'Queue is empty.'}
          </div>
          {data.raw && (
            <pre className="mt-4 rounded-lg border border-surface-border bg-surface-hover p-4 text-[11.5px] leading-relaxed font-mono overflow-x-auto scroll-thin whitespace-pre-wrap dark:bg-dark-hover dark:border-dark-border">
              {data.raw}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
