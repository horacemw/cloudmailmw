import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { useAuthStore } from '@/store/useAuthStore';

export function LoginPage(): JSX.Element {
  const login = useAuthStore((s) => s.login);
  const submitMfa = useAuthStore((s) => s.submitMfa);
  const cancelMfa = useAuthStore((s) => s.cancelMfa);
  const mfaChallenge = useAuthStore((s) => s.mfaChallenge);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  const finishLogin = (): void => {
    const redirect = (location.state as { from?: string } | null)?.from ?? '/mail';
    navigate(redirect, { replace: true });
  };

  const handle = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      const r = await login(email, password);
      if (!r.needsMfa) finishLogin();
    } catch {
      /* error already surfaced via store */
    }
  };

  const handleMfa = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      await submitMfa(mfaCode);
      finishLogin();
    } catch {
      /* surfaced */
    }
  };

  if (mfaChallenge) {
    return (
      <AuthLayout
        title="Two-factor verification"
        subtitle="Enter the 6-digit code from your authenticator app, or a recovery code."
        footer={
          <>
            <button type="button" onClick={cancelMfa} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Cancel and sign in as another user
            </button>
          </>
        }
      >
        <form onSubmit={handleMfa} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2.5 text-[13px] text-state-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <div className="flex-1">{error}</div>
              <button type="button" aria-label="Dismiss" className="opacity-70 hover:opacity-100" onClick={clearError}>×</button>
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
              Code
            </span>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={20}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.trim())}
              placeholder="123456"
              className="w-full h-12 rounded-lg border border-surface-border bg-white px-4 text-[18px] tracking-[0.4em] font-mono outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
            />
          </label>
          <button
            type="submit"
            disabled={loading || mfaCode.length < 6}
            className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={15} />}
            Verify + continue
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Cloud Mail workspace."
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handle} className="space-y-4" noValidate>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2.5 text-[13px] text-state-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button type="button" aria-label="Dismiss" className="opacity-70 hover:opacity-100" onClick={clearError}>
              ×
            </button>
          </div>
        )}
        <Field label="Email">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-11 rounded-lg border border-surface-border bg-white px-3.5 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
          />
        </Field>
        <Field
          label="Password"
          trailing={
            <Link to="/forgot" className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-300">
              Forgot?
            </Link>
          }
        >
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              minLength={1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 rounded-lg border border-surface-border bg-white pl-3.5 pr-10 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink dark:text-dark-muted"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={15} />}
          Sign in
        </button>
      </form>
    </AuthLayout>
  );
}

function Field({
  label,
  children,
  trailing,
}: {
  label: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
        {label}
        {trailing}
      </span>
      {children}
    </label>
  );
}
