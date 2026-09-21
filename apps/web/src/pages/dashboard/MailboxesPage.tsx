import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, Mail, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { humanFileSize } from '@/lib/utils';

interface Mailbox {
  id: string;
  address: string;
  localPart: string;
  displayName: string | null;
  domain: { id: string; name: string };
  quotaBytes: string;
  usedBytes: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}
interface Domain { id: string; name: string; status: string }

export function MailboxesPage(): JSX.Element {
  const { data, refetch, loading } = useResource<{ mailboxes: Mailbox[] }>('/v1/mailboxes');
  const { data: domainsData } = useResource<{ domains: Domain[] }>('/v1/domains');
  const [creating, setCreating] = useState(false);
  const mailboxes = data?.mailboxes ?? [];
  const domains = (domainsData?.domains ?? []).filter((d) => d.status === 'active' || d.status === 'verified');

  return (
    <>
      <PageHeader
        title="Mailboxes"
        description="Real IMAP mailboxes provisioned on your verified domains."
        actions={
          <button
            onClick={() => setCreating(true)}
            disabled={domains.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            <Plus size={15} /> Create mailbox
          </button>
        }
      />
      <div className="p-6">
        {domains.length === 0 && (
          <div className="mb-6 rounded-xl border border-state-warning/30 bg-state-warning-soft px-4 py-3 text-[13px] text-state-warning">
            You need at least one verified domain before you can create a mailbox.
            <Link to="/dashboard/domains" className="ml-2 font-semibold underline">Add a domain →</Link>
          </div>
        )}

        {creating && domains.length > 0 && (
          <CreateMailbox
            domains={domains}
            onClose={() => setCreating(false)}
            onCreated={async () => {
              setCreating(false);
              await refetch();
            }}
          />
        )}

        {loading && mailboxes.length === 0 && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {!loading && mailboxes.length === 0 && !creating && (
          <EmptyState
            icon={<Mail size={22} />}
            title="No mailboxes yet"
            description="Provision your first mailbox once at least one domain is verified."
          />
        )}

        {mailboxes.length > 0 && (
          <div className="grid gap-3">
            {mailboxes.map((m) => {
              const quota = Number(m.quotaBytes);
              const used = Number(m.usedBytes);
              const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
              return (
                <div key={m.id} className="rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 inline-flex items-center justify-center">
                      <Mail size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[15px]">{m.address}</p>
                        {m.status !== 'active' && (
                          <span className="text-[10.5px] uppercase tracking-wider rounded-full bg-surface-hover px-2 py-0.5 dark:bg-dark-hover">
                            {m.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-ink-muted dark:text-dark-muted">
                        {m.displayName ? `${m.displayName} · ` : ''}Created {new Date(m.createdAt).toLocaleDateString()}
                      </p>
                      <div className="mt-3 max-w-md">
                        <div className="h-1.5 rounded-full bg-surface-border dark:bg-dark-border overflow-hidden">
                          <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-[11.5px] text-ink-muted dark:text-dark-muted">
                          {humanFileSize(used)} of {humanFileSize(quota)} used
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Link
                        to={`/dashboard/mailboxes/${m.id}/connect`}
                        className="inline-flex items-center gap-1 h-8 rounded-lg border border-surface-border bg-white px-3 text-[12.5px] font-medium text-ink hover:bg-surface-hover dark:bg-dark-card dark:border-dark-border dark:text-dark-text dark:hover:bg-dark-hover"
                      >
                        <Settings2 size={12} /> Connect
                      </Link>
                      <SyncUsageButton mailboxId={m.id} onSynced={() => refetch()} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function SyncUsageButton({
  mailboxId,
  onSynced,
}: {
  mailboxId: string;
  onSynced: () => void | Promise<void>;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const click = async (): Promise<void> => {
    setBusy(true);
    try {
      await api(`/v1/mailboxes/${mailboxId}/sync-usage`, { method: 'POST' });
      await onSynced();
    } catch {
      /* silent — background sweep will pick it up eventually */
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void click()}
      disabled={busy}
      title="Refresh usage from Dovecot"
      className="inline-flex items-center justify-center gap-1 h-8 rounded-lg border border-surface-border bg-white px-3 text-[12.5px] font-medium text-ink-muted hover:bg-surface-hover dark:bg-dark-card dark:border-dark-border dark:text-dark-muted dark:hover:bg-dark-hover disabled:opacity-60"
    >
      <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Refresh usage
    </button>
  );
}

function CreateMailbox({
  domains,
  onClose,
  onCreated,
}: {
  domains: Domain[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}): JSX.Element {
  const [domainId, setDomainId] = useState(domains[0]!.id);
  const [localPart, setLocalPart] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/v1/mailboxes', {
        method: 'POST',
        body: JSON.stringify({ domainId, localPart, password, displayName: displayName || undefined }),
      });
      await onCreated();
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Could not create mailbox');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-6 rounded-xl border border-surface-border p-5 bg-white dark:bg-dark-card dark:border-dark-border">
      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Local part</span>
          <div className="flex rounded-lg border border-surface-border overflow-hidden bg-white dark:bg-dark-card dark:border-dark-border">
            <input required maxLength={60} pattern="[a-z0-9._-]+"
              value={localPart} onChange={(e) => setLocalPart(e.target.value.toLowerCase())}
              placeholder="info"
              className="flex-1 h-10 px-3 text-[14px] outline-none dark:text-dark-text bg-transparent" />
            <span className="inline-flex items-center px-3 text-[13px] text-ink-muted bg-surface-hover dark:bg-dark-hover dark:text-dark-muted">
              @{domains.find((d) => d.id === domainId)?.name}
            </span>
          </div>
        </label>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Domain</span>
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
          >
            {domains.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Display name (optional)</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Support team"
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Mailbox password</span>
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 10 characters — this is what the user logs in with"
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-4 text-[13.5px] rounded-lg border border-surface-border hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover">Cancel</button>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-[13.5px] font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {busy && <Loader2 size={13} className="animate-spin" />} Create mailbox
        </button>
      </div>
    </form>
  );
}
