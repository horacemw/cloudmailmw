import { Mail, Image as ImageIcon, FileText, Cloud } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/store/useUIStore';

const BREAKDOWN = [
  { label: 'Emails & attachments', value: 4.2, color: 'bg-brand', icon: <Mail size={14} /> },
  { label: 'Media', value: 1.6, color: 'bg-sky-400', icon: <ImageIcon size={14} /> },
  { label: 'Documents', value: 0.7, color: 'bg-violet-400', icon: <FileText size={14} /> },
  { label: 'Other', value: 0.3, color: 'bg-slate-400', icon: <Cloud size={14} /> },
];

const TOTAL = 10;

export function StorageModal(): JSX.Element {
  const open = useUIStore((s) => s.storageOpen);
  const setOpen = useUIStore((s) => s.setStorageOpen);
  const push = useUIStore((s) => s.pushToast);
  const used = BREAKDOWN.reduce((n, b) => n + b.value, 0);
  const pct = Math.round((used / TOTAL) * 100);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Storage"
      description={`Using ${used.toFixed(1)} GB of ${TOTAL} GB (${pct}%)`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              push({ title: 'Redirecting to plans — coming soon', tone: 'success' });
              setOpen(false);
            }}
          >
            Upgrade plan
          </Button>
        </>
      }
    >
      <div className="h-3 rounded-full bg-surface-border dark:bg-dark-border overflow-hidden flex">
        {BREAKDOWN.map((b) => (
          <div
            key={b.label}
            className={b.color}
            style={{ width: `${(b.value / TOTAL) * 100}%` }}
            title={`${b.label}: ${b.value} GB`}
          />
        ))}
      </div>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {BREAKDOWN.map((b) => (
          <li
            key={b.label}
            className="flex items-center gap-3 rounded-lg border border-surface-border dark:border-dark-border px-3 py-2.5"
          >
            <span className={`h-8 w-8 rounded-lg text-white inline-flex items-center justify-center ${b.color}`}>
              {b.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-ink dark:text-dark-text">{b.label}</p>
              <p className="text-[11.5px] text-ink-muted dark:text-dark-muted">
                {b.value.toFixed(2)} GB
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40 p-4">
        <p className="text-[13px] font-semibold text-brand-800 dark:text-brand-200">
          Get 100 GB with Cloud Mail Pro
        </p>
        <p className="text-[12.5px] text-brand-700 dark:text-brand-300 mt-1">
          Priority delivery, advanced filters, custom domain, and 10× the storage.
        </p>
      </div>
    </Modal>
  );
}
