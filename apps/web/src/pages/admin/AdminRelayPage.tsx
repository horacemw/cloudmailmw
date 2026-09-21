import { useState } from 'react';
import { CheckCircle2, Loader2, Send, ServerOff, XCircle } from 'lucide-react';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';

interface RelayInfo {
  mode: 'direct' | 'relay';
  relay: {
    host: string | null;
    port: number | null;
    encryption: string;
    usernameMasked: string | null;
    hasPassword: boolean;
    envelopeFrom: string | null;
  };
  instructions: { apply: string; disable: string; envFile: string };
}
interface RelayTestResp {
  host: string;
  port: number;
  encryption: string;
  ok: boolean;
  tcp: boolean;
  tls: boolean;
  ehlo: boolean;
  authAdvertised: boolean;
  banner: string | null;
  ehloResponse: string | null;
  error?: string;
}

export function AdminRelayPage(): JSX.Element {
  const { data, loading } = useResource<RelayInfo>('/v1/admin/mail-relay');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<RelayTestResp | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const runTest = async (): Promise<void> => {
    setTesting(true);
    setTestErr(null);
    try {
      const r = await api<RelayTestResp>('/v1/admin/mail-relay/test', { method: 'POST', body: '{}' });
      setTestResult(r);
    } catch (err) {
      setTestErr(err instanceof ApiError ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Outbound SMTP relay</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">
        Temporary path for outbound email while Hetzner reviews the direct port-25 request.
      </p>

      {loading && !data && <p className="mt-6 text-[13px] text-ink-muted">Loading…</p>}
      {data && (
        <>
          <div className="mt-6 rounded-xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11.5px] uppercase tracking-wider text-ink-muted">Delivery mode</p>
                <p className="mt-1 text-[18px] font-semibold">
                  {data.mode === 'relay' ? (
                    <span className="text-brand-700">Relay</span>
                  ) : (
                    <span>Direct (port 25)</span>
                  )}
                </p>
              </div>
              {data.mode === 'relay' && data.relay.hasPassword && (
                <button onClick={runTest} disabled={testing} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
                  {testing ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} Test connection
                </button>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-y-3 gap-x-6 text-[13px]">
              <dt className="text-ink-muted">Relay host</dt>
              <dd className="font-mono">{data.relay.host ?? <span className="text-ink-muted">(not set)</span>}</dd>
              <dt className="text-ink-muted">Port</dt>
              <dd className="font-mono">{data.relay.port ?? '—'}</dd>
              <dt className="text-ink-muted">Encryption</dt>
              <dd>{data.relay.encryption}</dd>
              <dt className="text-ink-muted">Username</dt>
              <dd className="font-mono">{data.relay.usernameMasked ?? <span className="text-ink-muted">(not set)</span>}</dd>
              <dt className="text-ink-muted">Password set</dt>
              <dd>{data.relay.hasPassword ? 'Yes' : <span className="text-state-warning">No</span>}</dd>
              <dt className="text-ink-muted">Envelope from</dt>
              <dd className="font-mono">{data.relay.envelopeFrom ?? '—'}</dd>
            </dl>
          </div>

          {testErr && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
              <XCircle size={14} className="mt-0.5" /> {testErr}
            </div>
          )}
          {testResult && (
            <div className={`mt-4 rounded-xl border p-4 ${testResult.ok ? 'border-brand-100 bg-brand-50 dark:border-brand-900/40 dark:bg-brand-900/20' : 'border-state-danger/30 bg-state-danger-soft'}`}>
              <p className="font-semibold text-[13.5px] flex items-center gap-2">
                {testResult.ok ? <CheckCircle2 size={16} className="text-brand" /> : <ServerOff size={16} className="text-state-danger" />}
                {testResult.host}:{testResult.port} ({testResult.encryption}) — {testResult.ok ? 'Reachable' : 'Failed'}
              </p>
              <ul className="mt-2 text-[12.5px] grid gap-1">
                <li>{step('TCP connection', testResult.tcp)}</li>
                <li>{step('TLS negotiation', testResult.tls)}</li>
                <li>{step('SMTP EHLO', testResult.ehlo)}</li>
                <li>{step('AUTH advertised', testResult.authAdvertised)}</li>
              </ul>
              {testResult.error && <p className="mt-2 text-[12px] text-state-danger">{testResult.error}</p>}
              {testResult.banner && <p className="mt-2 text-[11.5px] text-ink-muted font-mono">Banner: {testResult.banner}</p>}
            </div>
          )}

          <div className="mt-8 rounded-xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
            <p className="text-[13px] font-semibold">How to enable the relay</p>
            <ol className="mt-3 space-y-2 text-[12.5px] text-ink-muted dark:text-dark-muted list-decimal pl-4">
              <li>SSH into <code>mail.digiskills.live</code> as root.</li>
              <li>Edit <code>{data.instructions.envFile}</code> and set <code>SMTP_RELAY_HOST</code>, <code>SMTP_RELAY_PORT</code>, <code>SMTP_RELAY_USERNAME</code>, <code>SMTP_RELAY_PASSWORD</code>, <code>SMTP_RELAY_ENCRYPTION</code>, and (optional) <code>SMTP_RELAY_ENVELOPE_FROM</code>.</li>
              <li>Run <code className="text-brand-700 dark:text-brand-300">{data.instructions.apply}</code></li>
              <li>Restart the API: <code>systemctl restart cloudmail-api</code></li>
              <li>Come back to this page and click <strong>Test connection</strong>.</li>
            </ol>
            <p className="mt-4 text-[12.5px] text-ink-muted">
              To go back to direct delivery once Hetzner unblocks port 25:{' '}
              <code>{data.instructions.disable}</code>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function step(label: string, ok: boolean): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      {ok ? <CheckCircle2 size={12} className="text-brand" /> : <XCircle size={12} className="text-ink-muted" />}
      {label}
    </span>
  );
}
