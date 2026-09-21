import {
  Archive,
  Clock,
  FileText,
  Folder as FolderIcon,
  Inbox,
  Pencil,
  Plus,
  Send,
  Settings as SettingsIcon,
  ShieldAlert,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMailStore } from '@/store/useMailStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useUIStore } from '@/store/useUIStore';
import type { FolderId, SystemFolderId } from '@/types';
import { cn } from '@/lib/utils';
import { StorageWidget } from '@/components/sidebar/StorageWidget';

const SYSTEM_ICON: Record<SystemFolderId, LucideIcon> = {
  inbox: Inbox,
  starred: Star,
  snoozed: Clock,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  spam: ShieldAlert,
  trash: Trash2,
};

const SYSTEM_ORDER: SystemFolderId[] = [
  'inbox',
  'starred',
  'snoozed',
  'sent',
  'drafts',
  'archive',
  'spam',
  'trash',
];

export function Sidebar(): JSX.Element {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed lg:sticky top-16 lg:top-0 left-0 z-40 lg:z-auto',
          'flex flex-col w-64 shrink-0',
          'h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)]',
          'bg-white dark:bg-dark-panel border-r border-surface-border dark:border-dark-border',
          'transition-transform duration-200 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Mail folders"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 lg:hidden">
          <span className="text-sm font-semibold text-ink dark:text-dark-text">Menu</span>
          <button
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="text-ink-muted hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-4 pb-3">
          <ComposeButton />
        </div>

        <nav className="flex-1 overflow-y-auto scroll-thin px-3 pb-3 space-y-4">
          <LiveOrMockFolders />
        </nav>

        <div className="px-4 pt-3 pb-3 border-t border-surface-divider dark:border-dark-divider space-y-3">
          <StorageWidget />
          <SettingsLink />
        </div>
      </aside>
    </>
  );
}

function ComposeButton(): JSX.Element {
  const openCompose = useUIStore((s) => s.openCompose);
  return (
    <button
      onClick={() => openCompose()}
      className={cn(
        'group flex items-center justify-center gap-2 w-full h-11 rounded-xl',
        'bg-brand text-white font-semibold text-[14px] shadow-card',
        'hover:bg-brand-600 active:bg-brand-700 transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
      )}
    >
      <Pencil size={16} strokeWidth={2.5} />
      Compose
    </button>
  );
}

