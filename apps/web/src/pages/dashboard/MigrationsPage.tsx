import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeftRight, CheckCircle2, Circle, Loader2, PlayCircle, XCircle } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';

interface MigrationRow {
  id: string;
  mailboxId: string;
  source: string;
  status: string;
  totalMessages: number;
  processed: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
}
interface Mailbox { id: string; address: string; status: string }

export function MigrationsPage(): JSX.Element {
  const { data, refetch } = useResource<{ migrations: MigrationRow[] }>('/v1/migrations');
  const { data: mailboxesData } = useResource<{ mailboxes: Mailbox[] }>('/v1/mailboxes');
  const [opening, setOpening] = useState(false);
  const rows = data?.migrations ?? [];
  const mailboxes = (mailboxesData?.mailboxes ?? []).filter((m) => m.status === 'active');

  return (
    <>
      <PageHeader
        title="Migrations"
        description="Move email from Gmail, Microsoft 365, or any IMAP provider into a Cloud Mail mailbox."
        actions={
          <button
            onClick={() => setOpening(true)}
            disabled={mailboxes.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            <PlayCircle size={15} /> Start migration
          </button>
        }
      />
      <div className="p-6">
        {mailboxes.length === 0 && (
          <div className="mb-6 rounded-xl border border-state-warning/30 bg-state-warning-soft px-4 py-3 text-[13px] text-state-warning">
            Create a destination mailbox before starting a migration.
          </div>
        )}
        {opening && (
          <StartMigration
            mailboxes={mailboxes}
            onClose={() => setOpening(false)}
            onStarted={async () => {
              setOpening(false);
              await refetch();
            }}
          />
        )}
        {rows.length === 0 && !opening && (
          <EmptyState
            icon={<ArrowLeftRight size={22} />}
            title="No migrations yet"
            description="When you start a migration it will appear here with live progress."
          />
        )}
        {rows.length > 0 && (
          <ul className="grid gap-3">
            {rows.map((r) => {
              const pct = r.totalMessages > 0 ? Math.round((r.processed / r.totalMessages) * 100) : 0;
              return (
                <li key={r.id} className="rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
                  <div className="flex items-start gap-3">
                    <StatusIcon status={r.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[14px]">{r.source}</p>
                        <span className="text-[11px] uppercase tracking-wider rounded-full bg-surface-hover px-2 py-0.5 dark:bg-dark-hover">{r.status}</span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-muted dark:text-dark-muted">
                        {r.processed.toLocaleString()} / {r.totalMessages.toLocaleString()} messages · {r.failed.toLocaleString()} failed
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-surface-border dark:bg-dark-border overflow-hidden">
                        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {r.status === 'running' && (
                      <button
                        onClick={async () => { await api(`/v1/migrations/${r.id}/cancel`, { method: 'POST' }); await refetch(); }}
                        className="h-8 rounded-lg border border-surface-border px-3 text-[12.5px] hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: string }): JSX.Element {
  if (status === 'completed') return <CheckCircle2 size={18} className="text-brand mt-1" />;
  if (status === 'failed' || status === 'cancelled') return <XCircle size={18} className="text-state-danger mt-1" />;
  if (status === 'running') return <Loader2 size={18} className="text-brand animate-spin mt-1" />;
  return <Circle size={18} className="text-ink-muted mt-1" />;
}

function StartMigration({
  mailboxes,
  onClose,
  onStarted,
}: {
  mailboxes: Mailbox[];
  onClose: () => void;
  onStarted: () => void | Promise<void>;
}): JSX.Element {
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.id ?? '');
  const [host, setHost] = useState('imap.gmail.com');
  const [port, setPort] = useState(993);
  const [secure, setSecure] = useState(true);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const test = async (): Promise<void> => {
    setTesting(true); setTestMsg(null); setErr(null);
    try {
      const res = await api<{ folders: number; samplePaths: string[] }>('/v1/migrations/test', {
        method: 'POST',
        body: JSON.stringify({ host, port, secure, user, password }),
      });
      setTestMsg(`Connected. ${res.folders} folders found.`);
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/v1/migrations', {
        method: 'POST',
        body: JSON.stringify({ mailboxId, host, port, secure, user, password }),
      });
      await onStarted();
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Could not start migration');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-6 rounded-xl border border-surface-border p-5 bg-white dark:bg-dark-card dark:border-dark-border">
      {err && <div className="mb-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger"><AlertCircle size={14} className="mt-0.5" /> {err}</div>}
      {testMsg && <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">{testMsg}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Destination mailbox</span>
          <select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text">
            {mailboxes.map((m) => <option key={m.id} value={m.id}>{m.address}</option>)}
          </select>
        </label>
        <div />
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Source IMAP host</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} required
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Port</span>
          <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} min={1} max={65535}
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <label className="flex items-center gap-2 mt-6">
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="accent-brand" />
          <span className="text-[13px]">Use SSL/TLS (recommended)</span>
        </label>
        <div />
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Source email / username</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} required autoComplete="off"
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Source password / app password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off"
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-muted dark:text-dark-muted">
        Source credentials are encrypted at rest, used only for this migration, and wiped when the job finishes.
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={test} disabled={testing || !host || !user || !password}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-surface-border text-[13.5px] hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover disabled:opacity-60">
          {testing && <Loader2 size={13} className="animate-spin" />} Test connection
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="h-9 px-4 text-[13.5px] rounded-lg border border-surface-border hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover">Cancel</button>
          <button type="submit" disabled={busy || !mailboxId} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-[13.5px] font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />} Start migration
          </button>
        </div>
      </div>
    </form>
  );
}
