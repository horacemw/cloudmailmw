import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Copy, KeyRound, Loader2, MonitorSmartphone, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { api, ApiError } from '@/lib/apiClient';
import { useResource, useClipboard } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
interface MfaState { enabled: boolean; enrollmentPending: boolean; recoveryCodesRemaining: number }

const SCOPE_OPTIONS = [
  { v: 'mail.read', d: 'Read messages and folders' },
  { v: 'mail.send', d: 'Send outgoing mail' },
  { v: 'contacts.read', d: 'List contacts' },
  { v: 'contacts.write', d: 'Create/update contacts' },
  { v: 'mailboxes.read', d: 'List mailboxes' },
  { v: 'mailboxes.manage', d: 'Create/edit mailboxes' },
  { v: 'domains.read', d: 'List domains' },
];

export function SecurityPage(): JSX.Element {
  return (
    <>
      <PageHeader title="Security" description="Two-factor authentication, sessions, API keys." />
      <div className="p-6 grid gap-6 max-w-4xl">
        <MfaCard />
        <SessionsCard />
        <ApiKeysCard />
      </div>
    </>
  );
}

/* ─── MFA ─────────────────────────────────────────────────────── */

function MfaCard(): JSX.Element {
  const { data, refetch } = useResource<MfaState>('/v1/auth/mfa');
  const [openSetup, setOpenSetup] = useState(false);
  const [openDisable, setOpenDisable] = useState(false);
  const [openRegen, setOpenRegen] = useState(false);

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <ShieldCheck size={17} />
          </div>
          <h2 className="mt-3 text-[16px] font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-[13px] text-ink-muted dark:text-dark-muted">
            Use an authenticator app (Google Authenticator, 1Password, Authy, Bitwarden, Yubico) to
            protect your account with a time-based code.
          </p>
        </div>
        {data?.enabled ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpenRegen(true)}
              className="h-9 rounded-lg border border-surface-border px-3 text-[13px] font-semibold hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover"
            >
              Regenerate recovery codes
            </button>
            <button
              onClick={() => setOpenDisable(true)}
              className="h-9 rounded-lg border border-state-danger/40 text-state-danger px-3 text-[13px] font-semibold hover:bg-state-danger-soft"
            >
              Disable 2FA
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpenSetup(true)}
            className="h-9 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-600"
          >
            Enable 2FA
          </button>
        )}
      </div>
      {data?.enabled && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[12.5px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
          <CheckCircle2 size={14} className="text-brand" />
          2FA is active. {data.recoveryCodesRemaining} recovery codes remain.
        </div>
      )}
      {openSetup && <MfaSetupModal onClose={() => { setOpenSetup(false); void refetch(); }} />}
      {openDisable && <MfaDisableModal onClose={() => { setOpenDisable(false); void refetch(); }} />}
      {openRegen && <MfaRegenModal onClose={() => { setOpenRegen(false); void refetch(); }} />}
    </div>
  );
}

function MfaRegenModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const { copy, copied } = useClipboard();

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ recoveryCodes: string[] }>('/v1/auth/mfa/recovery-codes/regenerate', {
        method: 'POST',
        body: JSON.stringify({ password, code }),
      });
      setCodes(r.recoveryCodes);
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Regeneration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Regenerate recovery codes"
      description={codes ? 'Save your new recovery codes now.' : 'Confirm with your password and a current authenticator code. Previous recovery codes will stop working immediately.'}
    >
      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      {!codes && (
        <form onSubmit={submit} className="space-y-3">
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Password</span>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
          </label>
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Authenticator code</span>
            <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[15px] font-mono tracking-widest outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" placeholder="123456" />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
              {busy && <Loader2 className="animate-spin" size={13} />} Regenerate
            </button>
          </div>
        </form>
      )}
      {codes && (
        <div>
          <div className="grid grid-cols-2 gap-2">
            {codes.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-surface-border bg-white px-3 py-2 font-mono text-[13px] dark:bg-dark-card dark:border-dark-border">
                <span>{c}</span>
                <button onClick={() => copy(c, c)} className="opacity-60 hover:opacity-100"><Copy size={12} /></button>
                {copied === c && <span className="text-[10.5px] text-brand-700">copied</span>}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => copy(codes.join('\n'), 'all')} className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">
              {copied === 'all' ? 'Copied all' : 'Copy all codes'}
            </button>
            <button onClick={onClose} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600">I've saved them</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MfaSetupModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState<'loading' | 'scan' | 'verify' | 'done'>('loading');
  const [qr, setQr] = useState<{ dataUrl: string; base32: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const { copy, copied } = useClipboard();

  // Fire setup exactly once.
  useState(() => {
    (async () => {
      try {
        const r = await api<{ provisioningUri: string; qrPngDataUrl: string; base32: string }>(
          '/v1/auth/mfa/setup',
          { method: 'POST', body: '{}' },
        );
        setQr({ dataUrl: r.qrPngDataUrl, base32: r.base32, uri: r.provisioningUri });
        setStep('scan');
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : 'Setup failed');
      }
    })();
    return undefined;
  });

  const verify = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ recoveryCodes: string[] }>('/v1/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setRecoveryCodes(r.recoveryCodes);
      setStep('done');
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Enable two-factor authentication"
      size="lg"
      description={step === 'done' ? 'Save your recovery codes now.' : 'Scan the QR code in your authenticator app.'}
    >
      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      {step === 'loading' && <div className="flex items-center gap-2 py-6 text-[13px] text-ink-muted"><Loader2 className="animate-spin" size={14} /> Generating secret…</div>}
      {step === 'scan' && qr && (
        <form onSubmit={verify} className="grid gap-5 sm:grid-cols-[220px_1fr] items-start">
          <div className="flex flex-col items-center">
            <img src={qr.dataUrl} alt="TOTP QR code" width={220} height={220} className="rounded-lg border border-surface-border" />
            <p className="mt-2 text-[11px] text-ink-muted dark:text-dark-muted">Or type the secret:</p>
            <code className="mt-1 text-[11.5px] font-mono break-all text-center">{qr.base32}</code>
          </div>
          <div>
            <ol className="text-[13px] text-ink dark:text-dark-text space-y-2 list-decimal pl-5">
              <li>Open your authenticator app.</li>
              <li>Add a new account and scan the QR code.</li>
              <li>Type the 6-digit code from the app below.</li>
            </ol>
            <label className="mt-4 block">
              <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Verification code</span>
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full h-11 rounded-lg border border-surface-border bg-white px-3 text-[16px] tracking-widest font-mono outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
                placeholder="123456"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">Cancel</button>
              <button type="submit" disabled={busy || code.length !== 6} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
                {busy && <Loader2 className="animate-spin" size={13} />} Verify + activate
              </button>
            </div>
          </div>
        </form>
      )}
      {step === 'done' && (
        <div>
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
            2FA is now enabled. <strong>Store these one-time recovery codes somewhere safe</strong> — each can be used once to sign in if you lose access to your authenticator.
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {recoveryCodes.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-surface-border bg-white px-3 py-2 font-mono text-[13px] dark:bg-dark-card dark:border-dark-border">
                <span>{c}</span>
                <button onClick={() => copy(c, c)} className="opacity-60 hover:opacity-100">
                  <Copy size={12} />
                </button>
                {copied === c && <span className="text-[10.5px] text-brand-700">copied</span>}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => copy(recoveryCodes.join('\n'), 'all')}
              className="h-9 px-3 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border"
            >
              {copied === 'all' ? 'Copied all' : 'Copy all codes'}
            </button>
            <button onClick={onClose} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600">
              I've saved them
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MfaDisableModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/v1/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) });
      onClose();
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Disable failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Disable 2FA" description="Confirm with your password and a current authenticator code.">
      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
        </label>
        <label>
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Authenticator code</span>
          <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[15px] font-mono tracking-widest outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" placeholder="123456" />
        </label>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-surface-border text-[13px] hover:bg-surface-hover dark:border-dark-border">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-state-danger text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 className="animate-spin" size={13} />} Disable 2FA
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Sessions ────────────────────────────────────────────────── */

function SessionsCard(): JSX.Element {
  const { data, refetch, loading } = useResource<{ sessions: Session[] }>('/v1/sessions');
  const rows = data?.sessions ?? [];

  const revoke = async (id: string): Promise<void> => {
    await api(`/v1/sessions/${id}`, { method: 'DELETE' });
    await refetch();
  };
  const revokeAll = async (): Promise<void> => {
    await api('/v1/sessions/revoke-all', { method: 'POST', body: '{}' });
    await refetch();
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-start justify-between">
        <div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <MonitorSmartphone size={17} />
          </div>
          <h2 className="mt-3 text-[16px] font-semibold">Active sessions</h2>
          <p className="mt-1 text-[13px] text-ink-muted dark:text-dark-muted">Every browser/device where your account is signed in.</p>
        </div>
        {rows.length > 0 && (
          <button onClick={revokeAll} className="h-8 rounded-lg border border-surface-border px-3 text-[12.5px] hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover">Sign out everywhere</button>
        )}
      </div>
      <div className="mt-4">
        {loading && rows.length === 0 && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {!loading && rows.length === 0 && <p className="text-[13px] text-ink-muted dark:text-dark-muted">No active sessions.</p>}
        {rows.length > 0 && (
          <ul className="divide-y divide-surface-divider dark:divide-dark-divider">
            {rows.map((s) => (
              <li key={s.id} className="flex items-start justify-between py-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium truncate">{friendlyUA(s.userAgent)}</p>
                  <p className="text-[12px] text-ink-muted dark:text-dark-muted">
                    IP {s.ipAddress ?? 'unknown'} · signed in {relative(s.createdAt)} · expires {relative(s.expiresAt, true)}
                  </p>
                </div>
                <button onClick={() => revoke(s.id)} className="ml-3 inline-flex items-center gap-1 text-[12.5px] text-state-danger hover:underline">
                  <Trash2 size={12} /> Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── API keys ────────────────────────────────────────────────── */

function ApiKeysCard(): JSX.Element {
  const { data, refetch, loading } = useResource<{ keys: ApiKey[] }>('/v1/api-keys');
  const [creating, setCreating] = useState(false);
  const rows = data?.keys ?? [];

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <KeyRound size={17} />
          </div>
          <h2 className="mt-3 text-[16px] font-semibold">API keys</h2>
          <p className="mt-1 text-[13px] text-ink-muted dark:text-dark-muted">Programmatic access with least-privilege scopes.</p>
        </div>
        <button onClick={() => setCreating(true)} className="h-9 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-600">Create key</button>
      </div>
      {creating && <CreateKey onClose={() => setCreating(false)} onCreated={async () => { await refetch(); setCreating(false); }} />}
      <div className="mt-4">
        {loading && rows.length === 0 && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {!loading && rows.length === 0 && !creating && (
          <EmptyState icon={<KeyRound size={22} />} title="No API keys yet" description="Create one to call Cloud Mail from your own application." />
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-surface-divider dark:divide-dark-divider">
            {rows.map((k) => (
              <li key={k.id} className="flex items-start justify-between py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium">
                    {k.name}
                    {k.revokedAt && <span className="ml-2 text-[10.5px] uppercase tracking-wider text-state-danger">Revoked</span>}
                  </p>
                  <p className="text-[11.5px] text-ink-muted dark:text-dark-muted font-mono">{k.keyPrefix}…</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted dark:text-dark-muted">
                    Scopes: {k.scopes.join(', ')} · last used {k.lastUsedAt ? relative(k.lastUsedAt) : 'never'} · created {relative(k.createdAt)}
                  </p>
                </div>
                {!k.revokedAt && (
                  <button onClick={async () => { await api(`/v1/api-keys/${k.id}`, { method: 'DELETE' }); await refetch(); }} className="inline-flex items-center gap-1 text-[12.5px] text-state-danger hover:underline">
                    <Trash2 size={12} /> Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateKey({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }): JSX.Element {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['mail.read']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ secret: string; keyPrefix: string } | null>(null);
  const { copied, copy } = useClipboard();

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ secret: string; keyPrefix: string }>('/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name, scopes }),
      });
      setIssued({ secret: res.secret, keyPrefix: res.keyPrefix });
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Could not create key');
    } finally {
      setBusy(false);
    }
  };

  if (issued) {
    return (
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-900/40 dark:bg-brand-900/20">
        <div className="flex items-start gap-2">
          <ShieldCheck size={18} className="text-brand mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-brand-800 dark:text-brand-200">Key created — copy it now</p>
            <p className="text-[12.5px] text-brand-800/80 dark:text-brand-200/80 mt-0.5">Cloud Mail will never show this key again.</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-[13px] font-mono border border-brand-100 dark:bg-dark-card/70 dark:border-brand-900/40">
              <span className="flex-1 truncate">{issued.secret}</span>
              <button onClick={() => copy(issued.secret, 'sec')} className="opacity-70 hover:opacity-100"><Copy size={12} /></button>
              {copied === 'sec' && <span className="text-[10.5px]">copied</span>}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={async () => { await onCreated(); }} className="h-8 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-600">Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-surface-border p-4 bg-white dark:bg-dark-card dark:border-dark-border">
      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      <label>
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. CRM sync" className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text" />
      </label>
      <fieldset className="mt-3">
        <legend className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Scopes</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {SCOPE_OPTIONS.map((s) => (
            <label key={s.v} className="flex items-start gap-2 rounded-lg border border-surface-border p-2.5 text-[13px] dark:border-dark-border">
              <input type="checkbox" checked={scopes.includes(s.v)} onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s.v] : cur.filter((x) => x !== s.v)))} className="mt-0.5 accent-brand" />
              <span>
                <span className="font-mono text-[12px] block">{s.v}</span>
                <span className="text-[12px] text-ink-muted dark:text-dark-muted">{s.d}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-4 text-[13.5px] rounded-lg border border-surface-border hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-hover">Cancel</button>
        <button type="submit" disabled={busy || scopes.length === 0} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-[13.5px] font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {busy && <Loader2 size={13} className="animate-spin" />} Create key
        </button>
      </div>
    </form>
  );
}

/* ─── helpers ─────────────────────────────────────────────────── */

function friendlyUA(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/Chrome\/\d/.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return ua.slice(0, 80);
}
function relative(iso: string, isFuture = false): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = isFuture ? t - now : now - t;
  const s = Math.round(diffMs / 1000);
  if (s < 60) return isFuture ? `in ${s}s` : `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return isFuture ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return isFuture ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return isFuture ? `in ${d}d` : `${d}d ago`;
}
