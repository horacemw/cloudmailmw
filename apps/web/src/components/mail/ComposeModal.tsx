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
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { CURRENT_USER } from '@/data/mockData';
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
  const sendEmail = useMailStore((s) => s.sendEmail);
  const saveDraft = useMailStore((s) => s.saveDraft);
  const updateDraft = useMailStore((s) => s.updateDraft);
  const deleteDraft = useMailStore((s) => s.deleteDraft);
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
          from: { name: CURRENT_USER.name, email: CURRENT_USER.email },
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
  }, [compose, saveDraft, updateDraft, setField, signature]);

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
    // Fallback: mock store for demo mode.
    sendEmail({
      from: { name: CURRENT_USER.name, email: CURRENT_USER.email },
      to: parseContacts(compose.to),
      cc: compose.cc ? parseContacts(compose.cc) : undefined,
      bcc: compose.bcc ? parseContacts(compose.bcc) : undefined,
      subject: compose.subject || '(no subject)',
      preview: compose.body.slice(0, 140).replace(/\s+/g, ' '),
      bodyHtml: bodyToHtml(compose.body, signature),
      starred: false,
    });
    if (draftIdRef.current) deleteDraft(draftIdRef.current);
    push({ title: 'Message sent (demo)', tone: 'success' });
    closeCompose();
  };

  const handleSaveDraft = (): void => {
    const payload = draftPayload(compose, signature);
    if (draftIdRef.current) {
      updateDraft(draftIdRef.current, payload);
    } else {
      saveDraft({
        from: { name: CURRENT_USER.name, email: CURRENT_USER.email },
        to: payload.to ?? [],
        subject: payload.subject ?? '',
        preview: payload.preview ?? '',
        bodyHtml: payload.bodyHtml ?? '',
        starred: false,
      });
    }
    push({ title: 'Draft saved', tone: 'success' });
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
          <div className="inline-flex rounded-lg overflow-hidden">
            <Button
              variant="primary"
              size="md"
              onClick={handleSend}
              className="rounded-r-none pr-4"
            >
              Send
            </Button>
            <button
              aria-label="Send options"
              className="bg-brand text-white hover:bg-brand-600 w-9 rounded-r-lg border-l border-white/20 flex items-center justify-center"
              onClick={() => push({ title: 'Scheduled send — coming soon' })}
            >
              <ChevronDown size={14} />
            </button>
          </div>
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
