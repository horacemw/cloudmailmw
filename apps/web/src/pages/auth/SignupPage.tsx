import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, Eye, EyeOff, Loader2, Mail, User, UserPlus } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { useAuthStore } from '@/store/useAuthStore';

export function SignupPage(): JSX.Element {
  const signup = useAuthStore((s) => s.signup);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const strength = passwordStrength(password);

  const handle = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (strength.score < 2) return;
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    try {
      await signup({ email, password, name, organizationName });
      navigate('/onboarding/domain', { replace: true });
    } catch {
      /* surfaced via store */
    }
  };

  return (
    <AuthLayout
      title="Create your Cloud Mail workspace"
      subtitle="One account, one organisation, unlimited mailboxes across your domains."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handle} className="space-y-4" noValidate>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2.5 text-[13px] text-state-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button type="button" aria-label="Dismiss" className="opacity-70 hover:opacity-100" onClick={clearError}>×</button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <IconField label="First name" icon={<User size={15} />}>
            <input
              autoComplete="given-name"
              required
              maxLength={60}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="input-plain"
              placeholder="Amina"
            />
          </IconField>
          <IconField label="Last name" icon={<User size={15} />}>
            <input
              autoComplete="family-name"
              required
              maxLength={60}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="input-plain"
              placeholder="Kondowe"
            />
          </IconField>
        </div>
        <IconField label="Organisation" icon={<Building2 size={15} />}>
          <input
            required
            maxLength={120}
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            className="input-plain"
            placeholder="Future4All"
          />
        </IconField>
        <IconField label="Work email" icon={<Mail size={15} />}>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-plain"
            placeholder="you@yourcompany.com"
          />
        </IconField>
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-plain pr-10"
              placeholder="At least 10 characters"
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
          <StrengthMeter strength={strength} />
        </div>
        <p className="text-[11.5px] text-ink-muted dark:text-dark-muted">
          By creating an account you agree that your data will be stored on Cloud Mail infrastructure.
        </p>
        <button
          type="submit"
          disabled={loading || strength.score < 2}
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14.5px] font-semibold text-white shadow-card hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={15} />}
          Create workspace
        </button>
      </form>
      {/* utility class for consistent inputs */}
      <style>{`
        .input-plain {
          width: 100%;
          height: 2.75rem;
          border-radius: 0.5rem;
          border: 1px solid var(--tw-color-surface-border, #E5EAE7);
          background: #fff;
          padding-left: 0.875rem;
          padding-right: 0.875rem;
          font-size: 14px;
          outline: none;
        }
        html.dark .input-plain { background: #151D19; border-color:#232C27; color:#F2F7F4; }
        .input-plain:focus { border-color: #159447; }
      `}</style>
    </AuthLayout>
  );
}

function IconField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">
        {label}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted dark:text-dark-muted">
          {icon}
        </span>
        <span className="pl-8 block">
          {children}
        </span>
      </span>
    </label>
  );
}

function StrengthMeter({ strength }: { strength: ReturnType<typeof passwordStrength> }): JSX.Element {
  const bars = [1, 2, 3, 4];
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {bars.map((b) => (
          <div
            key={b}
            className={
              'h-1.5 flex-1 rounded-full ' +
              (b <= strength.score
                ? strength.score <= 1
                  ? 'bg-state-danger'
                  : strength.score === 2
                    ? 'bg-state-warning'
                    : 'bg-brand'
                : 'bg-surface-border dark:bg-dark-border')
            }
          />
        ))}
      </div>
      <p className={
        'mt-1 text-[11.5px] ' +
        (strength.score >= 3 ? 'text-brand-700 dark:text-brand-300' : 'text-ink-muted dark:text-dark-muted')
      }>
        {strength.label}
      </p>
    </div>
  );
}

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: 'Choose a strong password (10+ characters).' };
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const label = ['Too short', 'Weak', 'Okay — mix cases and digits', 'Good', 'Strong'][s]!;
  return { score: Math.min(4, s) as 0 | 1 | 2 | 3 | 4, label };
}
