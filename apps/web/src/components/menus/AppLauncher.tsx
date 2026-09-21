import type { ReactNode } from 'react';
import {
  Calendar,
  Cloud,
  Contact2,
  FileText,
  ListChecks,
  Mail,
  MessageSquare,
  Notebook,
  Video,
} from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import { useUIStore } from '@/store/useUIStore';

const APPS = [
  { name: 'Mail', icon: <Mail size={20} />, active: true },
  { name: 'Calendar', icon: <Calendar size={20} /> },
  { name: 'Contacts', icon: <Contact2 size={20} /> },
  { name: 'Drive', icon: <Cloud size={20} /> },
  { name: 'Docs', icon: <FileText size={20} /> },
  { name: 'Notes', icon: <Notebook size={20} /> },
  { name: 'Tasks', icon: <ListChecks size={20} /> },
  { name: 'Chat', icon: <MessageSquare size={20} /> },
  { name: 'Meet', icon: <Video size={20} /> },
];

interface Props {
  trigger: (opts: { open: boolean; toggle: () => void }) => ReactNode;
}

export function AppLauncher({ trigger }: Props): JSX.Element {
  const pushToast = useUIStore((s) => s.pushToast);
  return (
    <Dropdown width="w-[320px]" trigger={trigger}>
      {({ close }) => (
        <div className="p-3">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-faint dark:text-dark-faint px-1 pb-2">
            Cloud Mail workspace
          </p>
          <div className="grid grid-cols-3 gap-1">
            {APPS.map((app) => (
              <button
                key={app.name}
                onClick={() => {
                  if (!app.active) {
                    pushToast({
                      title: `${app.name} coming soon`,
                      description: 'Available in a later phase.',
                    });
                  }
                  close();
                }}
                className={
                  'flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors ' +
                  (app.active
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                    : 'hover:bg-surface-hover dark:hover:bg-dark-hover text-ink-muted dark:text-dark-muted')
                }
              >
                {app.icon}
                <span className="text-[11.5px] font-medium">{app.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
