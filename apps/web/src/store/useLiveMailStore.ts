import { create } from 'zustand';
import { api, ApiError } from '@/lib/apiClient';

/**
 * Live-mail adapter. When the user has at least one active mailbox and the
 * API is reachable, this store owns folders/messages/actions. The Phase 1
 * mock store still exists for demo mode until the mail server is up.
 *
 * We deliberately keep the shape close to what the UI already consumes so a
 * later refactor to a single unified store is a rename, not a rewrite.
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
  error: string | null;

  init: () => Promise<void>;
  selectFolder: (path: string) => Promise<void>;
  refreshFolders: () => Promise<void>;
  refreshMessages: () => Promise<void>;
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
}

export const useLiveMailStore = create<State>((set, get) => ({
  mode: 'checking',
  mailbox: null,
  folders: [],
  activeFolder: 'INBOX',
  messages: [],
  loadingMessages: false,
  error: null,

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
    set({ activeFolder: path });
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
    set({ loadingMessages: true });
    try {
      const resp = await api<{ messages: LiveMessageSummary[]; nextBefore: number | null }>(
        `/v1/mail/messages?folder=${encodeURIComponent(folder)}&limit=50`,
      );
      set({ messages: resp.messages, loadingMessages: false });
    } catch (err) {
      set({
        loadingMessages: false,
        error: err instanceof ApiError ? err.message : 'Could not load messages',
      });
    }
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
    await api(`/v1/mail/messages/${uid}/move`, {
      method: 'POST',
      body: JSON.stringify({ fromFolder, toFolder }),
    });
    // Optimistic: drop from current list.
    set((s) => ({ messages: s.messages.filter((m) => m.uid !== uid) }));
  },

  setFlags: async (uid, folder, add, remove) => {
    await api(`/v1/mail/messages/${uid}/flags`, {
      method: 'POST',
      body: JSON.stringify({ folder, add, remove }),
    });
  },
}));
