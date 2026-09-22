import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Inbox, Loader2, ServerOff } from 'lucide-react';
import { useMailStore } from '@/store/useMailStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useUIStore } from '@/store/useUIStore';
import { MessageRow } from './MessageRow';
import { BulkActionBar } from './BulkActionBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { MessageRowSkeleton } from '@/components/ui/Skeleton';
import { Checkbox } from '@/components/ui/Checkbox';
import type { Email } from '@/types';

/**
 * Message list. In LIVE mode: reads real IMAP messages from useLiveMailStore
 * (fetched via /v1/mail/messages, paginated with a UID before-cursor).
 * In demo mode: reads from the empty mock store — which shows the honest
 * empty state.
 */
export function MessageList(): JSX.Element {
  const mode = useLiveMailStore((s) => s.mode);
  const isLive = mode === 'ready';

  const mockEmails = useMailStore((s) => s.visibleEmails)();
  const activeFolderId = useMailStore((s) => s.activeFolderId);
  const query = useMailStore((s) => s.searchQuery);
  const filterTab = useMailStore((s) => s.filterTab);

  const liveMessages = useLiveMailStore((s) => s.messages);
  const liveFolder = useLiveMailStore((s) => s.activeFolder);
  const liveLoading = useLiveMailStore((s) => s.loadingMessages);
  const liveLoadingOlder = useLiveMailStore((s) => s.loadingOlder);
  const liveError = useLiveMailStore((s) => s.error);
  const liveNextBefore = useLiveMailStore((s) => s.nextBefore);
  const liveSearchQuery = useLiveMailStore((s) => s.searchQuery);
  const refreshMessages = useLiveMailStore((s) => s.refreshMessages);
  const loadOlder = useLiveMailStore((s) => s.loadOlder);

  const selectedIds = useMailStore((s) => s.selectedIds);
  const selectAll = useMailStore((s) => s.selectAllVisible);
  const clearSelection = useMailStore((s) => s.clearSelection);
  const selectedId = useMailStore((s) => s.selectedEmailId);
  const setPaneOpen = useUIStore((s) => s.setReadingPaneOpenMobile);
  const setSelectedEmail = useMailStore((s) => s.selectEmail);

  // Adapt live message summaries into the Email shape MessageRow already knows.
  const liveAsEmails: Email[] = useMemo(() => {
    return liveMessages.map((m) => ({
      id: `live-${m.uid}`,
      folderId: liveFolder,
      from: m.from
        ? { name: m.from.name || m.from.address, email: m.from.address }
        : { name: '(unknown)', email: '' },
      to: [],
      subject: m.subject,
      preview: m.preview || '',
      bodyHtml: '',
      timestamp: m.date ?? new Date().toISOString(),
      read: m.flags?.includes('\\Seen') ?? false,
      starred: m.flags?.includes('\\Flagged') ?? false,
      attachments: m.hasAttachments
        ? [{ id: 'placeholder', name: 'attachment', size: '?', type: 'other' }]
        : undefined,
    }));
  }, [liveMessages, liveFolder]);

  // Filter tabs (All / Unread / Starred / Attachments) are client-side over
  // the current message window — they're user-experience filters, not folder
  // navigation. Server-side search (see TopBar) is a separate concern.
  const filtered: Email[] = useMemo(() => {
    const source = isLive ? liveAsEmails : mockEmails;
    switch (filterTab) {
      case 'unread':
        return source.filter((e) => !e.read);
      case 'starred':
        return source.filter((e) => e.starred);
      case 'attachments':
        return source.filter((e) => (e.attachments?.length ?? 0) > 0);
      default:
        return source;
    }
  }, [isLive, liveAsEmails, mockEmails, filterTab]);

  const [refreshingFolder, setRefreshingFolder] = useState(false);
  useEffect(() => {
    if (!isLive) return;
    setRefreshingFolder(true);
    void refreshMessages().finally(() => setRefreshingFolder(false));
  }, [isLive, liveFolder, refreshMessages]);

  const [mockLoading, setMockLoading] = useState(false);
  useEffect(() => {
    if (isLive) return;
    setMockLoading(true);
    const t = setTimeout(() => setMockLoading(false), 220);
    return () => clearTimeout(t);
  }, [isLive, activeFolderId]);

  const loading = isLive ? liveLoading || refreshingFolder : mockLoading;
  const allSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
  const anySelected = selectedIds.size > 0;

  useEffect(() => {
    if (anySelected && !filtered.some((e) => selectedIds.has(e.id))) {
      clearSelection();
    }
  }, [filtered, selectedIds, anySelected, clearSelection]);

  useEffect(() => {
    if (selectedId && !filtered.some((e) => e.id === selectedId)) {
      const firstId = filtered[0]?.id ?? null;
      setSelectedEmail(firstId);
      if (firstId && !isLive) setPaneOpen(false);
    }
  }, [selectedId, filtered, setSelectedEmail, isLive, setPaneOpen]);

  // Text for the "search returned nothing" state — prefer the LIVE query
  // when in live mode (backend-filtered), else the mock query.
  const activeQuery = isLive ? liveSearchQuery : query;

  const canLoadOlder = isLive && liveNextBefore != null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {anySelected ? (
        <BulkActionBar />
      ) : (
        <div className="hidden sm:flex items-center gap-3 px-4 sm:px-5 py-2 border-b border-surface-divider dark:border-dark-divider">
          <Checkbox
            checked={allSelected}
            indeterminate={anySelected && !allSelected}
            onChange={(v) => (v ? selectAll(filtered.map((e) => e.id)) : clearSelection())}
            size="sm"
          />
          <span className="text-[12px] text-ink-muted dark:text-dark-muted">
            {filtered.length > 0
              ? `Select all ${filtered.length}`
              : loading
                ? 'Loading…'
                : 'No messages'}
          </span>
          {isLive && (
            <button
              onClick={() => void refreshMessages()}
              className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11.5px] text-ink-muted hover:text-ink hover:bg-surface-hover dark:text-dark-muted dark:hover:text-dark-text dark:hover:bg-dark-hover"
            >
              {refreshingFolder ? <Loader2 size={11} className="animate-spin" /> : null} Refresh
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto scroll-thin">
        {loading && filtered.length === 0 ? (
          <>
            <MessageRowSkeleton />
            <MessageRowSkeleton />
            <MessageRowSkeleton />
            <MessageRowSkeleton />
            <MessageRowSkeleton />
          </>
        ) : filtered.length === 0 ? (
          isLive && liveError ? (
            <EmptyState
              icon={<ServerOff size={22} />}
              title="Could not load messages"
              description={liveError}
            />
          ) : (
            <EmptyState
              icon={<Inbox size={22} />}
              title={activeQuery ? 'No matches found' : "You're all caught up"}
              description={
                activeQuery
                  ? `We couldn't find any messages matching "${activeQuery}".`
                  : filterTabEmptyDescription(filterTab)
              }
            />
          )
        ) : (
          <>
            {filtered.map((email) => (
              <MessageRow
                key={email.id}
                email={email}
                selected={selectedIds.has(email.id)}
                active={selectedId === email.id}
              />
            ))}
            {canLoadOlder && (
              <div className="p-4 flex items-center justify-center">
                <button
                  onClick={() => void loadOlder()}
                  disabled={liveLoadingOlder}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-surface-border dark:border-dark-border text-[13px] hover:bg-surface-hover dark:hover:bg-dark-hover disabled:opacity-50"
                >
                  {liveLoadingOlder ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} />}
                  Load older messages
                </button>
              </div>
            )}
            {isLive && !canLoadOlder && liveMessages.length > 0 && (
              <div className="py-6 text-center text-[11.5px] text-ink-faint dark:text-dark-faint">
                End of folder
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function filterTabEmptyDescription(tab: string): string {
  switch (tab) {
    case 'unread':
      return 'No unread messages in this folder.';
    case 'starred':
      return 'No starred messages here.';
    case 'attachments':
      return 'No messages with attachments in this folder.';
    default:
      return 'Messages you receive will appear here.';
  }
}
