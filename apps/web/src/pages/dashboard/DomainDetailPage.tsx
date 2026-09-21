import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Circle, Copy, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { api, ApiError } from '@/lib/apiClient';
import { useResource, useClipboard } from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface RecordRow {
  kind: string;
  type: string;
  host: string;
  value: string;
  ttl: number;
  purpose: string;
}
interface DnsPayload {
  id: string;
  name: string;
  status: string;
  dkimSelector?: string;
  dkimPublicKey?: string | null;
  records: RecordRow[];
}
interface VerifyResp {
  status: string;
  results: { kind: string; passed: boolean; observed: string | null; reason?: string }[];
}

export function DomainDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data, refetch, loading, error } = useResource<DnsPayload>(id ? `/v1/domains/${id}/dns` : null, [id]);
  const [verifying, setVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState<VerifyResp | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const { copied, copy } = useClipboard();

  const runVerify = async (): Promise<void> => {
    if (!id) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await api<VerifyResp>(`/v1/domains/${id}/verify`, { method: 'POST', body: '{}' });
      setVerifyResults(res);
      await refetch();
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const [generatingDkim, setGeneratingDkim] = useState(false);
  const generateDkim = async (): Promise<void> => {
    if (!id) return;
    setGeneratingDkim(true);
    try {
      await api(`/v1/domains/${id}/dkim/generate`, { method: 'POST', body: '{}' });
      await refetch();
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'DKIM generation failed');
    } finally {
      setGeneratingDkim(false);
    }
  };

  return (
    <>
      <PageHeader
        title={data?.name ?? 'Domain'}
        description="Publish these DNS records at your registrar, then click Verify."
        actions={
          <button
            onClick={runVerify}
            disabled={verifying}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            {verifying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Verify records
          </button>
        }
      />
      <div className="p-6 max-w-4xl">
        <Link to="/dashboard/domains" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink dark:text-dark-muted">
          <ArrowLeft size={13} /> Back
        </Link>

        {loading && !data && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {error && <p className="text-[13px] text-state-danger">{error}</p>}

        {verifyError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2.5 text-[13px] text-state-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {verifyError}
          </div>
        )}
        {verifyResults && (
          <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
            Status now: <strong>{verifyResults.status.replace(/_/g, ' ')}</strong>
          </div>
        )}

        {data && !data.dkimPublicKey && (
          <div className="mb-4 rounded-lg border border-state-warning/30 bg-state-warning-soft px-4 py-3 text-[13px] flex items-center justify-between gap-3 text-state-warning">
            <span>DKIM key not yet generated for this domain — outbound signing will not work until you generate one.</span>
            <button
              onClick={() => void generateDkim()}
              disabled={generatingDkim}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand text-white px-3 text-[12.5px] font-semibold hover:bg-brand-600 disabled:opacity-60"
            >
              {generatingDkim ? <Loader2 size={12} className="animate-spin" /> : null} Generate DKIM key
            </button>
          </div>
        )}

        {data && (
          <div className="rounded-2xl border border-surface-border dark:border-dark-border overflow-hidden bg-white dark:bg-dark-card">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-hover dark:bg-dark-hover">
                <tr className="text-left text-[11.5px] uppercase tracking-wider text-ink-muted dark:text-dark-muted">
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Host</th>
                  <th className="px-4 py-2">Value</th>
                  <th className="px-4 py-2 text-right">TTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-divider dark:divide-dark-divider">
                {data.records.map((r) => {
                  const key = `${r.type}:${r.host}`;
                  return (
                    <tr key={key} className="align-top">
                      <td className="px-4 py-3 font-semibold">{r.type}</td>
                      <td className="px-4 py-3 font-mono text-[12.5px]">
                        <span className="inline-flex items-center gap-1">
                          {r.host}
                          <button className="opacity-60 hover:opacity-100" onClick={() => copy(r.host, key + ':host')} aria-label="copy host">
                            <Copy size={11} />
                          </button>
                          {copied === key + ':host' && <span className="text-[10.5px] text-brand-700">copied</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12.5px] break-all">
                        <span className="inline-flex items-start gap-1">
                          <span>{r.value}</span>
                          <button className="opacity-60 hover:opacity-100" onClick={() => copy(r.value, key + ':val')} aria-label="copy value">
                            <Copy size={11} />
                          </button>
                          {copied === key + ':val' && <span className="text-[10.5px] text-brand-700">copied</span>}
                        </span>
                        <p className="mt-1 text-[11.5px] text-ink-muted dark:text-dark-muted">{r.purpose}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-muted">{r.ttl}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {verifyResults && (
          <div className="mt-6 grid gap-2">
            {verifyResults.results.map((r) => (
              <div key={r.kind} className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]',
                r.passed ? 'border-brand-100 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-900/40'
                        : 'border-surface-border bg-white dark:bg-dark-card dark:border-dark-border',
              )}>
                {r.passed ? <CheckCircle2 size={16} className="text-brand mt-0.5" /> : <Circle size={16} className="text-ink-muted mt-0.5" />}
                <div className="flex-1">
                  <div className="font-semibold">{humanKind(r.kind)}</div>
                  {r.observed !== null && (
                    <div className="text-[12px] text-ink-muted dark:text-dark-muted break-all font-mono">Saw: {r.observed || '(nothing)'}</div>
                  )}
                  {r.reason && <div className="text-[12px] text-state-danger">Error: {r.reason}</div>}
                </div>
                <ChevronRight size={14} className="mt-1 opacity-40" />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function humanKind(k: string): string {
  return { ownership_txt: 'Ownership TXT', mx: 'MX record', spf: 'SPF', dkim: 'DKIM', dmarc: 'DMARC' }[k] ?? k;
}
