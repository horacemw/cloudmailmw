import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Download,
  Globe2,
  KeyRound,
  Mail,
  MailCheck,
  Server,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/ui/Logo';

/**
 * Public landing page for Cloud Mail — no marketing fluff about features that
 * don't exist. Everything here maps to something already built or actively
 * being built in Phase 2/3.
 */
export function LandingPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-white text-ink dark:bg-dark-bg dark:text-dark-text">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-surface-border bg-white/90 backdrop-blur dark:bg-dark-panel/90 dark:border-dark-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 h-16">
          <Logo />
          <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-ink-muted dark:text-dark-muted">
            <a href="#features" className="hover:text-ink dark:hover:text-dark-text">Features</a>
            <a href="#how" className="hover:text-ink dark:hover:text-dark-text">How it works</a>
            <a href="#security" className="hover:text-ink dark:hover:text-dark-text">Security</a>
            <a href="#migration" className="hover:text-ink dark:hover:text-dark-text">Migrate</a>
            <a href="#clients" className="hover:text-ink dark:hover:text-dark-text">Mail clients</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/login"
              className="hidden md:inline-flex h-9 items-center px-3 text-[12.5px] font-medium text-ink-faint hover:text-ink-muted dark:text-dark-faint dark:hover:text-dark-muted"
              title="MailCloud platform administrator sign-in"
            >
              Platform admin
            </Link>
            <Link
              to="/login"
              className="hidden sm:inline-flex h-9 items-center px-4 text-[13.5px] font-medium text-ink-muted hover:text-ink dark:text-dark-muted dark:hover:text-dark-text"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600"
            >
              Get started <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 items-center">
            {/* Text column — left */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[12.5px] font-medium text-brand-700 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-300">
                <Sparkles size={13} /> Cloud Mail — professional email hosting
              </div>
              <h1 className="mt-6 text-[40px] sm:text-[54px] lg:text-[62px] leading-[1.02] font-bold tracking-tight text-ink dark:text-dark-text">
                Your email.
                <br />
                <span className="text-brand-700 dark:text-brand-300">Anywhere.</span>
              </h1>
              <p className="mt-5 max-w-xl mx-auto lg:mx-0 text-[16.5px] leading-relaxed text-ink-muted dark:text-dark-muted">
                Cloud Mail is a modern, standards-based email hosting platform for organisations
                that want their own domain, real mailboxes, and full control over their inbox —
                without the enterprise overhead.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3">
                <Link
                  to="/signup"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white shadow-card hover:bg-brand-600"
                >
                  Create your workspace <ArrowRight size={16} />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-surface-border bg-white px-6 text-[15px] font-semibold text-ink hover:bg-surface-hover dark:bg-dark-card dark:border-dark-border dark:text-dark-text dark:hover:bg-dark-hover"
                >
                  Sign in to my mailbox
                </Link>
              </div>
              <p className="mt-4 text-[12.5px] text-ink-faint dark:text-dark-faint">
                Same sign-in for mailbox users and organisation admins — your role is detected after
                login. <Link to="/admin/login" className="underline hover:text-ink-muted dark:hover:text-dark-muted">Platform administrator?</Link>
              </p>
            </div>

            {/* Image column — right */}
            <div className="relative">
              {/*
                Aspect ratio is preserved by `aspect-[16/9]` on the box; the
                image fills the box with object-cover, positioned to keep the
                laptop + phone composition visible.
                On mobile the image sits below the text (grid stacks) — no
                overlap, no laptop hiding the headline.
              */}
              <div className="relative w-full aspect-[16/9] sm:aspect-[16/8] lg:aspect-auto lg:h-[460px] xl:h-[520px]">
                <img
                  src="/hero.png"
                  alt=""
                  aria-hidden="true"
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-center lg:object-[center_right] rounded-3xl lg:rounded-none lg:rounded-l-[2rem]"
                />
                {/* Soft edge so the image blends into the page on desktop only */}
                <div
                  aria-hidden
                  className="hidden lg:block pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent dark:from-dark-bg"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 -bottom-16 h-64 bg-gradient-to-t from-transparent via-brand-50/60 to-transparent dark:via-brand-900/10" />
      </section>

      {/* Features grid */}
      <section id="features" className="border-t border-surface-border dark:border-dark-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <SectionHeading
            eyebrow="Everything you need"
            title="Professional email, without the friction"
            body="Everything a small team, NGO, or growing business needs to run email properly on their own domain."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<Globe2 size={18} />} title="Bring your own domain" body="Add example.com, ngo.mw, company.org — anything you already own. Cloud Mail walks you through the DNS." />
            <Feature icon={<MailCheck size={18} />} title="Real mailboxes" body="Not aliases pretending to be email. Real IMAP/SMTP mailboxes backed by Postfix and Dovecot." />
            <Feature icon={<ShieldCheck size={18} />} title="SPF, DKIM &amp; DMARC" body="Per-domain DKIM keys and clear DNS instructions so your mail actually reaches the inbox." />
            <Feature icon={<Cloud size={18} />} title="Clean, fast webmail" body="A modern reading experience with folders, search, filters, drafts, attachments and keyboard shortcuts." />
            <Feature icon={<Server size={18} />} title="Outlook and mobile" body="Standard IMAP + SMTP over TLS. Outlook, Thunderbird, Apple Mail, iPhone and Android all just work." />
            <Feature icon={<Upload size={18} />} title="Import your old email" body="Bring in Gmail, Microsoft 365 or any IMAP mailbox. Folders, attachments and dates preserved." />
            <Feature icon={<Download size={18} />} title="Export whenever you want" body="MBOX or ZIP-of-EML exports of any mailbox or folder. Your data isn't held hostage." />
            <Feature icon={<Users size={18} />} title="Multi-tenant by design" body="Each organisation is isolated end-to-end. Owner, admin and member roles enforced server-side." />
            <Feature icon={<KeyRound size={18} />} title="API access" body="Every dashboard action has an equivalent scoped API. Integrate Cloud Mail with your own tools." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-panel">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <SectionHeading
            eyebrow="How it works"
            title="Live email in four steps"
            body="No enterprise sales call. No 30-page onboarding PDF."
          />
          <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <Step n={1} title="Create your workspace" body="Sign up in under a minute. Your organisation is created automatically." />
            <Step n={2} title="Add your domain" body="Add example.com. Cloud Mail generates the exact DNS records you need." />
            <Step n={3} title="Publish DNS + verify" body="Copy the MX, SPF and DKIM records into your DNS. Cloud Mail checks them for you." />
            <Step n={4} title="Create mailboxes and go" body="Create info@, admin@, sales@ — log in via webmail, Outlook or your phone." />
          </ol>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-t border-surface-border dark:border-dark-border">
        <div className="mx-auto max-w-6xl px-5 py-20 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <ShieldCheck size={20} />
            </div>
            <h3 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">
              Security is not a marketing bullet — it's the foundation.
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted dark:text-dark-muted">
              Argon2id password hashing. Rotating refresh tokens with theft detection.
              TLS on every port. Per-mailbox and per-tenant rate limits. Rspamd + ClamAV
              on inbound. Anti-open-relay controls. Tenant isolation enforced at the query layer.
            </p>
          </div>
          <ul className="grid gap-3">
            {[
              'TLS 1.2+ across IMAP, SMTP, HTTPS',
              'Per-domain DKIM keys, never a shared platform key',
              'Encrypted at rest for migration credentials',
              'Detailed audit log for every admin action',
              'Rate limiting + brute-force protection on login',
              'Snapshot + backup ready',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 rounded-lg border border-surface-border p-3 text-[13.5px] dark:border-dark-border">
                <CheckCircle2 size={16} className="text-brand mt-0.5 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Migration */}
      <section id="migration" className="border-t border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-panel">
        <div className="mx-auto max-w-6xl px-5 py-20 grid gap-10 md:grid-cols-2 items-center">
          <div className="order-2 md:order-1">
            <ul className="grid gap-3">
              {[
                { t: 'Gmail / Google Workspace', d: 'Connect via IMAP, we handle the rest.' },
                { t: 'Outlook / Microsoft 365', d: 'Standard IMAP migration.' },
                { t: 'Any IMAP provider', d: 'If it speaks IMAP, we can migrate from it.' },
              ].map((m) => (
                <li key={m.t} className="rounded-lg border border-surface-border p-4 dark:border-dark-border">
                  <p className="text-[14px] font-semibold">{m.t}</p>
                  <p className="text-[13px] text-ink-muted dark:text-dark-muted">{m.d}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <Upload size={20} />
            </div>
            <h3 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">
              Bring years of email with you.
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted dark:text-dark-muted">
              Cloud Mail includes a background migration engine that preserves folders,
              dates, senders, attachments, and read state. Pause and resume any time —
              your credentials never touch our logs and are wiped when the job finishes.
            </p>
          </div>
        </div>
      </section>

      {/* Clients */}
      <section id="clients" className="border-t border-surface-border dark:border-dark-border">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <SectionHeading
            eyebrow="Works with your clients"
            title="Outlook, Thunderbird, Apple Mail, mobile — all supported."
            body="Every mailbox exposes IMAPS on 993 and STARTTLS SMTP submission on 587. Standard, boring, reliable."
          />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[13px] text-ink-muted dark:text-dark-muted">
            {['Outlook', 'Thunderbird', 'Apple Mail', 'iPhone / iPad Mail', 'Android Mail', 'Any IMAP client'].map((c) => (
              <span key={c} className="rounded-full border border-surface-border bg-white px-3 py-1.5 dark:bg-dark-card dark:border-dark-border">{c}</span>
            ))}
          </div>
          <p className="mt-6 text-[12.5px] text-ink-faint dark:text-dark-faint">
            Cloud Mail is standards-based IMAP/SMTP hosting. It does not provide Microsoft Exchange or ActiveSync.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-surface-border dark:border-dark-border bg-brand text-white">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h3 className="text-[28px] sm:text-[34px] font-semibold tracking-tight">
            Ready to run your own email properly?
          </h3>
          <p className="mt-3 text-[15.5px] text-white/85">
            Create your Cloud Mail workspace in under a minute.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-brand-700 hover:bg-brand-50"
            >
              Get started <ArrowRight size={16} />
            </Link>
            <Link
              to="/login"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/40 px-6 text-[15px] font-semibold text-white hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-border dark:border-dark-border">
        <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col md:flex-row gap-6 items-center md:items-end justify-between">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div className="leading-tight">
              <div className="text-[14px] font-bold">Cloud Mail</div>
              <div className="text-[11.5px] text-ink-muted dark:text-dark-muted">Your Email. Anywhere.</div>
            </div>
          </div>
          <div className="text-[12.5px] text-ink-muted dark:text-dark-muted flex flex-wrap gap-x-5 gap-y-2 items-center">
            <span>&copy; {new Date().getFullYear()} Cloud Mail</span>
            <Link to="/login" className="hover:text-ink dark:hover:text-dark-text">Sign in</Link>
            <Link to="/admin/login" className="hover:text-ink dark:hover:text-dark-text">Platform admin</Link>
            <a href="mailto:hello@digiskills.live" className="inline-flex items-center gap-1 hover:text-ink dark:hover:text-dark-text"><Mail size={12}/> hello@digiskills.live</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── small components ───────────────────────────────────────────── */

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}): JSX.Element {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-[30px] sm:text-[36px] font-semibold leading-tight tracking-tight text-ink dark:text-dark-text">
        {title}
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted dark:text-dark-muted">
        {body}
      </p>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-surface-border p-5 hover:border-brand-300 transition-colors dark:border-dark-border">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        {icon}
      </div>
      <h4 className="mt-3 text-[15px] font-semibold text-ink dark:text-dark-text">{title}</h4>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted dark:text-dark-muted">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }): JSX.Element {
  return (
    <li className="rounded-2xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white font-semibold text-[13px]">
        {n}
      </div>
      <h4 className="mt-3 text-[15px] font-semibold text-ink dark:text-dark-text">{title}</h4>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted dark:text-dark-muted">{body}</p>
    </li>
  );
}
