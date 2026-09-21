import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { AppShell } from '@/components/shell/AppShell';
import { DashboardShell } from '@/pages/dashboard/DashboardShell';
import { DomainsPage } from '@/pages/dashboard/DomainsPage';
import { AddDomainPage } from '@/pages/dashboard/AddDomainPage';
import { DomainDetailPage } from '@/pages/dashboard/DomainDetailPage';
import { MailboxesPage } from '@/pages/dashboard/MailboxesPage';
import { MailboxClientConfigPage } from '@/pages/dashboard/MailboxClientConfigPage';
import { MigrationsPage } from '@/pages/dashboard/MigrationsPage';
import { ExportsPage } from '@/pages/dashboard/ExportsPage';
import { SecurityPage } from '@/pages/dashboard/SecurityPage';
import { ContactsPage } from '@/pages/dashboard/ContactsPage';
import { SignaturesPage } from '@/pages/dashboard/SignaturesPage';
import { FiltersPage } from '@/pages/dashboard/FiltersPage';
import { CalendarPage } from '@/pages/dashboard/CalendarPage';
import { AdminShell } from '@/pages/admin/AdminShell';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import { AdminTenantsPage } from '@/pages/admin/AdminTenantsPage';
import { AdminMailboxesPage } from '@/pages/admin/AdminMailboxesPage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import { AdminAuditPage } from '@/pages/admin/AdminAuditPage';
import { AdminRelayPage } from '@/pages/admin/AdminRelayPage';
import { OnboardingDomainPage } from '@/pages/onboarding/OnboardingDomainPage';
import { useAuthStore } from '@/store/useAuthStore';

export default function App(): JSX.Element {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const ready = useAuthStore((s) => s.ready);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!ready) return <FullPageSpinner />;

  return (
    <BrowserRouter>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
          <Route path="/forgot" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
          <Route path="/reset" element={<PublicOnly><ResetPasswordPage /></PublicOnly>} />

          {/* Onboarding — requires auth but not a verified domain */}
          <Route element={<RequireAuth />}>
            <Route path="/onboarding/domain" element={<OnboardingDomainPage />} />
          </Route>

          {/* Dashboard */}
          <Route element={<RequireAuth />}>
            <Route element={<DashboardShell />}>
              <Route path="/dashboard" element={<Navigate to="/dashboard/domains" replace />} />
              <Route path="/dashboard/domains" element={<DomainsPage />} />
              <Route path="/dashboard/domains/new" element={<AddDomainPage />} />
              <Route path="/dashboard/domains/:id" element={<DomainDetailPage />} />
              <Route path="/dashboard/mailboxes" element={<MailboxesPage />} />
              <Route path="/dashboard/mailboxes/:id/connect" element={<MailboxClientConfigPage />} />
              <Route path="/dashboard/migrations" element={<MigrationsPage />} />
              <Route path="/dashboard/exports" element={<ExportsPage />} />
              <Route path="/dashboard/contacts" element={<ContactsPage />} />
              <Route path="/dashboard/signatures" element={<SignaturesPage />} />
              <Route path="/dashboard/rules" element={<FiltersPage />} />
              <Route path="/dashboard/calendar" element={<CalendarPage />} />
              <Route path="/dashboard/security" element={<SecurityPage />} />
            </Route>
          </Route>

          {/* Platform admin — server-side enforced; frontend just routes */}
          <Route element={<RequireAuth />}>
            <Route element={<AdminShell />}>
              <Route path="/admin" element={<AdminOverviewPage />} />
              <Route path="/admin/tenants" element={<AdminTenantsPage />} />
              <Route path="/admin/mailboxes" element={<AdminMailboxesPage />} />
              <Route path="/admin/queue" element={<AdminQueuePage />} />
              <Route path="/admin/audit" element={<AdminAuditPage />} />
              <Route path="/admin/relay" element={<AdminRelayPage />} />
            </Route>
          </Route>

          {/* Webmail — the Phase 1 experience, now authenticated */}
          <Route element={<RequireAuth />}>
            <Route path="/mail/*" element={<AppShell />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function RequireAuth(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}

function PublicOnly({ children }: { children: JSX.Element }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to="/mail" replace />;
  return children;
}

function FullPageSpinner(): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-dark-bg">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-r-transparent" />
    </div>
  );
}
