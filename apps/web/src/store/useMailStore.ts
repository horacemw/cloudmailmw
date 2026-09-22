import { create } from 'zustand';
import type {
  AdvancedFilter,
  Email,
  FilterTab,
  Folder,
  FolderId,
} from '@/types';
import { SYSTEM_FOLDERS } from '@/data/mockData';
import { uid } from '@/lib/utils';

interface MailState {
  emails: Email[];
  folders: Folder[];
  activeFolderId: FolderId;
  selectedEmailId: string | null;
  selectedIds: Set<string>;
  filterTab: FilterTab;
  searchQuery: string;
  advancedFilter: AdvancedFilter;

  /* Selection & navigation */
  setActiveFolder: (id: FolderId) => void;
  selectEmail: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;

  /* Filtering */
  setFilterTab: (tab: FilterTab) => void;
  setSearchQuery: (q: string) => void;
  setAdvancedFilter: (f: AdvancedFilter) => void;
  resetAdvancedFilter: () => void;

  /* Mutations */
  markRead: (ids: string[], read: boolean) => void;
  toggleStar: (id: string) => void;
  moveTo: (ids: string[], folderId: FolderId) => void;
  archive: (ids: string[]) => void;
  moveToSpam: (ids: string[]) => void;
  moveToTrash: (ids: string[]) => void;
  snooze: (ids: string[]) => void;

  /* Compose */
  sendEmail: (email: Omit<Email, 'id' | 'timestamp' | 'read' | 'folderId'>) => void;
  saveDraft: (email: Omit<Email, 'id' | 'timestamp' | 'folderId' | 'draft' | 'read'>) => string;
  updateDraft: (id: string, patch: Partial<Email>) => void;
  deleteDraft: (id: string) => void;

  /* Folders */
  createFolder: (name: string) => void;
  deleteFolder: (id: FolderId) => void;

  /* Derived */
  countsByFolder: () => Record<FolderId, { total: number; unread: number }>;
  visibleEmails: () => Email[];
  currentEmail: () => Email | null;
}

