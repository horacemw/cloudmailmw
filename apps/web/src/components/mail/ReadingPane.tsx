import {
  Archive,
  ArrowLeft,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  Download,
  FileText,
  Forward,
  Mail,
  MoreHorizontal,
  Printer,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useUIStore } from '@/store/useUIStore';
import { useAuthStore } from '@/store/useAuthStore';
import { api, ApiError } from '@/lib/apiClient';
import { sanitizeEmailHtml } from '@/lib/sanitizeHtml';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dropdown, MenuItem, MenuSection } from '@/components/ui/Dropdown';
import { formatLongTime, cn } from '@/lib/utils';
import type { Email } from '@/types';
import { MoveHorizontal as MoveIcon } from 'lucide-react';

interface LiveMessageDetail {
  uid: number;
  headers: {
    from: { name?: string; address: string }[];
    to: { name?: string; address: string }[];
    cc: { name?: string; address: string }[];
    date: string | null;
    subject: string;
    messageId: string | null;
  };
  html: string | null;
  text: string | null;
  attachments: { filename: string; contentType: string; size: number; contentId: string | null }[];
  flags: string[];
}

export function ReadingPane(): JSX.Element {
  const mockEmail = useMailStore((s) => s.currentEmail)();
  const selectedId = useMailStore((s) => s.selectedEmailId);
  const setPaneOpen = useUIStore((s) => s.setReadingPaneOpenMobile);
  const mode = useLiveMailStore((s) => s.mode);
  const isLive = mode === 'ready';
  const liveFolder = useLiveMailStore((s) => s.activeFolder);

  // For live-mode: fetch the full message body when the selected UID changes.
  const [liveDetail, setLiveDetail] = useState<LiveMessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const liveUid = useMemo(() => {
    if (!isLive || !selectedId?.startsWith('live-')) return null;
    return Number.parseInt(selectedId.slice(5), 10);
  }, [isLive, selectedId]);

  useEffect(() => {
    if (!isLive || liveUid == null || Number.isNaN(liveUid)) {
      setLiveDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    (async () => {
      try {
        const r = await api<LiveMessageDetail>(
          `/v1/mail/messages/${liveUid}?folder=${encodeURIComponent(liveFolder)}`,
        );
        if (!cancelled) setLiveDetail(r);
      } catch (err) {
        if (!cancelled)
          setDetailError(err instanceof ApiError ? err.message : 'Could not load message');
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive, liveUid, liveFolder]);

  // Adapt the live detail into the Phase-1 Email shape for the existing UI.
  const email: Email | null = useMemo(() => {
    if (isLive) {
      if (!liveDetail) return null;
      const from = liveDetail.headers.from?.[0];
      const to = liveDetail.headers.to ?? [];
      return {
        id: `live-${liveDetail.uid}`,
        folderId: liveFolder,
        from: from
          ? { name: from.name || from.address, email: from.address }
          : { name: '(unknown)', email: '' },
        to: to.map((t) => ({ name: t.name || t.address, email: t.address })),
        cc: (liveDetail.headers.cc ?? []).map((t) => ({
          name: t.name || t.address,
          email: t.address,
        })),
        subject: liveDetail.headers.subject || '(no subject)',
        preview: '',
        bodyHtml:
          liveDetail.html != null
            ? sanitizeEmailHtml(liveDetail.html)
            : liveDetail.text
              ? `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeText(liveDetail.text)}</pre>`
              : '<p style="color:#8A9690;">(empty message body)</p>',
        timestamp: liveDetail.headers.date ?? new Date().toISOString(),
        read: liveDetail.flags?.includes('\\Seen') ?? true,
        starred: liveDetail.flags?.includes('\\Flagged') ?? false,
        attachments: liveDetail.attachments.map((a, i) => ({
          id: `${liveDetail.uid}-${i}`,
          name: a.filename,
          size: humanSize(a.size),
          type: guessAttachmentKind(a.contentType, a.filename),
        })),
      };
    }
    return mockEmail;
  }, [isLive, liveDetail, liveFolder, mockEmail]);

  if (isLive && loadingDetail && !email) {
    return (
      <section className="flex flex-col h-full min-h-0 bg-white dark:bg-dark-panel">
        <div className="p-6">
          <div className="h-4 w-64 mb-3 shimmer rounded" />
          <div className="h-3 w-40 mb-6 shimmer rounded" />
          <div className="h-3 w-full mb-2 shimmer rounded" />
          <div className="h-3 w-full mb-2 shimmer rounded" />
          <div className="h-3 w-2/3 shimmer rounded" />
        </div>
      </section>
    );
  }
  if (isLive && detailError) {
    return (
      <section className="flex flex-col h-full min-h-0 bg-white dark:bg-dark-panel">
        <EmptyState
          icon={<Mail size={22} />}
          title="Could not load message"
          description={detailError}
          className="my-auto"
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col h-full min-h-0 bg-white dark:bg-dark-panel">
      {email ? (
        <>
          <ReadingToolbar email={email} onBack={() => setPaneOpen(false)} />
          <div className="flex-1 overflow-y-auto scroll-thin">
            <EmailHeader email={email} />
            {email.trusted && <TrustedBanner />}
            <div className="px-6 sm:px-8 py-6 email-prose" dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
            {email.attachments && email.attachments.length > 0 && (
              <AttachmentList attachments={email.attachments} />
            )}
            <ReplyActions email={email} />
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Mail size={22} />}
          title="Select a message"
          description="Pick a conversation from the list to read it here."
          className="my-auto"
        />
      )}
    </section>
  );
}

function ReadingToolbar({ email, onBack }: { email: Email; onBack: () => void }): JSX.Element {
  const toggleStar = useMailStore((s) => s.toggleStar);
  const archive = useMailStore((s) => s.archive);
  const spam = useMailStore((s) => s.moveToSpam);
  const trash = useMailStore((s) => s.moveToTrash);
  const snooze = useMailStore((s) => s.snooze);
  const markRead = useMailStore((s) => s.markRead);
  const moveTo = useMailStore((s) => s.moveTo);
  const folders = useMailStore((s) => s.folders);
  const selectEmail = useMailStore((s) => s.selectEmail);
  const push = useUIStore((s) => s.pushToast);

  const act = (fn: () => void, msg: string): void => {
    fn();
    push({ title: msg, tone: 'success' });
  };

  return (
    <div className="flex items-center gap-1 px-3 sm:px-5 h-14 border-b border-surface-divider dark:border-dark-divider">
      <Tooltip label="Back">
        <IconButton
          icon={<ArrowLeft size={16} />}
          label="Back"
          onClick={onBack}
          className="lg:hidden"
        />
      </Tooltip>
      <Tooltip label="Archive (E)">
        <IconButton
          icon={<Archive size={16} />}
          label="Archive"
          onClick={() => {
            act(() => archive([email.id]), 'Archived');
            selectEmail(null);
          }}
        />
      </Tooltip>
      <Tooltip label="Report spam">
        <IconButton
          icon={<ShieldAlert size={16} />}
          label="Spam"
          onClick={() => {
            act(() => spam([email.id]), 'Reported as spam');
            selectEmail(null);
          }}
        />
      </Tooltip>
      <Tooltip label="Delete (⌫)">
        <IconButton
          icon={<Trash2 size={16} />}
          label="Delete"
          onClick={() => {
            act(() => trash([email.id]), 'Moved to Trash');
            selectEmail(null);
          }}
        />
      </Tooltip>
      <div className="mx-1 h-5 w-px bg-surface-divider dark:bg-dark-divider" />
      <Tooltip label="Mark as unread">
        <IconButton
          icon={<Mail size={16} />}
          label="Mark unread"
          onClick={() => act(() => markRead([email.id], false), 'Marked as unread')}
        />
      </Tooltip>
      <Tooltip label="Snooze">
        <IconButton
          icon={<Clock size={16} />}
          label="Snooze"
          onClick={() => {
            act(() => snooze([email.id]), 'Snoozed for 1 hour');
            selectEmail(null);
          }}
        />
      </Tooltip>
      <Dropdown
        width="w-52"
        trigger={({ toggle, open }) => (
          <Tooltip label="Move to">
            <IconButton
              icon={<MoveIcon size={16} />}
              label="Move"
              onClick={toggle}
              tone={open ? 'active' : 'default'}
            />
          </Tooltip>
        )}
      >
        {({ close }) => (
          <>
            <MenuSection label="Move to folder" />
            {folders
              .filter((f) => f.id !== email.folderId && f.id !== 'starred')
              .slice(0, 12)
              .map((f) => (
                <MenuItem
                  key={f.id}
                  label={f.name}
                  onClick={() => {
                    act(() => moveTo([email.id], f.id), `Moved to ${f.name}`);
                    close();
                  }}
                />
              ))}
          </>
        )}
      </Dropdown>
      <Tooltip label="Labels">
        <IconButton
          icon={<Tag size={16} />}
          label="Labels"
          onClick={() => push({ title: 'Labels — coming in a later phase' })}
        />
      </Tooltip>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip label={email.starred ? 'Unstar' : 'Star'}>
          <IconButton
            icon={
              <Star
                size={16}
                fill={email.starred ? 'currentColor' : 'none'}
              />
            }
            label={email.starred ? 'Unstar' : 'Star'}
            tone={email.starred ? 'active' : 'default'}
            onClick={() => toggleStar(email.id)}
            className={email.starred ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : ''}
          />
        </Tooltip>
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
                icon={<Printer size={14} />}
                label="Print"
                onClick={() => {
                  window.print();
                  close();
                }}
              />
              <MenuItem
                icon={<Download size={14} />}
                label="Download original"
                onClick={() => {
                  push({ title: 'Message downloaded (demo)', tone: 'success' });
                  close();
                }}
              />
              <MenuItem
                label="Block sender"
                onClick={() => {
                  push({ title: `${email.from.email} blocked`, tone: 'success' });
                  close();
                }}
              />
            </>
          )}
        </Dropdown>
      </div>
    </div>
  );
}

/* ─── helpers ──────────────────────────────────────────────────── */

function humanSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
function guessAttachmentKind(mime: string, name: string): 'pdf' | 'image' | 'doc' | 'sheet' | 'zip' | 'other' {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx')) return 'doc';
  if (m.includes('sheet') || m.includes('excel') || n.endsWith('.xls') || n.endsWith('.xlsx') || n.endsWith('.csv')) return 'sheet';
  if (m.includes('zip') || n.endsWith('.zip')) return 'zip';
  return 'other';
}

function EmailHeader({ email }: { email: Email }): JSX.Element {
  const authUserEmail = useAuthStore((s) => s.user?.email ?? '');
  return (
    <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-surface-divider dark:border-dark-divider">
      <h2 className="text-[20px] sm:text-[22px] font-semibold text-ink dark:text-dark-text leading-snug tracking-tight">
        {email.subject}
      </h2>
      <div className="mt-4 flex items-start gap-3">
        <Avatar name={email.from.name} email={email.from.email} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold text-ink dark:text-dark-text">
              {email.from.name}
            </span>
            <span className="text-[12.5px] text-ink-muted dark:text-dark-muted">
              &lt;{email.from.email}&gt;
            </span>
          </div>
          <p className="text-[12.5px] text-ink-muted dark:text-dark-muted">
            to {email.to.map((t) => (authUserEmail && t.email === authUserEmail ? 'me' : t.name)).join(', ')}
            {email.cc && email.cc.length > 0 && (
              <> · cc {email.cc.map((t) => t.name).join(', ')}</>
            )}
          </p>
        </div>
        <span className="text-[12.5px] text-ink-muted dark:text-dark-muted whitespace-nowrap">
          {formatLongTime(email.timestamp)}
        </span>
      </div>
    </div>
  );
}

function TrustedBanner(): JSX.Element {
  return (
    <div className="mx-6 sm:mx-8 mt-4 flex items-center gap-2 rounded-lg bg-brand-50 border border-brand-100 text-brand-800 px-3 py-2 text-[12.5px] dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
      <ShieldCheck size={14} className="text-brand" />
      This message is from a trusted sender.
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: NonNullable<Email['attachments']> }): JSX.Element {
  return (
    <div className="px-6 sm:px-8 pb-6">
      <p className="text-[12px] uppercase tracking-wider font-semibold text-ink-faint dark:text-dark-faint mb-2">
        {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {attachments.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-surface-border dark:border-dark-border p-3 hover:border-brand-300 transition-colors"
          >
            <div
              className={cn(
                'h-9 w-9 rounded-lg flex items-center justify-center',
                a.type === 'pdf'
                  ? 'bg-rose-100 text-rose-700'
                  : a.type === 'doc'
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-emerald-100 text-emerald-700',
              )}
            >
              <FileText size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-ink dark:text-dark-text truncate">
                {a.name}
              </p>
              <p className="text-[11.5px] text-ink-muted dark:text-dark-muted">{a.size}</p>
            </div>
            <button
              aria-label={`Download ${a.name}`}
              className="text-ink-muted hover:text-brand-700 dark:text-dark-muted dark:hover:text-brand-300"
            >
              <Download size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReplyActions({ email }: { email: Email }): JSX.Element {
  const openCompose = useUIStore((s) => s.openCompose);

  const replyPrefill = (mode: 'reply' | 'replyAll' | 'forward') => {
    const subject =
      mode === 'forward'
        ? email.subject.startsWith('Fwd:')
          ? email.subject
          : `Fwd: ${email.subject}`
        : email.subject.startsWith('Re:')
          ? email.subject
          : `Re: ${email.subject}`;
    const quoted = `\n\n\n---\nOn ${new Date(email.timestamp).toLocaleString()}, ${email.from.name} <${email.from.email}> wrote:\n> ${email.preview}`;
    const to = mode === 'forward' ? '' : email.from.email;
    return { to, subject, body: quoted };
  };

  return (
    <div className="px-6 sm:px-8 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="md"
          leftIcon={<Reply size={15} />}
          onClick={() => openCompose(replyPrefill('reply'))}
        >
          Reply
        </Button>
        <Button
          variant="secondary"
          size="md"
          leftIcon={<ReplyAll size={15} />}
          onClick={() => openCompose(replyPrefill('replyAll'))}
        >
          Reply all
        </Button>
        <Button
          variant="secondary"
          size="md"
          leftIcon={<Forward size={15} />}
          onClick={() => openCompose(replyPrefill('forward'))}
        >
          Forward
        </Button>
        <div className="ml-auto hidden sm:flex items-center gap-1 text-[11.5px] text-ink-faint dark:text-dark-faint">
          <CornerUpLeft size={11} /> Press R to reply · F to forward
          <CornerUpRight size={11} className="ml-1" />
        </div>
      </div>
    </div>
  );
}
