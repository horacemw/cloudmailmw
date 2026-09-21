import { Modal } from '@/components/ui/Modal';
import { useUIStore } from '@/store/useUIStore';

const SHORTCUTS: { section: string; items: [string, string][] }[] = [
  {
    section: 'General',
    items: [
      ['C', 'Compose new message'],
      ['/', 'Search'],
      ['Ctrl / ⌘ + K', 'Focus search'],
      ['?', 'Show this help'],
      ['Esc', 'Close panels & dialogs'],
    ],
  },
  {
    section: 'Message',
    items: [
      ['R', 'Reply'],
      ['F', 'Forward'],
      ['E', 'Archive'],
      ['⌫ Backspace / Del', 'Move to Trash'],
    ],
  },
];

export function ShortcutsModal(): JSX.Element {
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="Move faster through your inbox."
      size="lg"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {SHORTCUTS.map((section) => (
          <div key={section.section}>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint dark:text-dark-faint font-semibold mb-2">
              {section.section}
            </p>
            <ul className="space-y-1.5">
              {section.items.map(([keys, label]) => (
                <li key={keys} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink dark:text-dark-text">{label}</span>
                  <kbd className="inline-flex items-center h-6 px-2 rounded-md border border-surface-border bg-white text-[11px] font-mono text-ink-muted dark:bg-dark-card dark:border-dark-border dark:text-dark-muted">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
