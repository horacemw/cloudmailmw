import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Filter as FilterIcon,
  Loader2, PenLine, Plus, Power, PowerOff, Trash2, Umbrella,
} from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

interface Condition {
  field: 'from' | 'to' | 'subject' | 'body' | 'any';
  op: 'contains' | 'is' | 'matches';
  value: string;
}
interface Action {
  kind: 'move' | 'copy' | 'flag' | 'markRead' | 'discard';
  target?: string;
}
interface Filter {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  matchType: 'all' | 'any';
  conditions: Condition[];
  actions: Action[];
}
interface AutoReply {
  enabled: boolean;
  subject: string;
  body: string;
  startDate: string | null;
  endDate: string | null;
}

export function FiltersPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Filters &amp; auto-reply"
        description="Server-side rules run in Dovecot Sieve — they apply to webmail, Outlook, Thunderbird and mobile alike."
      />
      <div className="p-6 grid gap-6 max-w-4xl">
        <FiltersCard />
        <AutoReplyCard />
      </div>
    </>
  );
}

/* ─── Filters card ────────────────────────────────────────────── */

function FiltersCard(): JSX.Element {
  const { data, refetch, loading } = useResource<{ filters: Filter[] }>('/v1/filters');
  const [editing, setEditing] = useState<Filter | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rows = data?.filters ?? [];

  const toggleActive = async (f: Filter): Promise<void> => {
    setErr(null);
    try {
      await api(`/v1/filters/${f.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: f.name,
          active: !f.active,
          matchType: f.matchType,
          conditions: f.conditions,
          actions: f.actions,
        }),
      });
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Toggle failed');
    }
  };

  const move = async (idx: number, delta: -1 | 1): Promise<void> => {
    const to = idx + delta;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(idx, 1);
    if (!item) return;
    next.splice(to, 0, item);
    await api('/v1/filters/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds: next.map((r) => r.id) }),
    });
    await refetch();
  };

  const del = async (f: Filter): Promise<void> => {
    if (!window.confirm(`Delete filter "${f.name}"?`)) return;
    await api(`/v1/filters/${f.id}`, { method: 'DELETE' });
    await refetch();
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <FilterIcon size={17} />
          </div>
          <h2 className="mt-3 text-[16px] font-semibold">Rules</h2>
          <p className="mt-1 text-[13px] text-ink-muted dark:text-dark-muted">
            Applied in order to every incoming message. First match wins if the actions include Discard.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={13} /> New rule
        </button>
      </div>
      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      <div className="mt-4">
        {loading && rows.length === 0 && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {!loading && rows.length === 0 && !creating && (
          <EmptyState icon={<FilterIcon size={22} />} title="No filters yet" description="Create your first rule to auto-file, flag, or delete incoming mail." />
        )}
        {rows.length > 0 && (
          <ul className="grid gap-2">
            {rows.map((f, i) => (
              <li key={f.id} className="rounded-xl border border-surface-border p-3 flex items-start gap-3 dark:border-dark-border">
                <div className="flex flex-col gap-0.5 pt-1">
                  <button aria-label="Move up" onClick={() => void move(i, -1)} disabled={i === 0} className="text-ink-muted hover:text-ink disabled:opacity-30">
                    <ArrowUp size={13} />
                  </button>
                  <button aria-label="Move down" onClick={() => void move(i, +1)} disabled={i === rows.length - 1} className="text-ink-muted hover:text-ink disabled:opacity-30">
                    <ArrowDown size={13} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <button onClick={() => setEditing(f)} className="text-[14px] font-semibold text-ink hover:underline dark:text-dark-text truncate text-left">
                    {f.name}
                    {!f.active && <span className="ml-2 text-[10.5px] uppercase tracking-wider text-state-warning">disabled</span>}
                  </button>
                  <p className="mt-0.5 text-[12.5px] text-ink-muted dark:text-dark-muted">
                    {summariseFilter(f)}
                  </p>
                </div>
                <button
                  onClick={() => void toggleActive(f)}
                  aria-label={f.active ? 'Disable rule' : 'Enable rule'}
                  className="text-ink-muted hover:text-ink"
                  title={f.active ? 'Disable' : 'Enable'}
                >
                  {f.active ? <PowerOff size={15} /> : <Power size={15} className="text-brand" />}
                </button>
                <button aria-label="Delete rule" onClick={() => void del(f)} className="text-ink-muted hover:text-state-danger">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(creating || editing) && (
        <FilterEditorModal
          initial={editing ?? null}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={async () => { setEditing(null); setCreating(false); await refetch(); }}
        />
      )}
    </div>
  );
}

function FilterEditorModal({
  initial, onClose, onSaved,
}: {
  initial: Filter | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}): JSX.Element {
  const [name, setName] = useState(initial?.name ?? 'New rule');
  const [active, setActive] = useState(initial?.active ?? true);
  const [matchType, setMatchType] = useState<'all' | 'any'>(initial?.matchType ?? 'all');
  const [conditions, setConditions] = useState<Condition[]>(
    initial?.conditions?.length ? initial.conditions : [{ field: 'from', op: 'contains', value: '' }],
  );
  const [actions, setActions] = useState<Action[]>(
    initial?.actions?.length ? initial.actions : [{ kind: 'move', target: 'INBOX/Filtered' }],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload = { name, active, matchType, conditions, actions };
      if (initial) {
        await api(`/v1/filters/${initial.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/v1/filters', { method: 'POST', body: JSON.stringify(payload) });
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit rule' : 'New rule'}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">Cancel</button>
          <button type="submit" form="filter-form" disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
            {busy && <Loader2 className="animate-spin" size={13} />} {initial ? 'Save' : 'Create rule'}
          </button>
        </>
      }
    >
      <form id="filter-form" onSubmit={submit} className="space-y-4">
        {err && <div className="rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">{err}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Name</span>
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </label>
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-brand" />
            <span className="text-[13px]">Rule active</span>
          </label>
        </div>

        <fieldset>
          <legend className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
            Match
            <select value={matchType} onChange={(e) => setMatchType(e.target.value as 'all' | 'any')} className="ml-2 h-6 rounded border border-surface-border bg-white px-1.5 text-[12px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
              <option value="all">all conditions</option>
              <option value="any">any condition</option>
            </select>
          </legend>
          <div className="grid gap-2">
            {conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-[110px_120px_1fr_auto] gap-2 items-center">
                <select value={c.field} onChange={(e) => updateAt(conditions, setConditions, i, { field: e.target.value as Condition['field'] })} className="h-9 rounded-lg border border-surface-border bg-white px-2 text-[13px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
                  <option value="from">From</option>
                  <option value="to">To</option>
                  <option value="subject">Subject</option>
                  <option value="body">Body</option>
                  <option value="any">Any header</option>
                </select>
                <select value={c.op} onChange={(e) => updateAt(conditions, setConditions, i, { op: e.target.value as Condition['op'] })} className="h-9 rounded-lg border border-surface-border bg-white px-2 text-[13px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
                  <option value="contains">contains</option>
                  <option value="is">is exactly</option>
                  <option value="matches">matches regex</option>
                </select>
                <input value={c.value} onChange={(e) => updateAt(conditions, setConditions, i, { value: e.target.value })} placeholder="Value…" className="h-9 rounded-lg border border-surface-border bg-white px-3 text-[13px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
                <button type="button" aria-label="Remove condition" onClick={() => setConditions((c2) => c2.length > 1 ? c2.filter((_, j) => j !== i) : c2)} className="text-ink-muted hover:text-state-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setConditions([...conditions, { field: 'from', op: 'contains', value: '' }])} className="text-[12px] text-brand-700 hover:underline self-start">
              + Add condition
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Do</legend>
          <div className="grid gap-2">
            {actions.map((a, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_auto] gap-2 items-center">
                <select value={a.kind} onChange={(e) => updateAt(actions, setActions, i, { kind: e.target.value as Action['kind'] })} className="h-9 rounded-lg border border-surface-border bg-white px-2 text-[13px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border">
                  <option value="move">Move to folder</option>
                  <option value="copy">Copy to folder</option>
                  <option value="flag">Add flag</option>
                  <option value="markRead">Mark as read</option>
                  <option value="discard">Discard (delete)</option>
                </select>
                {(a.kind === 'move' || a.kind === 'copy') && (
                  <input value={a.target ?? ''} onChange={(e) => updateAt(actions, setActions, i, { target: e.target.value })} placeholder="Folder name (e.g. Receipts)" className="h-9 rounded-lg border border-surface-border bg-white px-3 text-[13px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
                )}
                {a.kind === 'flag' && (
                  <input value={a.target ?? '\\Flagged'} onChange={(e) => updateAt(actions, setActions, i, { target: e.target.value })} placeholder="\\Flagged" className="h-9 rounded-lg border border-surface-border bg-white px-3 text-[13px] font-mono outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
                )}
                {(a.kind === 'markRead' || a.kind === 'discard') && <div />}
                <button type="button" aria-label="Remove action" onClick={() => setActions((c2) => c2.length > 1 ? c2.filter((_, j) => j !== i) : c2)} className="text-ink-muted hover:text-state-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setActions([...actions, { kind: 'move', target: '' }])} className="text-[12px] text-brand-700 hover:underline self-start">
              + Add action
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

/* ─── Auto-reply card ─────────────────────────────────────────── */

function AutoReplyCard(): JSX.Element {
  const { data, refetch, loading } = useResource<AutoReply>('/v1/auto-reply');
  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState('Out of office');
  const [body, setBody] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setSubject(data.subject);
    setBody(data.body ?? '');
    setStartDate(data.startDate ? data.startDate.slice(0, 10) : '');
    setEndDate(data.endDate ? data.endDate.slice(0, 10) : '');
  }, [data]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await api('/v1/auto-reply', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          subject,
          body,
          startDate: startDate ? new Date(startDate + 'T00:00:00Z').toISOString() : null,
          endDate: endDate ? new Date(endDate + 'T23:59:59Z').toISOString() : null,
        }),
      });
      setOk(enabled ? 'Auto-reply enabled' : 'Auto-reply saved (disabled)');
      setTimeout(() => setOk(null), 3000);
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-start justify-between">
        <div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Umbrella size={17} />
          </div>
          <h2 className="mt-3 text-[16px] font-semibold">Auto-reply</h2>
          <p className="mt-1 text-[13px] text-ink-muted dark:text-dark-muted">
            Sent server-side via Sieve's vacation extension — anti-loop, one reply per sender per week.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-brand" />
          Enabled
        </label>
      </div>
      {loading && !data && <p className="mt-4 text-[13px] text-ink-muted">Loading…</p>}
      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      {ok && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
          <CheckCircle2 size={14} className="mt-0.5 text-brand" /> {ok}
        </div>
      )}
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Start date (optional)</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </label>
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">End date (optional)</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </label>
        </div>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Subject</span>
          <input required maxLength={240} value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Body</span>
          <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="I'm currently away and will reply on my return. For urgent matters please contact…" className="w-full rounded-lg border border-surface-border bg-white p-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <div className="flex items-center justify-end gap-2">
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
            {busy && <Loader2 className="animate-spin" size={13} />} Save
          </button>
        </div>
        <p className="text-[11.5px] text-ink-muted dark:text-dark-muted">
          <PenLine size={11} className="inline mr-1" />
          Auto-reply is deployed to Dovecot Sieve when saved. Mailing lists and system-generated
          messages are skipped automatically.
        </p>
      </form>
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────── */

function summariseFilter(f: Filter): string {
  const cond = f.conditions
    .map((c) => `${c.field} ${c.op} "${c.value}"`)
    .join(f.matchType === 'any' ? ' OR ' : ' AND ');
  const act = f.actions
    .map((a) => {
      if (a.kind === 'move') return `move to ${a.target}`;
      if (a.kind === 'copy') return `copy to ${a.target}`;
      if (a.kind === 'flag') return `flag ${a.target ?? 'Flagged'}`;
      if (a.kind === 'markRead') return 'mark read';
      return 'discard';
    })
    .join(' + ');
  return `If ${cond} → ${act}`;
}
function updateAt<T>(arr: T[], set: (v: T[]) => void, i: number, patch: Partial<T>): void {
  const next = [...arr];
  next[i] = { ...next[i], ...patch } as T;
  set(next);
}
