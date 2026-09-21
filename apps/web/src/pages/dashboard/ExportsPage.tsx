import { useState, type FormEvent } from 'react';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';

interface ExportRow {
  id: string;
  mailboxId: string;
  format: string;
  scope: string;
  status: string;
  processed: number;
  downloadUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}
interface Mailbox { id: string; address: string; status: string }

export function ExportsPage(): JSX.Element {
  const { data, refetch } = useResource<{ exports: ExportRow[] }>('/v1/exports');
  const { data: mailboxesData } = useResource<{ mailboxes: Mailbox[] }>('/v1/mailboxes');
  const [opening, setOpening] = useState(false);
  const rows = data?.exports ?? [];
  const mailboxes = (mailboxesData?.mailboxes ?? []).filter((m) => m.status === 'active');

  return (
    <>
      <PageHeader
        title="Exports"
        description="Download an MBOX archive of any mailbox — your data isn't held hostage."
        actions={
          <button
            onClick={() => setOpening(true)}
            disabled={mailboxes.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            <Download size={15} /> New export
          </button>
        }
      />
      <div className="p-6">
        {opening && (
          <NewExport
            mailboxes={mailboxes}
            onClose={() => setOpening(false)}
            onCreated={async () => { setOpening(false); await refetch(); }}
          />
        )}
        {rows.length === 0 && !opening && (
          <EmptyState
            icon={<Download size={22} />}
            title="No exports yet"
            description="Start an export to bundle a mailbox's messages into a downloadable MBOX file."
          />
        )}
        {rows.length > 0 && (
          <ul className="grid gap-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 inline-flex items-center justify-center">
                    <Download size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[14px]">{r.format.toUpperCase()} · {r.scope}</p>
                      <span className="text-[11px] uppercase tracking-wider rounded-full bg-surface-hover px-2 py-0.5 dark:bg-dark-hover">{r.status}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-muted dark:text-dark-muted">
                      {r.processed.toLocaleString()} messages · created {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {r.status === 'completed' && r.downloadUrl && (
                    <a
                      href={r.downloadUrl}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-600"
                    >
                      <Download size={13} /> Download
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function NewExport({
  mailboxes, onClose, onCreated,
}: {
  mailboxes: Mailbox[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}): JSX.Element {
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/v1/exports', {
        method: 'POST',
        body: JSON.stringify({ mailboxId, format: 'mbox', scope: 'full' }),
      });
      await onCreated();
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Could not start export');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-6 rounded-xl border border-surface-border p-5 bg-white dark:bg-dark-card dark:border-dark-border">
      {err && <div className="mb-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger"><AlertCircle size={14} className="mt-0.5" /> {err}</div>}
      <label>
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Mailbox to export</span>
        <select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}
          className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text">
          {mailboxes.map((m) => <option key={m.id} value={m.id}>{m.address}</option>)}
        </select>
      </label>
      <p className="mt-3 text-[11.5px] text-ink-muted dark:text-dark-muted">
        Exports run in the background. A signed download link expires 24 hours after completion.
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-4 text-[13.5px] rounded-lg border border-surface-border hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover">Cancel</button>
        <button type="submit" disabled={busy || !mailboxId} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-[13.5px] font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {busy && <Loader2 size={13} className="animate-spin" />} Start export
        </button>
      </div>
    </form>
  );
}
