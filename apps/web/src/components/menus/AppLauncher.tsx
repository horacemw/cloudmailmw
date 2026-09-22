import type { ReactNode } from 'react';
import { Calendar, Contact2, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dropdown } from '@/components/ui/Dropdown';

/**
 * App switcher — only lists apps that are actually built and reachable.
 * Placeholder entries (Drive/Docs/Notes/Tasks/Chat/Meet) were removed so
 * a user isn't served a "coming soon" toast from a control that pretends
 * to work.
 */
const APPS = [
  { name: 'Mail', icon: <Mail size={20} />, to: '/mail' },
  { name: 'Calendar', icon: <Calendar size={20} />, to: '/dashboard/calendar' },
  { name: 'Contacts', icon: <Contact2 size={20} />, to: '/dashboard/contacts' },
];

interface Props {
  trigger: (opts: { open: boolean; toggle: () => void }) => ReactNode;
}

export function AppLauncher({ trigger }: Props): JSX.Element {
  const navigate = useNavigate();
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
                  navigate(app.to);
                  close();
                }}
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 hover:bg-brand-200/60 dark:hover:bg-brand-900/60"
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
