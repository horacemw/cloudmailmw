import { Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { useMailStore } from '@/store/useMailStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useUIStore } from '@/store/useUIStore';
import type { FilterTab } from '@/types';

export function InboxHeader({ folderName }: { folderName: string }): JSX.Element {
  const isLive = useLiveMailStore((s) => s.mode) === 'ready';
  const liveMessages = useLiveMailStore((s) => s.messages);
  const refreshMessages = useLiveMailStore((s) => s.refreshMessages);
  const refreshingLive = useLiveMailStore((s) => s.loadingMessages);

  // Mock-mode counters (all zero after the zero-mock cutover).
  const mockEmails = useMailStore((s) => s.emails);
  const activeFolderId = useMailStore((s) => s.activeFolderId);

  const filterTab = useMailStore((s) => s.filterTab);
  const setFilterTab = useMailStore((s) => s.setFilterTab);
  const setAdvancedOpen = useUIStore((s) => s.setAdvancedFilterOpen);
  const pushToast = useUIStore((s) => s.pushToast);

  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => {
    if (isLive) {
      return {
        total: liveMessages.length,
        unread: liveMessages.filter((m) => !(m.flags ?? []).includes('\\Seen')).length,
        starred: liveMessages.filter((m) => (m.flags ?? []).includes('\\Flagged')).length,
        attachments: liveMessages.filter((m) => m.hasAttachments).length,
      };
    }
    const inFolder = mockEmails.filter((e) =>
      activeFolderId === 'starred' ? e.starred : e.folderId === activeFolderId,
    );
    return {
      total: inFolder.length,
      unread: inFolder.filter((e) => !e.read).length,
      starred: inFolder.filter((e) => e.starred).length,
      attachments: inFolder.filter((e) => (e.attachments?.length ?? 0) > 0).length,
    };
  }, [isLive, liveMessages, mockEmails, activeFolderId]);

  const options: { value: FilterTab; label: string; badge?: number }[] = [
    { value: 'all', label: 'All', badge: stats.total },
    { value: 'unread', label: 'Unread', badge: stats.unread },
    { value: 'starred', label: 'Starred', badge: stats.starred },
    { value: 'attachments', label: 'Attachments', badge: stats.attachments },
  ];

  const doRefresh = async (): Promise<void> => {
    if (isLive) {
      setRefreshing(true);
      try {
        await refreshMessages();
        pushToast({ title: 'Inbox refreshed', tone: 'success' });
      } catch (err) {
        pushToast({ title: 'Refresh failed', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
      } finally {
        setRefreshing(false);
      }
    } else {
      // Nothing to refresh in demo mode — the mock store is memory-only.
      pushToast({ title: 'No mailbox connected' });
    }
  };

  return (
    <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-surface-divider dark:border-dark-divider">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[19px] font-semibold text-ink dark:text-dark-text tracking-tight">
            {folderName}
          </h1>
          <p className="text-[12.5px] text-ink-muted dark:text-dark-muted mt-0.5">
            {stats.total.toLocaleString()} message{stats.total === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip label="Refresh">
            <IconButton
              icon={refreshing || refreshingLive ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              label="Refresh"
              onClick={() => void doRefresh()}
              disabled={refreshing}
            />
          </Tooltip>
          <Tooltip label="Filter">
            <IconButton
              icon={<SlidersHorizontal size={16} />}
              label="Advanced filter"
              onClick={() => setAdvancedOpen(true)}
            />
          </Tooltip>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto scroll-thin -mx-1 px-1">
        <Segmented value={filterTab} onChange={setFilterTab} options={options} />
      </div>
    </div>
  );
}
