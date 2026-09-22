import { HardDrive, Mail } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/store/useUIStore';
import { useResource } from '@/lib/hooks';
import { humanFileSize } from '@/lib/utils';

interface MailboxRow {
  id: string;
  address: string;
  displayName: string | null;
  quotaBytes: string;
  usedBytes: string;
  status: string;
}

/**
 * Storage summary. Numbers come from /v1/mailboxes.usedBytes /
 * quotaBytes — populated by the Dovecot quota-sync worker. There is no
 * fabricated breakdown; the modal shows a genuine per-mailbox list and
 * an honest disabled "Upgrade plan" affordance because billing is not
 * yet wired.
 */
export function StorageModal(): JSX.Element {
  const open = useUIStore((s) => s.storageOpen);
  const setOpen = useUIStore((s) => s.setStorageOpen);
  const { data, loading, error } = useResource<{ mailboxes: MailboxRow[] }>(
    open ? '/v1/mailboxes' : null,
    [open],
  );
  const mailboxes = data?.mailboxes ?? [];
  const totalUsed = mailboxes.reduce((acc, m) => acc + Number(m.usedBytes || 0), 0);
  const totalQuota = mailboxes.reduce((acc, m) => acc + Number(m.quotaBytes || 0), 0);
  const pct = totalQuota > 0 ? Math.round((totalUsed / totalQuota) * 100) : 0;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Storage"
      description={
        loading
          ? 'Loading real usage…'
          : totalQuota > 0
            ? `${humanFileSize(totalUsed)} used of ${humanFileSize(totalQuota)} (${pct}%)`
            : 'No mailboxes yet'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled
            title="Billing is not yet connected"
          >
            Upgrade plan (not available)
          </Button>
        </>
      }
    >
      {error && (
        <p className="text-[13px] text-state-danger">Could not load usage: {error}</p>
      )}
      {!error && totalQuota > 0 && (
        <div className="h-3 rounded-full bg-surface-border dark:bg-dark-border overflow-hidden">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${Math.min(100, pct)}%` }}
            title={`${pct}% used`}
          />
        </div>
      )}
      {mailboxes.length === 0 && !loading ? (
        <p className="mt-4 text-[13px] text-ink-muted dark:text-dark-muted">
          You don't have any mailboxes yet. Add a domain and create a mailbox to start using storage.
        </p>
      ) : (
        <ul className="mt-5 grid gap-2">
          {mailboxes.map((mb) => {
            const used = Number(mb.usedBytes || 0);
            const quota = Number(mb.quotaBytes || 0);
            const perc = quota > 0 ? Math.round((used / quota) * 100) : 0;
            return (
              <li
                key={mb.id}
                className="rounded-lg border border-surface-border dark:border-dark-border px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 inline-flex items-center justify-center">
                    <Mail size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink dark:text-dark-text truncate">
                      {mb.displayName || mb.address}
                    </p>
                    <p className="text-[11.5px] text-ink-muted dark:text-dark-muted">
                      {mb.address} · {humanFileSize(used)} of {humanFileSize(quota)}
                    </p>
                  </div>
                  <div className="text-[11.5px] tabular-nums text-ink-muted dark:text-dark-muted">
                    {perc}%
                  </div>
                </div>
                {quota > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-surface-border dark:bg-dark-border overflow-hidden">
                    <div
                      className={`h-full ${perc >= 90 ? 'bg-state-danger' : perc >= 75 ? 'bg-state-warning' : 'bg-brand'}`}
                      style={{ width: `${Math.min(100, perc)}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5 flex items-start gap-3 rounded-xl bg-surface-hover dark:bg-dark-hover px-3 py-2.5 text-[12.5px] text-ink-muted dark:text-dark-muted">
        <HardDrive size={14} className="mt-0.5" />
        <p>
          Numbers are updated by the Dovecot quota-sync worker every few minutes.
          If a usage total looks stale, refresh after your next inbound message.
        </p>
      </div>
    </Modal>
  );
}
