import { useEffect } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';
import { useLiveMailStore } from '@/store/useLiveMailStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { InboxHeader } from '@/components/mail/InboxHeader';
import { MessageList } from '@/components/mail/MessageList';
import { ReadingPane } from '@/components/mail/ReadingPane';
import { ComposeModal } from '@/components/mail/ComposeModal';
import { LiveStatusBanner } from '@/components/mail/LiveStatusBanner';
import { AdvancedFilterModal } from '@/components/modals/AdvancedFilterModal';
import { CreateFolderModal } from '@/components/modals/CreateFolderModal';
import { StorageModal } from '@/components/modals/StorageModal';
import { ShortcutsModal } from '@/components/modals/ShortcutsModal';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ToastViewport } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export function AppShell(): JSX.Element {
  useKeyboardShortcuts();

  // Kick off live-mail probe on mount; the banner reflects the result.
  const initLive = useLiveMailStore((s) => s.init);
  useEffect(() => {
    void initLive();
  }, [initLive]);
  const activeFolderId = useMailStore((s) => s.activeFolderId);
  const folders = useMailStore((s) => s.folders);
  const active = folders.find((f) => f.id === activeFolderId);
  const paneOpenMobile = useUIStore((s) => s.readingPaneOpenMobile);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <div className="flex flex-col min-h-[100dvh] bg-surface-bg dark:bg-dark-bg">
      <TopBar />
      <LiveStatusBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex overflow-hidden">
          {/* Message list column */}
          <section
            className={cn(
              'flex flex-col min-w-0 border-r border-surface-border dark:border-dark-border bg-white dark:bg-dark-panel',
              'w-full lg:w-[420px] xl:w-[460px] shrink-0',
              !isDesktop && paneOpenMobile ? 'hidden' : 'flex',
            )}
          >
            <InboxHeader folderName={active?.name ?? 'Inbox'} />
            <MessageList />
          </section>

          {/* Reading pane */}
          <section
            className={cn(
              'flex-1 min-w-0 bg-white dark:bg-dark-panel',
              !isDesktop && !paneOpenMobile ? 'hidden' : 'flex',
            )}
          >
            <div className="flex-1 min-w-0">
              <ReadingPane />
            </div>
          </section>
        </main>
      </div>
      <MobileBottomNav />
      <div className="lg:hidden h-14" aria-hidden />

      {/* Overlays */}
      <ComposeModal />
      <AdvancedFilterModal />
      <CreateFolderModal />
      <StorageModal />
      <ShortcutsModal />
      <SettingsPanel />
      <ToastViewport />
    </div>
  );
}
