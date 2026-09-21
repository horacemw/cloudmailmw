import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useMailStore } from '@/store/useMailStore';
import { useUIStore } from '@/store/useUIStore';

export function CreateFolderModal(): JSX.Element {
  const open = useUIStore((s) => s.createFolderOpen);
  const setOpen = useUIStore((s) => s.setCreateFolderOpen);
  const createFolder = useMailStore((s) => s.createFolder);
  const push = useUIStore((s) => s.pushToast);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const submit = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createFolder(trimmed);
    push({ title: `Folder "${trimmed}" created`, tone: 'success' });
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Create folder"
      description="Organise your mail into a custom folder."
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <label>
        <span className="block text-[12px] font-semibold text-ink-muted dark:text-dark-muted mb-1.5 uppercase tracking-wide">
          Folder name
        </span>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="e.g. Clients, 2024, Board"
          className="w-full h-10 rounded-lg border border-surface-border dark:border-dark-border bg-white dark:bg-dark-card px-3 text-sm outline-none focus:border-brand placeholder:text-ink-muted"
        />
      </label>
    </Modal>
  );
}
