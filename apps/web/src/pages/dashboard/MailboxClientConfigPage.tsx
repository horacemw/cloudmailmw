import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Info, Server } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource, useClipboard } from '@/lib/hooks';

interface ClientConfig {
  emailAddress: string;
  username: string;
  incoming: { protocol: string; host: string; port: number; security: string; authentication: string };
  outgoing: { protocol: string; host: string; port: number; security: string; authentication: string };
  thunderbirdAutoconfig: string;
  outlook: { summary: string };
  mobile: { apple: string; android: string };
}

export function MailboxClientConfigPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useResource<ClientConfig>(id ? `/v1/mailboxes/${id}/client-config` : null, [id]);
  const { copied, copy } = useClipboard();

  return (
    <>
      <PageHeader title="Connect a mail client" description="Point Outlook, Thunderbird, Apple Mail or your phone at this mailbox." />
      <div className="p-6 max-w-3xl">
        <Link to="/dashboard/mailboxes" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink dark:text-dark-muted">
          <ArrowLeft size={13} /> Back to mailboxes
        </Link>
        {loading && !data && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {error && <p className="text-[13px] text-state-danger">{error}</p>}
        {data && (
          <>
            <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 flex items-start gap-2 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
              <Info size={15} className="mt-0.5 shrink-0 text-brand" />
              Use the mailbox password you set when you created this mailbox. Cloud Mail never displays it here.
            </div>
            <SettingsTable
              title="Incoming (IMAP)"
              rows={[
                ['Email', data.emailAddress],
                ['Username', data.username],
                ['Server', data.incoming.host],
                ['Port', String(data.incoming.port)],
                ['Security', data.incoming.security],
                ['Authentication', data.incoming.authentication],
              ]}
              copied={copied} copy={copy}
            />
            <SettingsTable
              title="Outgoing (SMTP submission)"
              rows={[
                ['Server', data.outgoing.host],
                ['Port', String(data.outgoing.port)],
                ['Security', data.outgoing.security],
                ['Authentication', data.outgoing.authentication],
              ]}
              copied={copied} copy={copy}
            />
            <div className="grid gap-4 md:grid-cols-3 mt-6">
              <ClientHint title="Outlook" body={data.outlook.summary} />
              <ClientHint title="Apple Mail (iOS/macOS)" body={data.mobile.apple} />
              <ClientHint title="Android" body={data.mobile.android} />
            </div>
            <div className="mt-6 flex items-center gap-2 text-[12px] text-ink-muted dark:text-dark-muted">
              <Server size={13} /> Thunderbird auto-config: <code>{data.thunderbirdAutoconfig}</code>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SettingsTable({
  title, rows, copied, copy,
}: {
  title: string;
  rows: [string, string][];
  copied: string | null;
  copy: (v: string, key?: string) => void;
}): JSX.Element {
  return (
    <div className="mt-4 rounded-xl border border-surface-border overflow-hidden bg-white dark:bg-dark-card dark:border-dark-border">
      <div className="px-4 py-2.5 bg-surface-hover text-[12px] font-semibold uppercase tracking-wider text-ink-muted dark:bg-dark-hover dark:text-dark-muted">{title}</div>
      <dl className="divide-y divide-surface-divider dark:divide-dark-divider">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-2 px-4 py-2.5 text-[13px]">
            <dt className="col-span-1 text-ink-muted dark:text-dark-muted">{k}</dt>
            <dd className="col-span-2 font-mono text-[12.5px] flex items-center gap-2 break-all">
              {v}
              <button className="opacity-60 hover:opacity-100" onClick={() => copy(v, k)} aria-label={`copy ${k}`}>
                <Copy size={11} />
              </button>
              {copied === k && <span className="text-[10.5px] text-brand-700">copied</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ClientHint({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-surface-border p-4 dark:border-dark-border">
      <p className="font-semibold text-[13.5px]">{title}</p>
      <p className="mt-1 text-[12.5px] text-ink-muted dark:text-dark-muted leading-relaxed">{body}</p>
    </div>
  );
}
