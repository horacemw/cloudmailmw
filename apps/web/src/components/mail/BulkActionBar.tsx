import {
  Archive,
  Mail,
  MailOpen,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useMailStore } from '@/store/useMailStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useUIStore } from '@/store/useUIStore';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { Dropdown, MenuItem, MenuSection } from '@/components/ui/Dropdown';
import { MoveHorizontal as MoveIcon } from 'lucide-react';

/**
 * Toolbar shown when the user selects one or more messages. The selection is
 * stored as string IDs — for live messages that means `live-<uid>`, for mock
 * messages it's the mock id. This bar auto-dispatches to the right store.
 */
export function BulkActionBar(): JSX.Element {
  const selected = useMailStore((s) => s.selectedIds);
  const clearSelection = useMailStore((s) => s.clearSelection);

  const isLive = useLiveMailStore((s) => s.mode) === 'ready';
  const liveFolder = useLiveMailStore((s) => s.activeFolder);
  const setFlags = useLiveMailStore((s) => s.setFlags);
  const moveMessage = useLiveMailStore((s) => s.moveMessage);
  const folderPathFor = useLiveMailStore((s) => s.folderPathFor);
  const liveFolders = useLiveMailStore((s) => s.folders);

  const mockArchive = useMailStore((s) => s.archive);
  const mockSpam = useMailStore((s) => s.moveToSpam);
  const mockTrash = useMailStore((s) => s.moveToTrash);
  const mockMarkRead = useMailStore((s) => s.markRead);
  const mockMoveTo = useMailStore((s) => s.moveTo);
  const mockFolders = useMailStore((s) => s.folders);
  const push = useUIStore((s) => s.pushToast);

  const ids = Array.from(selected);
  const liveUids = ids
    .filter((id) => id.startsWith('live-'))
    .map((id) => Number.parseInt(id.slice(5), 10))
    .filter((n) => Number.isFinite(n));

  const mockIds = ids.filter((id) => !id.startsWith('live-'));

  const summary = (verb: string): string =>
    `${ids.length} message${ids.length === 1 ? '' : 's'} — ${verb}`;

  const bulkFlags = async (add?: string[], remove?: string[], label = 'updated'): Promise<void> => {
    if (isLive && liveUids.length > 0) {
      const results = await Promise.allSettled(
        liveUids.map((uid) => setFlags(uid, liveFolder, add, remove)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) push({ title: summary(label), tone: 'success' });
      else push({ title: `${label}: ${failed} failed`, tone: 'danger' });
    }
    if (mockIds.length > 0) {
      if (remove?.includes('\\Seen')) mockMarkRead(mockIds, false);
      else if (add?.includes('\\Seen')) mockMarkRead(mockIds, true);
    }
    clearSelection();
  };

  const bulkMove = async (
    targetKind: 'archive' | 'spam' | 'trash',
    label: string,
  ): Promise<void> => {
    if (isLive && liveUids.length > 0) {
      const target = folderPathFor(targetKind);
      if (liveFolder === target) {
        push({ title: `Already in ${label}` });
        return;
      }
      const results = await Promise.allSettled(
        liveUids.map((uid) => moveMessage(uid, liveFolder, target)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) push({ title: summary(label), tone: 'success' });
      else push({ title: `${label}: ${failed} failed`, tone: 'danger' });
    }
    if (mockIds.length > 0) {
      if (targetKind === 'archive') mockArchive(mockIds);
      if (targetKind === 'spam') mockSpam(mockIds);
      if (targetKind === 'trash') mockTrash(mockIds);
    }
    clearSelection();
  };

  const bulkMoveToFolder = async (target: string, label: string): Promise<void> => {
    if (isLive && liveUids.length > 0) {
      const results = await Promise.allSettled(
        liveUids.map((uid) => moveMessage(uid, liveFolder, target)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) push({ title: summary(`moved to ${label}`), tone: 'success' });
      else push({ title: `Move: ${failed} failed`, tone: 'danger' });
    }
    if (mockIds.length > 0) mockMoveTo(mockIds, target);
    clearSelection();
  };

  const moveTargets = isLive
    ? liveFolders
        .filter((f) => f.path !== liveFolder)
        .map((f) => ({ key: f.path, label: f.path === 'INBOX' ? 'Inbox' : f.name }))
    : mockFolders.map((f) => ({ key: f.id, label: f.name }));

  return (
    <div className="flex items-center gap-1 px-4 sm:px-5 py-2.5 border-b border-surface-divider dark:border-dark-divider bg-brand-50 dark:bg-brand-900/10">
      <button
        onClick={clearSelection}
        aria-label="Clear selection"
        className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-[13px] font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/30"
      >
        <X size={14} />
        {selected.size} selected
      </button>
      <div className="mx-1 h-5 w-px bg-brand-200 dark:bg-brand-900/50" />
      <Tooltip label="Archive">
        <IconButton icon={<Archive size={16} />} label="Archive" onClick={() => void bulkMove('archive', 'archived')} />
      </Tooltip>
      <Tooltip label="Report spam">
        <IconButton icon={<ShieldAlert size={16} />} label="Spam" onClick={() => void bulkMove('spam', 'marked as spam')} />
      </Tooltip>
      <Tooltip label="Delete">
        <IconButton icon={<Trash2 size={16} />} label="Delete" onClick={() => void bulkMove('trash', 'moved to Trash')} />
      </Tooltip>
      <div className="mx-1 h-5 w-px bg-brand-200 dark:bg-brand-900/50" />
      <Tooltip label="Mark as read">
        <IconButton icon={<MailOpen size={16} />} label="Mark read" onClick={() => void bulkFlags(['\\Seen'], undefined, 'marked as read')} />
      </Tooltip>
      <Tooltip label="Mark as unread">
        <IconButton icon={<Mail size={16} />} label="Mark unread" onClick={() => void bulkFlags(undefined, ['\\Seen'], 'marked as unread')} />
      </Tooltip>
      <Dropdown
        width="w-56"
        trigger={({ toggle, open }) => (
          <IconButton
            icon={<MoveIcon size={16} />}
            label="Move to"
            onClick={toggle}
            tone={open ? 'active' : 'default'}
          />
        )}
      >
        {({ close }) => (
          <>
            <MenuSection label="Move to folder" />
            {moveTargets.slice(0, 20).map((f) => (
              <MenuItem
                key={f.key}
                label={f.label}
                onClick={() => {
                  void bulkMoveToFolder(f.key, f.label);
                  close();
                }}
              />
            ))}
          </>
        )}
      </Dropdown>
    </div>
  );
}
