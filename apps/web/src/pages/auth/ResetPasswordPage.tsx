import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { api, ApiError } from '@/lib/apiClient';

/**
 * Landing page for the reset link emailed from /v1/auth/forgot.
 * URL: /reset?token=<opaque>&uid=<userId>
 */
export function ResetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const uid = params.get('uid') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [missingParams, setMissingParams] = useState(false);

  useEffect(() => {
    if (!token || !uid) setMissingParams(true);
  }, [token, uid]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    setError(null);
    setState('submitting');
    try {
      await api('/v1/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ userId: uid, token, password }),
        skipAuthRefresh: true,
      });
      setState('done');
      window.setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? 'This reset link is invalid or has expired. Request a new one.'
            : err.message
          : 'Could not reset password. Please try again.';
      setError(msg);
      setState('idle');
    }
  };

  if (missingParams) {
    return (
      <AuthLayout
        title="Reset link is incomplete"
        subtitle="Open the reset email again — the full URL is required."
        footer={
          <Link to="/forgot" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Request a new link
          </Link>
        }
      >
        <div className="rounded-xl border border-state-warning/30 bg-state-warning-soft p-4 text-[13.5px] text-state-warning">
          <AlertCircle size={16} className="inline mr-1" />
          The link is missing the reset token. Copy and paste the full URL from the email, or start over.
        </div>
      </AuthLayout>
    );
  }

  if (state === 'done') {
    return (
      <AuthLayout title="Password updated" subtitle="Redirecting you to sign in…" footer={null}>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-5 text-[14px] text-brand-800 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-200">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" />
            <p>Your password has been changed. All other sessions have been signed out.</p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick a strong password you don't use elsewhere."
      footer={
        <>
          Changed your mind?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2.5 text-[13px] text-state-danger">
            <AlertCircle size={14} className="inline mr-1" /> {error}
          </div>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
            New password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-11 rounded-lg border border-surface-border bg-white px-3.5 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
          />
          <span className="mt-1 block text-[11.5px] text-ink-faint dark:text-dark-faint">
            At least 10 characters.
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
            Confirm new password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full h-11 rounded-lg border border-surface-border bg-white px-3.5 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
          />
        </label>
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
        >
          {state === 'submitting' && <Loader2 size={16} className="animate-spin" />}
          Reset password
        </button>
      </form>
    </AuthLayout>
  );
}
