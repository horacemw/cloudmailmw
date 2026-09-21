import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Calendar as CalendarIcon,
  Contact2,
  Download,
  Filter as FilterIcon,
  Globe2,
  LogOut,
  Mail,
  MailPlus,
  PenLine,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';

/**
 * Persistent shell around every customer dashboard page. Nav on the left,
 * account switcher + sign out in the top-right.
 */
const NAV = [
  { to: '/dashboard/domains', label: 'Domains', icon: Globe2 },
  { to: '/dashboard/mailboxes', label: 'Mailboxes', icon: MailPlus },
  { to: '/dashboard/contacts', label: 'Contacts', icon: Contact2 },
  { to: '/dashboard/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/dashboard/signatures', label: 'Signatures', icon: PenLine },
  { to: '/dashboard/rules', label: 'Rules', icon: FilterIcon },
  { to: '/dashboard/migrations', label: 'Migrations', icon: ArrowLeftRight },
  { to: '/dashboard/exports', label: 'Exports', icon: Download },
  { to: '/dashboard/security', label: 'Security', icon: ShieldCheck },
];

export function DashboardShell(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const activeTenant = useAuthStore((s) => s.activeTenant);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface-bg dark:bg-dark-bg text-ink dark:text-dark-text">
      <div className="grid lg:grid-cols-[240px_1fr] min-h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col border-r border-surface-border dark:border-dark-border bg-white dark:bg-dark-panel">
          <div className="p-5"><Logo /></div>
          <nav className="px-3 space-y-0.5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 h-10 rounded-lg text-[13.5px] transition-colors',
                    isActive
                      ? 'bg-brand-100 text-brand-700 font-semibold dark:bg-brand-900/40 dark:text-brand-200'
                      : 'text-ink hover:bg-surface-hover dark:text-dark-text dark:hover:bg-dark-hover',
                  )
                }
              >
                <n.icon size={16} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto p-4 space-y-2">
            <NavLink
              to="/mail"
              className="flex items-center gap-2 h-10 rounded-lg border border-brand-200 bg-brand-50 px-3 text-[13.5px] font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-300"
            >
              <Mail size={15} /> Open webmail
            </NavLink>
          </div>
        </aside>

        {/* Main */}
        <div className="flex flex-col min-h-0">
          <header className="flex items-center gap-3 h-16 px-5 border-b border-surface-border dark:border-dark-border bg-white/95 backdrop-blur dark:bg-dark-panel/95">
            <div className="lg:hidden"><LogoMark size={28} /></div>
            <div className="text-[12.5px] font-semibold text-ink-muted dark:text-dark-muted">
              {activeTenant?.name ?? 'Cloud Mail'}
              {activeTenant && (
                <span className="ml-2 rounded-full bg-surface-hover dark:bg-dark-hover px-2 py-0.5 text-[10.5px] uppercase tracking-wider">
                  {activeTenant.role}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2">
                <Avatar name={user?.name ?? '?'} email={user?.email ?? ''} size="md" />
                <div className="leading-tight">
                  <div className="text-[12.5px] font-semibold">{user?.name}</div>
                  <div className="text-[11px] text-ink-muted dark:text-dark-muted">{user?.email}</div>
                </div>
              </div>
              <button
                onClick={() => handleLogout()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12.5px] text-ink-muted hover:bg-surface-hover hover:text-ink dark:text-dark-muted dark:hover:bg-dark-hover dark:hover:text-dark-text"
                title="Sign out"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </header>
          {/* Mobile bottom nav */}
          <nav className="lg:hidden order-last fixed bottom-0 inset-x-0 z-30 border-t border-surface-border dark:border-dark-border bg-white/95 dark:bg-dark-panel/95 backdrop-blur">
            <div className="grid grid-cols-9 h-14">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium',
                      isActive ? 'text-brand-700 dark:text-brand-300' : 'text-ink-muted dark:text-dark-muted',
                    )
                  }
                >
                  <n.icon size={18} /> {n.label}
                </NavLink>
              ))}
            </div>
          </nav>
          <main className="flex-1 min-h-0 overflow-y-auto pb-16 lg:pb-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

/** Compact filler for pages the shell references but I've left as scaffold. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-surface-border dark:border-dark-border px-6 py-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-[13.5px] text-ink-muted dark:text-dark-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// re-export for pages that need role icons
export { Users, Settings };