export const useMailStore = create<MailState>((set, get) => ({
  // Local mail-UI state. `emails` starts empty — the production webmail
  // never seeds demo content. The live message list will populate this via
  // /v1/mail/* once its wiring lands (currently useLiveMailStore drives
  // send + folder metadata; message-list read path is pending).
  emails: [],
  folders: [...SYSTEM_FOLDERS],
  activeFolderId: 'inbox',
  selectedEmailId: null,
  selectedIds: new Set(),
  filterTab: 'all',
  searchQuery: '',
  advancedFilter: {},

  setActiveFolder: (id) =>
    set(() => {
      const first = get().emails.find((e) => matchesFolder(e, id));
      return {
        activeFolderId: id,
        selectedEmailId: first?.id ?? null,
        selectedIds: new Set(),
        filterTab: 'all',
      };
    }),

  selectEmail: (id) => {
    set({ selectedEmailId: id });
    if (id) {
      const e = get().emails.find((x) => x.id === id);
      if (e && !e.read) get().markRead([id], true);
    }
  },

  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  selectAllVisible: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),

  setFilterTab: (tab) => set({ filterTab: tab }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setAdvancedFilter: (f) => set({ advancedFilter: f }),
  resetAdvancedFilter: () => set({ advancedFilter: {} }),

  markRead: (ids, read) =>
    set((s) => ({
      emails: s.emails.map((e) => (ids.includes(e.id) ? { ...e, read } : e)),
    })),
  toggleStar: (id) =>
    set((s) => ({
      emails: s.emails.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)),
    })),
  moveTo: (ids, folderId) =>
    set((s) => ({
      emails: s.emails.map((e) => (ids.includes(e.id) ? { ...e, folderId } : e)),
      selectedIds: new Set(),
    })),
  archive: (ids) => get().moveTo(ids, 'archive'),
  moveToSpam: (ids) => get().moveTo(ids, 'spam'),
  moveToTrash: (ids) => get().moveTo(ids, 'trash'),
  snooze: (ids) =>
    set((s) => ({
      emails: s.emails.map((e) =>
        ids.includes(e.id)
          ? {
              ...e,
              folderId: 'snoozed',
              snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            }
          : e,
      ),
      selectedIds: new Set(),
    })),

  sendEmail: (email) => {
    const id = uid('sent');
    set((s) => ({
      emails: [
        {
          ...email,
          id,
          folderId: 'sent',
          timestamp: new Date().toISOString(),
          read: true,
        },
        ...s.emails,
      ],
    }));
  },
  saveDraft: (email) => {
    const id = uid('draft');
    set((s) => ({
      emails: [
        {
          ...email,
          id,
          folderId: 'drafts',
          timestamp: new Date().toISOString(),
          read: true,
          draft: true,
        },
        ...s.emails,
      ],
    }));
    return id;
  },
  updateDraft: (id, patch) =>
    set((s) => ({
      emails: s.emails.map((e) =>
        e.id === id ? { ...e, ...patch, timestamp: new Date().toISOString() } : e,
      ),
    })),
  deleteDraft: (id) =>
    set((s) => ({ emails: s.emails.filter((e) => e.id !== id) })),

  createFolder: (name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('f');
    set((s) => {
      if (s.folders.some((f) => f.id === id)) return s;
      return { folders: [...s.folders, { id, name, system: false }] };
    });
  },
  deleteFolder: (id) =>
    set((s) => {
      if (SYSTEM_FOLDERS.some((f) => f.id === id)) return s;
      return {
        folders: s.folders.filter((f) => f.id !== id),
        emails: s.emails.map((e) => (e.folderId === id ? { ...e, folderId: 'inbox' } : e)),
      };
    }),

  countsByFolder: () => {
    const counts: Record<FolderId, { total: number; unread: number }> = {} as Record<
      FolderId,
      { total: number; unread: number }
    >;
    for (const f of get().folders) counts[f.id] = { total: 0, unread: 0 };
    for (const e of get().emails) {
      const inStarred = e.starred;
      const buckets: FolderId[] = [e.folderId];
      if (inStarred) buckets.push('starred');
      for (const b of buckets) {
        if (!counts[b]) counts[b] = { total: 0, unread: 0 };
        counts[b].total += 1;
        if (!e.read) counts[b].unread += 1;
      }
    }
    return counts;
  },

  visibleEmails: () => {
    const {
      emails,
      activeFolderId,
      filterTab,
      searchQuery,
      advancedFilter: f,
    } = get();
    const q = searchQuery.trim().toLowerCase();
    return emails
      .filter((e) => matchesFolder(e, activeFolderId))
      .filter((e) => {
        if (filterTab === 'unread') return !e.read;
        if (filterTab === 'starred') return e.starred;
        if (filterTab === 'attachments')
          return !!e.attachments && e.attachments.length > 0;
        return true;
      })
      .filter((e) => {
        if (!q) return true;
        return (
          e.subject.toLowerCase().includes(q) ||
          e.from.name.toLowerCase().includes(q) ||
          e.from.email.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q) ||
          e.to.some(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.email.toLowerCase().includes(q),
          )
        );
      })
      .filter((e) => {
        if (f.from && !e.from.email.toLowerCase().includes(f.from.toLowerCase()))
          return false;
        if (f.to && !e.to.some((t) => t.email.toLowerCase().includes(f.to!.toLowerCase())))
          return false;
        if (f.subject && !e.subject.toLowerCase().includes(f.subject.toLowerCase()))
          return false;
        if (f.hasAttachment && (!e.attachments || e.attachments.length === 0))
          return false;
        if (f.unread && e.read) return false;
        if (f.starred && !e.starred) return false;
        if (f.dateRange && f.dateRange !== 'any') {
          const days = f.dateRange === 'today' ? 1 : f.dateRange === '7d' ? 7 : 30;
          const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
          if (new Date(e.timestamp).getTime() < cutoff) return false;
        }
        return true;
      })
      .sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
  },

  currentEmail: () => {
    const id = get().selectedEmailId;
    if (!id) return null;
    return get().emails.find((e) => e.id === id) ?? null;
  },
}));

function matchesFolder(e: Email, folderId: FolderId): boolean {
  if (folderId === 'starred') return e.starred;
  return e.folderId === folderId;
}
