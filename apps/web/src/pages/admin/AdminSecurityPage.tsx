import { useState } from 'react';
import { AlertTriangle, ShieldCheck, ShieldAlert, User } from 'lucide-react';
import { useResource } from '@/lib/hooks';

/**
 * Platform security overview. Every value comes from real tables:
 *   - LoginAttempt (failed/successful counts, recent failures)
 *   - AuditEvent (security-relevant actions filtered by an allowlist)
 *
 * Never fabricates data. If a table is empty, empty-state text says so.
 */
interface SecurityData {
  window: { hours: number; since: string };
  counts: {
    failedLogins24h: number;
    failedLogins7d: number;
    successfulLogins24h: number;
    successfulLogins7d: number;
  };
  recentFailedLogins: Array<{
    id: string;
    email: string;
    ipAddress: string;
    reason: string | null;
    createdAt: string;
    userId: string | null;
  }>;
  recentSecurityEvents: Array<{
    id: string;
    action: string;
    tenantId: string;
    actorUserId: string | null;
    targetType: string | null;
    targetId: string | null;
    ipAddress: string | null;
    createdAt: string;
    metadata: unknown;
  }>;
}

export function AdminSecurityPage(): JSX.Element {
  const [hours, setHours] = useState<number>(24);
  const { data, loading, error, refetch } = useResource<SecurityData>(
    `/v1/admin/security?hours=${hours}&limit=200`,
    [hours],
  );

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Security</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">
            Failed logins, admin actions, MFA + platform-admin changes. Data comes straight
            from <code className="font-mono text-[12.5px]">login_attempts</code> and
            <code className="font-mono text-[12.5px]"> audit_events</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12.5px] text-ink-muted dark:text-dark-muted">Window:</label>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="h-9 rounded-lg border border-surface-border bg-white px-2 text-[13px] dark:bg-dark-card dark:border-dark-border"
          >
            <option value={1}>Last 1 hour</option>
            <option value={24}>Last 24 hours</option>
            <option value={168}>Last 7 days</option>
            <option value={720}>Last 30 days</option>
          </select>
          <button
            onClick={() => refetch()}
            className="h-9 px-3 rounded-lg text-[12.5px] border border-surface-border dark:border-dark-border hover:bg-surface-hover dark:hover:bg-dark-hover"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && <p className="mt-6 text-[13px] text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-[13px] text-state-danger">{error}</p>}

      {data && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              icon={<AlertTriangle size={16} />}
              tone={data.counts.failedLogins24h > 0 ? 'warning' : 'ok'}
              label="Failed logins — 24h"
              value={data.counts.failedLogins24h}
            />
            <Tile
              icon={<AlertTriangle size={16} />}
              label="Failed logins — 7d"
              value={data.counts.failedLogins7d}
            />
            <Tile
              icon={<ShieldCheck size={16} />}
              label="Successful logins — 24h"
              value={data.counts.successfulLogins24h}
            />
            <Tile
              icon={<ShieldCheck size={16} />}
              label="Successful logins — 7d"
              value={data.counts.successfulLogins7d}
            />
          </div>

          <section className="mt-8">
            <h2 className="text-[15px] font-semibold">Recent failed logins</h2>
            {data.recentFailedLogins.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-muted dark:text-dark-muted">
                No failed login attempts in this window.
              </p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border border-surface-border bg-white dark:bg-dark-card dark:border-dark-border">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-surface-hover text-[11px] uppercase tracking-wider text-ink-muted dark:bg-dark-hover dark:text-dark-muted">
                    <tr className="text-left">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">IP</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-divider dark:divide-dark-divider">
                    {data.recentFailedLogins.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 whitespace-nowrap text-ink-muted">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-mono">{r.email}</td>
                        <td className="px-3 py-2 font-mono text-[11.5px]">{r.ipAddress}</td>
                        <td className="px-3 py-2 font-mono text-[11.5px]">{r.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-[15px] font-semibold flex items-center gap-2">
              <ShieldAlert size={15} className="text-state-warning" />
              Security-relevant audit events
            </h2>
            {data.recentSecurityEvents.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-muted dark:text-dark-muted">
                No security events in this window.
              </p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border border-surface-border bg-white dark:bg-dark-card dark:border-dark-border">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-surface-hover text-[11px] uppercase tracking-wider text-ink-muted dark:bg-dark-hover dark:text-dark-muted">
                    <tr className="text-left">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Tenant</th>
                      <th className="px-3 py-2">Actor</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-divider dark:divide-dark-divider">
                    {data.recentSecurityEvents.map((e) => (
                      <tr key={e.id}>
                        <td className="px-3 py-2 whitespace-nowrap text-ink-muted">
                          {new Date(e.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-mono">{e.action}</td>
                        <td className="px-3 py-2 font-mono text-[11.5px]">{e.tenantId.slice(0, 10)}…</td>
                        <td className="px-3 py-2 font-mono text-[11.5px] flex items-center gap-1">
                          {e.actorUserId ? (
                            <>
                              <User size={10} className="opacity-60" />
                              {e.actorUserId.slice(0, 10)}…
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11.5px]">
                          {e.targetType ? `${e.targetType}:${(e.targetId ?? '').slice(0, 8)}…` : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11.5px]">{e.ipAddress ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'ok' | 'warning';
}): JSX.Element {
  const iconClass = tone === 'warning' ? 'text-state-warning' : 'text-brand-700 dark:text-brand-300';
  return (
    <div className="rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-center gap-2 text-ink-muted text-[12.5px] dark:text-dark-muted">
        <span className={iconClass}>{icon}</span> {label}
      </div>
      <div className="mt-1.5 text-[22px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
