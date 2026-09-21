import { useState } from 'react';
import { Filter } from 'lucide-react';
import { useResource } from '@/lib/hooks';

interface AuditRow {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export function AdminAuditPage(): JSX.Element {
  const [action, setAction] = useState('');
  const { data, loading } = useResource<{ events: AuditRow[] }>(
    `/v1/admin/audit?limit=200${action ? `&action=${encodeURIComponent(action)}` : ''}`,
    [action],
  );
  const rows = data?.events ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">Every significant tenant-scoped action across the platform.</p>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 h-10 max-w-md dark:bg-dark-card dark:border-dark-border">
        <Filter size={14} className="text-ink-muted" />
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action (e.g. mailbox.created)…" className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-ink-muted" />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-surface-border bg-white dark:bg-dark-card dark:border-dark-border">
        {loading && rows.length === 0 && <div className="p-6 text-[13px] text-ink-muted">Loading…</div>}
        {!loading && rows.length === 0 && <div className="p-8 text-center text-[13px] text-ink-muted">No events match.</div>}
        {rows.length > 0 && (
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-hover text-[11px] uppercase tracking-wider text-ink-muted dark:bg-dark-hover">
              <tr className="text-left">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-divider dark:divide-dark-divider">
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-ink-muted whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono">{e.action}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-ink-muted">
                    {e.targetType ? `${e.targetType}:${e.targetId?.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">{e.tenantId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">{e.actorUserId ? e.actorUserId.slice(0, 8) + '…' : '—'}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">{e.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
