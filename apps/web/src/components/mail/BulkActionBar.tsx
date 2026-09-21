import {
  Archive,
  Clock,
  Mail,
  MailOpen,
  MoreHorizontal,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { Dropdown, MenuItem, MenuSection } from '@/components/ui/Dropdown';
import { MoveHorizontal as MoveIcon } from 'lucide-react';

export function BulkActionBar(): JSX.Element {
  const selected = useMailStore((s) => s.selectedIds);
  const clearSelection = useMailStore((s) => s.clearSelection);
  const archive = useMailStore((s) => s.archive);
  const spam = useMailStore((s) => s.moveToSpam);
  const trash = useMailStore((s) => s.moveToTrash);
  const snooze = useMailStore((s) => s.snooze);
  const markRead = useMailStore((s) => s.markRead);
  const moveTo = useMailStore((s) => s.moveTo);
  const folders = useMailStore((s) => s.folders);
  const push = useUIStore((s) => s.pushToast);

  const ids = Array.from(selected);

  const doAction = (fn: () => void, msg: string): void => {
    fn();
    push({ title: `${ids.length} message${ids.length === 1 ? '' : 's'} — ${msg}`, tone: 'success' });
  };

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
        <IconButton
          icon={<Archive size={16} />}
          label="Archive"
          onClick={() => doAction(() => archive(ids), 'archived')}
        />
      </Tooltip>
      <Tooltip label="Report spam">
        <IconButton
          icon={<ShieldAlert size={16} />}
          label="Spam"
          onClick={() => doAction(() => spam(ids), 'marked as spam')}
        />
      </Tooltip>
      <Tooltip label="Delete">
        <IconButton
          icon={<Trash2 size={16} />}
          label="Delete"
          onClick={() => doAction(() => trash(ids), 'moved to Trash')}
        />
      </Tooltip>
      <div className="mx-1 h-5 w-px bg-brand-200 dark:bg-brand-900/50" />
      <Tooltip label="Mark as read">
        <IconButton
          icon={<MailOpen size={16} />}
          label="Mark read"
          onClick={() => doAction(() => markRead(ids, true), 'marked as read')}
        />
      </Tooltip>
      <Tooltip label="Mark as unread">
        <IconButton
          icon={<Mail size={16} />}
          label="Mark unread"
          onClick={() => doAction(() => markRead(ids, false), 'marked as unread')}
        />
      </Tooltip>
      <Tooltip label="Snooze">
        <IconButton
          icon={<Clock size={16} />}
          label="Snooze"
          onClick={() => doAction(() => snooze(ids), 'snoozed for 1 hour')}
        />
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
            {folders
              .filter((f) => !f.system || ['archive', 'spam', 'trash', 'inbox'].includes(f.id))
              .map((f) => (
                <MenuItem
                  key={f.id}
                  label={f.name}
                  onClick={() => {
                    doAction(() => moveTo(ids, f.id), `moved to ${f.name}`);
                    close();
                  }}
                />
              ))}
          </>
        )}
      </Dropdown>
      <Dropdown
        width="w-48"
        trigger={({ toggle, open }) => (
          <IconButton
            icon={<MoreHorizontal size={16} />}
            label="More"
            onClick={toggle}
            tone={open ? 'active' : 'default'}
          />
        )}
      >
        {({ close }) => (
          <>
            <MenuItem
              label="Add label"
              onClick={() => {
                push({ title: 'Labels — coming in a later phase' });
                close();
              }}
            />
            <MenuItem
              label="Mute conversation"
              onClick={() => {
                push({ title: 'Muted', tone: 'success' });
                close();
              }}
            />
          </>
        )}
      </Dropdown>
    </div>
  );
}
