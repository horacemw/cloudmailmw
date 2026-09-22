import { useState } from 'react';
import { AlertCircle, Loader2, PlayCircle, Server, Trash2, PauseCircle, RefreshCw } from 'lucide-react';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';

interface QueueResp {
  available: boolean;
  summary?: string;
  entries?: number;
  raw?: string;
  error?: string;
}

/**
 * Platform admin view of the Postfix queue. Read side is `mailq` piped
 * through the API. Write side is `postqueue -i/-f` and `postsuper -d/-h/-H`
 * running under a strict sudoers whitelist as the `cloudmail` user.
 * Queue IDs are validated server-side against ^[A-F0-9]{6,15}$ before
 * any shell-out, and every action is written to audit_events.
 */
export function AdminQueuePage(): JSX.Element {
  const { data, loading, refetch } = useResource<QueueResp>('/v1/admin/queue');
  const [qid, setQid] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const validQid = /^[A-F0-9]{6,15}$/.test(qid.toUpperCase());

  const runAction = async (
    action: 'retry' | 'hold' | 'release' | 'delete',
    confirmMessage?: string,
  ): Promise<void> => {
    if (!validQid) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(action);
    setMsg(null);
    try {
      const r = await api<{ ok: true; action: string; qid: string; output: string }>(
        `/v1/admin/queue/${qid.toUpperCase()}/${action}`,
        { method: 'POST', body: '{}' },
      );
      setMsg({ text: `${action} ${r.qid}: ${r.output || 'OK'}`, tone: 'ok' });
      await refetch();
    } catch (e) {
      setMsg({
        text: e instanceof ApiError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : 'Failed'),
        tone: 'err',
      });
    } finally {
      setBusy(null);
    }
  };

  const flushAll = async (): Promise<void> => {
    if (!window.confirm('Flush the entire mail queue? Every deferred message will be retried immediately.')) return;
    setBusy('flush');
    setMsg(null);
    try {
      const r = await api<{ ok: true; action: string; output: string }>('/v1/admin/queue/flush', {
        method: 'POST',
        body: '{}',
      });
      setMsg({ text: `flush: ${r.output || 'OK'}`, tone: 'ok' });
      await refetch();
    } catch (e) {
      setMsg({
        text: e instanceof ApiError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : 'Failed'),
        tone: 'err',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Mail queue</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted dark:text-dark-muted">Live output from Postfix's <code className="font-mono text-[12.5px]">mailq</code> on the mail server.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={flushAll}
            disabled={busy !== null}
            className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border inline-flex items-center gap-1.5"
          >
            {busy === 'flush' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Flush queue
          </button>
          <button
            onClick={() => refetch()}
            className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border"
          >
            Refresh
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
        <h2 className="text-[13.5px] font-semibold uppercase tracking-wide text-ink-muted">
          Act on a specific queue ID
        </h2>
        <p className="mt-1 text-[12px] text-ink-muted dark:text-dark-muted">
          Copy a queue-id from the list below. Retry re-runs delivery immediately; hold
          pauses it; release un-holds; delete removes it (irreversible).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={qid}
            onChange={(e) => setQid(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}
            placeholder="e.g. 89F011FC35"
            className="h-9 w-56 rounded-lg border border-surface-border bg-white px-3 text-[13px] font-mono tracking-wide focus:border-brand outline-none dark:bg-dark-card dark:border-dark-border"
          />
          <button disabled={!validQid || busy !== null} onClick={() => runAction('retry')} className="h-9 px-3 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy === 'retry' ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
            Retry
          </button>
          <button disabled={!validQid || busy !== null} onClick={() => runAction('hold')} className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover disabled:opacity-40 dark:border-dark-border inline-flex items-center gap-1.5">
            {busy === 'hold' ? <Loader2 size={13} className="animate-spin" /> : <PauseCircle size={13} />}
            Hold
          </button>
          <button disabled={!validQid || busy !== null} onClick={() => runAction('release')} className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover disabled:opacity-40 dark:border-dark-border inline-flex items-center gap-1.5">
            Release
          </button>
          <button disabled={!validQid || busy !== null} onClick={() => runAction('delete', `Permanently delete queued message ${qid.toUpperCase()}?`)} className="h-9 px-3 rounded-lg border border-state-danger/40 text-state-danger text-[13px] hover:bg-state-danger-soft disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
        {msg && (
          <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] ${
            msg.tone === 'ok'
              ? 'border border-brand-100 bg-brand-50 text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200'
              : 'border border-state-danger/30 bg-state-danger-soft text-state-danger'
          }`}>
            <AlertCircle size={13} className="mt-0.5" />
            <span className="font-mono">{msg.text}</span>
          </div>
        )}
      </section>

      {loading && !data && <p className="mt-6 text-[13px] text-ink-muted">Loading…</p>}
      {data && !data.available && (
        <div className="mt-6 rounded-lg border border-state-warning/30 bg-state-warning-soft px-4 py-3 text-[13px] text-state-warning">
          <Server size={14} className="inline mr-1.5" />
          Queue not available: {data.error}
        </div>
      )}
      {data?.available && (
        <>
          <div className="mt-6 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
            {data.summary || 'Queue is empty.'}
          </div>
          {data.raw && (
            <pre className="mt-4 rounded-lg border border-surface-border bg-surface-hover p-4 text-[11.5px] leading-relaxed font-mono overflow-x-auto scroll-thin whitespace-pre-wrap dark:bg-dark-hover dark:border-dark-border">
              {data.raw}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
