import { Link } from 'react-router-dom';
import { AlertTriangle, Info, Loader2, MailPlus, ServerOff } from 'lucide-react';
import { useLiveMailStore } from '@/store/useLiveMailStore';

/**
 * Compact banner in the webmail top area explaining whether the user is
 * seeing real mail or demo/mock data, and what to do to move forward.
 * Non-intrusive: hidden entirely when in 'ready' mode.
 */
export function LiveStatusBanner(): JSX.Element | null {
  const mode = useLiveMailStore((s) => s.mode);
  const error = useLiveMailStore((s) => s.error);

  if (mode === 'ready') return null;

  if (mode === 'checking') {
    return (
      <Row tone="info" icon={<Loader2 size={14} className="animate-spin" />}>
        Connecting to your Cloud Mail mailbox…
      </Row>
    );
  }

  if (mode === 'no-mailbox') {
    return (
      <Row tone="info" icon={<Info size={14} />}>
        <span>
          You're browsing a <strong>demo inbox</strong>. Add a domain and create a mailbox to see real mail.
        </span>
        <Link
          to="/dashboard/domains/new"
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-brand-600"
        >
          <MailPlus size={12} /> Set up
        </Link>
      </Row>
    );
  }

  return (
    <Row tone="warning" icon={<ServerOff size={14} />}>
      <span>
        Cloud Mail mail server not yet reachable{error ? ` (${error})` : ''}. Showing demo data until it comes online.
      </span>
    </Row>
  );
}

function Row({
  tone,
  icon,
  children,
}: {
  tone: 'info' | 'warning';
  icon: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  const cls =
    tone === 'warning'
      ? 'border-state-warning/30 bg-state-warning-soft text-state-warning'
      : 'border-brand-100 bg-brand-50 text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200';
  return (
    <div
      className={
        'flex items-center gap-2 px-4 py-1.5 text-[12.5px] border-b ' + cls
      }
    >
      <span className="shrink-0">{tone === 'warning' ? <AlertTriangle size={14} /> : icon}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">{children}</div>
    </div>
  );
}
