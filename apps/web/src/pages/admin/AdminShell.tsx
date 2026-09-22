import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Building2, Lock, Mail, ScrollText, Server, Shield, Users } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin', label: 'Overview', icon: Shield, end: true },
  { to: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/admin/mailboxes', label: 'Mailboxes', icon: Mail },
  { to: '/admin/queue', label: 'Mail queue', icon: Server },
  { to: '/admin/system', label: 'System', icon: Activity },
  { to: '/admin/security', label: 'Security', icon: Lock },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { to: '/admin/relay', label: 'Mail relay', icon: Users },
];

export function AdminShell(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const push = useUIStore((s) => s.pushToast);
  const navigate = useNavigate();

  // Non-platform-admin users get bounced to their tenant dashboard. The
  // backend enforces the same rule (403 platform_admin_only on every /v1/admin
  // route) — this is just UX so they don't see the shell flash + broken
  // fetches. Wait for bootstrap to finish so we don't redirect during initial
  // silent refresh.
  useEffect(() => {
    if (ready && user && !user.isPlatformAdmin) {
      push({ title: 'Platform admin access required', tone: 'warning' });
    }
  }, [ready, user, push]);

  if (ready && user && !user.isPlatformAdmin) return <Navigate to="/dashboard" replace />;
  if (ready && !user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-surface-bg dark:bg-dark-bg text-ink dark:text-dark-text">
      <div className="grid lg:grid-cols-[240px_1fr] min-h-screen">
        <aside className="hidden lg:flex flex-col border-r border-surface-border dark:border-dark-border bg-white dark:bg-dark-panel">
          <div className="p-5"><Logo /></div>
          <div className="px-5 pb-3 text-[10.5px] uppercase tracking-wider font-bold text-state-warning">Platform admin</div>
          <nav className="px-3 space-y-0.5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
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
          <div className="mt-auto p-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 h-9 w-full px-3 rounded-lg text-[13px] text-ink-muted hover:bg-surface-hover dark:text-dark-muted dark:hover:bg-dark-hover"
            >
              <ArrowLeft size={14} /> Back to customer dashboard
            </button>
          </div>
        </aside>

        <div className="flex flex-col min-h-0">
          <header className="flex items-center gap-3 h-16 px-5 border-b border-surface-border dark:border-dark-border bg-white/95 backdrop-blur dark:bg-dark-panel/95">
            <div className="text-[12.5px] font-semibold text-state-warning uppercase tracking-wider">Platform administration</div>
            <div className="ml-auto text-[12.5px] text-ink-muted">
              Signed in as {user?.email}
            </div>
          </header>
          <main className="flex-1 min-h-0 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
