import { create } from 'zustand';
import { api, ApiError } from '@/lib/apiClient';

/**
 * Live-mail adapter. When the user has at least one active mailbox and the
 * API is reachable, this store owns folders/messages/actions. It talks to
 * the real /v1/mail/* endpoints — no mock fallback ever lives here.
 */

export interface LiveFolder {
  path: string;
  name: string;
  specialUse: string | null;
  subscribed: boolean;
  total: number;
  unread: number;
}
export interface LiveMessageSummary {
  uid: number;
  date: string | null;
  from: { name: string; address: string } | null;
  subject: string;
  preview: string;
  flags: string[];
  hasAttachments: boolean;
  size: number;
}
export interface LiveMailbox {
  id: string;
  address: string;
  displayName: string | null;
}

export type LiveMode = 'checking' | 'no-mailbox' | 'server-unreachable' | 'ready';

interface State {
  mode: LiveMode;
  mailbox: LiveMailbox | null;
  folders: LiveFolder[];
  activeFolder: string;
  messages: LiveMessageSummary[];
  loadingMessages: boolean;
  loadingOlder: boolean;
  /** Cursor for the "older than" pagination the API returns; null = end of folder. */
  nextBefore: number | null;
  error: string | null;

  /** Server-side search. Empty string = no filter. */
  searchQuery: string;

  init: () => Promise<void>;
  selectFolder: (path: string) => Promise<void>;
  refreshFolders: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  /** Append the next page of older messages using the current cursor. */
  loadOlder: () => Promise<void>;

  setSearch: (q: string) => Promise<void>;

  send: (payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    idempotencyKey: string;
  }) => Promise<{ messageId: string }>;
  saveDraft: (payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    replaceUid?: number;
  }) => Promise<{ uid: number | null; folder: string }>;

  moveMessage: (uid: number, fromFolder: string, toFolder: string) => Promise<void>;
  setFlags: (uid: number, folder: string, add?: string[], remove?: string[]) => Promise<void>;

  /** Local optimistic patch — flip a flag on the summary row without a refetch. */
  patchLocalFlags: (uid: number, opts: { add?: string[]; remove?: string[] }) => void;
  /** Local optimistic drop — remove a row from the current list (e.g. after move). */
  removeLocal: (uid: number) => void;

  /** Resolve the IMAP path for a well-known special folder. Falls back to
   *  common English names, and finally to the given default. */
  folderPathFor: (
    kind: 'sent' | 'drafts' | 'trash' | 'spam' | 'archive',
    fallback?: string,
  ) => string;
}

const SPECIAL_USE: Record<
  'sent' | 'drafts' | 'trash' | 'spam' | 'archive',
  { flag: string; names: string[] }
> = {
  sent:    { flag: '\\Sent',    names: ['sent', 'sent messages', 'sent items'] },
  drafts:  { flag: '\\Drafts',  names: ['drafts'] },
  trash:   { flag: '\\Trash',   names: ['trash', 'deleted', 'deleted items', 'bin'] },
  spam:    { flag: '\\Junk',    names: ['spam', 'junk', 'junk e-mail'] },
  archive: { flag: '\\Archive', names: ['archive', 'archives', 'all mail'] },
};

const DEFAULT_FALLBACK: Record<'sent' | 'drafts' | 'trash' | 'spam' | 'archive', string> = {
  sent: 'Sent',
  drafts: 'Drafts',
  trash: 'Trash',
  spam: 'Spam',
  archive: 'Archive',
};

