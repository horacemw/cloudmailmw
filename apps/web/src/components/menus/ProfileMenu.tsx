import { HelpCircle, Keyboard, LogOut, Palette, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown, MenuItem, MenuSeparator } from '@/components/ui/Dropdown';
import { useUIStore } from '@/store/useUIStore';
import { useAuthStore } from '@/store/useAuthStore';

interface Props {
  compact?: boolean;
}

export function ProfileMenu({ compact = false }: Props): JSX.Element {
  const openSettings = useUIStore((s) => s.setSettingsOpen);
  const openShortcuts = useUIStore((s) => s.setShortcutsOpen);
  const pushToast = useUIStore((s) => s.pushToast);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const displayName = user?.name ?? 'Signed out';
  const displayEmail = user?.email ?? '';
  const avatarEmail = user?.email ?? '';

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
          <Avatar name={displayName} email={avatarEmail} size="md" />
          {!compact && (
            <div className="text-left leading-tight hidden xl:block">
              <div className="text-[12.5px] font-semibold text-ink dark:text-dark-text">
                {displayName}
              </div>
              <div className="text-[11px] text-ink-muted dark:text-dark-muted truncate max-w-[140px]">
                {displayEmail}
              </div>
            </div>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="flex items-center gap-3 p-4">
            <Avatar name={displayName} email={avatarEmail} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                {displayName}
              </p>
              <p className="text-[12px] text-ink-muted dark:text-dark-muted truncate">
                {displayEmail}
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
              navigate('/dashboard/security');
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
            onClick={async () => {
              close();
              try {
                await logout();
                navigate('/login');
              } catch {
                pushToast({ title: 'Sign-out failed', tone: 'danger' });
              }
            }}
          />
        </>
      )}
    </Dropdown>
  );
}
