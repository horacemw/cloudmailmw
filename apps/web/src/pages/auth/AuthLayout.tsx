import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

/**
 * Shared shell for /login and /signup — split panel design that stays legible
 * on mobile (right panel hides on small screens).
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}): JSX.Element {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white dark:bg-dark-bg">
      {/* Form */}
      <div className="flex flex-col px-6 sm:px-10 py-8">
        <Link to="/" className="inline-flex"><Logo /></Link>
        <div className="flex flex-1 flex-col justify-center max-w-md w-full mx-auto py-14">
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink dark:text-dark-text">
            {title}
          </h1>
          <p className="mt-2 text-[14px] text-ink-muted dark:text-dark-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-[13.5px] text-ink-muted dark:text-dark-muted">{footer}</div>}
        </div>
        <p className="text-[11.5px] text-ink-faint dark:text-dark-faint">
          &copy; {new Date().getFullYear()} Cloud Mail. Your email. Anywhere.
        </p>
      </div>

      {/* Marketing panel */}
      <div className="hidden lg:flex bg-brand-50 dark:bg-brand-900/10 border-l border-surface-border dark:border-dark-border items-center justify-center p-10">
        <div className="max-w-md">
          <div className="rounded-2xl border border-brand-100 bg-white shadow-card p-6 dark:bg-dark-card dark:border-dark-border">
            <p className="text-[13px] font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wider">
              Cloud Mail
            </p>
            <p className="mt-2 text-[18px] font-semibold text-ink dark:text-dark-text leading-snug">
              Real email, on your own domain, without the enterprise overhead.
            </p>
            <ul className="mt-5 space-y-2.5 text-[13.5px] text-ink dark:text-dark-text">
              {[
                'Bring any domain — example.com, ngo.mw, company.org',
                'Real IMAP/SMTP mailboxes, not aliases',
                'Outlook, Thunderbird and mobile just work',
                'Import from Gmail, Microsoft 365 or any IMAP',
                'Export whenever you want — MBOX / EML',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-6 text-[12.5px] text-ink-muted dark:text-dark-muted">
            Standards-based IMAP + SMTP on your own domain. No vendor lock-in — export MBOX/EML any time.
          </p>
        </div>
      </div>
    </div>
  );
}
