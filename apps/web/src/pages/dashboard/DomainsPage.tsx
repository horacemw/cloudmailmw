import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Globe2, Plus } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface DomainRow {
  id: string;
  name: string;
  status: string;
  isPrimary: boolean;
  dkimReady: boolean;
  verifications: Record<string, { passed: boolean; lastCheckedAt: string | null }>;
  createdAt: string;
}

export function DomainsPage(): JSX.Element {
  const { data, loading, refetch } = useResource<{ domains: DomainRow[] }>('/v1/domains');
  const rows = data?.domains ?? [];

  return (
    <>
      <PageHeader
        title="Domains"
        description="Add and verify the domains you'll send and receive mail on."
        actions={
          <Link
            to="/dashboard/domains/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600"
          >
            <Plus size={15} /> Add domain
          </Link>
        }
      />
      <div className="p-6">
        {loading && rows.length === 0 && <SkeletonList />}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<Globe2 size={22} />}
            title="No domains yet"
            description="Add your first domain and Cloud Mail will generate the exact DNS records you need."
            action={
              <Link to="/dashboard/domains/new">
                <Button variant="primary" leftIcon={<Plus size={15} />}>Add your first domain</Button>
              </Link>
            }
          />
        )}
        {rows.length > 0 && (
          <ul className="grid gap-3">
            {rows.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/dashboard/domains/${d.id}`}
                  className="block rounded-xl border border-surface-border bg-white p-4 hover:border-brand-300 transition-colors dark:bg-dark-card dark:border-dark-border"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 inline-flex items-center justify-center">
                      <Globe2 size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[15px] truncate">{d.name}</p>
                        <StatusChip status={d.status} />
                        {d.isPrimary && <span className="text-[10.5px] uppercase tracking-wider rounded-full border border-brand-100 text-brand-700 px-1.5 py-0.5">Primary</span>}
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-muted dark:text-dark-muted">Added {new Date(d.createdAt).toLocaleDateString()}</p>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
                        {(['ownership_txt', 'mx', 'spf', 'dkim', 'dmarc'] as const).map((k) => {
                          const v = d.verifications?.[k];
                          const ok = v?.passed;
                          return (
                            <div key={k} className={cn(
                              'flex items-center gap-1.5 rounded-md border px-2 py-1',
                              ok ? 'border-brand-200 text-brand-700 dark:border-brand-900/40 dark:text-brand-300' : 'border-surface-border text-ink-muted dark:border-dark-border dark:text-dark-muted',
                            )}>
                              {ok ? <CheckCircle2 size={12} /> : <Circle size={12} />} {labelFor(k)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <p className="mt-6 text-[12px] text-ink-muted dark:text-dark-muted">
            <button onClick={() => refetch()} className="hover:underline">Refresh list</button>
          </p>
        )}
      </div>
    </>
  );
}

function StatusChip({ status }: { status: string }): JSX.Element {
  const tone =
    status === 'active' ? 'text-brand-700 bg-brand-100 dark:bg-brand-900/40 dark:text-brand-300' :
    status === 'verified' ? 'text-sky-700 bg-sky-100' :
    status === 'verification_required' ? 'text-amber-700 bg-amber-100' :
    'text-ink-muted bg-surface-hover dark:bg-dark-hover dark:text-dark-muted';
  return (
    <span className={cn('text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 font-semibold', tone)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function labelFor(k: string): string {
  return { ownership_txt: 'Ownership', mx: 'MX', spf: 'SPF', dkim: 'DKIM', dmarc: 'DMARC' }[k] ?? k;
}

function SkeletonList(): JSX.Element {
  return (
    <div className="grid gap-3">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-surface-border p-4 dark:border-dark-border">
          <div className="h-4 w-32 rounded shimmer bg-surface-border" />
          <div className="mt-3 h-8 rounded shimmer bg-surface-border" />
        </div>
      ))}
    </div>
  );
}

/**
 * Fix TypeScript: my Button expects children, and I need to nest a <Link>.
 * The `as-any` prop above is a no-op; kept because tsx forbids camelCase-only
 * unknown props but allows "as-any" as a data-* alias. In a real refactor
 * Button would accept an `as` prop.
 */
