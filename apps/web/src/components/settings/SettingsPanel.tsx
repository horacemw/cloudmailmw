import { useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { api, ApiError } from '@/lib/apiClient';
import {
  Bell,
  Keyboard,
  Palette,
  PenLine,
  User,
  X,
  Monitor,
  Sun,
  Moon,
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { CURRENT_USER } from '@/data/mockData';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import type { Theme } from '@/types';

type Section = 'profile' | 'appearance' | 'notifications' | 'signature' | 'shortcuts';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User size={15} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
  { id: 'signature', label: 'Signature', icon: <PenLine size={15} /> },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard size={15} /> },
];

export function SettingsPanel(): JSX.Element | null {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const [section, setSection] = useState<Section>('profile');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative ml-auto flex h-full w-full max-w-3xl bg-white dark:bg-dark-panel border-l border-surface-border dark:border-dark-border shadow-pop animate-slide-up">
        <aside className="w-56 border-r border-surface-divider dark:border-dark-divider p-3 shrink-0 hidden sm:block">
          <p className="px-3 pt-1 pb-3 text-[16px] font-semibold text-ink dark:text-dark-text">
            Settings
          </p>
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors',
                  section === s.id
                    ? 'bg-brand-100 text-brand-700 font-semibold dark:bg-brand-900/40 dark:text-brand-200'
                    : 'text-ink hover:bg-surface-hover dark:text-dark-text dark:hover:bg-dark-hover',
                )}
              >
                <span
                  className={cn(
                    section === s.id
                      ? 'text-brand-700 dark:text-brand-300'
                      : 'text-ink-muted dark:text-dark-muted',
                  )}
                >
                  {s.icon}
                </span>
                {s.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between h-14 px-5 border-b border-surface-divider dark:border-dark-divider">
            <div className="flex items-center gap-2">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as Section)}
                className="sm:hidden h-9 rounded-lg border border-surface-border dark:border-dark-border bg-white dark:bg-dark-card px-3 text-sm outline-none focus:border-brand"
              >
                {SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <h2 className="text-[15px] font-semibold text-ink dark:text-dark-text hidden sm:block">
                {SECTIONS.find((s) => s.id === section)?.label}
              </h2>
            </div>
            <button
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink dark:text-dark-muted"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin px-5 sm:px-8 py-6">
            {section === 'profile' && <ProfileSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'notifications' && <NotificationsSection />}
            {section === 'signature' && <SignatureSection />}
            {section === 'shortcuts' && <ShortcutsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSection(): JSX.Element {
  return <ProfileSectionImpl />;
}

function AppearanceSection(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; label: string; icon: React.ReactNode; hint: string }[] = [
    { value: 'light', label: 'Light', icon: <Sun size={16} />, hint: 'Bright and clear' },
    { value: 'dark', label: 'Dark', icon: <Moon size={16} />, hint: 'Easy on the eyes' },
    { value: 'system', label: 'System', icon: <Monitor size={16} />, hint: 'Match your device' },
  ];
  return (
    <div className="max-w-xl">
      <p className="text-[11px] uppercase tracking-wider text-ink-faint dark:text-dark-faint font-semibold mb-2">
        Theme
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
              theme === o.value
                ? 'border-brand bg-brand-50 dark:bg-brand-900/20 ring-1 ring-brand'
                : 'border-surface-border hover:border-brand-300 dark:border-dark-border',
            )}
          >
            <span
              className={cn(
                'h-8 w-8 rounded-lg inline-flex items-center justify-center',
                theme === o.value
                  ? 'bg-brand text-white'
                  : 'bg-surface-hover text-ink dark:bg-dark-hover dark:text-dark-text',
              )}
            >
              {o.icon}
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-ink dark:text-dark-text">{o.label}</p>
              <p className="text-[12px] text-ink-muted dark:text-dark-muted">{o.hint}</p>
            </div>
          </button>
        ))}
      </div>
      <p className="mt-8 text-[11px] uppercase tracking-wider text-ink-faint dark:text-dark-faint font-semibold mb-2">
        Density
      </p>
      <p className="text-[13px] text-ink-muted dark:text-dark-muted">
        Comfortable spacing is used by default. Compact mode arrives in a later phase.
      </p>
    </div>
  );
}

function NotificationsSection(): JSX.Element {
  const [prefs, setPrefs] = useState({
    inbox: true,
    mentions: true,
    marketing: false,
    security: true,
    digest: false,
  });
  const items: [keyof typeof prefs, string, string][] = [
    ['inbox', 'New mail', 'Notify me when a new message arrives in Inbox.'],
    ['mentions', 'Mentions', 'When someone mentions me in a shared thread.'],
    ['marketing', 'Marketing & promos', 'Product tips and occasional updates.'],
    ['security', 'Security alerts', 'Sign-ins from new devices or locations.'],
    ['digest', 'Daily digest', 'A summary email at 08:00 each morning.'],
  ];
  return (
    <ul className="max-w-xl divide-y divide-surface-divider dark:divide-dark-divider">
      {items.map(([key, title, desc]) => (
        <li key={key} className="flex items-start justify-between gap-4 py-4">
          <div>
            <p className="text-[13.5px] font-semibold text-ink dark:text-dark-text">{title}</p>
            <p className="text-[12.5px] text-ink-muted dark:text-dark-muted">{desc}</p>
          </div>
          <Checkbox
            checked={prefs[key]}
            onChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
          />
        </li>
      ))}
    </ul>
  );
}

