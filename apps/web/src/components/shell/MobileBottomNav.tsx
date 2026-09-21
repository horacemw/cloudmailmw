import { Inbox, Pencil, Search, Settings, Contact2 } from 'lucide-react';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';

export function MobileBottomNav(): JSX.Element {
  const openCompose = useUIStore((s) => s.openCompose);
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  const setActive = useMailStore((s) => s.setActiveFolder);
  const active = useMailStore((s) => s.activeFolderId);

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-dark-panel/95 backdrop-blur border-t border-surface-border dark:border-dark-border">
      <div className="grid grid-cols-5 h-14">
        <NavBtn
          icon={<Inbox size={20} />}
          label="Inbox"
          active={active === 'inbox'}
          onClick={() => setActive('inbox')}
        />
        <NavBtn
          icon={<Search size={20} />}
          label="Search"
          onClick={() => document.getElementById('cloudmail-search')?.focus()}
        />
        <button
          onClick={() => openCompose()}
          aria-label="Compose"
          className="flex items-center justify-center"
        >
          <span className="h-11 w-11 rounded-full bg-brand text-white shadow-card flex items-center justify-center">
            <Pencil size={18} strokeWidth={2.5} />
          </span>
        </button>
        <NavBtn
          icon={<Contact2 size={20} />}
          label="Contacts"
          onClick={() => {}}
        />
        <NavBtn
          icon={<Settings size={20} />}
          label="Settings"
          onClick={() => openSettings(true)}
        />
      </div>
    </nav>
  );
}

function NavBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors',
        active ? 'text-brand-700 dark:text-brand-300' : 'text-ink-muted dark:text-dark-muted',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
