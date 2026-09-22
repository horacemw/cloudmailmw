import type { CurrentUser, TenantSummary } from '@/store/useAuthStore';

/**
 * Single source of truth for the three post-login destinations MailCloud
 * routes an authenticated identity to. Keeps LoginPage, AdminLoginPage,
 * PublicOnly and any future auto-redirect in sync.
 *
 * The three logical workspaces are:
 *
 *   PLATFORM_SUPER_ADMIN   →  /admin       (Platform Administration shell)
 *   ORGANISATION_ADMIN     →  /dashboard   (Organisation management shell)
 *   MAILBOX_USER           →  /mail        (Webmail)
 *
 * "Organisation admin" here means owner or admin role in at least one
 * tenant membership; that matches the backend's `requireTenant('admin')`
 * gate on /v1/domains, /v1/mailboxes, etc.
 *
 * Backend authorization (requirePlatformAdmin + requireTenant(minRole)) is
 * still the actual gate — this helper is UX only. If a user manually types
 * /admin without isPlatformAdmin they get AdminShell's Navigate-away plus
 * a 403 from the very first data fetch.
 */

export type WorkspaceRole = 'platform_admin' | 'organisation_admin' | 'mailbox_user';

export function detectRole(user: CurrentUser | null, tenants: TenantSummary[]): WorkspaceRole {
  if (user?.isPlatformAdmin) return 'platform_admin';
  if (tenants.some((t) => t.role === 'owner' || t.role === 'admin')) return 'organisation_admin';
  return 'mailbox_user';
}

export function homeForRole(role: WorkspaceRole): string {
  switch (role) {
    case 'platform_admin':
      return '/admin';
    case 'organisation_admin':
      return '/dashboard';
    case 'mailbox_user':
      return '/mail';
  }
}

/** Convenience: given the auth store state, return where to land. */
export function postLoginDestination(
  user: CurrentUser | null,
  tenants: TenantSummary[],
  requested?: string | null,
): string {
  const role = detectRole(user, tenants);
  const defaultHome = homeForRole(role);
  if (!requested) return defaultHome;

  // Honour the `?from=…` redirect only if it's a workspace the user is
  // actually allowed in. This stops a mailbox user from being deep-linked
  // into /admin (they'd just bounce again with a confusing flash).
  if (requested.startsWith('/admin') && role !== 'platform_admin') return defaultHome;
  if (requested.startsWith('/dashboard') && role === 'mailbox_user') return defaultHome;
  return requested;
}

export function roleLabel(role: WorkspaceRole): string {
  switch (role) {
    case 'platform_admin':
      return 'Platform administrator';
    case 'organisation_admin':
      return 'Organisation administrator';
    case 'mailbox_user':
      return 'Mailbox user';
  }
}
