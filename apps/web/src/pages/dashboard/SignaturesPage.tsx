import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle, Bold, CheckCircle2, Image as ImageIcon, Italic, Link as LinkIcon,
  List, ListOrdered, Loader2, PenLine, Plus, Star, Trash2, Underline as UnderlineIcon,
} from 'lucide-react';
import { PageHeader } from './DashboardShell';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface Signature {
  id: string;
  name: string;
  html: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function SignaturesPage(): JSX.Element {
  const { data, refetch, loading } = useResource<{ signatures: Signature[] }>('/v1/signatures');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const rows = data?.signatures ?? [];

  // Auto-select the default or first on load.
  useEffect(() => {
    if (rows.length === 0 || selectedId) return;
    setSelectedId(rows.find((s) => s.isDefault)?.id ?? rows[0]!.id);
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Signatures"
        description="Multiple signatures with rich text and inline images that render in every mail client."
        actions={
          <button
            onClick={() => { setCreating(true); setSelectedId(null); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-600"
          >
            <Plus size={15} /> New signature
          </button>
        }
      />
      <div className="p-6 grid gap-6 lg:grid-cols-[280px_1fr] max-w-6xl">
        {/* List */}
        <aside className="rounded-xl border border-surface-border bg-white p-2 dark:bg-dark-card dark:border-dark-border h-fit">
          {loading && rows.length === 0 && <p className="p-3 text-[13px] text-ink-muted">Loading…</p>}
          {!loading && rows.length === 0 && !creating && (
            <EmptyState icon={<PenLine size={22} />} title="No signatures yet" description="Create one to auto-append to new messages." />
          )}
          {rows.length > 0 && (
            <ul className="space-y-0.5">
              {rows.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => { setSelectedId(s.id); setCreating(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13.5px] text-left',
                      selectedId === s.id
                        ? 'bg-brand-100 text-brand-800 font-semibold dark:bg-brand-900/40 dark:text-brand-200'
                        : 'hover:bg-surface-hover dark:hover:bg-dark-hover',
                    )}
                  >
                    <PenLine size={14} className="text-ink-muted" />
                    <span className="flex-1 truncate">{s.name}</span>
                    {s.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor */}
        <div>
          {creating && (
            <SignatureEditor
              key="new"
              signature={null}
              onSaved={async (s) => { await refetch(); setSelectedId(s.id); setCreating(false); }}
            />
          )}
          {!creating && selected && (
            <SignatureEditor
              key={selected.id}
              signature={selected}
              onSaved={() => refetch()}
              onDeleted={async () => { await refetch(); setSelectedId(null); }}
            />
          )}
          {!creating && !selected && rows.length > 0 && (
            <p className="text-[13px] text-ink-muted">Pick a signature on the left.</p>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Editor ──────────────────────────────────────────────────── */

interface EditorProps {
  signature: Signature | null;
  onSaved: (s: Signature) => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
}

function SignatureEditor({ signature, onSaved, onDeleted }: EditorProps): JSX.Element {
  const [name, setName] = useState(signature?.name ?? 'New signature');
  const [isDefault, setIsDefault] = useState(signature?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Set the editor's initial HTML exactly once per signature (or when creating).
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = signature?.html ?? '';
  }, [signature?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }, []);

  const insertLink = useCallback(() => {
    const url = window.prompt('Link URL:');
    if (!url) return;
    // Force a safe scheme; user typed URL without scheme -> add https://.
    const safe = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    exec('createLink', safe);
  }, [exec]);

  const insertImage = async (file: File): Promise<void> => {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ cidRef: string; url: string; mimeType: string; sizeBytes: number }>(
        '/v1/signatures/images',
        { method: 'POST', body: fd },
      );
      // Insert an <img> that references the CID. When the signature is later
      // sent as part of an email, the server converts these CID URIs into
      // inline attachments so external clients render them.
      const img = `<img src="${r.cidRef}" alt="" style="max-width:200px;height:auto;" />`;
      editorRef.current?.focus();
      document.execCommand('insertHTML', false, img);
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Image upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const html = editorRef.current?.innerHTML ?? '';
      const payload = { name, html, isDefault };
      const s = signature
        ? await api<Signature>(`/v1/signatures/${signature.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await api<Signature>('/v1/signatures', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      setOk('Saved');
      setTimeout(() => setOk(null), 2500);
      await onSaved(s);
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (): Promise<void> => {
    if (!signature) return;
    if (!window.confirm(`Delete "${signature.name}"?`)) return;
    await api(`/v1/signatures/${signature.id}`, { method: 'DELETE' });
    await onDeleted?.();
  };

  return (
    <form onSubmit={save} className="rounded-xl border border-surface-border bg-white p-5 dark:bg-dark-card dark:border-dark-border">
      <div className="flex items-center gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Name</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-lg border border-surface-border bg-white px-3 text-[14px] outline-none focus:border-brand dark:bg-dark-card dark:border-dark-border dark:text-dark-text"
          />
        </label>
        <label className="mt-6 flex items-center gap-2 text-[13px] shrink-0">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-brand" />
          Default for new messages
        </label>
      </div>

      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-soft px-3 py-2 text-[13px] text-state-danger">
          <AlertCircle size={14} className="mt-0.5" /> {err}
        </div>
      )}
      {ok && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:border-brand-900/40 dark:text-brand-200">
          <CheckCircle2 size={14} className="mt-0.5 text-brand" /> {ok}
        </div>
      )}

      <div className="mt-4">
        <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted">Signature body</span>
        <div className="rounded-lg border border-surface-border dark:border-dark-border overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-0.5 border-b border-surface-divider bg-surface-hover px-2 py-1 dark:border-dark-divider dark:bg-dark-hover">
            <ToolBtn label="Bold" onClick={() => exec('bold')}><Bold size={14} /></ToolBtn>
            <ToolBtn label="Italic" onClick={() => exec('italic')}><Italic size={14} /></ToolBtn>
            <ToolBtn label="Underline" onClick={() => exec('underline')}><UnderlineIcon size={14} /></ToolBtn>
            <div className="w-px h-4 bg-surface-border mx-1 dark:bg-dark-border" />
            <ToolBtn label="Bulleted list" onClick={() => exec('insertUnorderedList')}><List size={14} /></ToolBtn>
            <ToolBtn label="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered size={14} /></ToolBtn>
            <div className="w-px h-4 bg-surface-border mx-1 dark:bg-dark-border" />
            <ToolBtn label="Link" onClick={insertLink}><LinkIcon size={14} /></ToolBtn>
            <ToolBtn label="Insert image" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
            </ToolBtn>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void insertImage(f);
              }}
            />
          </div>

          {/* ContentEditable */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[220px] max-h-[500px] overflow-y-auto scroll-thin p-4 text-[14px] leading-relaxed bg-white dark:bg-dark-card outline-none prose max-w-none dark:text-dark-text"
            style={{ wordBreak: 'break-word' }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-ink-muted dark:text-dark-muted">
          Formatting is limited to safe HTML. Images are uploaded to Cloud Mail and embedded as
          CID inline parts so they render in Gmail, Outlook, Apple Mail — no external hotlinks.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        {signature && (
          <button type="button" onClick={del} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] text-state-danger hover:bg-state-danger-soft">
            <Trash2 size={13} /> Delete signature
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-600 disabled:opacity-60">
            {saving && <Loader2 className="animate-spin" size={13} />} {signature ? 'Save changes' : 'Create signature'}
          </button>
        </div>
      </div>
    </form>
  );
}

function ToolBtn({
  label, onClick, disabled, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      // execCommand runs on the *current* selection. If focus moves to this
      // button, the caret leaves the editor and the command targets nothing.
      // Prevent the mousedown → focus flip so the caret stays put.
      onMouseDown={(e) => e.preventDefault()}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-muted hover:bg-white hover:text-ink dark:hover:bg-dark-card dark:hover:text-dark-text disabled:opacity-50"
    >
      {children}
    </button>
  );
}
