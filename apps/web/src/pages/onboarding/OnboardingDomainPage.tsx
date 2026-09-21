import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Globe2, MailPlus, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { Logo } from '@/components/ui/Logo';

/**
 * First-run page shown immediately after signup. Sets expectations for what
 * happens next: add a domain, verify DNS, create a mailbox, sign in.
 */
export function OnboardingDomainPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.activeTenant);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg text-ink dark:text-dark-text">
      <header className="border-b border-surface-border dark:border-dark-border px-6 py-5">
        <Logo />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[12.5px] font-medium text-brand-700 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-300">
          <Sparkles size={13} /> Welcome, {user?.name?.split(' ')[0] ?? 'there'}
        </div>
        <h1 className="mt-4 text-[30px] font-semibold tracking-tight">
          Let's set up <span className="text-brand-700 dark:text-brand-300">{tenant?.name ?? 'your workspace'}</span>
        </h1>
        <p className="mt-2 text-[15px] text-ink-muted dark:text-dark-muted">
          Four short steps and you'll be sending and receiving real email from Cloud Mail.
        </p>

        <ol className="mt-8 grid gap-3">
          <Step n={1} icon={<Globe2 size={16} />} title="Add your domain" body="e.g. example.com or your organisation's domain — the one you want mail on." />
          <Step n={2} icon={<CheckCircle2 size={16} />} title="Publish DNS + verify" body="Cloud Mail generates the exact MX, SPF and DKIM records. You copy them to your DNS provider." />
          <Step n={3} icon={<MailPlus size={16} />} title="Create your first mailbox" body="e.g. info@example.com, admin@example.com — with a password the mailbox owner will use." />
          <Step n={4} icon={<ArrowRight size={16} />} title="Log in and start emailing" body="Open Cloud Mail webmail, or plug the settings into Outlook / Thunderbird / mobile." />
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/dashboard/domains/new')}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600"
          >
            Add your first domain <ArrowRight size={16} />
          </button>
          <Link
            to="/dashboard"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-surface-border bg-white px-6 text-[15px] font-semibold text-ink hover:bg-surface-hover dark:bg-dark-card dark:border-dark-border dark:text-dark-text dark:hover:bg-dark-hover"
          >
            Skip for now
          </Link>
        </div>
      </main>
    </div>
  );
}

function Step({
  n, icon, title, body,
}: {
  n: number; icon: React.ReactNode; title: string; body: string;
}): JSX.Element {
  return (
    <li className="flex items-start gap-4 rounded-xl border border-surface-border bg-white p-4 dark:bg-dark-card dark:border-dark-border">
      <div className="h-9 w-9 rounded-full bg-brand text-white text-[13px] font-semibold inline-flex items-center justify-center shrink-0">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-2 text-[14.5px] font-semibold">
          <span className="text-brand-700 dark:text-brand-300">{icon}</span>{title}
        </p>
        <p className="mt-0.5 text-[13.5px] text-ink-muted dark:text-dark-muted">{body}</p>
      </div>
    </li>
  );
}