function FolderSection({
  title,
  folderIds,
}: {
  title: string | null;
  folderIds: FolderId[];
}): JSX.Element {
  const active = useMailStore((s) => s.activeFolderId);
  const folders = useMailStore((s) => s.folders);
  const setActive = useMailStore((s) => s.setActiveFolder);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const counts = useMailStore((s) => s.countsByFolder)();

  return (
    <div>
      {title && (
        <div className="px-3 pb-1.5 pt-1 text-[11px] uppercase tracking-wider text-ink-faint dark:text-dark-faint font-semibold">
          {title}
        </div>
      )}
      <ul className="space-y-0.5">
        {folderIds.map((id) => {
          const f = folders.find((x) => x.id === id);
          if (!f) return null;
          const Icon = f.system
            ? SYSTEM_ICON[id as SystemFolderId]
            : FolderIcon;
          const isActive = active === id;
          const c = counts[id];
          const count = c ? (id === 'drafts' || id === 'spam' ? c.total : c.unread) : 0;
          return (
            <li key={id}>
              <button
                onClick={() => {
                  setActive(id);
                  setSidebarOpen(false);
                }}
                className={cn(
                  'group flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors',
                  isActive
                    ? 'bg-brand-100 text-brand-700 font-semibold dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-ink hover:bg-surface-hover dark:text-dark-text dark:hover:bg-dark-hover',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  size={16}
                  className={cn(
                    isActive
                      ? 'text-brand-700 dark:text-brand-300'
                      : 'text-ink-muted dark:text-dark-muted',
                  )}
                />
                <span className="flex-1 text-left truncate">{f.name}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      'text-[11px] font-semibold px-1.5 min-w-[20px] h-[18px] leading-[18px] rounded-full text-center',
                      isActive
                        ? 'bg-brand text-white'
                        : id === 'spam'
                          ? 'bg-state-danger-soft text-state-danger'
                          : 'bg-surface-hover text-ink-muted dark:bg-dark-hover dark:text-dark-muted',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CustomFolders(): JSX.Element {
  const folders = useMailStore((s) => s.folders);
  const active = useMailStore((s) => s.activeFolderId);
  const setActive = useMailStore((s) => s.setActiveFolder);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setCreateOpen = useUIStore((s) => s.setCreateFolderOpen);
  const custom = folders.filter((f) => !f.system);

  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-1.5 pt-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint dark:text-dark-faint font-semibold">
          Folders
        </span>
        <button
          onClick={() => setCreateOpen(true)}
          className="text-ink-muted hover:text-brand-700 dark:text-dark-muted dark:hover:text-brand-300 rounded-md p-0.5"
          aria-label="Create folder"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>
      <ul className="space-y-0.5">
        {custom.map((f) => {
          const isActive = active === f.id;
          return (
            <li key={f.id}>
              <button
                onClick={() => {
                  setActive(f.id);
                  setSidebarOpen(false);
                }}
                className={cn(
                  'group flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors',
                  isActive
                    ? 'bg-brand-100 text-brand-700 font-semibold dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-ink hover:bg-surface-hover dark:text-dark-text dark:hover:bg-dark-hover',
                )}
              >
                <FolderIcon
                  size={16}
                  className={cn(
                    isActive
                      ? 'text-brand-700 dark:text-brand-300'
                      : 'text-ink-muted dark:text-dark-muted',
                  )}
                />
                <span className="flex-1 text-left truncate">{f.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettingsLink(): JSX.Element {
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  return (
    <button
      onClick={() => openSettings(true)}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors',
        'text-ink hover:bg-surface-hover dark:text-dark-text dark:hover:bg-dark-hover',
      )}
    >
      <SettingsIcon size={16} className="text-ink-muted dark:text-dark-muted" />
      Settings
    </button>
  );
}

/**
 * Show live IMAP folders when the live-mail probe reports ready, otherwise
 * fall back to the Phase-1 mock folder tree. The switch is silent to the
 * user — the underlying labels/counts are honest either way.
 */
function LiveOrMockFolders(): JSX.Element {
  const mode = useLiveMailStore((s) => s.mode);
  if (mode === 'ready') return <LiveFolders />;
  return (
    <>
      <FolderSection title={null} folderIds={SYSTEM_ORDER} />
      <CustomFolders />
    </>
  );
}

function LiveFolders(): JSX.Element {
  const folders = useLiveMailStore((s) => s.folders);
  const activePath = useLiveMailStore((s) => s.activeFolder);
  const selectFolder = useLiveMailStore((s) => s.selectFolder);
  const refreshFolders = useLiveMailStore((s) => s.refreshFolders);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const pushToast = useUIStore((s) => s.pushToast);

  // Group folders: system-flagged first, then custom.
  const systemFirst = [...folders].sort((a, b) => {
    const aSys = a.specialUse ? 0 : 1;
    const bSys = b.specialUse ? 0 : 1;
    if (aSys !== bSys) return aSys - bSys;
    return a.path.localeCompare(b.path);
  });

  const iconFor = (specialUse: string | null, path: string): LucideIcon => {
    if (specialUse === '\\Sent') return Send;
    if (specialUse === '\\Drafts') return FileText;
    if (specialUse === '\\Trash') return Trash2;
    if (specialUse === '\\Junk') return ShieldAlert;
    if (specialUse === '\\Archive') return Archive;
    if (path.toLowerCase() === 'inbox') return Inbox;
    return FolderIcon;
  };

  const createFolder = async (): Promise<void> => {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;
    try {
      const { api } = await import('@/lib/apiClient');
      await api('/v1/mail/folders', {
        method: 'POST',
        body: JSON.stringify({ path: name.trim() }),
      });
      await refreshFolders();
      pushToast({ title: `Folder "${name.trim()}" created`, tone: 'success' });
    } catch (err) {
      pushToast({
        title: 'Could not create folder',
        description: err instanceof Error ? err.message : 'Unknown error',
        tone: 'danger',
      });
    }
  };

  return (
    <div>
      <ul className="space-y-0.5">
        {systemFirst.map((f) => {
          const isActive = activePath === f.path;
          const Icon = iconFor(f.specialUse, f.path);
          const label = f.path === 'INBOX' ? 'Inbox' : f.name;
          const badge =
            f.specialUse === '\\Drafts' || f.specialUse === '\\Junk' ? f.total : f.unread;
          return (
            <li key={f.path}>
              <button
                onClick={() => {
                  void selectFolder(f.path);
                  setSidebarOpen(false);
                }}
                className={cn(
                  'group flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors',
                  isActive
                    ? 'bg-brand-100 text-brand-700 font-semibold dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-ink hover:bg-surface-hover dark:text-dark-text dark:hover:bg-dark-hover',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  size={16}
                  className={cn(
                    isActive
                      ? 'text-brand-700 dark:text-brand-300'
                      : 'text-ink-muted dark:text-dark-muted',
                  )}
                />
                <span className="flex-1 text-left truncate">{label}</span>
                {badge > 0 && (
                  <span
                    className={cn(
                      'text-[11px] font-semibold px-1.5 min-w-[20px] h-[18px] leading-[18px] rounded-full text-center',
                      isActive
                        ? 'bg-brand text-white'
                        : f.specialUse === '\\Junk'
                          ? 'bg-state-danger-soft text-state-danger'
                          : 'bg-surface-hover text-ink-muted dark:bg-dark-hover dark:text-dark-muted',
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between px-3 pb-1.5 pt-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint dark:text-dark-faint font-semibold">
          Folders
        </span>
        <button
          onClick={() => void createFolder()}
          className="text-ink-muted hover:text-brand-700 dark:text-dark-muted dark:hover:text-brand-300 rounded-md p-0.5"
          aria-label="Create folder"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
