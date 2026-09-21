import { useEffect, useMemo, useState } from 'react';
import { Inbox, Loader2, ServerOff } from 'lucide-react';
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
 * Message list that transparently switches between LIVE mail (real IMAP via
 * /v1/mail/*) and the Phase 1 demo/mock store. In LIVE mode, IMAP UIDs are
 * mapped into the same Email shape the row component already knows how to
 * render — no per-row changes required.
 */
export function MessageList(): JSX.Element {
  const mode = useLiveMailStore((s) => s.mode);
  const isLive = mode === 'ready';

  // Mock-mode state
  const mockEmails = useMailStore((s) => s.visibleEmails)();
  const activeFolderId = useMailStore((s) => s.activeFolderId);
  const query = useMailStore((s) => s.searchQuery);

  // Live-mode state
  const liveMessages = useLiveMailStore((s) => s.messages);
  const liveFolder = useLiveMailStore((s) => s.activeFolder);
  const liveLoading = useLiveMailStore((s) => s.loadingMessages);
  const liveError = useLiveMailStore((s) => s.error);
  const refreshMessages = useLiveMailStore((s) => s.refreshMessages);

  // Selection (shared between modes — same store, just different ID space)
  const selectedIds = useMailStore((s) => s.selectedIds);
  const selectAll = useMailStore((s) => s.selectAllVisible);
  const clearSelection = useMailStore((s) => s.clearSelection);
  const selectedId = useMailStore((s) => s.selectedEmailId);
  const setPaneOpen = useUIStore((s) => s.setReadingPaneOpenMobile);
  const setSelectedEmail = useMailStore((s) => s.selectEmail);

  const emails: Email[] = useMemo(() => {
    if (!isLive) return mockEmails;
    // Convert LiveMessageSummary → Email so MessageRow stays identical.
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
  }, [isLive, mockEmails, liveMessages, liveFolder]);

  const [refreshingFolder, setRefreshingFolder] = useState(false);
  useEffect(() => {
    if (!isLive) return;
    setRefreshingFolder(true);
    void refreshMessages().finally(() => setRefreshingFolder(false));
  }, [isLive, liveFolder, refreshMessages]);

  // For mock mode, the historical brief skeleton on folder change.
  const [mockLoading, setMockLoading] = useState(false);
  useEffect(() => {
    if (isLive) return;
    setMockLoading(true);
    const t = setTimeout(() => setMockLoading(false), 220);
    return () => clearTimeout(t);
  }, [isLive, activeFolderId]);

  const loading = isLive ? liveLoading || refreshingFolder : mockLoading;
  const allSelected = emails.length > 0 && emails.every((e) => selectedIds.has(e.id));
  const anySelected = selectedIds.size > 0;

  // Auto-clear selection if it references stale rows after mode switch.
  useEffect(() => {
    if (anySelected && !emails.some((e) => selectedIds.has(e.id))) {
      clearSelection();
    }
  }, [emails, selectedIds, anySelected, clearSelection]);

  // Sync selected message across modes if the currently-selected row went away.
  useEffect(() => {
    if (selectedId && !emails.some((e) => e.id === selectedId)) {
      const firstId = emails[0]?.id ?? null;
      setSelectedEmail(firstId);
      if (firstId && !isLive) setPaneOpen(false);
    }
  }, [selectedId, emails, setSelectedEmail, isLive, setPaneOpen]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {anySelected ? (
        <BulkActionBar />
      ) : (
        <div className="hidden sm:flex items-center gap-3 px-4 sm:px-5 py-2 border-b border-surface-divider dark:border-dark-divider">
          <Checkbox
            checked={allSelected}
            indeterminate={anySelected && !allSelected}
            onChange={(v) => (v ? selectAll(emails.map((e) => e.id)) : clearSelection())}
            size="sm"
          />
          <span className="text-[12px] text-ink-muted dark:text-dark-muted">
            {emails.length > 0
              ? `Select all ${emails.length}`
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
        {loading && emails.length === 0 ? (
          <>
            <MessageRowSkeleton />
            <MessageRowSkeleton />
            <MessageRowSkeleton />
            <MessageRowSkeleton />
            <MessageRowSkeleton />
          </>
        ) : emails.length === 0 ? (
          isLive && liveError ? (
            <EmptyState
              icon={<ServerOff size={22} />}
              title="Could not load messages"
              description={liveError}
            />
          ) : (
            <EmptyState
              icon={<Inbox size={22} />}
              title={query ? 'No matches found' : "You're all caught up"}
              description={
                query
                  ? `We couldn't find any messages matching "${query}".`
                  : 'Messages you receive will appear here.'
              }
            />
          )
        ) : (
          emails.map((email) => (
            <MessageRow
              key={email.id}
              email={email}
              selected={selectedIds.has(email.id)}
              active={selectedId === email.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
