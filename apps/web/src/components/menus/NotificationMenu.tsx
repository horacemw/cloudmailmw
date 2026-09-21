import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  Mail,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Download,
  Globe2,
  KeyRound,
  Calendar as CalendarIcon,
  HardDrive,
} from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import { api, ApiError } from '@/lib/apiClient';
import { formatTime, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

type NotificationKind =
  | 'security_new_login'
  | 'security_password_changed'
  | 'security_mfa_enabled'
  | 'security_mfa_disabled'
  | 'domain_verified'
  | 'mailbox_created'
  | 'mailbox_password_reset'
  | 'migration_completed'
  | 'migration_failed'
  | 'export_completed'
  | 'quota_warning'
  | 'calendar_reminder'
  | 'system';

interface ApiNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
}

const KIND_ICON: Record<NotificationKind, ReactNode> = {
  security_new_login: <ShieldAlert size={14} />,
  security_password_changed: <KeyRound size={14} />,
  security_mfa_enabled: <ShieldCheck size={14} />,
  security_mfa_disabled: <ShieldAlert size={14} />,
  domain_verified: <Globe2 size={14} />,
  mailbox_created: <Mail size={14} />,
  mailbox_password_reset: <KeyRound size={14} />,
  migration_completed: <Download size={14} />,
  migration_failed: <ShieldAlert size={14} />,
  export_completed: <Download size={14} />,
  quota_warning: <HardDrive size={14} />,
  calendar_reminder: <CalendarIcon size={14} />,
  system: <FileText size={14} />,
};

interface Props {
  trigger: (opts: { open: boolean; toggle: () => void }) => ReactNode;
}

/**
 * Bell menu with real API-backed notifications. We poll `/unread-count` every
 * 60 s (cheap COUNT query) and refetch the full list when the dropdown opens.
 */
export function NotificationMenu({ trigger }: Props): JSX.Element {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { count } = await api<{ count: number }>('/v1/notifications/unread-count');
      setUnread(count);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
    }
  }, [isAuthenticated]);

  const loadList = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const { notifications: list } = await api<{ notifications: ApiNotification[] }>('/v1/notifications?limit=50');
      setNotifications(list);
      setUnread(list.filter((n) => !n.readAt).length);
    } catch {
      /* swallow — bell just stays empty */
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshCount();
    if (!isAuthenticated) return;
    const t = window.setInterval(() => {
      void refreshCount();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [refreshCount, isAuthenticated]);

  const markAllRead = useCallback(async () => {
    // Optimistic: paint the badge to zero, then let the server confirm.
    setUnread(0);
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    try {
      await api('/v1/notifications/read-all', { method: 'POST' });
    } catch {
      void refreshCount();
    }
  }, [refreshCount]);

  const dismiss = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnread((prev) => Math.max(0, prev - (notifications.find((n) => n.id === id && !n.readAt) ? 1 : 0)));
    try {
      await api(`/v1/notifications/${id}`, { method: 'DELETE' });
    } catch {
      void loadList();
    }
  }, [notifications, loadList]);

  return (
    <Dropdown
      width="w-[380px]"
      onOpen={() => void loadList()}
      trigger={(o) => (
        <div className="relative">
          {trigger(o)}
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white dark:ring-dark-panel"
            />
          )}
        </div>
      )}
    >
      {() => (
        <div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-divider dark:border-dark-divider">
            <div>
              <p className="text-[13px] font-semibold text-ink dark:text-dark-text">
                Notifications
              </p>
              <p className="text-[11.5px] text-ink-muted dark:text-dark-muted">
                {loading ? 'Loading…' : unread > 0 ? `${unread} new` : "You're all caught up"}
              </p>
            </div>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-[12px] font-semibold text-brand-700 dark:text-brand-300 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto scroll-thin">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-ink-muted dark:text-dark-muted">
                <Bell size={18} className="mx-auto mb-2 opacity-60" />
                {loading ? 'Loading…' : 'No notifications'}
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void dismiss(n.id)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-surface-hover dark:hover:bg-dark-hover transition-colors',
                    !n.readAt && 'bg-brand-50 dark:bg-brand-900/10',
                  )}
                  title="Dismiss"
                >
                  <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 inline-flex items-center justify-center shrink-0">
                    {KIND_ICON[n.kind] ?? <Bell size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink dark:text-dark-text truncate">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[12px] text-ink-muted dark:text-dark-muted truncate-2">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[11px] text-ink-faint dark:text-dark-faint mt-0.5">
                      {formatTime(n.createdAt)}
                    </p>
                  </div>
                  {!n.readAt && (
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
