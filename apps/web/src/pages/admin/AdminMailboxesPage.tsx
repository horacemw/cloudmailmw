import { useState } from 'react';
import { Mail, Search } from 'lucide-react';
import { useResource } from '@/lib/hooks';
import { humanFileSize } from '@/lib/utils';

interface MailboxRow {
  id: string;
  address: string;
  domain: string;
  tenant: { slug: string; name: string };
  status: string;
  quotaBytes: string;
  usedBytes: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export function AdminMailboxesPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const { data, loading } = useResource<{ mailboxes: MailboxRow[] }>(
    `/v1/admin/mailboxes${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    [search],
  );
  const rows = data?.mailboxes ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Mailboxes</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">Every mailbox across every tenant on this Cloud Mail platform.</p>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 h-10 max-w-md dark:bg-dark-card dark:border-dark-border">
        <Search size={14} className="text-ink-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by address…" className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-ink-muted" />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-surface-border bg-white dark:bg-dark-card dark:border-dark-border">
        {loading && rows.length === 0 && <div className="p-6 text-[13px] text-ink-muted">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="p-8 text-center text-[13px] text-ink-muted">
            <Mail size={22} className="mx-auto mb-2 opacity-50" />
            No mailboxes yet.
          </div>
        )}
        {rows.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="bg-surface-hover text-[11px] uppercase tracking-wider text-ink-muted dark:bg-dark-hover">
              <tr className="text-left">
                <th className="px-4 py-2">Address</th>
                <th className="px-3 py-2">Domain</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Usage</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-divider dark:divide-dark-divider">
              {rows.map((m) => {
                const quota = Number(m.quotaBytes);
                const used = Number(m.usedBytes);
                const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
                return (
                  <tr key={m.id} className="align-middle">
                    <td className="px-4 py-2 font-mono text-[12.5px]">{m.address}</td>
                    <td className="px-3 py-2 text-ink-muted">{m.domain}</td>
                    <td className="px-3 py-2 text-ink-muted">{m.tenant.name}</td>
                    <td className="px-3 py-2 min-w-[160px]">
                      <div className="h-1.5 rounded-full bg-surface-border dark:bg-dark-border overflow-hidden">
                        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-ink-muted">{humanFileSize(used)} of {humanFileSize(quota)}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 font-semibold ${
                        m.status === 'active' ? 'bg-brand-100 text-brand-700' :
                        'bg-surface-hover text-ink-muted'
                      }`}>{m.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-muted whitespace-nowrap">
                      {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : 'never'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
