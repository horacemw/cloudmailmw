import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';
import type { AdvancedFilter } from '@/types';

export function AdvancedFilterModal(): JSX.Element {
  const open = useUIStore((s) => s.advancedFilterOpen);
  const setOpen = useUIStore((s) => s.setAdvancedFilterOpen);
  const existing = useMailStore((s) => s.advancedFilter);
  const apply = useMailStore((s) => s.setAdvancedFilter);
  const reset = useMailStore((s) => s.resetAdvancedFilter);
  const push = useUIStore((s) => s.pushToast);

  const [local, setLocal] = useState<AdvancedFilter>(existing);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Filter messages"
      description="Narrow down what appears in this folder."
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setLocal({});
              reset();
              push({ title: 'Filters cleared' });
            }}
          >
            Clear
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              apply(local);
              setOpen(false);
              push({ title: 'Filters applied', tone: 'success' });
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From">
          <TextInput
            value={local.from ?? ''}
            onChange={(v) => setLocal({ ...local, from: v })}
            placeholder="sender@example.com"
          />
        </Field>
        <Field label="To">
          <TextInput
            value={local.to ?? ''}
            onChange={(v) => setLocal({ ...local, to: v })}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Subject" wide>
          <TextInput
            value={local.subject ?? ''}
            onChange={(v) => setLocal({ ...local, subject: v })}
            placeholder="Contains…"
          />
        </Field>
        <Field label="Date">
          <select
            value={local.dateRange ?? 'any'}
            onChange={(e) => setLocal({ ...local, dateRange: e.target.value as AdvancedFilter['dateRange'] })}
            className="w-full h-10 rounded-lg border border-surface-border dark:border-dark-border bg-white dark:bg-dark-card px-3 text-sm outline-none focus:border-brand"
          >
            <option value="any">Any time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </Field>
      </div>
      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <Checkbox
          label="Has attachment"
          checked={!!local.hasAttachment}
          onChange={(v) => setLocal({ ...local, hasAttachment: v })}
        />
        <Checkbox
          label="Unread only"
          checked={!!local.unread}
          onChange={(v) => setLocal({ ...local, unread: v })}
        />
        <Checkbox
          label="Starred only"
          checked={!!local.starred}
          onChange={(v) => setLocal({ ...local, starred: v })}
        />
      </div>
    </Modal>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }): JSX.Element {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="block text-[12px] font-semibold text-ink-muted dark:text-dark-muted mb-1.5 uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 rounded-lg border border-surface-border dark:border-dark-border bg-white dark:bg-dark-card px-3 text-sm outline-none focus:border-brand placeholder:text-ink-muted dark:placeholder:text-dark-muted"
    />
  );
}