export const useLiveMailStore = create<State>((set, get) => ({
  mode: 'checking',
  mailbox: null,
  folders: [],
  activeFolder: 'INBOX',
  messages: [],
  loadingMessages: false,
  loadingOlder: false,
  nextBefore: null,
  error: null,
  searchQuery: '',

  init: async () => {
    set({ mode: 'checking', error: null });
    try {
      const mbxList = await api<{ mailboxes: Array<{ id: string; address: string; displayName: string | null; status: string }> }>('/v1/mailboxes');
      const active = mbxList.mailboxes.find((m) => m.status === 'active');
      if (!active) {
        set({ mode: 'no-mailbox', mailbox: null, folders: [], messages: [] });
        return;
      }
      const mailbox: LiveMailbox = { id: active.id, address: active.address, displayName: active.displayName };
      // Try folders — proves the mail server is up.
      const foldersResp = await api<{ folders: LiveFolder[] }>('/v1/mail/folders');
      set({
        mode: 'ready',
        mailbox,
        folders: foldersResp.folders,
        activeFolder: foldersResp.folders.find((f) => f.specialUse === '\\Inbox')?.path
          ?? foldersResp.folders.find((f) => f.path.toLowerCase() === 'inbox')?.path
          ?? foldersResp.folders[0]?.path
          ?? 'INBOX',
      });
      await get().refreshMessages();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Not logged in — the caller will already redirect.
        set({ mode: 'checking' });
        return;
      }
      set({ mode: 'server-unreachable', error: err instanceof ApiError ? err.message : 'Mail server unreachable' });
    }
  },

  selectFolder: async (path) => {
    // Clear search when switching folders so results aren't stale.
    set({ activeFolder: path, searchQuery: '' });
    await get().refreshMessages();
  },

  refreshFolders: async () => {
    try {
      const foldersResp = await api<{ folders: LiveFolder[] }>('/v1/mail/folders');
      set({ folders: foldersResp.folders });
    } catch {
      /* ignore transient failures */
    }
  },

  refreshMessages: async () => {
    const folder = get().activeFolder;
    const search = get().searchQuery.trim();
    set({ loadingMessages: true, error: null, nextBefore: null });
    try {
      const qs = new URLSearchParams({ folder, limit: '50' });
      if (search) qs.set('search', search);
      const resp = await api<{ messages: LiveMessageSummary[]; nextBefore: number | null }>(
        `/v1/mail/messages?${qs.toString()}`,
      );
      set({ messages: resp.messages, nextBefore: resp.nextBefore, loadingMessages: false });
    } catch (err) {
      set({
        loadingMessages: false,
        error: err instanceof ApiError ? err.message : 'Could not load messages',
      });
    }
  },

  loadOlder: async () => {
    const folder = get().activeFolder;
    const cursor = get().nextBefore;
    if (cursor == null || get().loadingOlder) return;
    const search = get().searchQuery.trim();
    set({ loadingOlder: true, error: null });
    try {
      const qs = new URLSearchParams({ folder, limit: '50', before: String(cursor) });
      if (search) qs.set('search', search);
      const resp = await api<{ messages: LiveMessageSummary[]; nextBefore: number | null }>(
        `/v1/mail/messages?${qs.toString()}`,
      );
      set((s) => {
        // Dedupe by uid — belt-and-braces even though the backend returns
        // strictly-older UIDs when `before` is supplied.
        const seen = new Set(s.messages.map((m) => m.uid));
        const merged = [...s.messages];
        for (const m of resp.messages) {
          if (!seen.has(m.uid)) merged.push(m);
        }
        return { messages: merged, nextBefore: resp.nextBefore, loadingOlder: false };
      });
    } catch (err) {
      set({
        loadingOlder: false,
        error: err instanceof ApiError ? err.message : 'Could not load older messages',
      });
    }
  },

  setSearch: async (q) => {
    set({ searchQuery: q });
    await get().refreshMessages();
  },

  send: async (payload) => {
    const { idempotencyKey, ...body } = payload;
    return api<{ messageId: string }>('/v1/mail/send', {
      method: 'POST',
      body: JSON.stringify(body),
      idempotencyKey,
    });
  },

  saveDraft: async (payload) => {
    return api<{ uid: number | null; folder: string }>('/v1/mail/drafts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  moveMessage: async (uid, fromFolder, toFolder) => {
    // Optimistic — remove from current list before the API confirms so the UI
    // is snappy. If the API rejects we refetch to restore ground truth.
    const prev = get().messages;
    set({ messages: prev.filter((m) => m.uid !== uid) });
    try {
      await api(`/v1/mail/messages/${uid}/move`, {
        method: 'POST',
        body: JSON.stringify({ fromFolder, toFolder }),
      });
      // Fire-and-forget folder-count refresh so the sidebar reflects the move.
      void get().refreshFolders();
    } catch (err) {
      set({ messages: prev, error: err instanceof ApiError ? err.message : 'Move failed' });
      throw err;
    }
  },

  setFlags: async (uid, folder, add, remove) => {
    // Optimistic flag patch on the local summary row.
    const prev = get().messages;
    get().patchLocalFlags(uid, { add, remove });
    try {
      await api(`/v1/mail/messages/${uid}/flags`, {
        method: 'POST',
        body: JSON.stringify({ folder, add, remove }),
      });
      // Read/unread state feeds the sidebar unread badge; refresh in the background.
      void get().refreshFolders();
    } catch (err) {
      set({ messages: prev, error: err instanceof ApiError ? err.message : 'Flag change failed' });
      throw err;
    }
  },

  patchLocalFlags: (uid, { add, remove }) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.uid !== uid) return m;
        const flags = new Set(m.flags ?? []);
        for (const f of add ?? []) flags.add(f);
        for (const f of remove ?? []) flags.delete(f);
        return { ...m, flags: [...flags] };
      }),
    }));
  },

  removeLocal: (uid) => {
    set((s) => ({ messages: s.messages.filter((m) => m.uid !== uid) }));
  },

  folderPathFor: (kind, fallback) => {
    const meta = SPECIAL_USE[kind];
    const folders = get().folders;
    // Prefer IMAP special-use tag; then a name match; then fallback.
    const bySpecial = folders.find((f) => f.specialUse === meta.flag);
    if (bySpecial) return bySpecial.path;
    const byName = folders.find((f) => meta.names.includes(f.name.toLowerCase()));
    if (byName) return byName.path;
    return fallback ?? DEFAULT_FALLBACK[kind];
  },
}));
