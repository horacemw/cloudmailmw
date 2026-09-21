import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DropdownProps {
  trigger: (opts: { open: boolean; toggle: () => void }) => ReactNode;
  children: (opts: { close: () => void }) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  className?: string;
  /** Fires the first render after the menu opens — useful for lazy-loading contents. */
  onOpen?: () => void;
}

export function Dropdown({
  trigger,
  children,
  align = 'right',
  width = 'w-64',
  className,
  onOpen,
}: DropdownProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const close = (): void => setOpen(false);
  const toggle = (): void => setOpen((v) => !v);

  useEffect(() => {
    if (open) onOpen?.();
  }, [open, onOpen]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {trigger({ open, toggle })}
      {open && (
        <div
          className={cn(
            'absolute z-40 mt-2 rounded-xl bg-white dark:bg-dark-card border border-surface-border dark:border-dark-border shadow-pop overflow-hidden animate-slide-up',
            width,
            align === 'right' ? 'right-0' : 'left-0',
          )}
          role="menu"
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon?: ReactNode;
  label: ReactNode;
  onClick?: () => void;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function MenuItem({
  icon,
  label,
  onClick,
  shortcut,
  danger,
  disabled,
}: MenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-3 px-3.5 py-2 text-sm text-left transition-colors',
        'hover:bg-surface-hover dark:hover:bg-dark-hover',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        danger
          ? 'text-state-danger hover:bg-state-danger-soft'
          : 'text-ink dark:text-dark-text',
      )}
    >
      {icon && <span className="text-ink-muted dark:text-dark-muted">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="text-[11px] text-ink-faint dark:text-dark-faint font-mono">{shortcut}</span>
      )}
    </button>
  );
}

export function MenuSeparator(): JSX.Element {
  return <div className="h-px my-1 bg-surface-divider dark:bg-dark-divider" />;
}

export function MenuSection({ label }: { label: string }): JSX.Element {
  return (
    <div className="px-3.5 pt-2.5 pb-1 text-[11px] uppercase tracking-wider text-ink-faint dark:text-dark-faint font-semibold">
      {label}
    </div>
  );
}
