import { create } from 'zustand';
import { MOCK_NOTIFICATIONS } from '@/data/mockData';
import type { Notification } from '@/types';
import { uid } from '@/lib/utils';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  action?: { label: string; onClick: () => void };
}

interface ComposeState {
  open: boolean;
  minimized: boolean;
  draftId: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  showCcBcc: boolean;
}

const emptyCompose: ComposeState = {
  open: false,
  minimized: false,
  draftId: null,
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
  showCcBcc: false,
};

interface UIState {
  /* Layout */
  sidebarOpen: boolean; // mobile drawer
  readingPaneOpenMobile: boolean;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setReadingPaneOpenMobile: (v: boolean) => void;

  /* Modals */
  advancedFilterOpen: boolean;
  createFolderOpen: boolean;
  storageOpen: boolean;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  setAdvancedFilterOpen: (v: boolean) => void;
  setCreateFolderOpen: (v: boolean) => void;
  setStorageOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;

  /* Menus (opaque IDs — each menu manages its own open state via useState) */

  /* Compose */
  compose: ComposeState;
  openCompose: (prefill?: Partial<ComposeState>) => void;
  closeCompose: () => void;
  minimizeCompose: (v: boolean) => void;
  setComposeField: <K extends keyof ComposeState>(k: K, v: ComposeState[K]) => void;
  resetCompose: () => void;

  /* Notifications */
  notifications: Notification[];
  markNotificationsRead: () => void;
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;

  /* Toasts */
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  /* Signature */
  signature: string;
  setSignature: (s: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  readingPaneOpenMobile: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setReadingPaneOpenMobile: (v) => set({ readingPaneOpenMobile: v }),

  advancedFilterOpen: false,
  createFolderOpen: false,
  storageOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  setAdvancedFilterOpen: (v) => set({ advancedFilterOpen: v }),
  setCreateFolderOpen: (v) => set({ createFolderOpen: v }),
  setStorageOpen: (v) => set({ storageOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),

  compose: emptyCompose,
  openCompose: (prefill) =>
    set({ compose: { ...emptyCompose, ...prefill, open: true, minimized: false } }),
  closeCompose: () => set({ compose: emptyCompose }),
  minimizeCompose: (v) => set((s) => ({ compose: { ...s.compose, minimized: v } })),
  setComposeField: (k, v) =>
    set((s) => ({ compose: { ...s.compose, [k]: v } })),
  resetCompose: () => set({ compose: emptyCompose }),

  notifications: MOCK_NOTIFICATIONS,
  markNotificationsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        {
          ...n,
          id: uid('n'),
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...s.notifications,
      ],
    })),

  toasts: [],
  pushToast: (t) =>
    set((s) => {
      const toast = { ...t, id: uid('toast') };
      setTimeout(() => {
        useUIStore.getState().dismissToast(toast.id);
      }, 4000);
      return { toasts: [...s.toasts, toast] };
    }),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  signature: 'Horace Chipembere\nFuture4All — Programme Lead\ninfo@future4all.org',
  setSignature: (signature) => set({ signature }),
}));
