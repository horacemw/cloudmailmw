import { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  Cloud,
  Contact2,
  Grid3X3,
  Mail,
  Menu,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';
import { NotificationMenu } from '@/components/menus/NotificationMenu';
import { ProfileMenu } from '@/components/menus/ProfileMenu';
import { AppLauncher } from '@/components/menus/AppLauncher';

export function TopBar(): JSX.Element {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const [platformIsMac, setPlatformIsMac] = useState(false);

  useEffect(() => {
    setPlatformIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 h-16 px-3 sm:px-5 bg-white/95 backdrop-blur border-b border-surface-border dark:bg-dark-panel/95 dark:border-dark-border">
      <IconButton
        icon={<Menu size={20} />}
        label="Menu"
        onClick={toggleSidebar}
        className="lg:hidden"
      />
      <Logo showTag className="hidden sm:flex" />
      <span className="sm:hidden">
        <LogoMark size={30} />
      </span>

      <div className="flex-1 min-w-0 max-w-2xl md:mx-auto">
        <SearchBar shortcutHint={platformIsMac ? '⌘ K' : 'Ctrl K'} />
      </div>

      <nav className="hidden md:flex items-center gap-0.5">
        <Tooltip label="Mail">
          <IconButton icon={<Mail size={18} />} label="Mail" tone="active" />
        </Tooltip>
        <Tooltip label="Calendar">
          <IconButton icon={<Calendar size={18} />} label="Calendar" />
        </Tooltip>
        <Tooltip label="Contacts">
          <IconButton icon={<Contact2 size={18} />} label="Contacts" />
        </Tooltip>
        <Tooltip label="Cloud Drive">
          <IconButton icon={<Cloud size={18} />} label="Cloud Drive" />
        </Tooltip>
        <Tooltip label="Settings">
          <IconButton
            icon={<Settings size={18} />}
            label="Settings"
            onClick={() => setSettingsOpen(true)}
          />
        </Tooltip>
        <div className="mx-1 h-6 w-px bg-surface-divider dark:bg-dark-divider" />
        <AppLauncher trigger={(o) => (
          <IconButton
            icon={<Grid3X3 size={18} />}
            label="Apps"
            onClick={o.toggle}
            tone={o.open ? 'active' : 'default'}
          />
        )} />
        <NotificationMenu trigger={(o) => (
          <IconButton
            icon={<Bell size={18} />}
            label="Notifications"
            onClick={o.toggle}
            tone={o.open ? 'active' : 'default'}
          />
        )} />
      </nav>

      <div className="hidden md:block ml-1">
        <ProfileMenu />
      </div>

      {/* Mobile-only compact actions */}
      <div className="flex md:hidden items-center gap-0.5 shrink-0">
        <NotificationMenu trigger={(o) => (
          <IconButton
            icon={<Bell size={18} />}
            label="Notifications"
            onClick={o.toggle}
            tone={o.open ? 'active' : 'default'}
          />
        )} />
        <ProfileMenu compact />
      </div>
    </header>
  );
}

function SearchBar({ shortcutHint }: { shortcutHint: string }): JSX.Element {
  const searchQuery = useMailStore((s) => s.searchQuery);
  const setSearchQuery = useMailStore((s) => s.setSearchQuery);
  const [focused, setFocused] = useState(false);
  return (
    <div
      className={
        'group relative flex items-center h-10 rounded-xl bg-surface-hover dark:bg-dark-hover border border-transparent transition-colors ' +
        (focused ? 'border-brand-300 bg-white dark:bg-dark-card' : 'hover:border-surface-border dark:hover:border-dark-border')
      }
    >
      <Search size={16} className="ml-3 text-ink-muted dark:text-dark-muted" />
      <input
        id="cloudmail-search"
        type="text"
        placeholder="Search mail, contacts, files..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="flex-1 min-w-0 bg-transparent px-2.5 text-sm outline-none placeholder:text-ink-muted dark:placeholder:text-dark-muted"
        aria-label="Search mail"
      />
      {searchQuery ? (
        <button
          onClick={() => setSearchQuery('')}
          aria-label="Clear search"
          className="mr-2 text-ink-muted hover:text-ink dark:text-dark-muted dark:hover:text-dark-text"
        >
          <X size={14} />
        </button>
      ) : (
        <kbd className="hidden sm:inline-flex items-center gap-1 mr-2 h-6 px-1.5 rounded-md border border-surface-border bg-white text-[10.5px] font-mono text-ink-muted dark:bg-dark-card dark:border-dark-border dark:text-dark-muted">
          {shortcutHint}
        </kbd>
      )}
    </div>
  );
}
