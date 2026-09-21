import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { api, ApiError } from '@/lib/apiClient';

/**
 * Password reset request. The backend endpoint /v1/auth/forgot always
 * responds 202 to avoid leaking which addresses exist. Password reset via
 * emailed token is wired server-side in Phase 3.5 (SMTP relays live mail
 * once the mail stack is up on the server).
 */
export function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api('/v1/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuthRefresh: true,
      });
      setState('sent');
    } catch (err) {
      // We intentionally still show "check your inbox" — but if the endpoint
      // isn't wired yet (404), we show a clear placeholder.
      if (err instanceof ApiError && err.status === 404) {
        setError('Password reset via email is available once the mail server is live on your domain.');
        setState('idle');
        return;
      }
      setState('sent');
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send a link to your email if the account exists."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Back to sign in
          </Link>
        </>
      }
    >
      {state === 'sent' ? (
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-5 text-[14px] text-brand-800 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-200">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <p className="font-semibold">Check your inbox</p>
              <p className="mt-1 text-[13px] text-brand-800/90 dark:text-brand-200/90">
                If <span className="font-mono">{email}</span> matches a Cloud Mail account, you'll receive a
                reset link shortly.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-state-warning/30 bg-state-warning-soft px-3 py-2.5 text-[13px] text-state-warning">
              {error}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 rounded-lg border border-surface-border bg-white px-3.5 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
            />
          </label>
          <button
            type="submit"
            disabled={state === 'sending'}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            {state === 'sending' && <Loader2 size={16} className="animate-spin" />}
            Send reset link
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
