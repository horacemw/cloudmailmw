import { RefreshCw, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';
import type { FilterTab } from '@/types';

export function InboxHeader({ folderName }: { folderName: string }): JSX.Element {
  const filterTab = useMailStore((s) => s.filterTab);
  const setFilterTab = useMailStore((s) => s.setFilterTab);
  const activeFolderId = useMailStore((s) => s.activeFolderId);
  const emails = useMailStore((s) => s.emails);
  const setAdvancedOpen = useUIStore((s) => s.setAdvancedFilterOpen);
  const pushToast = useUIStore((s) => s.pushToast);

  const stats = useMemo(() => {
    const inFolder = emails.filter((e) =>
      activeFolderId === 'starred' ? e.starred : e.folderId === activeFolderId,
    );
    return {
      total: inFolder.length,
      unread: inFolder.filter((e) => !e.read).length,
      starred: inFolder.filter((e) => e.starred).length,
      attachments: inFolder.filter((e) => (e.attachments?.length ?? 0) > 0).length,
    };
  }, [emails, activeFolderId]);

  const options: { value: FilterTab; label: string; badge?: number }[] = [
    { value: 'all', label: 'All', badge: stats.total },
    { value: 'unread', label: 'Unread', badge: stats.unread },
    { value: 'starred', label: 'Starred', badge: stats.starred },
    { value: 'attachments', label: 'Attachments', badge: stats.attachments },
  ];

  return (
    <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-surface-divider dark:border-dark-divider">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[19px] font-semibold text-ink dark:text-dark-text tracking-tight">
            {folderName}
          </h1>
          <p className="text-[12.5px] text-ink-muted dark:text-dark-muted mt-0.5">
            {stats.total.toLocaleString()} messages
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip label="Refresh">
            <IconButton
              icon={<RefreshCw size={16} />}
              label="Refresh"
              onClick={() => pushToast({ title: 'Inbox refreshed', tone: 'success' })}
            />
          </Tooltip>
          <Tooltip label="Filter">
            <IconButton
              icon={<SlidersHorizontal size={16} />}
              label="Advanced filter"
              onClick={() => setAdvancedOpen(true)}
            />
          </Tooltip>
          <button
            className="hidden lg:inline-flex items-center gap-1 h-9 px-2 rounded-lg text-[13px] text-ink-muted hover:text-ink hover:bg-surface-hover dark:text-dark-muted dark:hover:text-dark-text dark:hover:bg-dark-hover"
            onClick={() => pushToast({ title: 'Sort — Newest first' })}
          >
            Newest <ChevronDown size={13} />
          </button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto scroll-thin -mx-1 px-1">
        <Segmented value={filterTab} onChange={setFilterTab} options={options} />
      </div>
    </div>
  );
}
