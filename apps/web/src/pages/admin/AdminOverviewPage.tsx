import { AlertTriangle, Building2, HardDrive, KeyRound, Mail, MailPlus, MonitorSmartphone, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useResource } from '@/lib/hooks';
import { humanFileSize } from '@/lib/utils';

interface Overview {
  counts: {
    tenants: number;
    activeTenants: number;
    suspendedTenants: number;
    users: number;
    domains: number;
    verifiedDomains: number;
    mailboxes: number;
    activeMailboxes: number;
    aliases: number;
    activeMigrations: number;
    activeExports: number;
    activeSessions: number;
    failedLoginsLast24h: number;
    storageUsedBytes: string;
  };
  recentAudit: Array<{
    id: string;
    tenantId: string;
    actorUserId: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
}

export function AdminOverviewPage(): JSX.Element {
  const { data, loading, error } = useResource<Overview>('/v1/admin/overview');

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Platform overview</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">Live counters straight from the database — no fake numbers.</p>

      {loading && !data && <p className="mt-6 text-[13px] text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-[13px] text-state-danger">{error}</p>}

      {data && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Building2 size={16} />} label="Tenants" value={data.counts.tenants} sub={`${data.counts.activeTenants} active · ${data.counts.suspendedTenants} suspended`} />
            <Stat icon={<Users size={16} />} label="Users" value={data.counts.users} />
            <Stat icon={<MailPlus size={16} />} label="Domains" value={data.counts.domains} sub={`${data.counts.verifiedDomains} verified`} />
            <Stat icon={<Mail size={16} />} label="Mailboxes" value={data.counts.mailboxes} sub={`${data.counts.activeMailboxes} active`} />
            <Stat icon={<MonitorSmartphone size={16} />} label="Aliases" value={data.counts.aliases} />
            <Stat icon={<HardDrive size={16} />} label="Storage used" value={humanFileSize(Number(data.counts.storageUsedBytes))} />
            <Stat icon={<KeyRound size={16} />} label="Active sessions" value={data.counts.activeSessions} />
            <Stat
              icon={data.counts.failedLoginsLast24h > 0 ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
              label="Failed logins (24h)"
              value={data.counts.failedLoginsLast24h}
              tone={data.counts.failedLoginsLast24h > 0 ? 'warning' : 'ok'}
            />
            <Stat icon={<ScrollText size={16} />} label="Active migrations" value={data.counts.activeMigrations} />
            <Stat icon={<ScrollText size={16} />} label="Active exports" value={data.counts.activeExports} />
          </div>

          <div className="mt-8">
            <h2 className="text-[15px] font-semibold">Recent audit events</h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-surface-border bg-white dark:bg-dark-card dark:border-dark-border">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-hover text-[11px] uppercase tracking-wider text-ink-muted dark:bg-dark-hover dark:text-dark-muted">
                  <tr className="text-left">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Tenant</th>
                    <th className="px-3 py-2">Actor</th>
                    <th className="px-3 py-2">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-divider dark:divide-dark-divider">
                  {data.recentAudit.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="px-3 py-2 text-ink-muted whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono">{e.action}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px]">{e.tenantId.slice(0, 10)}…</td>
                      <td className="px-3 py-2 font-mono text-[11.5px]">{e.actorUserId ? e.actorUserId.slice(0, 10) + '…' : '—'}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px]">{e.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'ok' | 'warning';
}): JSX.Element {
  const iconClass = tone === 'warning' ? 'text-state-warning' : 'text-brand-700 dark:text-brand-300';
  return (
    <div className="rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-center gap-2 text-ink-muted text-[12.5px] dark:text-dark-muted">
        <span className={iconClass}>{icon}</span> {label}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-muted dark:text-dark-muted">{sub}</div>}
    </div>
  );
}
