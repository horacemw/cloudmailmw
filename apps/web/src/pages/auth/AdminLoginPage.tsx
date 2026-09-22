import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, LogIn, Shield, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { detectRole, homeForRole } from '@/lib/roleRouting';
import { Logo } from '@/components/ui/Logo';

/**
 * Dedicated login entry point for MailCloud platform administrators.
 *
 *   /admin/login
 *
 * Uses the SAME authentication endpoint as /login — one identity system,
 * no duplicate password database. After successful auth we check
 * user.isPlatformAdmin and either land the caller on /admin or bounce them
 * back with a clear "this login is for platform administrators only"
 * message plus an immediate logout. That keeps a customer who wandered
 * here from being seamlessly dropped into their own workspace via this
 * portal — the whole point is separation.
 *
 * The visual identity is distinct (dark surface, "Platform Administration"
 * badge, no marketing panel) so the operator immediately knows they are
 * in the admin flow, not the customer flow.
 */
export function AdminLoginPage(): JSX.Element {
  const login = useAuthStore((s) => s.login);
  const submitMfa = useAuthStore((s) => s.submitMfa);
  const cancelMfa = useAuthStore((s) => s.cancelMfa);
  const logout = useAuthStore((s) => s.logout);
  const mfaChallenge = useAuthStore((s) => s.mfaChallenge);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [wrongPortal, setWrongPortal] = useState(false);

  const finish = (): void => {
    const { user, tenants } = useAuthStore.getState();
    if (!user?.isPlatformAdmin) {
      // Auth succeeded but the identity isn't a platform admin. Log them
      // straight back out so they can't half-linger in the admin portal,
      // then show a message and offer a path to the customer login.
      void logout();
      setWrongPortal(true);
      return;
    }
    // Even if they're an admin, respect their most-appropriate landing —
    // but for admins that's always /admin.
    navigate(homeForRole(detectRole(user, tenants)), { replace: true });
  };

  const handleLogin = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setWrongPortal(false);
    try {
      const r = await login(email, password);
      if (!r.needsMfa) finish();
    } catch {
      /* surfaced */
    }
  };

  const handleMfa = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      await submitMfa(mfaCode);
      finish();
    } catch {
      /* surfaced */
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-6 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[12.5px] text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft size={13} /> MailCloud home
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
            <Shield size={11} /> Platform admin
          </span>
        </div>

        <div className="mb-6">
          <div className="mb-3 text-slate-100"><Logo /></div>
          <h1 className="text-[24px] font-semibold tracking-tight">
            Platform Administration
          </h1>
          <p className="mt-1.5 text-[13.5px] text-slate-400">
            Secure access for MailCloud platform administrators. This is not a
            customer mailbox login.
          </p>
        </div>

        {wrongPortal && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-200">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              This login is for MailCloud platform administrators only. You've
              been signed out. If you're a MailCloud customer, use the{' '}
              <Link to="/login" className="underline font-semibold">customer login</Link>.
            </div>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-200">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button type="button" aria-label="Dismiss" onClick={clearError} className="opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        {mfaChallenge ? (
          <form onSubmit={handleMfa} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                Authenticator code
              </label>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={20}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.trim())}
                placeholder="123456"
                className="w-full h-12 rounded-lg border border-slate-700 bg-slate-900 px-4 text-[18px] tracking-[0.4em] font-mono text-slate-100 outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="submit"
              disabled={loading || mfaCode.length < 6}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 text-[14.5px] font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={15} />}
              Verify + enter platform admin
            </button>
            <button
              type="button"
              onClick={() => cancelMfa()}
              className="w-full text-center text-[12.5px] text-slate-400 hover:text-slate-200"
            >
              Cancel and sign in as another user
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div>
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                Admin email
              </label>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3.5 text-[14px] text-slate-100 outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 pl-3.5 pr-10 text-[14px] text-slate-100 outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 text-[14.5px] font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={15} />}
              Sign in to platform admin
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-[12px] text-slate-500">
          MailCloud customer?{' '}
          <Link to="/login" className="text-slate-300 hover:text-slate-100 font-medium">
            Customer login →
          </Link>
        </p>
      </div>
    </div>
  );
}
