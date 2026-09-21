import { useState } from 'react';
import { Building2, Search } from 'lucide-react';
import { useResource } from '@/lib/hooks';
import { api } from '@/lib/apiClient';
import { humanFileSize } from '@/lib/utils';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  createdAt: string;
  domainCount: number;
  mailboxCount: number;
  memberCount: number;
  storageQuotaBytes: string;
}

export function AdminTenantsPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const { data, loading, refetch } = useResource<{ tenants: TenantRow[] }>(
    `/v1/admin/tenants${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    [search],
  );
  const rows = data?.tenants ?? [];

  const suspend = async (t: TenantRow): Promise<void> => {
    if (!window.confirm(`Suspend "${t.name}"? Members will lose access immediately.`)) return;
    await api(`/v1/admin/tenants/${t.id}/suspend`, { method: 'POST', body: '{}' });
    await refetch();
  };
  const restore = async (t: TenantRow): Promise<void> => {
    await api(`/v1/admin/tenants/${t.id}/restore`, { method: 'POST', body: '{}' });
    await refetch();
  };

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Tenants</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">Every customer organisation on this Cloud Mail platform.</p>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 h-10 max-w-md dark:bg-dark-card dark:border-dark-border">
        <Search size={14} className="text-ink-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or slug…" className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-ink-muted" />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-surface-border bg-white dark:bg-dark-card dark:border-dark-border">
        {loading && rows.length === 0 && <div className="p-6 text-[13px] text-ink-muted">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="p-8 text-center text-[13px] text-ink-muted">
            <Building2 size={22} className="mx-auto mb-2 opacity-50" />
            No tenants yet.
          </div>
        )}
        {rows.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="bg-surface-hover text-[11px] uppercase tracking-wider text-ink-muted dark:bg-dark-hover">
              <tr className="text-left">
                <th className="px-4 py-2">Name / slug</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Domains</th>
                <th className="px-3 py-2">Mailboxes</th>
                <th className="px-3 py-2">Storage quota</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-divider dark:divide-dark-divider">
              {rows.map((t) => (
                <tr key={t.id} className="align-middle">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-ink dark:text-dark-text">{t.name}</div>
                    <div className="font-mono text-[11px] text-ink-muted">{t.slug}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{t.memberCount}</td>
                  <td className="px-3 py-2 tabular-nums">{t.domainCount}</td>
                  <td className="px-3 py-2 tabular-nums">{t.mailboxCount}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">{humanFileSize(Number(t.storageQuotaBytes))}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 font-semibold ${
                      t.status === 'active' ? 'bg-brand-100 text-brand-700' :
                      t.status === 'suspended' ? 'bg-state-danger-soft text-state-danger' :
                      'bg-surface-hover text-ink-muted'
                    }`}>{t.status}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-muted whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    {t.status === 'active' ? (
                      <button onClick={() => suspend(t)} className="text-[12px] text-state-danger hover:underline">Suspend</button>
                    ) : (
                      <button onClick={() => restore(t)} className="text-[12px] text-brand-700 hover:underline">Restore</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
