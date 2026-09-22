import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  ChevronDown,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Save,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useMailStore } from '@/store/useMailStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { RecipientChipInput } from './RecipientChipInput';
import { useResource } from '@/lib/hooks';

interface RemoteSignature {
  id: string;
  name: string;
  html: string;
  isDefault: boolean;
}

export function ComposeModal(): JSX.Element | null {
  const compose = useUIStore((s) => s.compose);
  const setField = useUIStore((s) => s.setComposeField);
  const closeCompose = useUIStore((s) => s.closeCompose);
  const minimizeCompose = useUIStore((s) => s.minimizeCompose);
  const push = useUIStore((s) => s.pushToast);
  const signature = useUIStore((s) => s.signature);
  const saveDraft = useMailStore((s) => s.saveDraft);
  const updateDraft = useMailStore((s) => s.updateDraft);
  const deleteDraft = useMailStore((s) => s.deleteDraft);
  const authUser = useAuthStore((s) => s.user);
  const [maximized, setMaximized] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const draftIdRef = useRef<string | null>(compose.draftId);

  // Signatures (live-mode only). Cached — one fetch per session.
  const liveModeReady = useLiveMailStore((s) => s.mode) === 'ready';
  const { data: sigData } = useResource<{ signatures: RemoteSignature[] }>(
    liveModeReady ? '/v1/signatures' : null,
  );
  const signatures = sigData?.signatures ?? [];
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  useEffect(() => {
    if (signatures.length === 0 || selectedSignatureId !== null) return;
    setSelectedSignatureId(signatures.find((s) => s.isDefault)?.id ?? signatures[0]!.id);
  }, [signatures, selectedSignatureId]);
  const activeSignatureHtml =
    signatures.find((s) => s.id === selectedSignatureId)?.html ?? null;

  useEffect(() => {
    draftIdRef.current = compose.draftId;
  }, [compose.draftId]);

  // Auto-save every 4 seconds when there is anything meaningful
  useEffect(() => {
    if (!compose.open) return;
    const hasContent = compose.to || compose.subject || compose.body;
    if (!hasContent) return;
    const t = setInterval(() => {
      const payload = draftPayload(compose, signature);
      if (draftIdRef.current) {
        updateDraft(draftIdRef.current, payload);
      } else {
        const id = saveDraft({
          from: { name: authUser?.name ?? '', email: authUser?.email ?? '' },
          to: payload.to ?? [],
          subject: payload.subject ?? '',
          preview: payload.preview ?? '',
          bodyHtml: payload.bodyHtml ?? '',
          starred: false,
        });
        draftIdRef.current = id;
        setField('draftId', id);
      }
      setAutoSavedAt(new Date());
    }, 4000);
    return () => clearInterval(t);
  }, [compose, saveDraft, updateDraft, setField, signature, authUser]);

  if (!compose.open) return null;

  const handleSend = async (): Promise<void> => {
    if (!compose.to.trim()) {
      push({ title: 'Please add at least one recipient', tone: 'warning' });
      return;
    }
    // Prefer real send when the mail server is reachable AND user has a real mailbox.
    const liveMode = useLiveMailStore.getState().mode;
    if (liveMode === 'ready') {
      try {
        // If the user has selected a real HTML signature, use it instead of
        // the plain-text fallback. The server sanitises signature HTML on
        // save AND turns cid:… image refs into inline nodemailer attachments
        // so external clients render them.
        const htmlBody = activeSignatureHtml
          ? composeBodyWithHtmlSignature(compose.body, activeSignatureHtml)
          : bodyToHtml(compose.body, signature);
        await useLiveMailStore.getState().send({
          to: parseContacts(compose.to).map((c) => c.email),
          cc: compose.cc ? parseContacts(compose.cc).map((c) => c.email) : undefined,
          bcc: compose.bcc ? parseContacts(compose.bcc).map((c) => c.email) : undefined,
          subject: compose.subject || '(no subject)',
          text: compose.body,
          html: htmlBody,
          idempotencyKey:
            typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `k_${Date.now()}`,
        });
        if (draftIdRef.current) deleteDraft(draftIdRef.current);
        // If we resumed an IMAP-stored draft, delete the old copy from Drafts
        // so the user isn't left with both a Sent copy and a stale draft.
        if (compose.liveDraftReplaceUid != null) {
          const store = useLiveMailStore.getState();
          const draftsPath = store.folderPathFor('drafts');
          const trashPath = store.folderPathFor('trash');
          store
            .moveMessage(compose.liveDraftReplaceUid, draftsPath, trashPath)
            .catch(() => { /* best-effort — send already succeeded */ });
        }
        push({ title: 'Message sent', tone: 'success' });
        closeCompose();
        return;
      } catch (err) {
        push({
          title: 'Send failed',
          description: err instanceof Error ? err.message : 'Please try again',
          tone: 'danger',
        });
        return;
      }
    }
    // No live mailbox → cannot actually send. Never fake a success — tell the
    // user honestly and leave the draft intact so they can retry after
    // connecting a mailbox.
    push({
      title: 'Cannot send — no live mailbox connected',
      description: 'Add and verify a domain, then create a mailbox to send real mail from MailCloud.',
      tone: 'warning',
    });
  };

  const handleSaveDraft = async (): Promise<void> => {
    const liveMode = useLiveMailStore.getState().mode;
    if (liveMode === 'ready') {
      // Real IMAP draft — round-trip through /v1/mail/drafts so it survives
      // page reload and appears in the Drafts folder for other clients.
      try {
        const htmlBody = activeSignatureHtml
          ? composeBodyWithHtmlSignature(compose.body, activeSignatureHtml)
          : bodyToHtml(compose.body, signature);
        const result = await useLiveMailStore.getState().saveDraft({
          to: compose.to ? parseContacts(compose.to).map((c) => c.email) : [],
          cc: compose.cc ? parseContacts(compose.cc).map((c) => c.email) : undefined,
          bcc: compose.bcc ? parseContacts(compose.bcc).map((c) => c.email) : undefined,
          subject: compose.subject || '(no subject)',
          text: compose.body,
          html: htmlBody,
          replaceUid: compose.liveDraftReplaceUid ?? undefined,
        });
        // Refresh the current folder if we're sitting in Drafts so the new
        // draft appears (or the replaced one is gone).
        const store = useLiveMailStore.getState();
        const draftsPath = store.folderPathFor('drafts');
        if (store.activeFolder === draftsPath) void store.refreshMessages();
        push({ title: 'Draft saved', tone: 'success' });
        void result;
      } catch (err) {
        push({
          title: 'Save failed',
          description: err instanceof Error ? err.message : 'Could not save the draft',
          tone: 'danger',
        });
        return;
      }
      closeCompose();
      return;
    }
    // No live mailbox: fall back to the local mock draft store (memory only).
    const payload = draftPayload(compose, signature);
    if (draftIdRef.current) {
      updateDraft(draftIdRef.current, payload);
    } else {
      saveDraft({
        from: { name: authUser?.name ?? '', email: authUser?.email ?? '' },
        to: payload.to ?? [],
        subject: payload.subject ?? '',
        preview: payload.preview ?? '',
        bodyHtml: payload.bodyHtml ?? '',
        starred: false,
      });
    }
    push({ title: 'Draft saved (local)', tone: 'success' });
    closeCompose();
  };

  const handleDiscard = (): void => {
    if (draftIdRef.current) deleteDraft(draftIdRef.current);
    push({ title: 'Draft discarded' });
    closeCompose();
  };

  // Minimized state — a small pill at the bottom right
  if (compose.minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border shadow-pop animate-slide-up">
        <button
          onClick={() => minimizeCompose(false)}
          className="text-[13px] font-medium text-ink dark:text-dark-text hover:underline max-w-[220px] truncate"
        >
          {compose.subject || 'New message'}
        </button>
        <button
          onClick={() => minimizeCompose(false)}
          aria-label="Expand"
          className="text-ink-muted hover:text-ink"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={handleDiscard}
          aria-label="Discard"
          className="text-ink-muted hover:text-state-danger"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-6 sm:pb-6 p-0 sm:p-4 pointer-events-none animate-fade-in"
      aria-modal
      role="dialog"
    >
      <div
        className={cn(
          'pointer-events-auto flex flex-col bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border shadow-pop overflow-hidden',
          'w-full',
          maximized
            ? 'h-[100dvh] sm:h-[90vh] sm:max-w-4xl rounded-none sm:rounded-2xl'
            : 'h-[100dvh] sm:h-auto sm:max-w-xl rounded-none sm:rounded-2xl',
          'animate-slide-up',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 h-11 bg-ink text-white dark:bg-dark-bg">
          <span className="text-[13px] font-semibold flex-1 truncate">
            {compose.subject || 'New Message'}
          </span>
          <button
            aria-label="Minimize"
            onClick={() => minimizeCompose(true)}
            className="text-white/70 hover:text-white"
          >
            <Minus size={14} />
          </button>
          <button
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => setMaximized((v) => !v)}
            className="text-white/70 hover:text-white"
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            aria-label="Close"
            onClick={handleSaveDraft}
            className="text-white/70 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto scroll-thin">
          <RecipientRow
            label="To"
            ariaLabel="To recipients"
            value={compose.to}
            onChange={(v) => setField('to', v)}
            placeholder="Recipients"
            trailing={
              !compose.showCcBcc && (
                <button
                  onClick={() => setField('showCcBcc', true)}
                  className="text-[12px] font-medium text-ink-muted hover:text-brand-700 dark:text-dark-muted"
                >
                  Cc · Bcc
                </button>
              )
            }
          />
          {compose.showCcBcc && (
            <>
              <RecipientRow
                label="Cc"
                ariaLabel="Cc recipients"
                value={compose.cc}
                onChange={(v) => setField('cc', v)}
                placeholder="Cc"
              />
              <RecipientRow
                label="Bcc"
                ariaLabel="Bcc recipients"
                value={compose.bcc}
                onChange={(v) => setField('bcc', v)}
                placeholder="Bcc"
              />
            </>
          )}
          <FieldRow
            label="Subject"
            value={compose.subject}
            onChange={(v) => setField('subject', v)}
            placeholder="Subject"
          />

          <textarea
            value={compose.body}
            onChange={(e) => setField('body', e.target.value)}
            placeholder="Write your message…"
            className={cn(
              'w-full min-h-[220px] px-4 py-3 text-[14px] leading-6 outline-none resize-none bg-transparent',
              'placeholder:text-ink-muted dark:placeholder:text-dark-muted',
            )}
          />
          {/* Signature preview area — real HTML from the /v1/signatures list
              when live, plain-text fallback otherwise. Read-only. */}
          {activeSignatureHtml ? (
            <div className="px-4 pb-3 border-t border-dashed border-surface-divider dark:border-dark-divider pt-2 mt-2">
              <div
                className="text-[13px] text-ink-muted dark:text-dark-muted email-prose max-w-none"
                dangerouslySetInnerHTML={{ __html: activeSignatureHtml }}
              />
            </div>
          ) : (
            <div className="px-4 pb-3 text-[12px] text-ink-muted whitespace-pre-line border-t border-dashed border-surface-divider dark:border-dark-divider dark:text-dark-muted pt-2 mt-2">
              {signature}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t border-surface-divider dark:border-dark-divider">
          <SendSplitButton
            onSendNow={handleSend}
            onScheduled={async (sendAt) => {
              const liveMode = useLiveMailStore.getState().mode;
              if (liveMode !== 'ready') {
                push({ title: 'Scheduled send needs live mailbox', tone: 'warning' });
                return;
              }
              if (!compose.to.trim()) {
                push({ title: 'Please add at least one recipient', tone: 'warning' });
                return;
              }
              try {
                const htmlBody = activeSignatureHtml
                  ? composeBodyWithHtmlSignature(compose.body, activeSignatureHtml)
                  : bodyToHtml(compose.body, signature);
                const { api } = await import('@/lib/apiClient');
                await api('/v1/mail/schedule', {
                  method: 'POST',
                  body: JSON.stringify({
                    to: parseContacts(compose.to).map((c) => c.email),
                    cc: compose.cc ? parseContacts(compose.cc).map((c) => c.email) : undefined,
                    bcc: compose.bcc ? parseContacts(compose.bcc).map((c) => c.email) : undefined,
                    subject: compose.subject || '(no subject)',
                    text: compose.body,
                    html: htmlBody,
                    sendAt: sendAt.toISOString(),
                  }),
                });
                if (draftIdRef.current) deleteDraft(draftIdRef.current);
                push({
                  title: `Scheduled for ${sendAt.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
                  tone: 'success',
                });
                closeCompose();
              } catch (err) {
                push({
                  title: 'Scheduling failed',
                  description: err instanceof Error ? err.message : 'Please try again',
                  tone: 'danger',
                });
              }
            }}
          />
          <FormatToolbar />
          {signatures.length > 0 && (
            <label className="flex items-center gap-1 text-[12px] text-ink-muted dark:text-dark-muted ml-1">
              <span className="hidden sm:inline">Signature:</span>
              <select
                value={selectedSignatureId ?? ''}
                onChange={(e) => setSelectedSignatureId(e.target.value || null)}
                className="h-7 rounded-md border border-surface-border bg-white px-2 text-[12px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
              >
                <option value="">None</option>
                {signatures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="ml-auto flex items-center gap-1 text-ink-muted dark:text-dark-muted">
            <Tooltip label="Save draft">
              <IconButton icon={<Save size={15} />} label="Save draft" onClick={handleSaveDraft} />
            </Tooltip>
            <Tooltip label="Discard draft">
              <IconButton
                icon={<Trash2 size={15} />}
                label="Discard"
                tone="danger"
                onClick={handleDiscard}
              />
            </Tooltip>
          </div>
          {autoSavedAt && (
            <span className="w-full text-right text-[11px] text-ink-faint dark:text-dark-faint">
              Draft saved · {autoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  placeholder,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  trailing?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-4 h-11 border-b border-surface-divider dark:border-dark-divider">
      <span className="w-14 text-[12px] text-ink-muted dark:text-dark-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-muted dark:text-dark-text dark:placeholder:text-dark-muted"
      />
      {trailing}
    </div>
  );
}

function RecipientRow({
  label,
  ariaLabel,
  value,
  onChange,
  placeholder,
  trailing,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  trailing?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-start gap-2 px-4 py-2 border-b border-surface-divider dark:border-dark-divider min-h-[44px]">
      <span className="w-14 mt-1 text-[12px] text-ink-muted dark:text-dark-muted shrink-0">
        {label}
      </span>
      <RecipientChipInput
        ariaLabel={ariaLabel}
        value={value}
        onChange={onChange}
        {...(placeholder !== undefined ? { placeholder } : {})}
      />
      {trailing && <span className="mt-1 shrink-0">{trailing}</span>}
    </div>
  );
}

function FormatToolbar(): JSX.Element {
  const push = useUIStore((s) => s.pushToast);
  const notice = (): void =>
    push({ title: 'Rich formatting demo', description: 'A full editor will land in Phase 2.' });
  return (
    <div className="flex items-center gap-0 border-l border-surface-divider dark:border-dark-divider ml-1 pl-1">
      <IconButton icon={<Bold size={14} />} label="Bold" size="sm" onClick={notice} />
      <IconButton icon={<Italic size={14} />} label="Italic" size="sm" onClick={notice} />
      <IconButton icon={<Underline size={14} />} label="Underline" size="sm" onClick={notice} />
      <IconButton icon={<List size={14} />} label="Bulleted list" size="sm" onClick={notice} />
      <IconButton icon={<ListOrdered size={14} />} label="Numbered list" size="sm" onClick={notice} />
      <IconButton icon={<Link2 size={14} />} label="Insert link" size="sm" onClick={notice} />
      <IconButton icon={<Paperclip size={14} />} label="Attach file" size="sm" onClick={notice} />
      <IconButton icon={<ImageIcon size={14} />} label="Insert image" size="sm" onClick={notice} />
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────────── */

function parseContacts(csv: string): { name: string; email: string }[] {
  return csv
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*)<([^>]+)>$/);
      if (m) return { name: m[1]!.trim() || m[2]!.trim(), email: m[2]!.trim() };
      return { name: s, email: s };
    });
}

function bodyToHtml(body: string, signature: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = escape(body)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const sig = escape(signature).replace(/\n/g, '<br/>');
  return `${paragraphs}<p style="color:#8A9690; font-size:12px;">${sig}</p>`;
}

/**
 * Combine the user's plain-text body with a rich HTML signature. The plain
 * text is escaped + paragraph-wrapped so it renders correctly; the signature
 * HTML is already server-sanitised and safe to concatenate.
 */
function composeBodyWithHtmlSignature(body: string, signatureHtml: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = escape(body)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `${paragraphs}<br/><div class="cloudmail-signature">${signatureHtml}</div>`;
}

function SendSplitButton({
  onSendNow,
  onScheduled,
}: {
  onSendNow: () => void;
  onScheduled: (sendAt: Date) => void | Promise<void>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open && !customOpen) return;
    const onDoc = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, customOpen]);

  // Preset "Tomorrow morning" = tomorrow 08:00 local.
  const tomorrowMorning = (): Date => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  };
  // "This afternoon" = today 14:00 local (or tomorrow if past).
  const laterToday = (): Date => {
    const d = new Date();
    if (d.getHours() >= 13) d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    return d;
  };
  const mondayMorning = (): Date => {
    const d = new Date();
    const daysUntilMon = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMon);
    d.setHours(8, 0, 0, 0);
    return d;
  };

  const fmt = (d: Date): string =>
    d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const submitCustom = (): void => {
    const d = new Date(customValue);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 30_000) return;
    void onScheduled(d);
    setCustomOpen(false);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-flex rounded-lg overflow-hidden">
      <Button variant="primary" size="md" onClick={onSendNow} className="rounded-r-none pr-4">
        Send
      </Button>
      <button
        aria-label="Send options"
        className="bg-brand text-white hover:bg-brand-600 w-9 rounded-r-lg border-l border-white/20 flex items-center justify-center"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown size={14} />
      </button>
      {open && !customOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-64 rounded-xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border shadow-pop overflow-hidden z-40">
          <button
            className="w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-surface-hover dark:hover:bg-dark-hover"
            onClick={() => { void onScheduled(laterToday()); setOpen(false); }}
          >
            <div className="font-medium">Later today</div>
            <div className="text-[11.5px] text-ink-muted dark:text-dark-muted">{fmt(laterToday())}</div>
          </button>
          <button
            className="w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-surface-hover dark:hover:bg-dark-hover"
            onClick={() => { void onScheduled(tomorrowMorning()); setOpen(false); }}
          >
            <div className="font-medium">Tomorrow morning</div>
            <div className="text-[11.5px] text-ink-muted dark:text-dark-muted">{fmt(tomorrowMorning())}</div>
          </button>
          <button
            className="w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-surface-hover dark:hover:bg-dark-hover"
            onClick={() => { void onScheduled(mondayMorning()); setOpen(false); }}
          >
            <div className="font-medium">Monday morning</div>
            <div className="text-[11.5px] text-ink-muted dark:text-dark-muted">{fmt(mondayMorning())}</div>
          </button>
          <div className="h-px bg-surface-divider dark:bg-dark-divider" />
          <button
            className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20"
            onClick={() => setCustomOpen(true)}
          >
            Pick date & time…
          </button>
        </div>
      )}
      {customOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-72 rounded-xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border shadow-pop p-3 z-40">
          <label className="block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted mb-1">
            Send at (your timezone)
          </label>
          <input
            type="datetime-local"
            value={customValue}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            onChange={(e) => setCustomValue(e.target.value)}
            className="w-full h-10 rounded-lg border border-surface-border bg-white dark:bg-dark-panel dark:border-dark-border px-3 text-[13.5px] outline-none focus:border-brand"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              className="h-8 px-3 rounded-lg text-[12.5px] border border-surface-border dark:border-dark-border hover:bg-surface-hover dark:hover:bg-dark-hover"
              onClick={() => { setCustomOpen(false); setOpen(false); }}
            >
              Cancel
            </button>
            <button
              disabled={!customValue}
              className="h-8 px-3 rounded-lg text-[12.5px] font-semibold bg-brand text-white hover:bg-brand-600 disabled:opacity-50"
              onClick={submitCustom}
            >
              Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function draftPayload(
  compose: ReturnType<typeof useUIStore.getState>['compose'],
  signature: string,
): {
  to?: { name: string; email: string }[];
  subject?: string;
  preview?: string;
  bodyHtml?: string;
} {
  return {
    to: parseContacts(compose.to),
    subject: compose.subject,
    preview: (compose.body || '').slice(0, 140),
    bodyHtml: bodyToHtml(compose.body, signature),
  };
}
