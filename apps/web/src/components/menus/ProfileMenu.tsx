import { HelpCircle, Keyboard, LogOut, Palette, Shield, User } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown, MenuItem, MenuSeparator } from '@/components/ui/Dropdown';
import { useUIStore } from '@/store/useUIStore';
import { CURRENT_USER } from '@/data/mockData';

interface Props {
  compact?: boolean;
}

export function ProfileMenu({ compact = false }: Props): JSX.Element {
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  const openShortcuts = useUIStore((s) => s.setShortcutsOpen);
  const pushToast = useUIStore((s) => s.pushToast);

  return (
    <Dropdown
      width="w-72"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-label="Account menu"
          className={
            'flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full hover:bg-surface-hover dark:hover:bg-dark-hover transition-colors ' +
            (open ? 'bg-surface-hover dark:bg-dark-hover' : '')
          }
        >
          <Avatar name={CURRENT_USER.name} email={CURRENT_USER.email} size="md" />
          {!compact && (
            <div className="text-left leading-tight hidden xl:block">
              <div className="text-[12.5px] font-semibold text-ink dark:text-dark-text">
                {CURRENT_USER.name}
              </div>
              <div className="text-[11px] text-ink-muted dark:text-dark-muted truncate max-w-[140px]">
                {CURRENT_USER.email}
              </div>
            </div>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="flex items-center gap-3 p-4">
            <Avatar name={CURRENT_USER.name} email={CURRENT_USER.email} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                {CURRENT_USER.name}
              </p>
              <p className="text-[12px] text-ink-muted dark:text-dark-muted truncate">
                {CURRENT_USER.email}
              </p>
            </div>
          </div>
          <MenuSeparator />
          <MenuItem
            icon={<User size={14} />}
            label="Profile"
            onClick={() => {
              openSettings(true);
              close();
            }}
          />
          <MenuItem
            icon={<Palette size={14} />}
            label="Appearance"
            onClick={() => {
              openSettings(true);
              close();
            }}
          />
          <MenuItem
            icon={<Shield size={14} />}
            label="Security"
            onClick={() => {
              pushToast({ title: 'Security settings', description: 'Coming in a later phase.' });
              close();
            }}
          />
          <MenuItem
            icon={<Keyboard size={14} />}
            label="Keyboard shortcuts"
            shortcut="?"
            onClick={() => {
              openShortcuts(true);
              close();
            }}
          />
          <MenuItem
            icon={<HelpCircle size={14} />}
            label="Help & support"
            onClick={() => {
              pushToast({ title: 'Help centre opening…' });
              close();
            }}
          />
          <MenuSeparator />
          <MenuItem
            icon={<LogOut size={14} />}
            label="Sign out"
            danger
            onClick={() => {
              pushToast({ title: 'Signed out (demo)', tone: 'success' });
              close();
            }}
          />
        </>
      )}
    </Dropdown>
  );
}