function SignatureSection(): JSX.Element {
  const signature = useUIStore((s) => s.signature);
  const setSignature = useUIStore((s) => s.setSignature);
  const push = useUIStore((s) => s.pushToast);
  const [value, setValue] = useState(signature);
  return (
    <div className="max-w-xl">
      <p className="text-[12.5px] text-ink-muted dark:text-dark-muted mb-3">
        Appears at the bottom of every new message you send.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        className="w-full rounded-xl border border-surface-border dark:border-dark-border bg-white dark:bg-dark-card p-3 text-sm outline-none focus:border-brand"
      />
      <div className="mt-3 flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            setSignature(value);
            push({ title: 'Signature saved', tone: 'success' });
          }}
        >
          Save signature
        </Button>
      </div>
    </div>
  );
}

function ShortcutsSection(): JSX.Element {
  return (
    <div className="max-w-xl grid gap-3">
      {[
        ['C', 'Compose'],
        ['R', 'Reply'],
        ['F', 'Forward'],
        ['E', 'Archive'],
        ['⌫', 'Delete'],
        ['/', 'Search'],
        ['?', 'Show this help'],
        ['Esc', 'Close overlays'],
      ].map(([keys, label]) => (
        <div
          key={keys}
          className="flex items-center justify-between rounded-lg border border-surface-border dark:border-dark-border px-4 py-2.5"
        >
          <span className="text-[13.5px] text-ink dark:text-dark-text">{label}</span>
          <kbd className="inline-flex items-center h-6 px-2 rounded-md border border-surface-border bg-white text-[11px] font-mono text-ink-muted dark:bg-dark-card dark:border-dark-border dark:text-dark-muted">
            {keys}
          </kbd>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  readOnly,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  readOnly?: boolean;
}): JSX.Element {
  return (
    <label>
      <span className="block text-[12px] font-semibold text-ink-muted dark:text-dark-muted mb-1.5 uppercase tracking-wide">
        {label}
      </span>
      <input
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        readOnly={readOnly}
        className={cn(
          'w-full h-10 rounded-lg border border-surface-border dark:border-dark-border bg-white dark:bg-dark-card px-3 text-sm outline-none focus:border-brand placeholder:text-ink-muted',
          readOnly && 'bg-surface-hover dark:bg-dark-hover text-ink-muted',
        )}
      />
    </label>
  );
}

function ProfileSectionImpl(): JSX.Element {
  const push = useUIStore((s) => s.pushToast);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const displayName = user?.name ?? CURRENT_USER.name;
  const displayEmail = user?.email ?? CURRENT_USER.email;
  const avatarUrl = previewUrl ?? user?.avatarUrl ?? null;

  const handleChoose = (): void => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-selecting the same file works
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      push({ title: 'Only JPEG, PNG, or WebP', tone: 'warning' });
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      push({ title: 'Image is over 1 MB', tone: 'warning' });
      return;
    }
    // Local preview for instant feedback while the upload flies.
    setPreviewUrl(URL.createObjectURL(file));
    setBusy('upload');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api<{ avatarUrl: string }>('/v1/me/avatar', { method: 'POST', body: form });
      if (user) setUser({ ...user, avatarUrl: res.avatarUrl });
      push({ title: 'Photo updated', tone: 'success' });
      setPreviewUrl(null);
    } catch (err) {
      setPreviewUrl(null);
      push({
        title: 'Upload failed',
        description: err instanceof ApiError ? err.message : 'Please try again',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (): Promise<void> => {
    if (!avatarUrl) return;
    setBusy('remove');
    try {
      await api('/v1/me/avatar', { method: 'DELETE' });
      if (user) setUser({ ...user, avatarUrl: null });
      setPreviewUrl(null);
      push({ title: 'Photo removed', tone: 'success' });
    } catch (err) {
      push({
        title: 'Could not remove photo',
        description: err instanceof ApiError ? err.message : 'Please try again',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-16 w-16 rounded-full object-cover ring-1 ring-surface-border dark:ring-dark-border"
          />
        ) : (
          <Avatar name={displayName} email={displayEmail} size="xl" />
        )}
        <div>
          <p className="text-[15px] font-semibold text-ink dark:text-dark-text">{displayName}</p>
          <p className="text-[13px] text-ink-muted dark:text-dark-muted">{displayEmail}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={handleChoose}
            >
              {busy === 'upload' ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
            </Button>
            {avatarUrl && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void handleRemove()}
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleFile(e)}
          />
          <p className="mt-1 text-[11px] text-ink-faint dark:text-dark-faint">
            JPEG, PNG or WebP, up to 1 MB.
          </p>
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Field label="Display name" value={displayName} readOnly />
        <Field label="Primary email" value={displayEmail} readOnly />
        <Field label="Recovery email" placeholder="Add a recovery email" />
        <Field label="Language" value="English (Malawi)" readOnly />
      </div>
    </div>
  );
}
