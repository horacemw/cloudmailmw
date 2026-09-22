import { CheckCircle2, ShieldAlert, Terminal } from 'lucide-react';
import { useResource } from '@/lib/hooks';

/**
 * Real infrastructure status straight from the server: systemctl is-active
 * for the mail-serving daemons, LE cert expiry, fail2ban jails.
 *
 * If a probe can't run, the endpoint labels the value as "unavailable" —
 * no fabricated numbers are ever displayed here.
 */
interface SystemInfo {
  hostname: string;
  publicMailHostname: string;
  publicIpv4: string;
  services: Array<{ name: string; state: string; ok: boolean }>;
  cert:
    | { available: true; notBefore: string; notAfter: string; daysUntilExpiry: number }
    | { available: false; reason: string };
  fail2ban:
    | { available: true; jails: string[] }
    | { available: false; jails: string[]; error?: string };
}

export function AdminSystemPage(): JSX.Element {
  const { data, loading, error, refetch } = useResource<SystemInfo>('/v1/admin/system');

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">System status</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">
            Live status of the mail-serving daemons on the MailCloud host. Every value
            comes from a real probe — nothing is fabricated.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-9 px-3 rounded-lg text-[12.5px] border border-surface-border dark:border-dark-border hover:bg-surface-hover dark:hover:bg-dark-hover"
        >
          Refresh
        </button>
      </div>

      {loading && !data && <p className="mt-6 text-[13px] text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-[13px] text-state-danger">{error}</p>}

      {data && (
        <>
          <div className="mt-6 rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
            <h2 className="text-[13.5px] font-semibold uppercase tracking-wide text-ink-muted">
              Identity
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-4 text-[13px]">
              <div>
                <dt className="text-ink-muted dark:text-dark-muted">Server hostname</dt>
                <dd className="mt-0.5 font-mono">{data.hostname}</dd>
              </div>
              <div>
                <dt className="text-ink-muted dark:text-dark-muted">Public mail hostname</dt>
                <dd className="mt-0.5 font-mono">{data.publicMailHostname}</dd>
              </div>
              <div>
                <dt className="text-ink-muted dark:text-dark-muted">Public IPv4</dt>
                <dd className="mt-0.5 font-mono">{data.publicIpv4}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-6">
            <h2 className="text-[15px] font-semibold">Services</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.services.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-4 py-3 dark:bg-dark-card dark:border-dark-border"
                >
                  {s.ok ? (
                    <CheckCircle2 size={16} className="text-state-success shrink-0" />
                  ) : (
                    <ShieldAlert size={16} className="text-state-danger shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{s.name}</div>
                    <div className={`text-[11.5px] ${s.ok ? 'text-ink-muted' : 'text-state-danger'}`}>{s.state}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
              <h2 className="text-[13.5px] font-semibold uppercase tracking-wide text-ink-muted">
                TLS certificate
              </h2>
              {data.cert.available ? (
                <div className="mt-3 space-y-1 text-[13px]">
                  <div><span className="text-ink-muted">Valid from:</span> <span className="font-mono">{data.cert.notBefore}</span></div>
                  <div><span className="text-ink-muted">Valid to:</span> <span className="font-mono">{data.cert.notAfter}</span></div>
                  <div className={`text-[13.5px] font-semibold mt-1 ${data.cert.daysUntilExpiry < 14 ? 'text-state-danger' : 'text-state-success'}`}>
                    {data.cert.daysUntilExpiry} days until renewal
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12.5px] text-ink-muted">Unavailable — {data.cert.reason}</p>
              )}
            </div>

            <div className="rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
              <h2 className="text-[13.5px] font-semibold uppercase tracking-wide text-ink-muted">
                fail2ban jails
              </h2>
              {data.fail2ban.available ? (
                data.fail2ban.jails.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {data.fail2ban.jails.map((j) => (
                      <li key={j} className="rounded-full bg-surface-hover px-2.5 py-0.5 text-[12px] font-mono dark:bg-dark-hover">{j}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[12.5px] text-ink-muted">No jails active.</p>
                )
              ) : (
                <p className="mt-3 text-[12.5px] text-ink-muted flex items-start gap-2">
                  <Terminal size={12} className="mt-0.5 shrink-0" />
                  Unavailable.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
