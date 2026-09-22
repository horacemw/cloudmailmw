import { Paperclip, ShieldCheck, Star } from 'lucide-react';
import { useMailStore } from '@/store/useMailStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useUIStore } from '@/store/useUIStore';
import { Avatar } from '@/components/ui/Avatar';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn, formatTime } from '@/lib/utils';
import type { Email } from '@/types';

interface Props {
  email: Email;
  selected: boolean;
  active: boolean;
}

export function MessageRow({ email, selected, active }: Props): JSX.Element {
  const toggleSelected = useMailStore((s) => s.toggleSelected);
  const selectEmail = useMailStore((s) => s.selectEmail);
  const mockToggleStar = useMailStore((s) => s.toggleStar);
  const setPaneOpen = useUIStore((s) => s.setReadingPaneOpenMobile);
  const push = useUIStore((s) => s.pushToast);

  const isLive = useLiveMailStore((s) => s.mode) === 'ready';
  const liveFolder = useLiveMailStore((s) => s.activeFolder);
  const setFlags = useLiveMailStore((s) => s.setFlags);

  const handleStar = async (): Promise<void> => {
    if (isLive && email.id.startsWith('live-')) {
      const uid = Number.parseInt(email.id.slice(5), 10);
      if (!Number.isFinite(uid)) return;
      const nextStarred = !email.starred;
      try {
        await setFlags(
          uid,
          liveFolder,
          nextStarred ? ['\\Flagged'] : undefined,
          nextStarred ? undefined : ['\\Flagged'],
        );
      } catch (err) {
        push({ title: 'Star failed', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
      }
    } else {
      mockToggleStar(email.id);
    }
  };

  const unread = !email.read;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        selectEmail(email.id);
        setPaneOpen(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectEmail(email.id);
          setPaneOpen(true);
        }
      }}
      className={cn(
        'group relative flex items-start gap-3 px-4 sm:px-5 py-3 border-b border-surface-divider dark:border-dark-divider cursor-pointer transition-colors',
        active
          ? 'bg-brand-50/70 dark:bg-brand-900/15'
          : 'hover:bg-surface-hover dark:hover:bg-dark-hover',
        selected && 'bg-brand-50 dark:bg-brand-900/20',
      )}
    >
      {/* Unread indicator */}
      {unread && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand rounded-r"
        />
      )}

      <div className="pt-1.5 flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onChange={() => toggleSelected(email.id)}
          size="sm"
        />
        <button
          onClick={() => void handleStar()}
          aria-label={email.starred ? 'Unstar' : 'Star'}
          className={cn(
            'transition-colors',
            email.starred
              ? 'text-amber-400 hover:text-amber-500'
              : 'text-ink-faint hover:text-amber-400 opacity-0 group-hover:opacity-100',
            email.starred && 'opacity-100',
          )}
        >
          <Star size={14} fill={email.starred ? 'currentColor' : 'none'} />
        </button>
      </div>

      <Avatar name={email.from.name} email={email.from.email} size="md" />

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[13.5px]',
              unread
                ? 'font-semibold text-ink dark:text-dark-text'
                : 'font-medium text-ink dark:text-dark-text',
            )}
          >
            {email.from.name}
          </span>
          {email.trusted && (
            <ShieldCheck size={12} className="text-brand shrink-0" aria-label="Trusted sender" />
          )}
          <span className="ml-auto shrink-0 text-[11.5px] text-ink-muted dark:text-dark-muted tabular-nums">
            {formatTime(email.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={cn(
              'truncate text-[13px]',
              unread
                ? 'font-semibold text-ink dark:text-dark-text'
                : 'text-ink dark:text-dark-text',
            )}
          >
            {email.subject}
          </span>
          {email.attachments && email.attachments.length > 0 && (
            <Paperclip
              size={12}
              className="text-ink-muted dark:text-dark-muted shrink-0"
              aria-label="Has attachment"
            />
          )}
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-muted dark:text-dark-muted">
          {email.preview}
        </p>
      </div>
    </div>
  );
}
